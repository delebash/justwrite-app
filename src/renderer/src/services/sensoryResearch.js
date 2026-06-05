// Sensory research — "Research feel".
//
// Sibling to Describe. Where Describe streams 1-2 paragraphs of fresh
// sensory prose ABOUT a subject, this returns a STRUCTURED card of
// short sensory phrases the writer can browse and selectively drop
// into their prose. The shape is different: Describe is for "give me
// finished prose for this moment"; Research feel is for "give me a
// research pack about this place / object / experience so I can pick
// the details that fit my scene."
//
// JSON return shape (each value is a list of 2-5 short phrases):
//   {
//     smell, sound, touch, temperature, taste,
//     movement, social, period
//   }

import { runAiStream } from "./aiStream.js";

// Categories rendered in order in the modal. The "blurb" is shown
// under each section header — sets the writer's expectation for what
// the phrases will contain. Kept in one place so the modal and prompt
// stay in lockstep.
export const SENSORY_CATEGORIES = [
  { key: "smell",       label: "Smell",        blurb: "What it smells of — distinct, specific, sometimes unpleasant." },
  { key: "sound",       label: "Sound",        blurb: "Background and foreground noise; what the ear actually catches." },
  { key: "touch",       label: "Touch",        blurb: "Surfaces against skin, weight in the hand, fabric and air." },
  { key: "temperature", label: "Temperature",  blurb: "Heat, cold, drafts, the body's response." },
  { key: "taste",       label: "Taste",        blurb: "The mouth as a sense organ — what lingers, what's swallowed." },
  { key: "movement",    label: "Movement",     blurb: "Bodies in motion, how the space is navigated, what's happening." },
  { key: "social",      label: "Social",       blurb: "Who is here, what they're doing, the codes they speak in." },
  { key: "period",      label: "Period detail", blurb: "Period- or setting-specific texture a modern reader wouldn't know." },
];

const CATEGORY_KEYS = SENSORY_CATEGORIES.map((c) => c.key);

function parseJsonLoose(text) {
  if (!text) return null;
  let s = text.replace(/```(?:json)?/gi, "").replace(/<think>[\s\S]*?<\/think>/gi, "");
  const objIdx = s.indexOf("{");
  const arrIdx = s.indexOf("[");
  const objectFirst = objIdx !== -1 && (arrIdx === -1 || objIdx < arrIdx);
  const order = objectFirst ? [["{", "}"], ["[", "]"]] : [["[", "]"], ["{", "}"]];
  for (const [open, close] of order) {
    const slice = extractBalanced(s, open, close);
    if (slice) { try { return JSON.parse(slice); } catch {} }
  }
  return null;
}
function extractBalanced(s, open, close) {
  for (let start = s.indexOf(open); start !== -1; start = s.indexOf(open, start + 1)) {
    let depth = 0, inStr = false, esc = false;
    for (let i = start; i < s.length; i++) {
      const c = s[i];
      if (inStr) {
        if (esc) esc = false;
        else if (c === "\\") esc = true;
        else if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') { inStr = true; continue; }
      if (c === open) depth++;
      else if (c === close) {
        depth--;
        if (depth === 0) return s.slice(start, i + 1);
      }
    }
  }
  return null;
}

const SYSTEM = `You are a sensory-research assistant for a novelist. Given a subject — a place, an object, an environment, an experience — produce a structured research pack of short concrete sensory details the writer can pick from and drop into their prose.

Return ONLY a JSON object with these eight string-array fields:

{
  "smell":       [string, ...],   // 2-5 entries
  "sound":       [string, ...],   // 2-5 entries
  "touch":       [string, ...],   // 2-5 entries
  "temperature": [string, ...],   // 2-5 entries
  "taste":       [string, ...],   // 1-3 entries (often empty for non-edible subjects)
  "movement":    [string, ...],   // 2-5 entries — bodies in motion, how the space is navigated
  "social":      [string, ...],   // 2-5 entries — who is there, what they're doing, the codes they speak in
  "period":      [string, ...]    // 1-4 entries — period- or setting-specific details a modern reader wouldn't know
}

RULES for each entry:
  - Short phrase form. 4-15 words. NOT full sentences.
  - Concrete and specific. Name the thing. Not "the air smells bad" — "the air smells of tanning oil and wet hair".
  - Sensory, not interpretive. "the slap of leather against leather" beats "a busy, oppressive workspace".
  - Period-accurate. If the subject implies a setting (Victorian, medieval, futuristic, contemporary urban, etc.), respect it. If the subject doesn't imply a period, write for contemporary.
  - The taste field is often [] for subjects with no edible aspect. Don't manufacture entries.
  - The period field is often [] for contemporary or generic subjects. Don't manufacture.

Return ONLY the JSON object. No preface, no markdown fences, no commentary.`;

/**
 * Generate a sensory research pack for the given subject.
 *
 * @param {object} opts
 * @param {string} opts.subject  — selection text from the editor
 * @param {string} [opts.contextHint] — optional broader setting description (e.g. project's setting field)
 * @param {AbortSignal} [opts.signal]
 * @param {(d,c)=>void} [opts.onDelta]
 */
export async function generateSensoryPack({
  subject,
  contextHint = "",
  signal,
  onDelta,
  provider,
  model,
  task,
  meta,
} = {}) {
  const trimmed = String(subject || "").trim();
  if (!trimmed) throw new Error("Highlight a subject first (a place, object, or moment).");

  const parts = [];
  parts.push(`Subject: ${trimmed.slice(0, 600)}`);
  if (contextHint) {
    parts.push("");
    parts.push(`Broader setting / world context:`);
    parts.push(String(contextHint).slice(0, 500));
  }

  const messages = [
    { role: "system", content: SYSTEM },
    { role: "user", content: parts.join("\n") },
  ];

  const sensoryMeta = { ...(meta || {}), subject: trimmed.slice(0, 120) };
  const result = await runAiStream({
    feature: "sensory",
    messages,
    temperature: 0.7,
    extra: { think: false },
    signal,
    onDelta,
    provider,
    model,
    meta: sensoryMeta,
    task: task || { label: "Sensory research", meta: sensoryMeta },
  });

  const parsed = parseJsonLoose(result.content) || {};
  const pack = {};
  for (const key of CATEGORY_KEYS) {
    const arr = Array.isArray(parsed[key]) ? parsed[key] : [];
    pack[key] = arr
      .map((s) => String(s || "").trim())
      .filter((s) => s.length > 2 && s.length < 200)
      .slice(0, 6);
  }

  return {
    pack,
    subject: trimmed,
    model: result.model,
    providerId: result.providerId,
    generatedAt: Date.now(),
    raw: result.content,
  };
}
