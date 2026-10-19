// SPDX-License-Identifier: MIT
// Prose highlights (2026-10-18, the editor-expansion plan's piece 3): Writing settings' Filter
// words, Adverbs and AI-tell phrases, marked in the editor as you write. The catalogs are the ones
// Analysis counts with (styleMetrics' filter words and -ly adverbs, the AI-tell scan's phrases),
// so the editor and Analysis agree. They are English lists: English books only (RichEditor
// decides, from the book's language).
//
// ProseMirror inline decorations (prosemirror.net/docs/ref/#view.Decoration^inline), the way
// searchReplace.js marks its matches: view-only, never in the document or the undo history. An
// edit maps the old marks and rescans only the blocks it touched (DecorationSet.map / remove /
// add). Nothing is scanned while all three are off.
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { tellRanges } from "./analysis/aiTellScanner.js";
import { adverbRanges, filterWordRanges } from "./analysis/styleMetrics.js";

export const proseHighlightsKey = new PluginKey("proseHighlights");

// One character per position: an inline node that isn't text (a mention, an image, a hard break)
// stands in as U+FFFC for each of its positions, so an offset in the string is an offset in the block.
function blockText(block) {
  let text = "";
  block.forEach((child) => { text += child.isText ? child.text : "￼".repeat(child.nodeSize); });
  return text;
}

/**
 * The ranges to mark in one block's text, for the categories that are on:
 * [{ from, to, kind: "filter" | "adverb" | "tell", noteKey }].
 */
export function highlightRanges(text, on) {
  const out = [];
  if (on.filter) for (const r of filterWordRanges(text)) out.push({ ...r, kind: "filter", noteKey: "richEditor.highlight.filterNote" });
  if (on.adverbs) for (const r of adverbRanges(text)) out.push({ ...r, kind: "adverb", noteKey: "richEditor.highlight.adverbNote" });
  if (on.tells) for (const r of tellRanges(text)) out.push({ from: r.from, to: r.to, kind: "tell", noteKey: r.blurbKey });
  return out;
}

function blockDecorations(block, pos, on, note) {
  return highlightRanges(blockText(block), on).map((r) =>
    Decoration.inline(pos + 1 + r.from, pos + 1 + r.to, { class: `ph-${r.kind}`, title: note(r.noteKey) }));
}

/** The whole document's decorations — empty when `on` is null (nothing on, or not an English book). */
export function proseDecorations(doc, on, note) {
  if (!on) return DecorationSet.empty;
  const decos = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    decos.push(...blockDecorations(node, pos, on, note));
    return false;
  });
  return DecorationSet.create(doc, decos);
}

/**
 * After an edit: the old marks mapped through it, and only the blocks it touched scanned again —
 * a keystroke in a 10,000-word chapter rescans one paragraph, not the chapter (2026-10-18, the unit
 * test: a full pass 13–38 ms there, a keystroke under 1 ms).
 */
export function updateProseDecorations(old, tr, on, note) {
  if (!on) return DecorationSet.empty;
  let set = old.map(tr.mapping, tr.doc);
  const size = tr.doc.content.size;
  tr.mapping.maps.forEach((map, i) => {
    const rest = tr.mapping.slice(i + 1);
    map.forEach((_oldStart, _oldEnd, newStart, newEnd) => {
      // one position either side, so a block that the change only touches at its edge is rescanned too
      const from = Math.max(0, rest.map(newStart, -1) - 1);
      const to = Math.min(size, rest.map(newEnd, 1) + 1);
      tr.doc.nodesBetween(from, to, (node, pos) => {
        if (!node.isTextblock) return true;
        set = set.remove(set.find(pos, pos + node.nodeSize));
        set = set.add(tr.doc, blockDecorations(node, pos, on, note));
        return false;
      });
    });
  });
  return set;
}

/**
 * The extension. `on()` → { filter, adverbs, tells } or null, read on each change; `note(key)` →
 * the hover note in the interface's language. After either changes, dispatch a transaction with
 * `setMeta(proseHighlightsKey, true)` to recompute.
 */
export const ProseHighlights = Extension.create({
  name: "proseHighlights",
  addOptions() {
    return { on: () => null, note: (key) => key };
  },
  addProseMirrorPlugins() {
    const { on, note } = this.options;
    return [
      new Plugin({
        key: proseHighlightsKey,
        state: {
          init: (_config, state) => proseDecorations(state.doc, on(), note),
          apply: (tr, old) => {
            if (tr.getMeta(proseHighlightsKey)) return proseDecorations(tr.doc, on(), note);
            return tr.docChanged ? updateProseDecorations(old, tr, on(), note) : old;
          },
        },
        props: {
          decorations(state) { return proseHighlightsKey.getState(state); },
        },
      }),
    ];
  },
});
