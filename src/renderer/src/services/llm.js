// High-level LLM operations used by the rest of the app.
// Wraps OpenAICompatClient with task-specific prompts.

import { OpenAICompatClient } from "./openai-compat.js";

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
  { "speaker": <id>, "confidence": <0..1>, "kind": "narration"|"dialogue"|"interior"|"scene" }
Use "narrator" for narration. Use the character id (e.g. "c1") for dialogue.
Use "interior" for unspoken thoughts of a character. Use "scene" for scene
markers like "Scene i". Be conservative — if you are uncertain, set
confidence below 0.85.`;

export async function detectSpeakers({ provider, paragraphs, characters, model, signal }) {
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

  const reply = await client.chat({
    model,
    signal,
    messages: [
      { role: "system", content: SPEAKER_SYSTEM },
      { role: "user", content: userMsg },
    ],
  });

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

export async function smartCast({ provider, characters, voices, model, signal }) {
  const client = new OpenAICompatClient(provider);

  const charList = characters
    .map((c) => `- id=${c.id}, name="${c.name}", role="${c.role}", description="${c.oneLiner}"`)
    .join("\n");
  const voiceList = voices
    .map((v) => `- id="${v.id}", name="${v.name}", gender=${v.gender || "?"}, age=${v.age || "?"}, accent=${v.accent || "?"}, tone="${v.tone || ""}"`)
    .join("\n");

  const reply = await client.chat({
    model,
    signal,
    messages: [
      { role: "system", content: CAST_SYSTEM },
      { role: "user", content: `Characters:\n${charList}\n\nAvailable voices:\n${voiceList}\n\nReturn only the JSON object.` },
    ],
  });

  return parseJsonObject(reply);
}

// ─── Generic chat ──────────────────────────────────────────────────────
// For freeform features (writing assistance, brainstorming) added later.
export async function chat({ provider, messages, model, signal, temperature }) {
  const client = new OpenAICompatClient(provider);
  return client.chat({ messages, model, signal, temperature });
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
