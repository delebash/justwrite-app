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

import { runJsonAnalysis } from "./runJson.js";
import { t } from "../i18n/index.js";
import { cutToLength } from "@delebash/core/platform/text";

// Categories rendered in order in the modal. The "blurb" is shown
// under each section header — sets the writer's expectation for what
// the phrases will contain. Kept in one place so the modal and prompt
// stay in lockstep.
export const SENSORY_CATEGORIES = [
  { key: "smell",       labelKey: "sensory.category.smell.label", blurbKey: "sensory.category.smell.blurb" },
  { key: "sound",       labelKey: "sensory.category.sound.label", blurbKey: "sensory.category.sound.blurb" },
  { key: "touch",       labelKey: "sensory.category.touch.label", blurbKey: "sensory.category.touch.blurb" },
  { key: "temperature", labelKey: "sensory.category.temperature.label", blurbKey: "sensory.category.temperature.blurb" },
  { key: "taste",       labelKey: "sensory.category.taste.label", blurbKey: "sensory.category.taste.blurb" },
  { key: "movement",    labelKey: "sensory.category.movement.label", blurbKey: "sensory.category.movement.blurb" },
  { key: "social",      labelKey: "sensory.category.social.label", blurbKey: "sensory.category.social.blurb" },
  { key: "period",      labelKey: "sensory.category.period.label", blurbKey: "sensory.category.period.blurb" },
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
/* eslint-disable i18next/no-literal-string -- text the AI model reads stays English (ruled 2026-10-13) */
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
  parts.push(`Subject: ${cutToLength(trimmed, 600)}`);
  if (contextHint) {
    parts.push("");
    parts.push(`Broader setting / world context:`);
    parts.push(cutToLength(String(contextHint), 500));
  }

  const sensoryMeta = { ...(meta || {}), subject: cutToLength(trimmed, 120) };
  const { result, parsed } = await runJsonAnalysis({
    action: "sensory",
    feature: "sensory",
    variables: { user_content: parts.join("\n") },
    signal,
    provider,
    model,
    meta: sensoryMeta,
    task: task || { label: t("sensory.taskShort"), meta: sensoryMeta },
  });

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
/* eslint-enable i18next/no-literal-string */
