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
});
