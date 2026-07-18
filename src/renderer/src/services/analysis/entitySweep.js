// Whole-book entity sweep — walks every chapter, calls extractEntities
// per chapter, merges + dedupes proposals across the project.
//
// Parallel: a bounded pool of N workers processes chapters concurrently.
// The pool is PROVIDER-AWARE (C2, 2026-07-18): cloud APIs get 4 workers
// (they genuinely parallelize); the built-in llama.cpp server processes ONE
// request at a time (no -np parallel slots), so against it a 4-wide pool
// just parked 3 requests in its server-side queue while their rows showed
// "scanning" — fake concurrency observed on the real 114-chapter run as a
// row sitting "SCANNING" 10+ minutes of pure queue-wait. Local built-in →
// 1 worker: zero throughput loss (requests serialized anyway) and SCANNING
// means scanning. The per-chapter merge is synchronous and idempotent, so
// workers can share the running aggregate without locking — JS's
// single-threaded execution makes each mergeProposals call atomic.
//
// Cost of parallelism: workers no longer see each other's in-flight
// proposals, so the same name may be proposed by multiple chapters. The
// final dedupe in mergeProposals collapses these correctly; the only
// downside is a few wasted output tokens per duplicate. Worth it for the
// 3-4× wall-clock speed-up on a long book.

import { useAiTasksStore, useResolvedRoute } from "@delebash/llm-ui";
import { LOCAL_RUNNER_ID } from "@delebash/llm-ui/services/modelApply.js";

import { normalizeName as normName } from "../text.js";
import { extractEntities } from "./entityExtraction.js";

const DEFAULT_CONCURRENCY = 4;

// D (2026-07-18): titles that are almost certainly front/back matter, not
// story — the sweep modal unticks them by default (visible, one click
// re-ticks; this list only picks a DEFAULT, it never excludes anything on
// its own). From the real 114-chapter import: the sweep scanned the
// Glossary, the praise pages, and the NEXT book's preview chapters, and
// the proposals contained "The Broken Eye (Book)" extracted from the
// praise page.
const NON_STORY_TITLE_PATTERNS = [
  /^acknowledg/i,             // Acknowledgments / Acknowledgements
  /^glossary\b/i,
  /^appendix\b/i,
  /^extras?\b/i,
  /^about the author/i,
  /^meet the author/i,
  /^also by\b/i,
  /^praise for\b/i,
  /preview of\b/i,            // "A Preview of …"
  /^the story continues/i,
  /^character list\b/i,
  /^dramatis personae/i,
  /^copyright\b/i,
  /^dedication\b/i,
  /^(table of )?contents\b/i,
  /^title page\b/i,
  /^index\b/i,
];

/** True when a chapter title looks like front/back matter (glossary,
 *  acknowledgments, previews of other books…) — used only to pick the
 *  DEFAULT tick state in the sweep's chapter picker. */
export function isLikelyNonStoryTitle(title) {
  const t = String(title || "").trim();
  if (!t) return false;
  return NON_STORY_TITLE_PATTERNS.some((re) => re.test(t));
}

// C2: pick the pool width for this run. An explicit `concurrency` argument
// wins; otherwise the provider decides — a passed provider override directly,
// else the server-resolved route for entitySweep (the same authority the
// modal's provenance chip shows). Built-in local → 1 (single slot); anything
// else → DEFAULT_CONCURRENCY. Route-resolution failure falls back to the old
// default rather than blocking the sweep. Exported for tests.
export async function resolvePoolSize({ concurrency, provider } = {}) {
  if (concurrency != null) return Math.max(1, concurrency | 0 || DEFAULT_CONCURRENCY);
  let providerId = provider?.id || "";
  if (!providerId) {
    try {
      const route = await useResolvedRoute().ensureRoute("entitySweep");
      providerId = route?.providerId || "";
    } catch { /* unreachable route endpoint — keep the old default */ }
  }
  return providerId === LOCAL_RUNNER_ID ? 1 : DEFAULT_CONCURRENCY;
}

// Merge a freshly-scanned chapter's proposals into the running aggregate.
// Same-name proposals get their `originChapters` list extended; the first
// non-empty role / kind / oneLiner / note wins so the eventual review
// modal has the best available description. The evidence quote sticks
// to whichever chapter first surfaced the entity, since that's the only
// quote anchored to a real place.
// Exported since A (2026-07-18): sweepDraft.js re-merges persisted
// per-chapter results into the review aggregate on resume.
export function mergeProposals(into, fresh, chapter) {
  const ref = { id: chapter.id, num: chapter.num, title: chapter.title };

  function merge(list, incoming) {
    for (const item of incoming) {
      const key = normName(item.name);
      if (!key) continue;
      const existing = list.find((x) => normName(x.name) === key);
      if (existing) {
        if (!existing.originChapters.some((c) => c.id === ref.id)) {
          existing.originChapters.push(ref);
        }
        // Backfill empty fields from later mentions.
        for (const f of ["role", "kind", "oneLiner", "note"]) {
          if (!existing[f] && item[f]) existing[f] = item[f];
        }
        // E3: aliases UNION across chapters (different chapters may use
        // different nicknames for the same person).
        if (Array.isArray(item.aliases) && item.aliases.length) {
          const have = new Set((existing.aliases || []).map(normName));
          existing.aliases = [
            ...(existing.aliases || []),
            ...item.aliases.filter((a) => !have.has(normName(a))),
          ];
        }
      } else {
        list.push({ ...item, originChapters: [ref] });
      }
    }
  }

  merge(into.characters, fresh.characters || []);
  merge(into.locations,  fresh.locations  || []);
  merge(into.objects,    fresh.objects    || []);
}

/**
 * Scan every chapter in the project for new entities and return one
 * combined, deduped proposal set. Runs with bounded concurrency.
 *
 * @param {object} opts
 * @param {object} opts.project        — useProjectStore() instance
 * @param {AbortSignal} [opts.signal]  — cancels the whole sweep
 * @param {number}      [opts.concurrency] — max in-flight chapter calls; when
 *   omitted the pool is provider-aware (C2): built-in local → 1, else 4
 * @param {(p) => void} [opts.onProgress] — fires per chapter lifecycle event
 *   p shape: { phase: "start"|"done"|"skip"|"error",
 *              chapter: { id, num, title },
 *              completed, total,
 *              soFar?: { characters, locations, objects }, reason?: string }
 *   "start" fires when a chapter's LLM call begins; "done" / "skip" /
 *   "error" fire as each chapter finishes. `completed` is incremented
 *   AFTER the chapter finishes (not on start), so it always reflects
 *   "chapters finished so far" regardless of which is being reported.
 * @param {object} [opts.provider]     — provider override (debug compare)
 * @param {string} [opts.model]        — model override
 * @param {object} [opts.chapterFilter] — { ids: Set<string> } to scan only a subset
 *
 * Note: onDelta is intentionally NOT supported. With concurrent streams
 * interleaving token deltas isn't legible; per-chapter progress comes
 * through onProgress + the soFar counts instead.
 *
 * @returns {Promise<{ characters, locations, objects, scanned, skipped, totalChapters,
 *                     cancelled }>} — `cancelled` true when the user stopped it early;
 *          the proposals gathered so far are still returned (a cancel is not a failure).
 */
export async function scanAllChapters({
  project,
  signal,
  onProgress,
  provider,
  model,
  chapterFilter,
  concurrency,
} = {}) {
  if (!project) throw new Error("scanAllChapters: project store is required.");
  const all = project.allChapters.filter((c) => {
    if (chapterFilter?.ids) return chapterFilter.ids.has(c.id);
    return true;
  });

  // QC-31, the sanctioned batch-owner pattern (aiTasks.js:124-128, implemented by
  // readerKnowledge.js:231-244 — this is a COPY OF THAT SHAPE, not a new invention):
  // the whole sweep is ONE user action → ONE task entry whose handle owns the ONE
  // controller. Every per-chapter call rides `runSignal` and passes `task: false`, so
  // the strip's single Cancel aborts the WHOLE pool.
  //
  // Before 2026-07-17 this file had NO owner: each chapter registered its own task
  // (entityExtraction.js:81 `task: task || {…}`), so a 4-wide pool made four rival
  // "entitySweep" entries, the modal's Cancel reached only the FIRST, and the pool
  // marched on — every later chapter failing "Request cancelled" as a red ERROR row
  // while the user watched. The user, 2026-07-17: "cancel should cancel everything".
  const aiTasks = useAiTasksStore();
  const handle = aiTasks.start({
    feature: "entitySweep",
    label: "Entity sweep",
    meta: { kind: "sweep" },
  });
  handle.setProgress(0, all.length);
  if (signal) {
    if (signal.aborted) handle.cancel();
    else signal.addEventListener?.("abort", () => handle.cancel(), { once: true });
  }
  const runSignal = handle.signal;

  const proposals = { characters: [], locations: [], objects: [] };
  const skipped = [];
  let completed = 0;
  let scanned = 0;

  // Snapshot the project's existing bible ONCE. Workers can't see each
  // other's in-flight proposals, so the LLM may re-propose the same name
  // across parallel chapters — mergeProposals collapses by normalised
  // name, so the final output stays clean. (The cost is a small extra
  // output-token bill on a long book; well below the wall-clock win.)
  const baselineExisting = {
    characters: project.characters || [],
    locations:  project.locations  || [],
    objects:    project.objects    || [],
  };

  async function processChapter(ch) {
    const html = project.chapterBody[ch.id] || "";
    const text = stripText(html);

    if (!text.trim()) {
      skipped.push({ id: ch.id, num: ch.num, title: ch.title, reason: "empty" });
      completed += 1;
      onProgress?.({
        phase: "skip",
        chapter: { id: ch.id, num: ch.num, title: ch.title },
        completed, total: all.length, reason: "empty",
      });
      return;
    }

    onProgress?.({
      phase: "start",
      chapter: { id: ch.id, num: ch.num, title: ch.title },
      completed, total: all.length,
    });

    try {
      const fresh = await extractEntities({
        html,
        chapterTitle: ch.title,
        chapterNum: ch.num,
        existingCharacters: baselineExisting.characters,
        existingLocations:  baselineExisting.locations,
        existingObjects:    baselineExisting.objects,
        signal: runSignal,
        provider,
        model,
        // task:false — the OWNER above is this sweep's one task entry (QC-31). Without
        // it every chapter registered a rival "entitySweep" task and Cancel only ever
        // reached one of them.
        task: false,
        meta: { chapterId: ch.id, kind: "sweep" },
      });
      // mergeProposals is synchronous → atomic from concurrent workers'
      // point of view in JS's single-thread model.
      mergeProposals(proposals, fresh, ch);
      scanned += 1;
      completed += 1;
      handle.setProgress(completed, all.length);
      onProgress?.({
        phase: "done",
        chapter: { id: ch.id, num: ch.num, title: ch.title },
        completed, total: all.length, soFar: cloneCounts(proposals),
        // A: the chapter's RAW single-chapter extraction — the draft store
        // persists it so a resume can re-merge any subset later.
        fresh,
      });
    } catch (err) {
      // A CANCEL IS NOT AN ERROR. `runSignal.aborted` is the authority — the string
      // sniff stays only as a belt for an abort raised without our signal. The old test
      // was the sniff ALONE (the caller never even passed a signal), and a cancelled
      // call's message reads "Couldn't reach the LLM. Request cancelled." — no "abort"
      // in it — so every in-flight chapter rendered as a red ERROR row for a stop the
      // user asked for.
      const msg = String(err?.message || err || "");
      if (runSignal.aborted || /abort/i.test(msg)) {
        // Bubble so workers exit; caller already has partial proposals.
        throw err;
      }
      skipped.push({ id: ch.id, num: ch.num, title: ch.title, reason: msg.slice(0, 200) });
      completed += 1;
      handle.setProgress(completed, all.length);
      onProgress?.({
        phase: "error",
        chapter: { id: ch.id, num: ch.num, title: ch.title },
        completed, total: all.length, reason: msg.slice(0, 200),
      });
    }
  }

  // Bounded-concurrency pool: N workers pull from a shared queue until
  // it's empty or the signal fires.
  const queue = [...all];
  async function worker() {
    while (queue.length) {
      if (runSignal.aborted) return;
      const ch = queue.shift();
      try {
        await processChapter(ch);
      } catch (err) {
        if (runSignal.aborted || /abort/i.test(String(err?.message || err))) return;
        // processChapter swallows non-abort errors into `skipped`; the
        // only thing that reaches here is an abort.
      }
    }
  }

  const poolSize = Math.max(1, Math.min(await resolvePoolSize({ concurrency, provider }), all.length));
  try {
    await Promise.all(Array.from({ length: poolSize }, () => worker()));
  } finally {
    // Always terminate the entry — a cancelled sweep must not leave a task
    // "streaming" forever in the strip/panel (cancel() already archived it).
    if (!runSignal.aborted) handle.finish({});
  }

  // CANCELLED IS A RETURN VALUE, NOT AN EXCEPTION (2026-07-17). The workers exit by
  // RETURNING when the signal fires, so Promise.all resolves normally — which is why
  // the caller's catch-on-abort cleanup never ran and rows froze on "scanning" forever.
  // Say it in the result instead: the caller marks its unfinished rows and still gets
  // every proposal gathered before the stop.
  return {
    ...proposals, scanned, skipped, totalChapters: all.length,
    cancelled: runSignal.aborted,
  };
}

// Exported since A (2026-07-18): the draft store hashes EXACTLY the text the
// sweep scanned, so "text changed since the draft" is judged on the same bytes.
export function stripChapterText(html) {
  if (!html) return "";
  const div = document.createElement("div");
  div.innerHTML = html;
  div.querySelectorAll(".ai-del").forEach((el) => { el.remove(); });
  div.querySelectorAll(".ai-ins").forEach((el) => { el.replaceWith(...el.childNodes); });
  return div.textContent || "";
}
const stripText = stripChapterText;

function cloneCounts(p) {
  return {
    characters: p.characters.length,
    locations:  p.locations.length,
    objects:    p.objects.length,
  };
}
