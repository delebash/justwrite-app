// AI-assisted diff marks for the editor.
//
// Two TipTap marks (`aiIns`, `aiDel`) plus a parent extension that owns
// the commands. A "change" is a pair of marks that share a changeId
// attribute — when the user picks Accept, we unwrap the aiIns marks and
// delete the aiDel ranges; Reject does the opposite.
//
// Visual rendering: <ins data-ai-ins data-change-id="…"> and
// <del data-ai-del data-change-id="…">. CSS in RichEditor.vue styles
// them as green-underlined and red-strikethrough respectively.

import { Mark, Extension } from "@tiptap/core";

function uid() {
  return `chg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

const changeIdAttr = {
  default: null,
  parseHTML: (el) => el.getAttribute("data-change-id"),
  renderHTML: (attrs) => (attrs.changeId ? { "data-change-id": attrs.changeId } : {}),
};

export const AiInsMark = Mark.create({
  name: "aiIns",
  inclusive: false,
  // Allow nesting with em / strong / etc. — only excludes other AI marks.
  excludes: "aiDel",
  addAttributes() { return { changeId: changeIdAttr }; },
  parseHTML() { return [{ tag: "ins[data-ai-ins]" }]; },
  renderHTML({ HTMLAttributes }) {
    return ["ins", { "data-ai-ins": "", class: "ai-ins", ...HTMLAttributes }, 0];
  },
});

export const AiDelMark = Mark.create({
  name: "aiDel",
  inclusive: false,
  excludes: "aiIns",
  addAttributes() { return { changeId: changeIdAttr }; },
  parseHTML() { return [{ tag: "del[data-ai-del]" }]; },
  renderHTML({ HTMLAttributes }) {
    return ["del", { "data-ai-del": "", class: "ai-del", ...HTMLAttributes }, 0];
  },
});

// Split a chunk of HTML into top-level paragraph HTML strings. The chunk
// can come from either the original selection (already HTML) or the
// LLM's reply (also already HTML — textToHtml wrapped it for us). We
// re-extract paragraph contents so we can stitch the diff one paragraph
// at a time.
function splitParagraphs(html) {
  if (!html) return [];
  const div = document.createElement("div");
  div.innerHTML = html;
  const out = [];
  for (const child of div.children) {
    if (child.tagName === "P") {
      out.push(child.innerHTML);
    } else {
      // Treat any non-paragraph block (e.g. <h2>) as its own line.
      out.push(child.outerHTML);
    }
  }
  // No block children → treat the whole html as one paragraph.
  if (!out.length && div.innerHTML.trim()) out.push(div.innerHTML);
  return out;
}

// Build the diff HTML for a single change: the original paragraphs each
// wrapped in <del>, followed by the new paragraphs each wrapped in <ins>.
// Each mark carries the same change-id so accept/reject can target the
// whole change as a unit.
function buildDiffHtml(changeId, originalHtml, newHtml) {
  const oldParas = splitParagraphs(originalHtml);
  const newParas = splitParagraphs(newHtml);
  const out = [];
  for (const p of oldParas) {
    out.push(`<p><del data-ai-del data-change-id="${changeId}">${p}</del></p>`);
  }
  for (const p of newParas) {
    out.push(`<p><ins data-ai-ins data-change-id="${changeId}">${p}</ins></p>`);
  }
  return out.join("");
}

// Walk the doc for every position covered by a mark of the given type
// with a matching change-id. Returns an array of { from, to } ranges
// (text-level, not block-level), sorted ascending.
function findRanges(doc, markName, changeId) {
  const ranges = [];
  doc.descendants((node, pos) => {
    if (!node.isText) return;
    const mark = node.marks.find((m) => m.type.name === markName && (!changeId || m.attrs.changeId === changeId));
    if (mark) ranges.push({ from: pos, to: pos + node.nodeSize });
  });
  return ranges;
}

// Merge adjacent / overlapping ranges so a paragraph's worth of text
// nodes (split by other marks like <em>) collapses into one block
// delete. Not strictly necessary, but it cuts the number of tr steps.
function mergeRanges(ranges) {
  if (!ranges.length) return ranges;
  ranges.sort((a, b) => a.from - b.from);
  const out = [ranges[0]];
  for (let i = 1; i < ranges.length; i++) {
    const last = out[out.length - 1];
    if (ranges[i].from <= last.to) last.to = Math.max(last.to, ranges[i].to);
    else out.push(ranges[i]);
  }
  return out;
}

// Block-level deletion: when a <p> contains only a deleted/rejected
// range, the paragraph would otherwise survive as an empty block. We
// detect that case and expand the deletion to include the block.
function expandRangeToContainingBlock(doc, range) {
  // Map text position back to the enclosing block. Find the parent of
  // the text node at `range.from`.
  const $from = doc.resolve(range.from);
  const $to = doc.resolve(range.to);
  // Sit at the parent block's depth.
  if ($from.depth === 0 || $to.depth === 0) return range;
  const block = $from.node($from.depth);
  const blockStart = $from.start($from.depth);
  const blockEnd = blockStart + block.nodeSize - 1; // exclusive of closing token
  // The "covers the whole block" check: the range spans from block start
  // to block end. We use textBetween to inspect.
  if (range.from <= blockStart + 1 && range.to >= blockEnd - 1) {
    return { from: blockStart - 1, to: blockEnd + 1 };
  }
  return range;
}

export const AiDiff = Extension.create({
  name: "aiDiff",
  addExtensions() { return [AiInsMark, AiDelMark]; },

  addCommands() {
    return {
      // Replace the selection (from..to) with a paired diff: the original
      // wrapped in <del> + the new content wrapped in <ins>. Returns the
      // newly-minted changeId via the editor's transaction meta — callers
      // can retrieve it from the editor's state after run() if they need
      // to scroll to / focus the change.
      proposeReplacement:
        ({ from, to, originalHtml, newHtml }) =>
        ({ chain, state }) => {
          const changeId = uid();
          const html = buildDiffHtml(changeId, originalHtml, newHtml);
          const range = from != null && to != null
            ? { from, to }
            : { from: state.selection.from, to: state.selection.to };
          return chain().deleteRange(range).insertContentAt(range.from, html).run();
        },

      // Append new content at the end of the doc as an Ins-only change
      // (used by "Continue from cursor" — there's no original to delete).
      proposeContinuation:
        ({ at, newHtml }) =>
        ({ chain, state }) => {
          const changeId = uid();
          const newParas = splitParagraphs(newHtml);
          const html = newParas
            .map((p) => `<p><ins data-ai-ins data-change-id="${changeId}">${p}</ins></p>`)
            .join("");
          const pos = at != null ? at : state.selection.from;
          return chain().insertContentAt(pos, html).run();
        },

      // Accept a single change: keep <ins> content (unwrap mark), drop
      // <del> ranges entirely.
      acceptChange:
        (changeId) =>
        ({ tr, state, dispatch }) => {
          const ins = mergeRanges(findRanges(state.doc, "aiIns", changeId));
          const del = mergeRanges(findRanges(state.doc, "aiDel", changeId)).map((r) => expandRangeToContainingBlock(state.doc, r));
          // Delete <del> ranges from highest to lowest position so earlier
          // ones don't shift later ones.
          for (const r of [...del].sort((a, b) => b.from - a.from)) {
            tr.delete(tr.mapping.map(r.from), tr.mapping.map(r.to));
          }
          // Unwrap surviving <ins> ranges (positions remapped through tr).
          const insType = state.schema.marks.aiIns;
          for (const r of ins) {
            tr.removeMark(tr.mapping.map(r.from), tr.mapping.map(r.to), insType);
          }
          if (dispatch) dispatch(tr);
          return true;
        },

      // Reject a single change: drop <ins> ranges, keep <del> content
      // (unwrap mark).
      rejectChange:
        (changeId) =>
        ({ tr, state, dispatch }) => {
          const ins = mergeRanges(findRanges(state.doc, "aiIns", changeId)).map((r) => expandRangeToContainingBlock(state.doc, r));
          const del = mergeRanges(findRanges(state.doc, "aiDel", changeId));
          for (const r of [...ins].sort((a, b) => b.from - a.from)) {
            tr.delete(tr.mapping.map(r.from), tr.mapping.map(r.to));
          }
          const delType = state.schema.marks.aiDel;
          for (const r of del) {
            tr.removeMark(tr.mapping.map(r.from), tr.mapping.map(r.to), delType);
          }
          if (dispatch) dispatch(tr);
          return true;
        },

      // Bulk-accept / reject every pending change in the document.
      acceptAllChanges:
        () =>
        ({ chain, state }) => {
          const ids = new Set();
          state.doc.descendants((node) => {
            for (const m of node.marks) {
              if (m.type.name === "aiIns" || m.type.name === "aiDel") {
                if (m.attrs.changeId) ids.add(m.attrs.changeId);
              }
            }
          });
          if (!ids.size) return false;
          let c = chain();
          for (const id of ids) c = c.acceptChange(id);
          return c.run();
        },

      rejectAllChanges:
        () =>
        ({ chain, state }) => {
          const ids = new Set();
          state.doc.descendants((node) => {
            for (const m of node.marks) {
              if (m.type.name === "aiIns" || m.type.name === "aiDel") {
                if (m.attrs.changeId) ids.add(m.attrs.changeId);
              }
            }
          });
          if (!ids.size) return false;
          let c = chain();
          for (const id of ids) c = c.rejectChange(id);
          return c.run();
        },
    };
  },
});

// Probe the editor state for whether any pending changes exist — drives
// the visibility of the "Accept all / Reject all" header buttons.
export function hasPendingChanges(editor) {
  if (!editor) return false;
  let found = false;
  editor.state.doc.descendants((node) => {
    if (found) return false;
    for (const m of node.marks) {
      if (m.type.name === "aiIns" || m.type.name === "aiDel") { found = true; return false; }
    }
  });
  return found;
}

// Collect changeIds of every active change in document order so the UI
// can show "3 pending changes" and stepNext / stepPrev navigation.
export function listPendingChanges(editor) {
  if (!editor) return [];
  const seen = new Set();
  const out = [];
  editor.state.doc.descendants((node, pos) => {
    for (const m of node.marks) {
      if ((m.type.name === "aiIns" || m.type.name === "aiDel") && m.attrs.changeId && !seen.has(m.attrs.changeId)) {
        seen.add(m.attrs.changeId);
        out.push({ changeId: m.attrs.changeId, pos });
      }
    }
  });
  return out;
}
