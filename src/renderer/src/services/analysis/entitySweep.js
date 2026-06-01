// Whole-book entity sweep — walks every chapter, calls extractEntities
// per chapter, merges + dedupes proposals across the project.
//
// The single-chapter call (extractEntities) is the building block; this
// is the orchestration. We loop sequentially rather than in parallel so:
//   - the user's local LLM isn't slammed with N concurrent requests
//   - progress reporting can name "currently scanning chapter X of N"
//   - cancellation between chapters cleanly stops further work

import { extractEntities } from "./entityExtraction.js";

function normName(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFC")
    .replace(/[^\p{Letter}\p{Number}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

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
 * combined, deduped proposal set.
 *
 * @param {object} opts
 * @param {object} opts.project        — useProjectStore() instance
 * @param {AbortSignal} [opts.signal]  — cancels the whole sweep
 * @param {(p) => void} [opts.onProgress] — fires as each chapter starts
 *   p shape: { index, total, chapter: { id, num, title }, soFar: { characters, locations, objects } }
 * @param {(delta: string, content: string) => void} [opts.onDelta] — streams tokens for the current chapter's call
 * @param {object} [opts.provider]     — provider override (debug compare)
 * @param {string} [opts.model]        — model override
 * @param {object} [opts.chapterFilter] — { ids: Set<string> } to scan only a subset
 *
 * @returns {Promise<{ characters, locations, objects, scanned, skipped }>}
 */
export async function scanAllChapters({
  project,
  signal,
  onProgress,
  onDelta,
  provider,
  model,
  chapterFilter,
} = {}) {
  if (!project) throw new Error("scanAllChapters: project store is required.");
  const all = project.allChapters.filter((c) => {
    if (chapterFilter?.ids) return chapterFilter.ids.has(c.id);
    return true;
  });

  const proposals = { characters: [], locations: [], objects: [] };
  const skipped = [];
  let scanned = 0;

  // The "existing" set grows as we accept proposals into the aggregate so
  // each next chapter sees both the project's bible AND the names we've
  // already proposed in earlier chapters of this sweep — preventing the
  // LLM from re-proposing the same name in every chapter it appears.
  function existingFor(slot) {
    const fromProject = project[slot] || [];
    const fromSweep = proposals[slot].map((p) => ({ name: p.name }));
    return [...fromProject, ...fromSweep];
  }

  for (let i = 0; i < all.length; i++) {
    if (signal?.aborted) break;
    const ch = all[i];
    const html = project.chapterBody[ch.id] || "";
    const text = stripText(html);

    onProgress?.({
      index: i,
      total: all.length,
      chapter: { id: ch.id, num: ch.num, title: ch.title },
      soFar: cloneCounts(proposals),
    });

    // Skip chapters that have no prose to scan — counts as skipped, not
    // as an error.
    if (!text.trim()) {
      skipped.push({ id: ch.id, num: ch.num, title: ch.title, reason: "empty" });
      continue;
    }

    try {
      const fresh = await extractEntities({
        html,
        chapterTitle: ch.title,
        chapterNum: ch.num,
        existingCharacters: existingFor("characters"),
        existingLocations:  existingFor("locations"),
        existingObjects:    existingFor("objects"),
        signal,
        onDelta,
        provider,
        model,
        meta: { chapterId: ch.id, kind: "sweep" },
      });
      mergeProposals(proposals, fresh, ch);
      scanned++;
    } catch (err) {
      // Abort: stop the loop cleanly so the caller can show partial
      // results instead of an error. Any other failure on a single
      // chapter is logged into `skipped` and the sweep continues.
      const msg = String(err?.message || err || "");
      if (signal?.aborted || /abort/i.test(msg)) break;
      skipped.push({ id: ch.id, num: ch.num, title: ch.title, reason: msg.slice(0, 200) });
    }
  }

  return { ...proposals, scanned, skipped, totalChapters: all.length };
}

function stripText(html) {
  if (!html) return "";
  const div = document.createElement("div");
  div.innerHTML = html;
  div.querySelectorAll(".ai-del").forEach((el) => el.remove());
  div.querySelectorAll(".ai-ins").forEach((el) => el.replaceWith(...el.childNodes));
  return div.textContent || "";
}

function cloneCounts(p) {
  return {
    characters: p.characters.length,
    locations:  p.locations.length,
    objects:    p.objects.length,
  };
}
