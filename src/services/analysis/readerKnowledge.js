// Reader-knowledge tracker — per-chapter and whole-book.
//
// The hard part of suspense/mystery/unreliable-narrator fiction is
// holding TWO knowledge models at once: what the reader has figured
// out vs. what the POV character knows. The gap between them produces
// dramatic irony; closing the gap produces resolution; reversing it
// (POV knows things the reader doesn't) often produces confusion.
//
// This service walks the manuscript chapter-by-chapter. Each call sees
// a compact summary of what the reader and POV character already know
// going in, and returns:
//   - what the reader newly learns this chapter
//   - what the POV character newly learns this chapter
//   - a classification: aligned | dramatic-irony | reader-confused | neutral
//   - a one-or-two-sentence editorial rationale
//
// Sequential by design: chapter N's prompt needs the accumulated state
// from chapters 1..N-1, so workers can't run in parallel without
// degrading accuracy. The cost is wall-clock — a 30-chapter book is 30
// sequential LLM calls. Caller renders per-chapter progress and can
// cancel mid-sweep (partial results stay).

import { withAiTask } from "@delebash/llm-ui";
import { runJsonAnalysis } from "../runJson.js";
import { htmlToText } from "../text.js";

// ─── helpers ─────────────────────────────────────────────────────────

export const STATUS_OPTIONS = ["aligned", "dramatic-irony", "reader-confused", "neutral"];

export const STATUS_LABELS = {
  aligned: "Aligned",
  "dramatic-irony": "Dramatic irony",
  "reader-confused": "Reader confused",
  neutral: "Neutral",
};

// Colour tokens (mapped in CSS — see ReaderKnowledgeView). Names match
// the tokens.css palette: status-done (green) / gold / danger / muted.
export const STATUS_COLOURS = {
  aligned: "var(--status-done)",
  "dramatic-irony": "var(--gold)",
  "reader-confused": "var(--danger)",
  neutral: "var(--muted)",
};

// Cap a fact list to N entries and shorten each so the prompt stays
// well under context limits even on a 30+ chapter book.
function condenseFacts(facts, maxItems = 14, maxChars = 140) {
  if (!Array.isArray(facts)) return [];
  return facts.slice(-maxItems).map((f) => String(f || "").slice(0, maxChars)).filter(Boolean);
}

// ─── per-chapter call ────────────────────────────────────────────────

// The prompt lives server-side (features.py, action "readerKnowledge"); the
// multi-part user message (prior facts + chapter) is assembled below and sent
// as the user_content variable.

/**
 * Analyse a single chapter's reader-knowledge state.
 *
 * @param {object} opts
 * @param {string} opts.html
 * @param {string} [opts.chapterTitle]
 * @param {number} [opts.chapterNum]
 * @param {string[]} [opts.priorReaderFacts]  Cumulative reader knowledge before this chapter.
 * @param {string[]} [opts.priorPovFacts]     Cumulative POV-character knowledge before this chapter.
 * @param {AbortSignal} [opts.signal]
 * @param {(d,c)=>void} [opts.onDelta]
 * @param {object} [opts.provider]
 * @param {string} [opts.model]
 * @param {object} [opts.meta]
 */
/**
 * Compose one chapter's readerKnowledge input (the two condensed going-in
 * fact lists + the chapter prose). THE composer for both the real per-chapter
 * call below and the Lab's chapter picker (QC-35: one source, no copies —
 * an empty prior state renders the composer's own honest "(nothing — first
 * chapter…)" lines). Returns null when the chapter has no prose.
 *
 * @returns {{ variables: {user_content} } | null}
 */
export function composeReaderKnowledgeInput({
  html,
  chapterTitle = "",
  chapterNum = null,
  priorReaderFacts = [],
  priorPovFacts = [],
} = {}) {
  const text = htmlToText(html, { stripSceneMarks: false }).trim();
  if (!text) return null;

  const reader = condenseFacts(priorReaderFacts);
  const pov    = condenseFacts(priorPovFacts);

  const header = chapterTitle
    ? `Chapter ${chapterNum != null ? `${chapterNum} — ` : ""}${chapterTitle}\n\n`
    : "";

  const userParts = [];
  userParts.push("READER ALREADY KNOWS (going in):");
  if (reader.length) {
    for (const f of reader) userParts.push(`- ${f}`);
  } else {
    userParts.push("(nothing — first chapter or no prior facts established)");
  }
  userParts.push("");
  userParts.push("POV CHARACTER ALREADY KNOWS (going in):");
  if (pov.length) {
    for (const f of pov) userParts.push(`- ${f}`);
  } else {
    userParts.push("(nothing — first chapter, or POV unknown earlier)");
  }
  userParts.push("");
  userParts.push(`${header}--- BEGIN CHAPTER ---`);
  userParts.push(text);
  userParts.push("--- END CHAPTER ---");

  return { variables: { user_content: userParts.join("\n") } };
}

export async function analyseChapterKnowledge({
  html,
  chapterTitle = "",
  chapterNum = null,
  priorReaderFacts = [],
  priorPovFacts = [],
  signal,
  provider,
  model,
  meta = {},
  task,
} = {}) {
  const composed = composeReaderKnowledgeInput({
    html, chapterTitle, chapterNum, priorReaderFacts, priorPovFacts,
  });
  if (!composed) {
    return {
      povCharacter: "",
      newReaderFacts: [],
      newPovFacts: [],
      status: "neutral",
      rationale: "",
      empty: true,
    };
  }

  const { result, parsed } = await runJsonAnalysis({
    action: "readerKnowledge",
    feature: "readerKnowledge",
    variables: composed.variables,
    signal,
    provider,
    model,
    meta,
    task: task || { label: "Reader knowledge", meta },
  });

  const status = STATUS_OPTIONS.includes(parsed.status) ? parsed.status : "neutral";
  const newReaderFacts = Array.isArray(parsed.newReaderFacts)
    ? parsed.newReaderFacts.map((s) => String(s || "").trim()).filter(Boolean).slice(0, 8)
    : [];
  const newPovFacts = Array.isArray(parsed.newPovFacts)
    ? parsed.newPovFacts.map((s) => String(s || "").trim()).filter(Boolean).slice(0, 8)
    : [];
  const povCharacter = typeof parsed.povCharacter === "string"
    ? parsed.povCharacter.trim().slice(0, 80)
    : "";
  const rationale = typeof parsed.rationale === "string"
    ? parsed.rationale.trim().slice(0, 600)
    : "";

  return {
    povCharacter,
    newReaderFacts,
    newPovFacts,
    status,
    rationale,
    raw: result.content,
    model: result.model,
    providerId: result.providerId,
    // The sweep aggregates these into its ONE task entry's usage — a batch
    // owner must not finish bare (AI-call convention 2026-08-08).
    promptTokens: result.promptTokens || 0,
    completionTokens: result.completionTokens || 0,
    generatedAt: Date.now(),
  };
}

// ─── sequential whole-book sweep ─────────────────────────────────────

/**
 * Walk every chapter in order. Each chapter's call sees the accumulated
 * reader/POV knowledge state from prior chapters and returns its own
 * deltas. Sequential by design (see file header).
 *
 * @param {object} opts
 * @param {object} opts.project        useProjectStore() instance
 * @param {AbortSignal} [opts.signal]  Cancels the rest of the sweep
 * @param {(p)=>void} [opts.onProgress]
 *   p shape: { phase: "start"|"done"|"skip"|"error",
 *              chapter: { id, num, title },
 *              completed, total, result?, reason? }
 *   "result" on "done" is the analyseChapterKnowledge return value
 *   PLUS the cumulative reader/POV fact lists at end-of-chapter, so the
 *   caller can persist as it goes.
 * @param {object} [opts.provider]
 * @param {string} [opts.model]
 * @param {object} [opts.chapterFilter] { ids: Set<string> }
 *
 * @returns {Promise<{ perChapter: {id, status, rationale, povCharacter,
 *                     newReaderFacts, newPovFacts,
 *                     totalReaderKnown, totalPovKnown,
 *                     activeIronyCount}[],
 *                     accumulatedReader: string[],
 *                     accumulatedPov: string[],
 *                     scanned, skipped, totalChapters }>}
 */
export async function scanReaderKnowledge({
  project,
  signal,
  onProgress,
  provider,
  model,
  chapterFilter,
} = {}) {
  if (!project) throw new Error("scanReaderKnowledge: project store is required.");

  const allChapters = project.allChapters.filter((c) => {
    if (chapterFilter?.ids) return chapterFilter.ids.has(c.id);
    return true;
  });

  // QC-31: the whole sweep is ONE user action → ONE task entry, and the kit
  // runner owns its lifecycle (AI-call convention 2026-08-08). The handle's
  // signal threads through every per-chapter call, so the strip/panel Cancel
  // aborts the entire loop; per-chapter progress renders as n/m on the entry.
  return withAiTask({
    feature: "readerKnowledge",
    label: "Reader knowledge",
    meta: { kind: "readerKnowledge" },
    signal,
  }, (handle) => runSweep(handle, { project, allChapters, provider, model, onProgress }));
}

async function runSweep(handle, { project, allChapters, provider, model, onProgress }) {
  handle.setProgress(0, allChapters.length);
  const runSignal = handle.signal;

  const accumulatedReader = [];
  const accumulatedPov = [];
  const perChapter = [];
  const skipped = [];
  let completed = 0;
  let scanned = 0;
  let promptTokens = 0;
  let completionTokens = 0;

  for (const ch of allChapters) {
    if (runSignal.aborted) break;

    const html = project.chapterBody[ch.id] || "";

    onProgress?.({
      phase: "start",
      chapter: { id: ch.id, num: ch.num, title: ch.title },
      completed, total: allChapters.length,
    });

    try {
      const r = await analyseChapterKnowledge({
        html,
        chapterTitle: ch.title,
        chapterNum: ch.num,
        priorReaderFacts: accumulatedReader,
        priorPovFacts: accumulatedPov,
        signal: runSignal, provider, model,
        meta: { chapterId: ch.id, kind: "readerKnowledge" },
        task: false,
      });

      promptTokens += r.promptTokens || 0;
      completionTokens += r.completionTokens || 0;
      if (r.empty) {
        skipped.push({ id: ch.id, num: ch.num, title: ch.title, reason: "empty" });
        completed += 1;
        onProgress?.({
          phase: "skip",
          chapter: { id: ch.id, num: ch.num, title: ch.title },
          completed, total: allChapters.length, reason: "empty",
        });
        continue;
      }

      // Push new facts into the running accumulators (dedup by exact string).
      const seenReader = new Set(accumulatedReader);
      for (const f of r.newReaderFacts) {
        if (!seenReader.has(f)) { accumulatedReader.push(f); seenReader.add(f); }
      }
      const seenPov = new Set(accumulatedPov);
      for (const f of r.newPovFacts) {
        if (!seenPov.has(f)) { accumulatedPov.push(f); seenPov.add(f); }
      }

      // Active dramatic irony = facts the reader knows but POV doesn't.
      const povSetForCount = new Set(accumulatedPov.map((f) => f.toLowerCase().trim()));
      const activeIronyCount = accumulatedReader.filter(
        (f) => !povSetForCount.has(f.toLowerCase().trim())
      ).length;

      const entry = {
        chapterId: ch.id,
        chapterNum: ch.num,
        chapterTitle: ch.title || "",
        povCharacter: r.povCharacter,
        newReaderFacts: r.newReaderFacts,
        newPovFacts: r.newPovFacts,
        status: r.status,
        rationale: r.rationale,
        totalReaderKnown: accumulatedReader.length,
        totalPovKnown: accumulatedPov.length,
        activeIronyCount,
        generatedAt: r.generatedAt,
        model: r.model,
      };
      perChapter.push(entry);
      scanned += 1;
      completed += 1;
      onProgress?.({
        phase: "done",
        chapter: { id: ch.id, num: ch.num, title: ch.title },
        completed, total: allChapters.length,
        result: entry,
      });
    } catch (err) {
      const msg = String(err?.message || err || "");
      if (runSignal.aborted || /abort/i.test(msg)) break;
      skipped.push({ id: ch.id, num: ch.num, title: ch.title, reason: msg.slice(0, 200) });
      completed += 1;
      onProgress?.({
        phase: "error",
        chapter: { id: ch.id, num: ch.num, title: ch.title },
        completed, total: allChapters.length, reason: msg.slice(0, 200),
      });
    }
    handle.setProgress(completed, allChapters.length);
  }

  // The runner finishes the entry with the sweep's aggregated usage (a cancel
  // already archived it — first-outcome-wins makes that finish a no-op).
  return {
    result: {
      perChapter,
      accumulatedReader,
      accumulatedPov,
      scanned,
      skipped,
      totalChapters: allChapters.length,
    },
    usage: { promptTokens, completionTokens },
  };
}
