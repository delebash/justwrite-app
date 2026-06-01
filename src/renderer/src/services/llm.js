// High-level LLM operations used by the rest of the app.
// Wraps OpenAICompatClient with task-specific prompts.
//
// Tier integration: structured-output paths (detectSpeakers, smartCast)
// accept an optional `tier` object resolved by the caller via
// `ai.resolveTier(modelId)`. Callers pass the resolved tier so this layer
// stays Pinia-free. Only `tier.think` is consumed here because production
// prompts are paragraph-granular and don't match the inline-tag tier
// prompts. When inline-tag eventually gets promoted to production, the
// tier's prompt body becomes load-bearing too.

import { OpenAICompatClient } from "./openai-compat.js";
import { friendlyAiError } from "./aiErrors.js";

// ─── Speaker detection ──────────────────────────────────────────────────
//
// Given a chapter's text + the project character list, ask the LLM to
// label each paragraph with a speaker id ("narrator" or characterId)
// and a confidence 0..1.
//
// We split the chapter into paragraphs first and ask the LLM to return
// JSON. If the response is malformed we keep the original line and mark
// confidence low.
//
const SPEAKER_SYSTEM = `You are a dialogue analysis assistant for a novelist.
For each paragraph the user gives you, identify the speaker.
Return a JSON array, one object per paragraph, in order, with fields:
  { "speaker": <id>, "confidence": <0..1>, "kind": "narration"|"dialogue"|"interior" }
Use "narrator" for narration. Use the character id (e.g. "c1") for dialogue.
Use "interior" for unspoken thoughts of a character. Be conservative — if
you are uncertain, set confidence below 0.85.`;

export async function detectSpeakers({ provider, paragraphs, characters, model, signal, tier }) {
  const client = new OpenAICompatClient(provider);

  const characterList = characters
    .map((c) => `- id=${c.id}, name="${c.name}", role="${c.role}"`)
    .join("\n");

  const userMsg = [
    "Characters in this novel:",
    characterList,
    "",
    "Paragraphs:",
    ...paragraphs.map((p, i) => `${i + 1}. ${p}`),
    "",
    "Return only the JSON array, no commentary.",
  ].join("\n");

  let reply;
  try {
    reply = await client.chat({
      model,
      signal,
      messages: [
        { role: "system", content: SPEAKER_SYSTEM },
        { role: "user", content: userMsg },
      ],
      // think driven by the resolved tier — Reasoned (hybrid models like
      // Qwen3:14B+) gets true and benefits from implicit chain-of-thought;
      // Guided / Direct get false. No-op on non-Ollama providers (unknown
      // body param is ignored per OpenAI spec). Fallback to false when no
      // tier is supplied keeps backwards-compat with any caller that
      // hasn't been updated.
      extra: { think: tier?.think === true },
    });
  } catch (err) {
    throw friendlyAiError(err, provider);
  }

  return parseJsonArray(reply, paragraphs);
}

// ─── Smart cast assignment ──────────────────────────────────────────────
//
// Given a list of characters and a list of available voices, ask the LLM
// to pick the closest voice for each.
//
const CAST_SYSTEM = `You are a casting director for an audiobook producer.
Given a list of characters with descriptions and a list of available voices
with descriptors, pick the best voice for each character. Return a JSON
object mapping characterId -> voiceId. Match on age, gender, tone,
and accent. Do not invent ids. If no voice fits, omit that character.`;

export async function smartCast({ provider, characters, voices, model, signal, tier }) {
  const client = new OpenAICompatClient(provider);

  const charList = characters
    .map((c) => `- id=${c.id}, name="${c.name}", role="${c.role}", description="${c.oneLiner}"`)
    .join("\n");
  const voiceList = voices
    .map((v) => `- id="${v.id}", name="${v.name}", gender=${v.gender || "?"}, age=${v.age || "?"}, accent=${v.accent || "?"}, tone="${v.tone || ""}"`)
    .join("\n");

  let reply;
  try {
    reply = await client.chat({
      model,
      signal,
      messages: [
        { role: "system", content: CAST_SYSTEM },
        { role: "user", content: `Characters:\n${charList}\n\nAvailable voices:\n${voiceList}\n\nReturn only the JSON object.` },
      ],
      // think driven by tier (model-level capability). See detectSpeakers.
      extra: { think: tier?.think === true },
    });
  } catch (err) {
    throw friendlyAiError(err, provider);
  }

  return parseJsonObject(reply);
}

// ─── Generic chat ──────────────────────────────────────────────────────
// For freeform features (writing assistance, brainstorming) added later.
// `extra` is passed through to the underlying request body — callers can
// add `{ think: false }` if they need a JSON-parseable response from a
// reasoning model, or omit it and let the model think for creative tasks.
export async function chat({ provider, messages, model, signal, temperature, extra }) {
  const client = new OpenAICompatClient(provider);
  try {
    return await client.chat({ messages, model, signal, temperature, extra });
  } catch (err) {
    throw friendlyAiError(err, provider);
  }
}

// ─── helpers ────────────────────────────────────────────────────────────

function parseJsonArray(text, fallbackParagraphs) {
  const m = text.match(/\[[\s\S]*\]/);
  if (!m) return fallbackParagraphs.map(() => ({ speaker: "narrator", confidence: 0.5, kind: "narration" }));
  try {
    const arr = JSON.parse(m[0]);
    return arr.map((a) => ({
      speaker: a.speaker || "narrator",
      confidence: typeof a.confidence === "number" ? a.confidence : 0.5,
      kind: a.kind || "narration",
    }));
  } catch {
    return fallbackParagraphs.map(() => ({ speaker: "narrator", confidence: 0.4, kind: "narration" }));
  }
}

function parseJsonObject(text) {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return {};
  try {
    return JSON.parse(m[0]);
  } catch {
    return {};
  }
}
