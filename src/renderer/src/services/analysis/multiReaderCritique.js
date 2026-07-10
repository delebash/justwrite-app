// Multi-reader panel critique — four distinct reader personas, in
// parallel, each reading the same chapter through a different lens.
//
// Where the standard critique (services/analysis/critique.js) gives a
// single editorial pass with notes grouped by severity, this returns
// four first-person reactions from readers who care about different
// things. The panel works best on a finished chapter you've already
// run the standard critique on — different shape of feedback, not a
// replacement.
//
// Per-persona output shape:
//   {
//     personaKey, label, blurb,
//     reaction:    "2-3 paragraphs of first-person reaction",
//     suggestions: ["1-3 concrete actions or questions the persona would offer"],
//     generatedAt, model
//   }

import { runAiFeature, useAiTasksStore } from "@delebash/llm-ui";
import { parseJsonLoose } from "../llmText.js";
import { htmlToText } from "../text.js";

// ─── Personas ────────────────────────────────────────────────────────
// Four deliberately distinct reader lenses. The persona's system prompt + the
// shared JSON contract live server-side (features.py, one action per persona);
// the client keeps only the UI metadata + the action id to dispatch.

export const PERSONAS = [
  {
    key: "genre-reader",
    label: "Genre-savvy reader",
    blurb: "A reader who's read deeply in this genre and is encountering your book cold.",
    action: "multiReaderGenre",
  },
  {
    key: "literary-critic",
    label: "Literary critic",
    blurb: "A close reader concerned with prose craft, voice, image, and what the chapter is doing on the line level.",
    action: "multiReaderLiterary",
  },
  {
    key: "agent-intern",
    label: "Agent's intern",
    blurb: "A junior agent reading the chapter as a query sample — looking for marketability and hooks.",
    action: "multiReaderAgent",
  },
  {
    key: "book-club",
    label: "Book club reader",
    blurb: "A reader who'll bring this book to a six-person book club next month and is reading for what they'll say.",
    action: "multiReaderBookClub",
  },
];

// ─── Run a single persona ───────────────────────────────────────────

async function runPersona({ persona, html, chapterTitle, chapterNum, signal, provider, model, meta, task }) {
  const text = htmlToText(html).trim();
  if (!text) throw new Error("Chapter has no prose to read.");
  const header = chapterTitle
    ? `Chapter ${chapterNum != null ? `${chapterNum} — ` : ""}${chapterTitle}\n\n`
    : "";

  const result = await runAiFeature({
    action: persona.action,
    feature: "multiReader",
    variables: { chapter_label: header, chapter_text: text },
    signal,
    provider, model,
    meta: { ...meta, personaKey: persona.key },
    task: task || { label: "Multi-reader critique", meta: { ...meta, personaKey: persona.key } },
  });

  const parsed = parseJsonLoose(result.content) || {};
  const reaction = typeof parsed.reaction === "string" ? parsed.reaction.trim().slice(0, 2000) : "";
  const suggestions = Array.isArray(parsed.suggestions)
    ? parsed.suggestions.map((s) => String(s || "").trim()).filter(Boolean).slice(0, 4)
    : [];

  return {
    personaKey: persona.key,
    label: persona.label,
    blurb: persona.blurb,
    reaction,
    suggestions,
    raw: result.content,
    model: result.model,
    providerId: result.providerId,
    generatedAt: Date.now(),
  };
}

// ─── Run all four in parallel ───────────────────────────────────────

/**
 * Run a multi-reader panel critique on a chapter.
 *
 * @param {object} opts
 * @param {string} opts.html
 * @param {string} [opts.chapterTitle]
 * @param {number} [opts.chapterNum]
 * @param {AbortSignal} [opts.signal]
 * @param {(personaKey, phase, result?) => void} [opts.onPersonaPhase]
 * @param {object} [opts.provider]
 * @param {string} [opts.model]
 *
 * @returns {Promise<{ panel: Array, generatedAt, totalPersonas }>}
 */
export async function runMultiReaderPanel({
  html,
  chapterTitle = "",
  chapterNum = null,
  signal,
  onPersonaPhase,
  provider,
  model,
  meta = {},
} = {}) {
  // QC-31: the four-persona panel is ONE user action → ONE task entry with
  // n/4 progress; the entry's Cancel (strip/panel) aborts all four personas
  // through the shared signal.
  const aiTasks = useAiTasksStore();
  const handle = aiTasks.start({
    feature: "multiReader",
    label: "Multi-reader critique",
    meta: { ...meta, kind: "multiReader" },
  });
  handle.setProgress(0, PERSONAS.length);
  if (signal) {
    if (signal.aborted) handle.cancel();
    else signal.addEventListener?.("abort", () => handle.cancel(), { once: true });
  }
  let settled = 0;

  const tasks = PERSONAS.map(async (persona) => {
    onPersonaPhase?.(persona.key, "start");
    try {
      const r = await runPersona({
        persona, html, chapterTitle, chapterNum,
        signal: handle.signal, provider, model, meta, task: false,
      });
      onPersonaPhase?.(persona.key, "done", r);
      return r;
    } catch (err) {
      onPersonaPhase?.(persona.key, "error", { error: err?.message || String(err) });
      // Return a placeholder so the panel still renders the remaining
      // personas; the writer can re-run individual columns if desired.
      return {
        personaKey: persona.key,
        label: persona.label,
        blurb: persona.blurb,
        reaction: "",
        suggestions: [],
        error: err?.message || String(err),
        generatedAt: Date.now(),
      };
    } finally {
      settled += 1;
      handle.setProgress(settled, PERSONAS.length);
    }
  });

  const panel = await Promise.all(tasks);
  // A cancel already archived the entry (finish becomes a no-op there).
  handle.finish({});

  return {
    panel,
    totalPersonas: PERSONAS.length,
    generatedAt: Date.now(),
  };
}
