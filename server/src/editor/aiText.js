// The AI-text mark — which words in a document the AI wrote (the design:
// docs/plans/archive/2026-10-18-ai-text-mark-and-slice-4.md §2).
//
// Stored inline in the document's HTML like the markers (`<span data-ai-text class="ai-text">`),
// so it travels with the text through split, merge, copy and sync. An accepted AI insertion
// becomes it (aiDiff.js `acceptChange`, when the insertion says `aiWritten`).
//
// It survives your edits word by word: the AI's words stay marked, the words you type are yours.
// A typed character inside a marked run would inherit the mark (ProseMirror gives inserted text
// the marks around it), so a plugin takes the mark off text the writer inserted — typing, an
// accepted spelling fix, Find & replace, IME input: every replace step whose new content is plain
// inline text. Left alone: a paste or a drop (copied AI text stays AI's — ProseMirror tags those
// transactions `uiEvent`), Undo and Redo (they restore what was there — prosemirror-history's
// `history$` meta), Enter (a block split, not text), and anything an AI command inserts (block
// content, or tagged AI_TEXT_META).

import { Mark } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { ReplaceStep } from "@tiptap/pm/transform";

/** Transaction meta for an insertion that is the AI's own text and keeps any mark it carries. */
export const AI_TEXT_META = "aiTextInsert";

/** True when this step inserts plain inline text — what typing (and the like) produces. */
function insertsInlineText(step) {
  if (!(step instanceof ReplaceStep)) return false;
  const { slice } = step;
  if (!slice.size || slice.openStart || slice.openEnd) return false;
  let inline = true;
  slice.content.forEach((node) => { if (!node.isText) inline = false; });
  return inline;
}

function keepsMarks(tr) {
  const ui = tr.getMeta("uiEvent");
  return ui === "paste" || ui === "drop" || !!tr.getMeta("history$") || !!tr.getMeta(AI_TEXT_META);
}

/** The ranges, in the final document, of the inline text the writer inserted in `trs`. */
function typedRanges(trs) {
  const out = [];
  trs.forEach((tr, i) => {
    if (!tr.docChanged || keepsMarks(tr)) return;
    tr.steps.forEach((step, j) => {
      if (!insertsInlineText(step)) return;
      // From just after this step to the end of the last transaction. Mapped directly through the
      // slice: appending `mapping.slice(j + 1)` to a new Mapping takes the step's own map too
      // (appendMapping ignores a slice's bounds) and shifted the range by what was typed.
      const rest = tr.mapping.slice(j + 1);
      let from = rest.map(step.from, 1);
      let to = rest.map(step.from + step.slice.size, -1);
      for (const later of trs.slice(i + 1)) {
        from = later.mapping.map(from, 1);
        to = later.mapping.map(to, -1);
      }
      if (to > from) out.push({ from, to });
    });
  });
  return out;
}

export const AiText = Mark.create({
  name: "aiText",
  // Typing at the end of a run is never the AI's; inside one, the plugin decides.
  inclusive: false,
  excludes: "",
  parseHTML() { return [{ tag: "span[data-ai-text]" }]; },
  renderHTML({ HTMLAttributes }) {
    return ["span", { "data-ai-text": "", class: "ai-text", ...HTMLAttributes }, 0];
  },
  addCommands() {
    return {
      /** Mark as mine: the mark off the selection, or off the whole document when nothing is
       *  selected. */
      unsetAiText: () => ({ tr, state, dispatch }) => {
        const type = state.schema.marks.aiText;
        const { from, to, empty } = state.selection;
        const [a, b] = empty ? [0, state.doc.content.size] : [from, to];
        if (dispatch) dispatch(tr.removeMark(a, b, type));
        return true;
      },
    };
  },
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("aiTextTyping"),
        appendTransaction(trs, _oldState, newState) {
          const type = newState.schema.marks.aiText;
          const ranges = typedRanges(trs).filter((r) => newState.doc.rangeHasMark(r.from, r.to, type));
          if (!ranges.length) return null;
          const tr = newState.tr;
          for (const r of ranges) tr.removeMark(r.from, r.to, type);
          return tr;
        },
      }),
    ];
  },
});

/** Whether any text in from..to (the whole document when omitted) carries the mark. */
export function hasAiText(state, from = 0, to = state.doc.content.size) {
  const type = state.schema.marks.aiText;
  return !!type && state.doc.rangeHasMark(from, to, type);
}
