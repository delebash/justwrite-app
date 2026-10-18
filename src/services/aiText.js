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
