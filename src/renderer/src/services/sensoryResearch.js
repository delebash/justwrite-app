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

import { runAiFeature } from "@delebash/llm-ui";
import { parseJsonLoose } from "./llmText.js";

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

// The prompt lives server-side (features.py, action "sensory").

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

  const sensoryMeta = { ...(meta || {}), subject: trimmed.slice(0, 120) };
  const result = await runAiFeature({
    action: "sensory",
    feature: "sensory",
    variables: { user_content: parts.join("\n") },
    signal,
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
