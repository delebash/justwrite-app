/**
 * @vitest-environment jsdom
 */
// Prose highlights (2026-10-18): Analysis' lists marked in the editor — the ranges, their place in a
// real document (positions line up across marks and inline nodes), and what Analysis counts
// unchanged by sharing them.
import { getSchema } from "@tiptap/core";
import { DOMParser } from "@tiptap/pm/model";
import { expect, test } from "vitest";
import { editorExtensions } from "justwrite-server/editor/editorSchema.js";
import { chapterMetrics } from "./analysis/styleMetrics.js";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import { fullDecorations, updateDecorations } from "./editorDecorations.js";
import { highlightRanges, proseHighlightRanges } from "./proseHighlights.js";

const proseDecorations = (doc, on, note) => fullDecorations(doc, proseHighlightRanges(on, note));
const updateProseDecorations = (old, tr, on, note) => updateDecorations(old, tr, proseHighlightRanges(on, note));

const ALL = { filter: true, adverbs: true, tells: true };
const schema = getSchema(editorExtensions());
const docOf = (html) => {
  const el = document.createElement("div");
  el.innerHTML = html;
  return DOMParser.fromSchema(schema).parse(el);
};
const marked = (doc, on = ALL) =>
  proseDecorations(doc, on, (key) => `note:${key}`).find().map((d) => ({
    text: doc.textBetween(d.from, d.to), cls: d.type.attrs.class, title: d.type.attrs.title,
  }));

test("each list finds its words in a block's text", () => {
  const text = "She felt the cold. He walked slowly, only to delve into the archive.";
  const got = highlightRanges(text, ALL).map((r) => [r.kind, text.slice(r.from, r.to)]);
  expect(got).toEqual([["filter", "felt"], ["adverb", "slowly"], ["tell", "delve into"]]);
  expect(highlightRanges(text, { filter: false, adverbs: true, tells: false }).map((r) => r.kind)).toEqual(["adverb"]);
});

test("the marks land on the words, across formatting and a line break", () => {
  const doc = docOf("<p>She <em>noticed</em> the door.<br>It opened quietly.</p><p>A testament to <strong>craft</strong>.</p>");
  expect(marked(doc)).toEqual([
    { text: "noticed", cls: "ph-filter", title: "note:richEditor.highlight.filterNote" },
    { text: "quietly", cls: "ph-adverb", title: "note:richEditor.highlight.adverbNote" },
    { text: "A testament to", cls: "ph-tell", title: "note:aiTell.note.aTestamentTo" },
  ]);
});

test("repeated words (2026-10-29): a word used again within the window, both times", () => {
  const repeats = { within: 5, skip: ["Cael"] };
  const words = (text) => highlightRanges(text, { repeats }).map((r) => [r.kind, text.slice(r.from, r.to), r.from]);
  // lantern, then lantern 3 words on: both; the third is 9 words after the second — outside
  expect(words("The lantern swung. The lantern died. Far away, after many quiet hours, the lantern woke."))
    .toEqual([["repeat", "lantern", 4], ["repeat", "lantern", 23]]);
  // any case; the same form only; the common words and the story bible's names never
  expect(words("Storm and storm.")).toEqual([["repeat", "Storm", 0], ["repeat", "storm", 10]]);
  expect(words("We walk, we walked.")).toEqual([]);
  expect(words("Cael and Cael's sister, the the")).toEqual([]);
  // the two standard lists together (2026-10-29): pronouns, the commonest verbs, and a contraction
  // by its first part — while a real echo still shows
  expect(words("She said no. She said she didn't, and didn't again.")).toEqual([]);
  expect(words("Her face fell; his face did not.")).toEqual([["repeat", "face", 4], ["repeat", "face", 19]]);
  expect(words("Rain at noon and rain at dusk")).toEqual([["repeat", "Rain", 0], ["repeat", "rain", 17]]);
  // off
  expect(highlightRanges("Rain and rain", { repeats: null })).toEqual([]);
});

test("a repeated word's mark says the window, and stops at its paragraph", () => {
  const on = { repeats: { within: 50, skip: [] } };
  const note = (key, params) => `${key}:${params?.n}`;
  const marks = (html) => {
    const doc = docOf(html);
    return proseDecorations(doc, on, note).find().map((d) => [doc.textBetween(d.from, d.to), d.type.attrs.class, d.type.attrs.title]);
  };
  expect(marks("<p>The lantern swung; the lantern died.</p>")).toEqual([
    ["lantern", "ph-repeat", "richEditor.highlight.repeatNote:50"],
    ["lantern", "ph-repeat", "richEditor.highlight.repeatNote:50"],
  ]);
  expect(marks("<p>The lantern swung.</p><p>The lantern died.</p>")).toEqual([]);
});

test("nothing is marked while every list is off", () => {
  expect(marked(docOf("<p>She felt it, slowly.</p>"), null)).toEqual([]);
});

test("Analysis counts the same adverbs it did", () => {
  // "only" and "family" are the excluded non-adverbs; "quickly", "softly" count
  const m = chapterMetrics("<p>Only the family moved quickly and softly.</p>");
  expect(m.adverbsPer1k).toBeCloseTo((2 / 7) * 1000, 5);
});

test("after any edit, the marks are the ones a full pass would make", () => {
  let state = EditorState.create({ doc: docOf("<p>She saw it.</p><p>He ran quickly.</p><p>A plain line.</p>") });
  let set = proseDecorations(state.doc, ALL, (k) => k);
  const keys = (s, doc) => s.find().map((d) => `${d.from}-${d.to}:${doc.textBetween(d.from, d.to)}`).sort();
  const edits = [
    (s) => s.tr.insertText("felt ", 5),                            // a new filter word mid-paragraph
    (s) => s.tr.insertText("ly", 13),                               // turns a word into an adverb
    (s) => s.tr.delete(2, 6),                                       // cuts across a mark
    (s) => s.tr.setSelection(TextSelection.create(s.doc, 3)).split(3), // Enter: one block becomes two
    (s) => s.tr.join(s.doc.child(0).nodeSize),                     // Backspace at a block's start: two become one
    (s) => s.tr.insertText(" a testament to", s.doc.content.size - 1), // a phrase at the very end
  ];
  for (const edit of edits) {
    const tr = edit(state);
    set = updateProseDecorations(set, tr, ALL, (k) => k);
    state = state.apply(tr);
    expect(keys(set, state.doc)).toEqual(keys(proseDecorations(state.doc, ALL, (k) => k), state.doc));
  }
});

test("a long chapter is marked in well under a frame", () => {
  const para = "<p>She saw the gate and felt the cold. He walked slowly into the dark, a testament to nothing.</p>";
  const doc = docOf(para.repeat(600)); // ~10,000 words
  const t0 = performance.now();
  const n = proseDecorations(doc, ALL, (k) => k).find().length;
  const ms = performance.now() - t0;
  expect(n).toBe(600 * 4); // saw, felt, slowly, a testament to
  expect(ms).toBeLessThan(200);
  // a keystroke rescans its paragraph only
  const state = EditorState.create({ doc });
  const set = proseDecorations(doc, ALL, (k) => k);
  const t1 = performance.now();
  updateProseDecorations(set, state.tr.insertText("x", 10), ALL, (k) => k);
  const keyMs = performance.now() - t1;
  console.log(`prose highlights: ${n} marks over ~10,000 words in ${ms.toFixed(1)} ms; a keystroke ${keyMs.toFixed(2)} ms`);
  expect(keyMs).toBeLessThan(ms);
});
