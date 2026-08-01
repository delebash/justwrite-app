// chapterStitch.js — round-trip utilities for the continuous-chapter
// editor mode.
//
// stitchChapter(scenes) → one HTML blob with every scene's body, each
//   prefixed by a <div data-scene-boundary> carrying the scene's id /
//   title / index. That blob feeds the RichEditor's modelValue when the
//   user toggles continuous mode on for a chapter.
//
// splitChapter(html) → an array of { sceneId, title, body, isNew }
//   reconstructed from the stitched HTML. Boundaries that survived the
//   round-trip preserve their original sceneId. New boundaries (a
//   writer's brand-new scene inserted in continuous mode) come back
//   with sceneId === null and isNew === true so the caller can mint a
//   fresh scene record. Adjacent scenes whose boundary was deleted
//   collapse into the previous one (the canonical "merge scenes" gesture).
//
// We never split on text content — only on the dedicated
// data-scene-boundary div. The TipTap node is `atom: true`, so writers
// can't accidentally insert one by typing.

function escapeAttr(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/"/g, "&quot;")
    .replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Build a stitched HTML string from a chapter's scenes.
 * @param {Array<{ id: string, title?: string, body?: string }>} scenes
 * @returns {string}
 */
export function stitchChapter(scenes = []) {
  if (!scenes.length) return "";
  const parts = [];
  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i];
    parts.push(
      `<div data-scene-boundary="true"` +
        ` data-scene-id="${escapeAttr(s.id)}"` +
        ` data-scene-title="${escapeAttr(s.title || "")}"` +
        ` data-scene-idx="${i}"></div>`,
    );
    parts.push(s.body || "");
  }
  return parts.join("");
}

/**
 * Reverse stitchChapter: given the editor's current HTML, return an
 * array of scene records keyed by their original sceneId (when possible).
 * @param {string} html
 * @returns {Array<{ sceneId: string|null, title: string, body: string, isNew: boolean }>}
 */
export function splitChapter(html) {
  if (!html?.trim()) return [];
  const container = document.createElement("div");
  container.innerHTML = html;

  // Pre-pass: collect top-level child nodes in document order. The
  // splitter expects boundaries and content to be siblings; TipTap's
  // schema enforces that for atom block nodes.
  const out = [];
  let current = null;
  // Content typed *before* the first boundary (rare — would only happen
  // if a boundary got removed from the head of the document) accumulates
  // into a "leading orphan" record so we don't lose the writer's work.
  const leadingOrphan = { sceneId: null, title: "", body: "", isNew: true };
  let hasLeading = false;

  for (const node of Array.from(container.childNodes)) {
    if (node.nodeType !== 1) {
      if (!current) {
        if (node.textContent?.trim()) {
          leadingOrphan.body += node.textContent;
          hasLeading = true;
        }
      } else {
        current.body += (node.outerHTML || node.textContent || "");
      }
      continue;
    }
    const el = /** @type {Element} */ (node);
    if (el.getAttribute && el.getAttribute("data-scene-boundary") === "true") {
      if (current) out.push(current);
      current = {
        sceneId: el.getAttribute("data-scene-id") || null,
        title: el.getAttribute("data-scene-title") || "",
        body: "",
        isNew: !el.getAttribute("data-scene-id"),
      };
    } else if (current) {
      current.body += el.outerHTML;
    } else {
      // Content before the first boundary.
      leadingOrphan.body += el.outerHTML;
      hasLeading = true;
    }
  }
  if (current) out.push(current);
  if (hasLeading) {
    // If the leading orphan has non-empty body, prepend it as a new
    // scene at the top. If there are no boundaries at all, the orphan
    // IS the chapter — one scene covering everything.
    if (leadingOrphan.body.trim()) out.unshift(leadingOrphan);
  }
  // Normalize bodies — trim leading/trailing whitespace TipTap may have
  // serialized around blocks, but preserve interior structure.
  for (const s of out) s.body = s.body.trim();
  return out;
}
