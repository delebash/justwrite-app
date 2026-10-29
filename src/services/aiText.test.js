// @vitest-environment jsdom
// The AI-text mark (docs/plans/archive/2026-10-18-ai-text-mark-and-slice-4.md §2): an accepted AI-written
// insertion keeps it; an AI edit of the writer's own words doesn't; the AI's words stay marked
// through edits around them while the words the writer types are theirs; a paste, Enter and Undo
// keep it; Mark as mine clears it. On the app's own schema (server/src/editor/editorSchema.js).
import { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vitest";
import { editorExtensions } from "justwrite-server/editor/editorSchema.js";
import { hasAiText } from "justwrite-server/editor/aiText.js";
import { aiWrittenWords } from "./aiText.js";

let editor;
afterEach(() => editor?.destroy());

const make = (content) => { editor = new Editor({ extensions: editorExtensions(), content }); return editor; };
/** The text of every run carrying the mark, in order. */
const marked = () => {
  const out = [];
  editor.state.doc.descendants((node) => {
    if (node.isText && node.marks.some((m) => m.type.name === "aiText")) out.push(node.text);
  });
  return out;
};
const end = () => editor.state.doc.content.size;

describe("accepting an AI change", () => {
  it("an AI-written insertion keeps the mark once accepted", () => {
    make("<p>She opened the door.</p>");
    editor.commands.proposeContinuation({ at: end(), newHtml: "<p>The hall was dark.</p>", aiWritten: true });
    expect(marked()).toEqual([]); // pending: still the insertion mark only
    editor.commands.acceptAllChanges();
    expect(marked()).toEqual(["The hall was dark."]);
    expect(editor.getHTML()).toContain('<span data-ai-text="" class="ai-text">The hall was dark.</span>');
  });

  it("an AI edit of the writer's own words leaves no mark", () => {
    make("<p>She opened the door.</p>");
    editor.commands.proposeReplacement({ from: 1, to: end() - 1, originalHtml: "She opened the door.", newHtml: "She pushed the door open." });
    editor.commands.acceptAllChanges();
    expect(editor.state.doc.textContent).toBe("She pushed the door open.");
    expect(marked()).toEqual([]);
  });

  it("a rejected AI-written insertion leaves nothing", () => {
    make("<p>She opened the door.</p>");
    editor.commands.proposeContinuation({ at: end(), newHtml: "<p>The hall was dark.</p>", aiWritten: true });
    editor.commands.rejectAllChanges();
    expect(marked()).toEqual([]);
    expect(editor.state.doc.textContent).toBe("She opened the door.");
  });
});

describe("editing AI-written text", () => {
  const AI = '<p><span data-ai-text>The quiet sea</span></p>';

  it("the words the writer types inside a marked run are theirs; the AI's stay marked", () => {
    make(AI);
    editor.view.dispatch(editor.state.tr.insertText("very ", 5)); // after "The "
    expect(editor.state.doc.textContent).toBe("The very quiet sea");
    expect(marked()).toEqual(["The ", "quiet sea"]);
  });

  it("typing over a selection inside a run is the writer's too", () => {
    make(AI);
    editor.view.dispatch(editor.state.tr.insertText("calm", 5, 10)); // "quiet" → "calm"
    expect(editor.state.doc.textContent).toBe("The calm sea");
    expect(marked()).toEqual(["The ", " sea"]);
  });

  it("a paste keeps the mark the copied text had", () => {
    make(AI);
    const tr = editor.state.tr.insertText("quiet ", 5);
    tr.setMeta("uiEvent", "paste");
    editor.view.dispatch(tr);
    expect(marked()).toEqual(["The quiet quiet sea"]);
  });

  it("Enter splits a run and both halves stay marked", () => {
    make(AI);
    editor.commands.setTextSelection(10); // after "The quiet"
    editor.commands.splitBlock();
    expect(marked()).toEqual(["The quiet", " sea"]);
  });

  it("Undo restores deleted AI words with their mark", () => {
    make(AI);
    editor.commands.deleteRange({ from: 5, to: 11 }); // "quiet "
    expect(editor.state.doc.textContent).toBe("The sea");
    editor.commands.undo();
    expect(editor.state.doc.textContent).toBe("The quiet sea");
    expect(marked()).toEqual(["The quiet sea"]);
  });
});

describe("Mark as mine", () => {
  it("clears the selection only", () => {
    make('<p><span data-ai-text>The quiet sea</span></p>');
    editor.commands.setTextSelection({ from: 5, to: 10 });
    editor.commands.unsetAiText();
    expect(marked()).toEqual(["The ", " sea"]);
  });

  it("clears the whole document when nothing is selected", () => {
    make('<p><span data-ai-text>The quiet sea</span></p><p>Mine. <span data-ai-text>Theirs.</span></p>');
    editor.commands.setTextSelection(3);
    expect(hasAiText(editor.state)).toBe(true);
    editor.commands.unsetAiText();
    expect(marked()).toEqual([]);
    expect(hasAiText(editor.state)).toBe(false);
  });
});

describe("the per-book record", () => {
  it("counts the words inside the mark", () => {
    expect(aiWrittenWords('<p>Mine here. <span data-ai-text class="ai-text">The hall was dark.</span></p><p><span data-ai-text>Again</span> mine.</p>')).toBe(5);
    expect(aiWrittenWords("<p>No AI here.</p>")).toBe(0);
    expect(aiWrittenWords("")).toBe(0);
  });
});
