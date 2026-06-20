// Per-chapter critique. Two LLM passes:
//
//   runCritique(html)       — text critique: a structured list of notes
//                             grouped by severity. Reuses the writerAI
//                             plumbing (chatStream → ai.usage).
//   runStructuralAnalysis() — single JSON object with tension, hook,
//                             pacing, ending classification, summary.
//
// Both return shapes that drop straight into `chapter.critique`.

import { runAiStream } from "../aiStream.js";
import { parseJsonLoose } from "../llmText.js";

function htmlToText(html) {
  if (!html) return "";
  const div = document.createElement("div");
  div.innerHTML = html;
  // Strip pending AI diff marks so the LLM doesn't critique its own
  // earlier suggestions back to itself.
  div.querySelectorAll(".ai-del").forEach((el) => { el.remove(); });
  div.querySelectorAll(".ai-ins").forEach((el) => { el.replaceWith(...el.childNodes); });
  return div.textContent || "";
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

export async function runCritique({ html, chapterTitle = "", chapterNum = null, meta = {}, signal, onDelta, provider, model, task } = {}) {
  const text = htmlToText(html).trim();
  if (!text) throw new Error("This chapter has no prose to critique yet.");
  const header = chapterTitle
    ? `Chapter ${chapterNum != null ? `${chapterNum} — ` : ""}${chapterTitle}\n\n`
    : "";

  const messages = [
    { role: "system", content: CRITIQUE_SYSTEM },
    { role: "user",   content: `${header}--- BEGIN CHAPTER ---\n${text}\n--- END CHAPTER ---` },
  ];
  const result = await runAiStream({
    feature: "critique",
    messages, temperature: 0.4,
    extra: { think: false },
    signal, onDelta, provider, model, meta,
    task: task || { label: "Chapter critique notes", meta },
  });

  const parsed = parseJsonLoose(result.content);
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

export async function runStructuralAnalysis({ html, chapterTitle = "", chapterNum = null, meta = {}, signal, onDelta, provider, model, task } = {}) {
  const text = htmlToText(html).trim();
  if (!text) throw new Error("This chapter has no prose to analyze yet.");
  const header = chapterTitle
    ? `Chapter ${chapterNum != null ? `${chapterNum} — ` : ""}${chapterTitle}\n\n`
    : "";

  const messages = [
    { role: "system", content: STRUCTURE_SYSTEM },
    { role: "user",   content: `${header}--- BEGIN CHAPTER ---\n${text}\n--- END CHAPTER ---` },
  ];
  // JSON output — turn thinking off so reasoning doesn't end up in the
  // body and break the parse on Ollama hybrid models.
  const result = await runAiStream({
    feature: "critique", usageFeature: "structural-analysis",
    messages, temperature: 0.2, extra: { think: false },
    signal, onDelta, provider, model, meta,
    task: task || { label: "Chapter structure", meta },
  });

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
