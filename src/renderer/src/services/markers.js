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
