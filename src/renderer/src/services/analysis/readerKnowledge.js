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

import { runAiStream } from "../aiStream.js";

// ─── helpers ─────────────────────────────────────────────────────────

function htmlToText(html) {
  if (!html) return "";
  const div = document.createElement("div");
  div.innerHTML = html;
  div.querySelectorAll(".ai-del").forEach((el) => { el.remove(); });
  div.querySelectorAll(".ai-ins").forEach((el) => { el.replaceWith(...el.childNodes); });
  return (div.textContent || "").trim();
}

function parseJsonLoose(text) {
  if (!text) return null;
  const s = text.replace(/```(?:json)?/gi, "").replace(/<think>[\s\S]*?<\/think>/gi, "");
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

const SYSTEM = `You analyse fiction for dramatic irony — the gap between what the reader knows and what the POV character knows.

You will be given:
  - what the reader already knows going INTO this chapter (cumulative)
  - what the POV character already knows going INTO this chapter (cumulative)
  - the full prose of this chapter

Return ONLY a JSON object with these fields:

{
  "povCharacter":   string,  // best guess at this chapter's POV character name, or "narrator" if uncertain
  "newReaderFacts": [string], // 0-6 facts the reader LEARNS this chapter that they didn't know before
  "newPovFacts":    [string], // 0-6 facts the POV character LEARNS this chapter that they didn't know before
  "status":         "aligned" | "dramatic-irony" | "reader-confused" | "neutral",
  "rationale":      string   // 1-2 sentences explaining the classification
}

Status definitions — be deliberate:
  - "aligned" — reader and POV know roughly the same things; their knowledge moves in lockstep this chapter
  - "dramatic-irony" — reader knows something important the POV character does NOT (either newly created this chapter, or sustained from earlier)
  - "reader-confused" — POV character knows something the reader doesn't (withheld information that ISN'T clearly intentional), OR the chapter introduces ambiguity the reader can't resolve
  - "neutral" — transitional / setup / world-building chapter where neither alignment nor a meaningful gap is the point

Facts should be one declarative sentence each, short and specific. Examples:
  - "Marcus is the killer."
  - "The locket Elena found is a forgery."
  - "Sarah has been lying about her brother."

Rules:
  - Be selective. Don't list every detail — only facts that materially shift the reader's or POV's understanding.
  - Don't restate facts already in the "going-in" lists. Focus on what's NEW this chapter.
  - If you're unsure whether a fact counts, leave it out — false positives degrade the running model.
  - The rationale should name the central irony / alignment / confusion in concrete terms, not in genre abstractions.

Return ONLY the JSON object. No preface, no markdown fences, no commentary.`;

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
export async function analyseChapterKnowledge({
  html,
  chapterTitle = "",
  chapterNum = null,
  priorReaderFacts = [],
  priorPovFacts = [],
  signal,
  onDelta,
  provider,
  model,
  meta = {},
  task,
} = {}) {
  const text = htmlToText(html).trim();
  if (!text) {
    return {
      povCharacter: "",
      newReaderFacts: [],
      newPovFacts: [],
      status: "neutral",
      rationale: "",
      empty: true,
    };
  }

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

  const messages = [
    { role: "system", content: SYSTEM },
    { role: "user", content: userParts.join("\n") },
  ];

  const result = await runAiStream({
    feature: "readerKnowledge",
    messages,
    temperature: 0.3,
    extra: { think: false },
    signal,
    onDelta,
    provider,
    model,
    meta,
    task: task || { label: "Reader knowledge", meta },
  });

  const parsed = parseJsonLoose(result.content) || {};
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
  task,
} = {}) {
  if (!project) throw new Error("scanReaderKnowledge: project store is required.");

  const allChapters = project.allChapters.filter((c) => {
    if (chapterFilter?.ids) return chapterFilter.ids.has(c.id);
    return true;
  });

  const accumulatedReader = [];
  const accumulatedPov = [];
  const perChapter = [];
  const skipped = [];
  let completed = 0;
  let scanned = 0;

  for (const ch of allChapters) {
    if (signal?.aborted) break;

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
        signal, provider, model,
        meta: { chapterId: ch.id, kind: "readerKnowledge" },
        task,
      });

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
      if (signal?.aborted || /abort/i.test(msg)) break;
      skipped.push({ id: ch.id, num: ch.num, title: ch.title, reason: msg.slice(0, 200) });
      completed += 1;
      onProgress?.({
        phase: "error",
        chapter: { id: ch.id, num: ch.num, title: ch.title },
        completed, total: allChapters.length, reason: msg.slice(0, 200),
      });
    }
  }

  return {
    perChapter,
    accumulatedReader,
    accumulatedPov,
    scanned,
    skipped,
    totalChapters: allChapters.length,
  };
}
