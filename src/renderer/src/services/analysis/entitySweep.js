// Whole-book entity sweep — walks every chapter, calls extractEntities
// per chapter, merges + dedupes proposals across the project.
//
// Parallel: a bounded pool of N workers processes chapters concurrently.
// Default N=4 balances cloud APIs (which want concurrency) and local
// servers (which generally can't handle a dozen parallel streams). The
// per-chapter merge is synchronous and idempotent, so workers can share
// the running aggregate without locking — JS's single-threaded execution
// makes each mergeProposals call atomic.
//
// Cost of parallelism: workers no longer see each other's in-flight
// proposals, so the same name may be proposed by multiple chapters. The
// final dedupe in mergeProposals collapses these correctly; the only
// downside is a few wasted output tokens per duplicate. Worth it for the
// 3-4× wall-clock speed-up on a long book.

import { normalizeName as normName } from "../text.js";
import { extractEntities } from "./entityExtraction.js";

const DEFAULT_CONCURRENCY = 4;

// Merge a freshly-scanned chapter's proposals into the running aggregate.
// Same-name proposals get their `originChapters` list extended; the first
// non-empty role / kind / oneLiner / note wins so the eventual review
// modal has the best available description. The evidence quote sticks
// to whichever chapter first surfaced the entity, since that's the only
// quote anchored to a real place.
function mergeProposals(into, fresh, chapter) {
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
 * @param {number}      [opts.concurrency=4] — max in-flight chapter calls
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
 * @returns {Promise<{ characters, locations, objects, scanned, skipped, totalChapters }>}
 */
export async function scanAllChapters({
  project,
  signal,
  onProgress,
  provider,
  model,
  chapterFilter,
  concurrency = DEFAULT_CONCURRENCY,
} = {}) {
  if (!project) throw new Error("scanAllChapters: project store is required.");
  const all = project.allChapters.filter((c) => {
    if (chapterFilter?.ids) return chapterFilter.ids.has(c.id);
    return true;
  });

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
        signal,
        provider,
        model,
        meta: { chapterId: ch.id, kind: "sweep" },
      });
      // mergeProposals is synchronous → atomic from concurrent workers'
      // point of view in JS's single-thread model.
      mergeProposals(proposals, fresh, ch);
      scanned += 1;
      completed += 1;
      onProgress?.({
        phase: "done",
        chapter: { id: ch.id, num: ch.num, title: ch.title },
        completed, total: all.length, soFar: cloneCounts(proposals),
      });
    } catch (err) {
      const msg = String(err?.message || err || "");
      if (signal?.aborted || /abort/i.test(msg)) {
        // Bubble so workers exit; caller already has partial proposals.
        throw err;
      }
      skipped.push({ id: ch.id, num: ch.num, title: ch.title, reason: msg.slice(0, 200) });
      completed += 1;
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
      if (signal?.aborted) return;
      const ch = queue.shift();
      try {
        await processChapter(ch);
      } catch (err) {
        if (signal?.aborted || /abort/i.test(String(err?.message || err))) return;
        // processChapter swallows non-abort errors into `skipped`; the
        // only thing that reaches here is an abort.
      }
    }
  }

  const poolSize = Math.max(1, Math.min(concurrency | 0 || DEFAULT_CONCURRENCY, all.length));
  await Promise.all(Array.from({ length: poolSize }, () => worker()));

  return { ...proposals, scanned, skipped, totalChapters: all.length };
}

function stripText(html) {
  if (!html) return "";
  const div = document.createElement("div");
  div.innerHTML = html;
  div.querySelectorAll(".ai-del").forEach((el) => { el.remove(); });
  div.querySelectorAll(".ai-ins").forEach((el) => { el.replaceWith(...el.childNodes); });
  return div.textContent || "";
}

function cloneCounts(p) {
  return {
    characters: p.characters.length,
    locations:  p.locations.length,
    objects:    p.objects.length,
  };
}
