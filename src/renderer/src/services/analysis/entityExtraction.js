// LLM entity extraction — scans chapter prose and proposes new
// characters, locations, and objects. Output is a review list, NOT a
// commit: callers display it for the user to tick-box and edit before
// anything lands in the project store.
//
// We dedupe against existing entity names so the LLM doesn't propose
// "Halvard" when there's already a Halvard in the cast.

import { OpenAICompatClient } from "../openai-compat.js";
import { useAiStore } from "../../stores/ai.js";
import { friendlyAiError } from "../aiErrors.js";

function htmlToText(html) {
  if (!html) return "";
  const div = document.createElement("div");
  div.innerHTML = html;
  div.querySelectorAll(".ai-del").forEach((el) => el.remove());
  div.querySelectorAll(".ai-ins").forEach((el) => el.replaceWith(...el.childNodes));
  return div.textContent || "";
}

async function runChat({ messages, temperature, signal, onDelta, provider, model }) {
  const ai = useAiStore();
  const actualProvider = provider || ai.providerForFeature("entitySweep");
  if (!actualProvider) throw new Error("No LLM provider is configured. Add one in Settings → AI providers.");
  const actualModel = model || ai.modelForFeature("entitySweep") || actualProvider.chatModel;
  const client = new OpenAICompatClient(actualProvider);
  let content = "";
  let usage = null;
  const stream = client.chatStream({
    messages,
    model: actualModel,
    signal,
    temperature: temperature ?? 0.2,
    // JSON output — no thinking on Ollama hybrid models so reasoning
    // doesn't end up in the body and break the parse.
    extra: { think: false },
  });
  try {
    for await (const chunk of stream) {
      if (chunk.delta && onDelta) onDelta(chunk.delta, chunk.content);
      if (chunk.content) content = chunk.content;
      if (chunk.usage) usage = chunk.usage;
    }
  } catch (err) {
    throw friendlyAiError(err, actualProvider);
  }
  return { content, usage, providerId: actualProvider.id, model: actualModel };
}

function recordCall(feature, result, meta) {
  const { usage, providerId, model } = result;
  if (!usage) return;
  const ai = useAiStore();
  ai.recordUsage({
    feature,
    providerId,
    model,
    promptTokens: usage.prompt_tokens || 0,
    completionTokens: usage.completion_tokens || 0,
    meta: meta || {},
  });
}

function parseJsonLoose(text) {
  if (!text) return null;
  const trimmed = text.replace(/```(?:json)?/gi, "").trim();
  const m = trimmed.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

// Normalize a string for fuzzy duplicate detection: lowercase, strip
// punctuation, collapse whitespace. "The Old Lighthouse" and "Old
// Lighthouse" still differ — we don't try to be clever; the writer can
// edit names in the review list before accepting.
function norm(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFC")
    .replace(/[^\p{Letter}\p{Number}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

const ENTITY_SYSTEM = `You are a story-bible assistant scanning a single chapter of fiction.
Identify NEW named characters, locations, and objects that appear in the chapter.

Return ONLY a JSON object with three arrays:
{
  "characters": [{ "name": <string>, "role": <short label>, "oneLiner": <one sentence>, "evidence": <short quote from text> }],
  "locations":  [{ "name": <string>, "kind": <short label>, "note": <one sentence>, "evidence": <short quote> }],
  "objects":    [{ "name": <string>, "kind": <short label>, "note": <one sentence>, "evidence": <short quote> }]
}

Rules:
- Only include named entities — proper nouns. Skip "the man", "a sword", "the village".
- An object is included only if it has narrative weight (named, referenced more than once, or a Chekhov's gun candidate). Skip incidental nouns.
- For each entity, include a SHORT evidence quote (under 14 words) from the chapter so the human reviewer can verify.
- One entry per entity even if it appears multiple times.
- Skip entities listed in the "Already in the story bible" section below — don't re-propose them.
- If a category is empty, return [] for it.
- Return ONLY the JSON, no preface, no markdown fences.`;

/**
 * Scan a chapter and return proposals.
 *
 * @param {object} opts
 * @param {string} opts.html         — chapter HTML
 * @param {string} opts.chapterTitle
 * @param {number} opts.chapterNum
 * @param {{name: string}[]} opts.existingCharacters
 * @param {{name: string}[]} opts.existingLocations
 * @param {{name: string}[]} opts.existingObjects
 * @returns {Promise<{characters: Proposal[], locations: Proposal[], objects: Proposal[]}>}
 */
export async function extractEntities({
  html,
  chapterTitle = "",
  chapterNum = null,
  existingCharacters = [],
  existingLocations = [],
  existingObjects = [],
  meta = {},
  signal,
  onDelta,
  provider,
  model,
} = {}) {
  const text = htmlToText(html).trim();
  if (!text) throw new Error("This chapter has no prose to scan yet.");

  const existing = [
    "Already in the story bible — DO NOT re-propose:",
    "Characters: " + (existingCharacters.length ? existingCharacters.map((c) => c.name).join(", ") : "(none)"),
    "Locations: "  + (existingLocations.length  ? existingLocations.map((l) => l.name).join(", ")  : "(none)"),
    "Objects: "    + (existingObjects.length    ? existingObjects.map((o) => o.name).join(", ")    : "(none)"),
  ].join("\n");

  const header = chapterTitle
    ? `Chapter ${chapterNum != null ? chapterNum + " — " : ""}${chapterTitle}\n\n`
    : "";

  const messages = [
    { role: "system", content: ENTITY_SYSTEM },
    { role: "user",   content: `${existing}\n\n${header}--- BEGIN CHAPTER ---\n${text}\n--- END CHAPTER ---` },
  ];
  const result = await runChat({ messages, temperature: 0.2, signal, onDelta, provider, model });
  recordCall("entity-extraction", result, meta);

  const parsed = parseJsonLoose(result.content) || {};
  const knownChar = new Set(existingCharacters.map((c) => norm(c.name)));
  const knownLoc  = new Set(existingLocations.map((l) => norm(l.name)));
  const knownObj  = new Set(existingObjects.map((o) => norm(o.name)));

  function clean(list, known) {
    if (!Array.isArray(list)) return [];
    const seen = new Set();
    const out = [];
    for (const item of list) {
      const name = String(item?.name || "").trim();
      if (!name) continue;
      const k = norm(name);
      if (!k || known.has(k) || seen.has(k)) continue;
      seen.add(k);
      out.push({
        name,
        role: typeof item?.role === "string" ? item.role.trim() : "",
        kind: typeof item?.kind === "string" ? item.kind.trim() : "",
        oneLiner: typeof item?.oneLiner === "string" ? item.oneLiner.trim() : "",
        note: typeof item?.note === "string" ? item.note.trim() : "",
        evidence: typeof item?.evidence === "string" ? item.evidence.trim() : "",
      });
    }
    return out;
  }

  return {
    characters: clean(parsed.characters, knownChar),
    locations:  clean(parsed.locations,  knownLoc),
    objects:    clean(parsed.objects,    knownObj),
  };
}
