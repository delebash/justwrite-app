// Per-chapter critique. Two LLM passes:
//
//   runCritique(html)       — text critique: a structured list of notes
//                             grouped by severity. Reuses the writerAI
//                             plumbing (chatStream → ai.usage).
//   runStructuralAnalysis() — single JSON object with tension, hook,
//                             pacing, ending classification, summary.
//
// Both return shapes that drop straight into `chapter.critique`.

import { OpenAICompatClient } from "../openai-compat.js";
import { useAiStore } from "../../stores/ai.js";
import { friendlyAiError } from "../aiErrors.js";

function htmlToText(html) {
  if (!html) return "";
  const div = document.createElement("div");
  div.innerHTML = html;
  // Strip pending AI diff marks so the LLM doesn't critique its own
  // earlier suggestions back to itself.
  div.querySelectorAll(".ai-del").forEach((el) => el.remove());
  div.querySelectorAll(".ai-ins").forEach((el) => el.replaceWith(...el.childNodes));
  return div.textContent || "";
}

async function runChat({ messages, temperature, extra, signal, onDelta, provider, model }) {
  const ai = useAiStore();
  const actualProvider = provider || ai.llmProvider;
  if (!actualProvider) throw new Error("No LLM provider is configured. Add one in Settings → AI providers.");
  const actualModel = model || actualProvider.chatModel;
  const client = new OpenAICompatClient(actualProvider);
  const tier = ai.resolveTier(actualModel);
  let content = "";
  let usage = null;
  const stream = client.chatStream({
    messages,
    model: actualModel,
    signal,
    temperature: temperature ?? 0.4,
    // Critique benefits from reasoning on reasoning-capable models;
    // structural analysis (JSON) prefers no-think so the response is
    // pure JSON — callers can override via extra.think.
    extra: { think: tier?.think === true, ...(extra || {}) },
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

function recordCall(feature, runResult, meta) {
  const { usage, providerId, model } = runResult;
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

// Strip ```json fences and grab the outermost JSON object/array.
function parseJsonLoose(text) {
  if (!text) return null;
  const trimmed = text.replace(/```(?:json)?/gi, "").trim();
  // Object first; arrays handled at the call site if we need them.
  const objMatch = trimmed.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try { return JSON.parse(objMatch[0]); } catch {}
  }
  const arrMatch = trimmed.match(/\[[\s\S]*\]/);
  if (arrMatch) {
    try { return JSON.parse(arrMatch[0]); } catch {}
  }
  return null;
}

// ─── Text critique ──────────────────────────────────────────────────

const CRITIQUE_SYSTEM = `You are a sharp, honest fiction editor giving line-level notes on a single chapter.
Return a JSON object with one field: "notes" — an array of 4 to 10 critique items.
Each item: { "severity": "info" | "suggest" | "flag", "category": short label, "message": one sentence }.

Severity scale:
- "info"    — observation worth noting, no action needed
- "suggest" — concrete revision idea
- "flag"    — a clear problem (pacing dip, unearned reveal, voice break, continuity error)

Categories should be short and specific: "pacing", "voice", "dialogue", "POV", "show-don't-tell",
"opening", "closing", "characterization", "setting", "tension", "stakes", "exposition",
"redundancy", "clarity".

Be specific — quote a short phrase from the text when calling something out.
Be honest — if the chapter is genuinely strong, say so briefly in 2-3 "info" notes rather than inventing problems.
Return ONLY the JSON object, no preface, no markdown fences.`;

export async function runCritique({ html, chapterTitle = "", chapterNum = null, meta = {}, signal, onDelta, provider, model } = {}) {
  const text = htmlToText(html).trim();
  if (!text) throw new Error("This chapter has no prose to critique yet.");
  const header = chapterTitle
    ? `Chapter ${chapterNum != null ? chapterNum + " — " : ""}${chapterTitle}\n\n`
    : "";

  const messages = [
    { role: "system", content: CRITIQUE_SYSTEM },
    { role: "user",   content: `${header}--- BEGIN CHAPTER ---\n${text}\n--- END CHAPTER ---` },
  ];
  const result = await runChat({ messages, temperature: 0.4, signal, onDelta, provider, model });
  recordCall("critique", result, meta);

  const parsed = parseJsonLoose(result.content);
  const rawNotes = Array.isArray(parsed?.notes) ? parsed.notes : [];
  const notes = rawNotes
    .map((n, i) => ({
      id: `note_${Date.now().toString(36)}_${i}`,
      severity: ["info", "suggest", "flag"].includes(n?.severity) ? n.severity : "info",
      category: typeof n?.category === "string" ? n.category.slice(0, 40) : "general",
      message: typeof n?.message === "string" ? n.message.trim() : "",
    }))
    .filter((n) => n.message);

  return {
    generatedAt: Date.now(),
    model: result.model,
    notes,
    raw: result.content,
  };
}

// ─── Structural analysis ────────────────────────────────────────────
// One LLM call returns a JSON object with the four headline metrics
// plus a short prose summary. Designed to land in chapter.critique.structure
// alongside (or independent of) the text notes.

const STRUCTURE_SYSTEM = `You are an experienced fiction editor diagnosing a chapter's structure.
Return ONLY a JSON object with these fields:
  "tension":     integer 1..10 (10 = unbearable; 1 = inert)
  "hookQuality": integer 1..10 (does the opening pull the reader in? 10 = irresistible)
  "pacing":      "slow" | "balanced" | "fast"
  "endingClass": "cliffhanger" | "soft" | "closed" | "dead-end"
                 - cliffhanger: unresolved high-stakes moment that demands the next chapter
                 - soft: ends on a question or mood that pulls forward but with breathing room
                 - closed: a complete unit; this chapter could end the book
                 - dead-end: ends limply, no propulsive force; a smell
  "summary":     a one- or two-sentence editorial summary of the chapter's structural posture

Be honest. Assess what's on the page, not what could be there.
Return ONLY the JSON object, no preface, no markdown fences.`;

const PACING_OPTIONS = ["slow", "balanced", "fast"];
const ENDING_OPTIONS = ["cliffhanger", "soft", "closed", "dead-end"];

export async function runStructuralAnalysis({ html, chapterTitle = "", chapterNum = null, meta = {}, signal, onDelta, provider, model } = {}) {
  const text = htmlToText(html).trim();
  if (!text) throw new Error("This chapter has no prose to analyze yet.");
  const header = chapterTitle
    ? `Chapter ${chapterNum != null ? chapterNum + " — " : ""}${chapterTitle}\n\n`
    : "";

  const messages = [
    { role: "system", content: STRUCTURE_SYSTEM },
    { role: "user",   content: `${header}--- BEGIN CHAPTER ---\n${text}\n--- END CHAPTER ---` },
  ];
  // JSON output — turn thinking off so reasoning doesn't end up in the
  // body and break the parse on Ollama hybrid models.
  const result = await runChat({ messages, temperature: 0.2, extra: { think: false }, signal, onDelta, provider, model });
  recordCall("structural-analysis", result, meta);

  const parsed = parseJsonLoose(result.content) || {};
  const tension = clamp1to10(parsed.tension);
  const hookQuality = clamp1to10(parsed.hookQuality);
  const pacing = PACING_OPTIONS.includes(parsed.pacing) ? parsed.pacing : "balanced";
  const endingClass = ENDING_OPTIONS.includes(parsed.endingClass) ? parsed.endingClass : "soft";
  const summary = typeof parsed.summary === "string" ? parsed.summary.trim() : "";

  return {
    generatedAt: Date.now(),
    model: result.model,
    tension,
    hookQuality,
    pacing,
    endingClass,
    summary,
  };
}

function clamp1to10(v) {
  const n = typeof v === "number" ? v : parseInt(v, 10);
  if (!Number.isFinite(n)) return 5;
  return Math.max(1, Math.min(10, Math.round(n)));
}

// Friendly labels for the structure values — used by the UI badges.
export const PACING_LABELS = { slow: "Slow", balanced: "Balanced", fast: "Fast" };
export const ENDING_LABELS = {
  cliffhanger: "Cliffhanger",
  soft:        "Soft hook",
  closed:      "Closed",
  "dead-end":  "Dead end",
};
