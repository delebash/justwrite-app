// Shared prose-text helpers — HTML→plain-text prep for LLM prompts and
// deterministic scans, plus tail-of-text excerpting.
//
// htmlToText was copy-pasted into 16 services/analysis modules and tailWords
// into 6, drifting into option-shaped variants (scene-mark stripping,
// trimming, line tidying; "…" truncation prefix). Single source of truth
// here (the llmText.js convergence, applied to prose input prep); import
// instead of redefining. Genuine variants stay local where the behavior
// really differs: writerAI.js and versionDiff.js keep the AI diff marks,
// voiceFingerprint.js collapses ALL whitespace, labTestData.js collapses
// blank-line runs, and voiceDrift.js's tailWords takes the HEAD of the text.

// Strip an HTML chapter/scene body down to plain text. Always removes
// pending AI-diff marks (.ai-del dropped, .ai-ins unwrapped) so an LLM never
// critiques its own earlier suggestions back to itself.
//   stripSceneMarks — remove .scene-mark separator nodes (default true)
//   trim            — trim the result (default true)
//   tidyLines       — collapse whitespace runs before newlines (default false)
export function htmlToText(html, { stripSceneMarks = true, trim = true, tidyLines = false } = {}) {
  if (!html) return "";
  const div = document.createElement("div");
  div.innerHTML = html;
  div.querySelectorAll(".ai-del").forEach((el) => { el.remove(); });
  div.querySelectorAll(".ai-ins").forEach((el) => { el.replaceWith(...el.childNodes); });
  if (stripSceneMarks) div.querySelectorAll(".scene-mark").forEach((el) => { el.remove(); });
  let text = div.textContent || "";
  if (tidyLines) text = text.replace(/\s+\n/g, "\n");
  return trim ? text.trim() : text;
}

// Last `max` whitespace-separated words of `text` — the most recent prose is
// what matters for "where did I leave off". Returns `text` unchanged when it
// is short enough; `ellipsis: true` prefixes "… " when truncation happened.
export function tailWords(text, max, { ellipsis = false } = {}) {
  if (!text) return "";
  const parts = text.split(/\s+/);
  if (parts.length <= max) return text;
  const tail = parts.slice(-max).join(" ");
  return ellipsis ? `… ${tail}` : tail;
}
