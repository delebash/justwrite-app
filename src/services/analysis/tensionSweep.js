// Whole-book story-tension sweep.
//
// Walks every chapter that doesn't already have a critique.structure
// payload and runs runStructuralAnalysis on it. Sequential (one chapter
// at a time) — keeps things gentle on local model servers and gives
// the user predictable per-chapter progress. Re-running on an
// already-analysed book is a no-op unless `force: true`.
//
// The output of runStructuralAnalysis (tension, hookQuality, pacing,
// endingClass, summary) already drops into chapter.critique.structure
// via the caller's setChapterCritique action — this service just
// orchestrates the walk.

import { runStructuralAnalysis } from "./critique.js";

export async function sweepStoryTension({
  project,
  signal,
  onProgress,
  provider,
  model,
  force = false,
  chapterFilter,
} = {}) {
  if (!project) throw new Error("sweepStoryTension: project store is required.");

  const allChapters = project.allChapters.filter((c) => {
    if (chapterFilter?.ids) return chapterFilter.ids.has(c.id);
    return true;
  });

  // Skip chapters that already have a structure unless force=true.
  const targets = allChapters.filter((c) => force || !c.critique?.structure);
  let completed = 0;
  const skipped = [];

  for (const ch of targets) {
    if (signal?.aborted) break;
    const html = project.chapterBody[ch.id] || "";

    onProgress?.({
      phase: "start",
      chapter: { id: ch.id, num: ch.num, title: ch.title },
      completed, total: targets.length,
    });

    if (!html.trim()) {
      skipped.push({ id: ch.id, num: ch.num, title: ch.title, reason: "empty" });
      completed += 1;
      onProgress?.({
        phase: "skip",
        chapter: { id: ch.id, num: ch.num, title: ch.title },
        completed, total: targets.length, reason: "empty",
      });
      continue;
    }

    try {
      const result = await runStructuralAnalysis({
        html,
        chapterTitle: ch.title,
        chapterNum: ch.num,
        meta: { chapterId: ch.id, kind: "tension-sweep" },
        signal, provider, model,
      });
      // Persist via the existing critique mutator. Preserve any prior
      // text notes — only the structure half is updated.
      const next = { ...(ch.critique || {}), structure: result };
      if (!next.generatedAt) next.generatedAt = result.generatedAt;
      if (!next.model) next.model = result.model;
      project.setChapterCritique(ch.id, next);

      completed += 1;
      onProgress?.({
        phase: "done",
        chapter: { id: ch.id, num: ch.num, title: ch.title },
        completed, total: targets.length, result,
      });
    } catch (err) {
      const msg = String(err?.message || err || "");
      if (signal?.aborted || /abort/i.test(msg)) break;
      skipped.push({ id: ch.id, num: ch.num, title: ch.title, reason: msg.slice(0, 200) });
      completed += 1;
      onProgress?.({
        phase: "error",
        chapter: { id: ch.id, num: ch.num, title: ch.title },
        completed, total: targets.length, reason: msg.slice(0, 200),
      });
    }
  }

  return {
    scanned: targets.length - skipped.length,
    skipped,
    totalTargets: targets.length,
  };
}
