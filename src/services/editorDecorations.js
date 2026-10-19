// SPDX-License-Identifier: MIT
// Marks the editor draws over the text without changing it — the renderer's view-only additions
// to the editor (2026-10-18, the editor-expansion plan): Writing settings' prose highlights
// (proseHighlights.js) and the story bible's names kept out of the spellchecker (storyNames.js).
//
// ProseMirror inline decorations (prosemirror.net/docs/ref/#view.Decoration^inline), the way
// searchReplace.js marks its matches: never in the document or the undo history. An edit maps the
// old marks and rescans only the blocks it touched (DecorationSet.map / remove / add) — a keystroke
// in a 10,000-word chapter rescans one paragraph (the unit test, 2026-10-18: a full pass 13–38 ms
// there, a keystroke under 1 ms).
//
// Each user gives a `ranges(text)` function — the marks for one block's text, as
// [{ from, to, attrs }] — or null when it has nothing to mark, and then nothing is scanned.
import { Extension } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

// One character per position: an inline node that isn't text (a mention, an image, a hard break)
// stands in as U+FFFC for each of its positions, so an offset in the string is an offset in the block.
function blockText(block) {
  let text = "";
  block.forEach((child) => { text += child.isText ? child.text : "￼".repeat(child.nodeSize); });
  return text;
}

function blockDecorations(block, pos, ranges) {
  return ranges(blockText(block)).map((r) => Decoration.inline(pos + 1 + r.from, pos + 1 + r.to, r.attrs));
}

/** The whole document's marks — empty when `ranges` is null. */
export function fullDecorations(doc, ranges) {
  if (!ranges) return DecorationSet.empty;
  const decos = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    decos.push(...blockDecorations(node, pos, ranges));
    return false;
  });
  return DecorationSet.create(doc, decos);
}

/** After an edit: the old marks mapped through it, and the blocks it touched scanned again. */
export function updateDecorations(old, tr, ranges) {
  if (!ranges) return DecorationSet.empty;
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
        set = set.add(tr.doc, blockDecorations(node, pos, ranges));
        return false;
      });
    });
  });
  return set;
}

/**
 * A TipTap extension drawing one kind of mark. Its option `ranges: () => ((text) => [...]) | null`
 * is read on every change; after what it depends on changes (a setting, the book's names), dispatch
 * a transaction with `setMeta(key, true)` and everything is scanned again.
 */
export function decorationExtension(name, key) {
  return Extension.create({
    name,
    addOptions() {
      return { ranges: () => null };
    },
    addProseMirrorPlugins() {
      const { ranges } = this.options;
      return [
        new Plugin({
          key,
          state: {
            init: (_config, state) => fullDecorations(state.doc, ranges()),
            apply: (tr, old) => {
              if (tr.getMeta(key)) return fullDecorations(tr.doc, ranges());
              return tr.docChanged ? updateDecorations(old, tr, ranges()) : old;
            },
          },
          props: {
            decorations(state) { return key.getState(state); },
          },
        }),
      ];
    },
  });
}

/** Redraw an editor's marks of one kind (after a setting or the book's names changed). */
export function refreshDecorations(editor, key) {
  if (editor && !editor.isDestroyed) editor.view.dispatch(editor.state.tr.setMeta(key, true));
}
