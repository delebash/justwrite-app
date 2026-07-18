// The entity sweep's per-project working draft (A, 2026-07-18).
//
// The sweep modal writes each chapter's RAW extraction result here the moment
// the chapter finishes, so a crash, cancel, or app close never loses an
// hour-long run: reopening the modal resumes from the draft and only re-scans
// chapters that are pending, failed, or whose text changed since they were
// scanned. The draft is working state, NOT the book — nothing lands in the
// story bible until the user accepts proposals — and it's cleared on accept or
// Start-over. Server side: one JSON row per project
// (/v1/projects/{id}/sweep-draft, api/sweep_draft.py).
//
// Draft document shape (version 1):
//   { version: 1,
//     chapters: { [chapterId]: {
//        chapter:  { id, num, title },
//        status:   "done" | "error",
//        textHash: <hash of the stripped chapter text at scan time>,
//        counts:   { characters, locations, objects },   // done rows
//        proposals: { characters, locations, objects },  // done rows — RAW,
//                                                        // single-chapter
//        reason:   <string>,                             // error rows
//     } } }
//
// Storing RAW per-chapter results (not the merged aggregate) is the load-
// bearing choice: any subset can be re-scanned and the review aggregate is
// re-merged from scratch with the same mergeProposals the live sweep uses.

import { del, get, put } from "@delebash/llm-ui";

import { mergeProposals } from "./entitySweep.js";

// ── server io ───────────────────────────────────────────────────────────

export async function loadSweepDraft(projectId) {
  if (!projectId) return null;
  const r = await get(`/v1/projects/${encodeURIComponent(projectId)}/sweep-draft`);
  return r?.draft || null;
}

export async function saveSweepDraft(projectId, draft) {
  if (!projectId) return;
  await put(`/v1/projects/${encodeURIComponent(projectId)}/sweep-draft`, draft || {});
}

export async function clearSweepDraft(projectId) {
  if (!projectId) return;
  await del(`/v1/projects/${encodeURIComponent(projectId)}/sweep-draft`);
}

// ── pure helpers (the modal stays thin; these carry the logic + the tests) ──

/** FNV-1a over the stripped chapter text — cheap change detection, not
 *  cryptography. Stable across sessions; "" hashes to the FNV offset. */
export function textHash(s) {
  let h = 0x811c9dc5;
  const str = String(s || "");
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h.toString(36);
}

export function emptyDraft() {
  return { version: 1, chapters: {} };
}

/** Record a finished chapter into the draft (mutates + returns it). */
export function recordChapterDone(draft, chapter, fresh, hash) {
  draft.chapters[chapter.id] = {
    chapter: { id: chapter.id, num: chapter.num, title: chapter.title },
    status: "done",
    textHash: hash,
    counts: {
      characters: fresh?.characters?.length || 0,
      locations: fresh?.locations?.length || 0,
      objects: fresh?.objects?.length || 0,
    },
    proposals: fresh || { characters: [], locations: [], objects: [] },
  };
  return draft;
}

/** Record a failed chapter into the draft (mutates + returns it). */
export function recordChapterError(draft, chapter, reason, hash) {
  draft.chapters[chapter.id] = {
    chapter: { id: chapter.id, num: chapter.num, title: chapter.title },
    status: "error",
    textHash: hash,
    reason: String(reason || "").slice(0, 200),
  };
  return draft;
}

/** Does this chapter need (re-)scanning? No entry → yes; error → yes;
 *  done but the text changed since → yes; done and unchanged → no. */
export function needsScan(entry, currentHash) {
  if (!entry) return true;
  if (entry.status !== "done") return true;
  return entry.textHash !== currentHash;
}

/** {done, failed} across the draft. */
export function draftCounts(draft) {
  let done = 0;
  let failed = 0;
  for (const e of Object.values(draft?.chapters || {})) {
    if (e.status === "done") done += 1;
    else if (e.status === "error") failed += 1;
  }
  return { done, failed };
}

/** Total entities found across done entries — the "Review N found" count. */
export function draftFoundTotal(draft) {
  let n = 0;
  for (const e of Object.values(draft?.chapters || {})) {
    if (e.status !== "done") continue;
    n += (e.counts?.characters || 0) + (e.counts?.locations || 0) + (e.counts?.objects || 0);
  }
  return n;
}

/** Drop draft entries for chapters no longer in the book. Returns true when
 *  anything was pruned (caller persists the slimmer draft). */
export function pruneDraft(draft, currentChapterIds) {
  const keep = currentChapterIds instanceof Set ? currentChapterIds : new Set(currentChapterIds);
  let pruned = false;
  for (const id of Object.keys(draft?.chapters || {})) {
    if (!keep.has(id)) {
      delete draft.chapters[id];
      pruned = true;
    }
  }
  return pruned;
}

/** Re-merge every done entry (chapter order) into ONE review aggregate — the
 *  same shape scanAllChapters returns, built with the same mergeProposals. */
export function rebuildProposals(draft) {
  const agg = { characters: [], locations: [], objects: [] };
  const entries = Object.values(draft?.chapters || {})
    .filter((e) => e.status === "done")
    .sort((a, b) => (a.chapter?.num || 0) - (b.chapter?.num || 0));
  for (const e of entries) {
    mergeProposals(agg, e.proposals || {}, e.chapter);
  }
  return agg;
}
