// The AI-text mark's reading side (the mark itself: server/src/editor/aiText.js; the design:
// docs/plans/2026-10-18-ai-text-mark-and-slice-4.md §2): the per-book record — how many words
// of the book's scenes the AI wrote and are still there.

/** Words inside AI-text spans in one HTML body. */
export function aiWrittenWords(html) {
  if (!html?.includes("data-ai-text")) return 0;
  const div = document.createElement("div");
  div.innerHTML = html;
  let n = 0;
  for (const el of div.querySelectorAll("[data-ai-text]")) {
    n += (el.textContent.match(/\S+/g) || []).length;
  }
  return n;
}

/** Words inside AI-text spans across every scene of the book. */
export function bookAiWrittenWords(project) {
  let n = 0;
  for (const scenes of Object.values(project?.scenes || {})) {
    for (const scene of scenes || []) n += aiWrittenWords(scene.body);
  }
  return n;
}

/** The chapters with words still marked, in book order — `{ chapterId, num, title, ai, words }`
 *  (`words` the chapter's own count) — for the breakdown under the book's count in Settings →
 *  Project (2026-10-28, docs/plans/2026-10-28-four-feature-ideas.md §2). */
export function chapterAiWrittenWords(project) {
  return (project?.allChapters || [])
    .map((c) => ({
      chapterId: c.id,
      num: c.num,
      title: c.title || "",
      ai: (project.scenes?.[c.id] || []).reduce((n, s) => n + aiWrittenWords(s.body), 0),
      words: c.words || 0,
    }))
    .filter((r) => r.ai > 0);
}
