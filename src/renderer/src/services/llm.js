// High-level LLM operations used by the rest of the app.
// Wraps OpenAICompatClient with task-specific prompts.
//
// detectSpeakers / smartCast route through `runAiStream` so they show up
// in the global AI status panel (header chip → slide-in) with elapsed,
// token count, tokens/s, and a cancel button — and so the call survives
// component unmount. The legacy `provider`/`model`/`tier` args are still
// accepted for ad-hoc callers, but Studio (the only production caller)
// now relies on the wrapper's provider-pin resolution.
//
// `chat()` (freeform) still uses the non-streaming OpenAICompatClient
// directly for callers that don't need the panel surface.

import { OpenAICompatClient } from "./openai-compat.js";
import { friendlyAiError } from "./aiErrors.js";
import { runAiStream } from "./aiStream.js";

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

export async function detectSpeakers({ paragraphs, characters, task, meta } = {}) {
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

  // Temperature 0.3 — low for stricter JSON output. runAiStream's default
  // is 0.7 (for prose generation), which is way too high here: at 0.7 the
  // model gets creative, mis-attributes lines, and sometimes returns
  // malformed JSON. Speaker Lab's studio path uses 0.3 and produces
  // correct attributions; this matches it.
  // think disabled — JSON-parseable output; reasoning trails would break
  // the array parse. Spread via `extra` so the OpenAI-compat code path
  // ignores it as an unknown body field and Ollama honors it on /api/chat.
  const { content } = await runAiStream({
    feature: "speakerAnalysis",
    messages: [
      { role: "system", content: SPEAKER_SYSTEM },
      { role: "user", content: userMsg },
    ],
    temperature: 0.3,
    extra: { think: false },
    meta,
    task: task || { label: "Script analysis", meta },
  });

  return parseJsonArray(content, paragraphs);
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

export async function smartCast({ characters, voices, task, meta } = {}) {
  const charList = characters
    .map((c) => `- id=${c.id}, name="${c.name}", role="${c.role}", description="${c.oneLiner}"`)
    .join("\n");
  const voiceList = voices
    .map((v) => `- id="${v.id}", name="${v.name}", gender=${v.gender || "?"}, age=${v.age || "?"}, accent=${v.accent || "?"}, tone="${v.tone || ""}"`)
    .join("\n");

  // Temperature 0.3 — JSON output; see detectSpeakers above for the same
  // reasoning. Default 0.7 from runAiStream produces erratic casting.
  const { content } = await runAiStream({
    feature: "smartCast",
    messages: [
      { role: "system", content: CAST_SYSTEM },
      { role: "user", content: `Characters:\n${charList}\n\nAvailable voices:\n${voiceList}\n\nReturn only the JSON object.` },
    ],
    temperature: 0.3,
    extra: { think: false },
    meta,
    task: task || { label: "Smart-assign cast", meta },
  });

  return parseJsonObject(content);
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
