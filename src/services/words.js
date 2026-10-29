// A scene's or chapter's word count as the chapter rollup counts it: tags stripped, split on
// whitespace. Moved out of stores/project.js (2026-10-29) so Analysis' POV balance counts a scene
// exactly as its chapter's total does.
export function wordCountFromHtml(html) {
  if (!html) return 0;
  const text = String(html).replace(/<[^>]+>/g, " ").trim();
  return text ? text.split(/\s+/).length : 0;
}
