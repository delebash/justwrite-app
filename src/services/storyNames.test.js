/**
 * @vitest-environment jsdom
 */
// The story bible's names kept out of the spellchecker (2026-10-18): which words count as names,
// and where spellcheck="false" lands in a real document.
import { getSchema } from "@tiptap/core";
import { DOMParser } from "@tiptap/pm/model";
import { expect, test } from "vitest";
import { editorExtensions } from "justwrite-server/editor/editorSchema.js";
import { fullDecorations } from "./editorDecorations.js";
import { storyNameRanges, storyNameWords } from "./storyNames.js";

const book = {
  characters: [{ name: "Cael Ferren", aliases: ["the Brass Girl"] }, { name: "Iven Sarraz", aliases: [] }],
  locations: [{ name: "Threnn" }],
  objects: [{ name: "Sigil-plate" }],
  groups: [{ name: "Ó Briain" }],
};

test("each word of a name or alias is a name, longest first, capitals kept, a lowercase word left out", () => {
  expect(storyNameWords(book)).toEqual(["Sigil-plate", "Briain", "Ferren", "Sarraz", "Threnn", "Brass", "Cael", "Girl", "Iven"]);
  expect(storyNameWords({ characters: [{ name: "李明", aliases: [] }] })).toEqual(["李明"]);
  expect(storyNameWords({})).toEqual([]);
  expect(storyNameRanges([])).toBeNull();
});

test("names are marked as whole words, with their possessive; a lowercase common word isn't", () => {
  const ranges = storyNameRanges(storyNameWords(book));
  const text = "Cael's lamp lit Threnn. Caelan waited; the brass girl smiled at Iven.";
  expect(ranges(text).map((r) => text.slice(r.from, r.to))).toEqual(["Cael's", "Threnn", "Iven"]);
  expect(ranges(text)[0].attrs).toEqual({ spellcheck: "false", class: "story-name" });
});

test("in a document, spellcheck=false lands on exactly the names", () => {
  const schema = getSchema(editorExtensions());
  const el = document.createElement("div");
  el.innerHTML = "<p><em>Iven</em> met Cael at Threnn.</p><p>Nobody else.</p>";
  const doc = DOMParser.fromSchema(schema).parse(el);
  const marked = fullDecorations(doc, storyNameRanges(storyNameWords(book))).find()
    .map((d) => [doc.textBetween(d.from, d.to), d.type.attrs.spellcheck]);
  expect(marked).toEqual([["Iven", "false"], ["Cael", "false"], ["Threnn", "false"]]);
});
