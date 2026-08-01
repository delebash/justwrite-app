// Scene-break splitting for IMPORTED chapter HTML (E5, RAG build 2026-07-11 —
// docs/plans/2026-07-11-rag-story-bible-build.md §T6). Imported chapters used
// to land as ONE scene each (stores/project.js importChapters), which made
// RAG chunks whole-chapter blobs and excerpts show only each chapter's
// opening 1200 chars.
//
// This is a marker-normalizing PRE-PASS over chapterStitch's splitChapter —
// THE one HTML→scenes splitter (panel-required reuse): visible manuscript
// break markers are converted into the editor's `data-scene-boundary` atoms,
// then splitChapter does the actual splitting (leading-orphan handling and
// body trimming come free).
//
// Marker set (flag F8 — the manuscript-standard forms):
//   * a block element (<p>/<h*>/<div>) whose TEXT is only asterisks, hashes,
//     tildes, or dashes with optional spaces — "* * *", "***", "#", "— — —"
//   * an <hr>
//   * an existing `.scene-mark` paragraph (the editor's own separator)
// The marker is CONSUMED — the boundary replaces it, matching how the
// stitcher re-inserts `<p class="scene-mark">* * *</p>` between scenes.
// Runs of empty paragraphs are NOT a break (docx exports are full of them).

import { splitChapter } from "./chapterStitch.js";

// Only marker glyphs (with optional whitespace), and at least one of them.
const MARKER_TEXT = /^[\s*#~—–-]+$/;
const HAS_MARKER_GLYPH = /[*#~—–-]/;

function isBreakMarker(el) {
  if (el.tagName === "HR") return true;
  if (el.classList?.contains("scene-mark")) return true;
  if (!/^(P|H[1-6]|DIV)$/.test(el.tagName)) return false;
  const text = el.textContent || "";
  return HAS_MARKER_GLYPH.test(text) && MARKER_TEXT.test(text);
}

/**
 * Split imported chapter HTML into scene records on visible break markers.
 * No markers → one record covering the whole chapter (byte-identical body).
 *
 * @param {string} html
 * @returns {Array<{ title: string, body: string }>}
 */
export function splitHtmlIntoScenes(html) {
  if (!html?.trim()) return [];
  const container = document.createElement("div");
  container.innerHTML = html;

  let found = false;
  for (const el of Array.from(container.children)) {
    if (isBreakMarker(el)) {
      const boundary = document.createElement("div");
      boundary.setAttribute("data-scene-boundary", "true");
      el.replaceWith(boundary);
      found = true;
    }
  }
  // Fast path: nothing to split — return the original html untouched so an
  // unmarked import stays byte-identical to today's single-scene behavior.
  if (!found) return [{ title: "", body: html }];

  return splitChapter(container.innerHTML)
    .map((r) => ({ title: r.title || "", body: r.body }))
    .filter((r) => r.body.trim().length > 0);
}
