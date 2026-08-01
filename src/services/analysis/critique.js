// Per-chapter critique. Two LLM passes:
//
//   runCritique(html)       — text critique: a structured list of notes
//                             grouped by severity. Reuses the writerAI
//                             plumbing (chatStream → ai.usage).
//   runStructuralAnalysis() — single JSON object with tension, hook,
//                             pacing, ending classification, summary.
//
// Both return shapes that drop straight into `chapter.critique`.

import { runJsonAnalysis } from "../runJson.js";
import { htmlToText } from "../text.js";

// ─── Text critique ──────────────────────────────────────────────────
// The prompt lives server-side now (justwrite_server/llm/features.py, action
// "critique"); we send the chapter label + text and parse the JSON result.

export async function runCritique({ html, chapterTitle = "", chapterNum = null, meta = {}, signal, provider, model, task } = {}) {
  const text = htmlToText(html, { stripSceneMarks: false, trim: false }).trim();
  if (!text) throw new Error("This chapter has no prose to critique yet.");
  const header = chapterTitle
    ? `Chapter ${chapterNum != null ? `${chapterNum} — ` : ""}${chapterTitle}\n\n`
    : "";

  const { result, parsed } = await runJsonAnalysis({
    action: "critique", feature: "critique",
    variables: { chapter_label: header, chapter_text: text },
    signal, provider, model, meta,
    task: task || { label: "Chapter critique notes", meta },
  });

  // Tolerate both shapes: {"notes":[…]} (the prompt asks for this) AND a
  // bare top-level array of note objects (which some models give anyway).
  const rawNotes = Array.isArray(parsed?.notes)
    ? parsed.notes
    : Array.isArray(parsed)
      ? parsed
      : [];
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
// One LLM call returns a JSON object with the four headline metrics plus a
// short prose summary (lands in chapter.critique.structure). The prompt lives
// server-side (features.py, action "critiqueStructure"); usage is recorded
// server-side under the "critique" feature.

const PACING_OPTIONS = ["slow", "balanced", "fast"];
const ENDING_OPTIONS = ["cliffhanger", "soft", "closed", "dead-end"];

export async function runStructuralAnalysis({ html, chapterTitle = "", chapterNum = null, meta = {}, signal, provider, model, task } = {}) {
  const text = htmlToText(html, { stripSceneMarks: false, trim: false }).trim();
  if (!text) throw new Error("This chapter has no prose to analyze yet.");
  const header = chapterTitle
    ? `Chapter ${chapterNum != null ? `${chapterNum} — ` : ""}${chapterTitle}\n\n`
    : "";

  const { result, parsed } = await runJsonAnalysis({
    action: "critiqueStructure", feature: "critique",
    variables: { chapter_label: header, chapter_text: text },
    signal, provider, model, meta,
    task: task || { label: "Chapter structure", meta },
  });

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
