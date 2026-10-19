// @vitest-environment jsdom
// Accept all / Reject all with several pending AI changes (2026-10-11, found driving the editor
// for the AI drafting plan Task 13). The bulk commands chain one acceptChange / rejectChange per
// change; in a TipTap chain each command's `state.doc` is the transaction's CURRENT doc, so a
// range found there must not be mapped again through the steps already in the transaction —
// mapped twice, Reject all threw "Position … out of range" or cut the wrong text. The editor runs
// on the app's own schema (server/src/editor/editorSchema.js), as RichEditor builds it.
import { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vitest";
import { editorExtensions } from "justwrite-server/editor/editorSchema.js";
import { hasPendingChanges } from "justwrite-server/editor/aiDiff.js";

let editor;
afterEach(() => editor?.destroy());

const ORIGINAL = "<p>First paragraph, the long original that will be rewritten.</p><p>Second, also original.</p><p>Third stays.</p>";

/** Two pending replacements, the later one proposed first (as two AI runs would leave them). */
function twoPendingChanges() {
  editor = new Editor({ extensions: editorExtensions(), content: ORIGINAL });
  const para = (i) => {
    let n = 0;
    let found = null;
    editor.state.doc.forEach((node, offset) => {
      if (n++ === i) found = { from: offset + 1, to: offset + node.nodeSize - 1 };
    });
    return found;
  };
  const second = para(1);
  editor.commands.proposeReplacement({ ...second, originalHtml: "Second, also original.", newHtml: "Second, now rewritten at length by the model." });
  const first = para(0);
  editor.commands.proposeReplacement({ ...first, originalHtml: "First paragraph, the long original that will be rewritten.", newHtml: "First, short." });
  expect(hasPendingChanges(editor)).toBe(true);
}

const text = () => editor.state.doc.textContent;
const paragraphs = () => { const out = []; editor.state.doc.forEach((n) => { out.push(n.textContent); }); return out; };

describe("with two pending changes", () => {
  it("Reject all restores both originals", () => {
    twoPendingChanges();
    expect(editor.commands.rejectAllChanges()).toBe(true);
    expect(hasPendingChanges(editor)).toBe(false);
    expect(text()).toBe("First paragraph, the long original that will be rewritten.Second, also original.Third stays.");
  });

  it("Accept all keeps both rewrites", () => {
    twoPendingChanges();
    expect(editor.commands.acceptAllChanges()).toBe(true);
    expect(hasPendingChanges(editor)).toBe(false);
    expect(text()).toBe("First, short.Second, now rewritten at length by the model.Third stays.");
  });

  it("keeps every other paragraph whole", () => {
    twoPendingChanges();
    editor.commands.rejectAllChanges();
    expect(paragraphs()).toEqual(["First paragraph, the long original that will be rewritten.", "Second, also original.", "Third stays."]);
  });
});

// The deleted block's range ended one past the paragraph (2026-10-11): a change whose inserted
// paragraph is the scene's last asked for a position past the document's end — a continuation
// at the end of a scene always is — and elsewhere the cut reached into the next paragraph.
describe("a change at the end of the scene", () => {
  const endOf = () => editor.state.doc.content.size;

  it("Reject removes a continuation and nothing else", () => {
    editor = new Editor({ extensions: editorExtensions(), content: "<p>One.</p><p>Two.</p>" });
    editor.commands.proposeContinuation({ at: endOf(), newHtml: "Three, from the model.\n\nFour, from the model." });
    expect(hasPendingChanges(editor)).toBe(true);
    expect(() => editor.commands.rejectAllChanges()).not.toThrow();
    expect(paragraphs()).toEqual(["One.", "Two."]);
  });

  it("Reject restores a rewritten last paragraph", () => {
    editor = new Editor({ extensions: editorExtensions(), content: "<p>One.</p><p>Two, the original.</p>" });
    let last = null;
    editor.state.doc.forEach((n, off) => { last = { from: off + 1, to: off + n.nodeSize - 1 }; });
    editor.commands.proposeReplacement({ ...last, originalHtml: "Two, the original.", newHtml: "Two, rewritten." });
    expect(() => editor.commands.rejectAllChanges()).not.toThrow();
    expect(paragraphs()).toEqual(["One.", "Two, the original."]);
  });

  it("Accept keeps a rewritten last paragraph and drops the original", () => {
    editor = new Editor({ extensions: editorExtensions(), content: "<p>One.</p><p>Two, the original.</p>" });
    let last = null;
    editor.state.doc.forEach((n, off) => { last = { from: off + 1, to: off + n.nodeSize - 1 }; });
    editor.commands.proposeReplacement({ ...last, originalHtml: "Two, the original.", newHtml: "Two, rewritten." });
    expect(() => editor.commands.acceptAllChanges()).not.toThrow();
    expect(paragraphs()).toEqual(["One.", "Two, rewritten."]);
  });
});
