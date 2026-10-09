// In-text markers — drop-a-pin-and-keep-writing notes for the manuscript.
//
// Markers are TipTap marks stored inline in scene HTML. They're meant to
// be low-friction interruptions during drafting (hotkey, pick a category,
// type 3 words, back to writing) and a manuscript-wide "where are my
// unresolved problems clustering" view in revision.
//
// Storage: <span data-marker-category data-marker-label data-marker-id>text</span>
// inside the scene body. No separate store — markers travel with the prose
// like comments, so split/merge/copy operations carry them automatically.

import { Mark } from "@tiptap/core";

// Built-in categories. Hard-coded for now — promoting to a user-editable
// palette (like statuses) is a small refactor when the time comes.
export const MARKER_CATEGORIES = [
  { id: "fix",     label: "Fix later",    color: "var(--marker-fix)" },
  { id: "verify",  label: "Verify",       color: "var(--marker-verify)" },
  { id: "weak",    label: "Weak prose",   color: "var(--marker-weak)" },
  { id: "thread",  label: "Loose thread", color: "var(--marker-thread)" },
  { id: "todo",    label: "TODO",         color: "var(--marker-todo)" },
  { id: "idea",    label: "Idea",         color: "var(--marker-idea)" },
];

export function categoryById(id) {
  return MARKER_CATEGORIES.find((c) => c.id === id) || MARKER_CATEGORIES[0];
}

function uid() {
  return `mk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export const Marker = Mark.create({
  name: "marker",
  inclusive: false,
  excludes: "",
  addAttributes() {
    return {
      category: {
        default: "fix",
        parseHTML: (el) => el.getAttribute("data-marker-category") || "fix",
        renderHTML: (attrs) => ({ "data-marker-category": attrs.category || "fix" }),
      },
      label: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-marker-label") || "",
        renderHTML: (attrs) => (attrs.label ? { "data-marker-label": attrs.label } : {}),
      },
      markerId: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-marker-id") || null,
        renderHTML: (attrs) => (attrs.markerId ? { "data-marker-id": attrs.markerId } : {}),
      },
    };
  },
  parseHTML() { return [{ tag: "span[data-marker-category]" }]; },
  renderHTML({ HTMLAttributes }) {
    return ["span", { class: "marker-mark", ...HTMLAttributes }, 0];
  },
  addCommands() {
    return {
      setMarker: ({ category, label } = {}) => ({ commands }) => commands.setMark("marker", {
        category: category || "fix",
        label: label || "",
        markerId: uid(),
      }),
      unsetMarker: () => ({ commands }) => commands.unsetMark("marker"),
    };
  },
});

// Strip every HTML tag except the marker span itself, then walk the
// resulting DOM to collect markers in order. Returns:
//   [{ markerId, category, label, snippet, textOffset }]
// where `textOffset` is the character index in the plain-text body where
// the marker begins (so MarkersView can render proportional ticks on the
// scene's strip).
function scanSceneBody(html) {
  if (!html) return { markers: [], plainLength: 0 };
  const div = document.createElement("div");
  div.innerHTML = html;

  const markers = [];
  let textOffset = 0;
  const walker = document.createTreeWalker(div, NodeFilter.SHOW_ALL, null);
  let node = walker.nextNode();
  while (node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const len = node.nodeValue?.length || 0;
      // Is this text inside a marker span?
      let p = node.parentElement;
      while (p && p !== div) {
        if (p.hasAttribute?.("data-marker-category")) {
          const id = p.getAttribute("data-marker-id");
          if (id && !markers.some((m) => m.markerId === id)) {
            markers.push({
              markerId: id,
              category: p.getAttribute("data-marker-category") || "fix",
              label: p.getAttribute("data-marker-label") || "",
              snippet: (p.textContent || "").slice(0, 120),
              textOffset,
            });
          }
          break;
        }
        p = p.parentElement;
      }
      textOffset += len;
    }
    node = walker.nextNode();
  }
  return { markers, plainLength: textOffset };
}

// Walk every chapter → scene → marker in the project and return a flat
// list ordered by manuscript position, with each marker carrying its
// project-wide normalized position (0..1) for the timeline strip.
//
// Returns:
//   [{
//     markerId, category, label, snippet,
//     chapterId, chapterNum, chapterTitle,
//     sceneId, sceneIdx, sceneTitle,
//     projectPos,   // 0..1 — fraction of total project text before this marker
//   }]
export function scanProjectMarkers(project) {
  const out = [];
  const chapters = project.allChapters;

  // First pass: collect markers + per-scene plain length, total length.
  const perScene = [];
  let totalLen = 0;
  for (let ci = 0; ci < chapters.length; ci++) {
    const ch = chapters[ci];
    const scenes = project.scenesFor(ch.id);
    for (let si = 0; si < scenes.length; si++) {
      const scn = scenes[si];
      const { markers, plainLength } = scanSceneBody(scn.body || "");
      perScene.push({ ch, ci, scn, si, markers, plainLength, startAt: totalLen });
      totalLen += plainLength;
    }
  }

  // Second pass: emit markers with normalized project positions.
  const denom = Math.max(1, totalLen);
  for (const entry of perScene) {
    for (const m of entry.markers) {
      out.push({
        markerId: m.markerId,
        category: m.category,
        label: m.label,
        snippet: m.snippet,
        chapterId: entry.ch.id,
        chapterNum: entry.ci + 1,
        chapterTitle: entry.ch.title || "",
        sceneId: entry.scn.id,
        sceneIdx: entry.si,
        sceneTitle: entry.scn.title || "",
        projectPos: (entry.startAt + m.textOffset) / denom,
      });
    }
  }

  return out;
}

// Add a marker by wrapping the first occurrence of `snippet` (plain
// text) in a scene's HTML with a marker span. Returns the new HTML, or
// null if the snippet wasn't found (callers can fall back to skipping
// the marker rather than failing the whole save).
//
// Used by features that propose markers from outside the editor — the
// end-of-session recap, dangling-thread tracker, etc. — where the LLM
// surfaces a phrase from the prose and we want to pin it without the
// writer manually selecting and applying.
//
// Matching:
//   - normalized whitespace (runs of spaces/tabs/newlines collapse to one)
//   - case-sensitive
//   - first text-only match within a single text node, OR a span of text
//     nodes inside the same parent
//
// If the snippet straddles formatting boundaries we currently skip
// (returning null) rather than mangle inline marks. Good-enough for
// recap suggestions, which the LLM is asked to quote verbatim from a
// continuous run of prose.
export function addMarkerToSceneHtml(html, snippet, { category = "thread", label = "" } = {}) {
  if (!html || !snippet) return null;
  const cleanSnippet = String(snippet).replace(/\s+/g, " ").trim();
  if (!cleanSnippet) return null;

  const div = document.createElement("div");
  div.innerHTML = html;

  // Build a flat list of text nodes with their cumulative normalised
  // offsets so we can locate the snippet across a contiguous run.
  const walker = document.createTreeWalker(div, NodeFilter.SHOW_TEXT, null);
  const nodes = [];
  let node = walker.nextNode();
  let cursor = 0;
  while (node) {
    // Skip text nodes already inside a marker span — don't double-wrap.
    let inMarker = false;
    let p = node.parentElement;
    while (p && p !== div) {
      if (p.hasAttribute?.("data-marker-category")) { inMarker = true; break; }
      p = p.parentElement;
    }
    if (!inMarker) {
      const raw = node.nodeValue || "";
      // Normalise whitespace for matching but remember the raw length too.
      const norm = raw.replace(/\s+/g, " ");
      nodes.push({ node, raw, norm, normStart: cursor });
      cursor += norm.length;
    }
    node = walker.nextNode();
  }

  // Concatenate the normalised text and find the snippet's offset.
  const fullNorm = nodes.map((n) => n.norm).join("");
  const hit = fullNorm.indexOf(cleanSnippet);
  if (hit < 0) return null;
  const hitEnd = hit + cleanSnippet.length;

  // Resolve the start/end node + offset for the slice.
  function locate(targetOffset) {
    for (const n of nodes) {
      const end = n.normStart + n.norm.length;
      if (targetOffset <= end) {
        // Map the normalised offset back to a raw offset within this text node.
        const local = Math.max(0, targetOffset - n.normStart);
        // Walk the raw string consuming whitespace runs as one. Tracks
        // the raw index that corresponds to the normalised `local`.
        let rawIdx = 0;
        let normIdx = 0;
        const raw = n.raw;
        while (rawIdx < raw.length && normIdx < local) {
          const ws = /\s/.test(raw[rawIdx]);
          if (ws) {
            // consume the whole whitespace run, count as 1 normalised char
            while (rawIdx < raw.length && /\s/.test(raw[rawIdx])) rawIdx++;
            normIdx++;
          } else {
            rawIdx++;
            normIdx++;
          }
        }
        return { node: n.node, offset: rawIdx };
      }
    }
    return null;
  }
  const startLoc = locate(hit);
  const endLoc = locate(hitEnd);
  if (!startLoc || !endLoc) return null;

  // Require start and end nodes to share a common ancestor that isn't
  // the document — otherwise wrapping across boundaries would have to
  // split formatting marks. We allow same-parent OR same-paragraph: walk
  // up to find a block-level ancestor (P/LI/DIV/etc.) and require both
  // sit inside the same one.
  function block(n) {
    let p = n.parentNode;
    while (p && p !== div) {
      const tag = (p.tagName || "").toLowerCase();
      if (["p", "li", "blockquote", "div", "td", "th"].includes(tag)) return p;
      p = p.parentNode;
    }
    return p || div;
  }
  if (block(startLoc.node) !== block(endLoc.node)) return null;

  // Use a Range to extract the contents into a marker span. This handles
  // multi-text-node, mark-spanning cases cleanly when start/end share a
  // block container.
  const range = document.createRange();
  try {
    range.setStart(startLoc.node, startLoc.offset);
    range.setEnd(endLoc.node, endLoc.offset);
  } catch {
    return null;
  }
  const span = document.createElement("span");
  span.setAttribute("data-marker-category", category);
  span.setAttribute("data-marker-id", uid());
  if (label) span.setAttribute("data-marker-label", label);
  try {
    const contents = range.extractContents();
    span.appendChild(contents);
    range.insertNode(span);
  } catch {
    return null;
  }
  return div.innerHTML;
}

// Remove a marker (by id) from a scene's HTML and return the new HTML.
// Pure string transformation so callers can hand the result straight to
// project.setSceneBody / updateScene.
export function removeMarkerFromHtml(html, markerId) {
  if (!html || !markerId) return html;
  const div = document.createElement("div");
  div.innerHTML = html;
  const el = div.querySelector(`[data-marker-id="${CSS.escape(markerId)}"]`);
  if (!el) return html;
  // Unwrap — keep children, drop the span.
  const parent = el.parentNode;
  while (el.firstChild) parent.insertBefore(el.firstChild, el);
  parent.removeChild(el);
  return div.innerHTML;
}
