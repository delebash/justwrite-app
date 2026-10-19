/**
 * @vitest-environment jsdom
 */
// Spelling JustWrite checks itself (2026-10-19, docs/plans/2026-10-19-spelling.md): which words it
// looks at, the checker over the real English and Spanish dictionaries (the book's names, its
// possessives, words taken back), the client and its worker (worker.js run behind a stand-in
// Worker), and the mark on the word being typed left out.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Editor } from "@tiptap/core";
import { PluginKey, TextSelection } from "@tiptap/pm/state";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { editorExtensions } from "justwrite-server/editor/editorSchema.js";
import { decorationExtension } from "../editorDecorations.js";
import { createChecker } from "./checker.js";
import { spellWords } from "./words.js";

const dictionary = (code) => {
  const dir = resolve(import.meta.dirname, "../../../node_modules", `dictionary-${code}`);
  return { aff: readFileSync(resolve(dir, "index.aff"), "utf8"), dic: readFileSync(resolve(dir, "index.dic"), "utf8") };
};
const en = createChecker(dictionary("en"));

describe("the words it looks at", () => {
  test("words with their places, an apostrophe inside kept", () => {
    expect(spellWords("Cael’s mare didn't stop.")).toEqual([
      { from: 0, to: 6, word: "Cael’s" }, { from: 7, to: 11, word: "mare" },
      { from: 12, to: 18, word: "didn't" }, { from: 19, to: 23, word: "stop" },
    ]);
  });

  test("not a number, a word in capitals, a single letter, or anything in an address", () => {
    const words = spellWords("I met NASA at 3rd and v2 — see www.example.com, a@b.org or C:/Users/x then went").map((w) => w.word);
    expect(words).toEqual(["met", "at", "and", "see", "or", "then", "went"]);
  });
});

describe("the checker", () => {
  test("flags a misspelling and suggests the word", () => {
    expect(en.correct("walkd")).toBe(false);
    expect(en.correct("walked")).toBe(true);
    expect(en.suggest("storry")).toContain("story");
  });

  test("a curly apostrophe is an apostrophe, in the answer and the suggestions", () => {
    expect(en.correct("don’t")).toBe(true);
    expect(en.suggest("dont’").length).toBeGreaterThan(0);
  });

  test("the book's words are right, possessives too, and taking one back makes it wrong again", () => {
    expect(en.correct("Threnn")).toBe(false);
    en.setWords(["Threnn", "Paris"]);
    expect(en.correct("Threnn")).toBe(true);
    expect(en.correct("Threnn's")).toBe(true);
    expect(en.correct("Threnn’s")).toBe(true);
    en.setWords([]);
    expect(en.correct("Threnn")).toBe(false);
    // a word the dictionary has is never taken out with the book's
    expect(en.correct("Paris")).toBe(true);
  });

  test("Spanish, with its accents", () => {
    const es = createChecker(dictionary("es"));
    expect(es.correct("jardín")).toBe(true);
    expect(es.correct("jardin")).toBe(false);
    expect(es.suggest("jardin")).toContain("jardín");
  });
});

describe("the client and its worker", () => {
  // worker.js as it runs in a Worker: its `self` is the stand-in's other end (the client makes
  // one worker, so the module is evaluated once)
  class StandInWorker {
    constructor() {
      this.inside = { postMessage: (data) => setTimeout(() => this.onmessage?.({ data })) };
      globalThis.self = this.inside;
      this.ready = import("./worker.js");
    }
    postMessage(data) {
      this.ready.then(() => setTimeout(() => this.inside.onmessage({ data })));
    }
  }

  let spelling;
  // polls until `ok()` — the worker answers in its own time (a loaded machine runs the suite)
  const until = async (ok) => {
    for (let i = 0; i < 250 && !ok(); i++) await new Promise((r) => setTimeout(r, 20));
  };
  beforeAll(async () => {
    vi.stubGlobal("Worker", StandInWorker);
    vi.doMock("./dictionaries.js", async (importOriginal) => ({
      ...(await importOriginal()),
      loadDictionary: async (code) => dictionary(code),
    }));
    spelling = await import("./index.js");
  });
  afterAll(() => vi.unstubAllGlobals());

  test("marks a misspelling once the worker answers, never the book's words, and the dictionary's word after it's added", async () => {
    let redraws = 0;
    const off = spelling.onSpellingChange(() => redraws++);
    await spelling.configureSpelling({ enabled: true, language: "en", words: ["Threnn"] });
    await until(() => spelling.spellingMarks());
    const text = "Threnn walkd home.";
    const marks = () => spelling.spellingMarks()(text).map((m) => text.slice(m.from, m.to));
    expect(marks()).toEqual([]); // asked, not answered yet
    await until(() => marks().length);
    expect(marks()).toEqual(["walkd"]);
    expect(redraws).toBeGreaterThan(0);
    expect(await spelling.suggestSpelling("walkd")).toContain("walk");

    await spelling.configureSpelling({ enabled: true, language: "en", words: ["Threnn", "walkd"] });
    expect(marks()).toEqual(["walkd"]); // stays marked until the answer — no flicker
    await until(() => !marks().length);
    expect(marks()).toEqual([]);
    off();
  });

  test("off, or a language without a dictionary: nothing to mark; Spanish for es-419", async () => {
    await spelling.configureSpelling({ enabled: false, language: "en", words: [] });
    expect(spelling.spellingMarks()).toBe(null);
    await spelling.configureSpelling({ enabled: true, language: "fr", words: [] });
    expect(spelling.spellingMarks()).toBe(null);
    await spelling.configureSpelling({ enabled: true, language: "es-419", words: [] });
    await until(() => spelling.spellingMarks()); // Spanish takes its ~650 ms to load
    const text = "El jardin";
    spelling.spellingMarks()(text);
    await until(() => spelling.spellingMarks()(text).length);
    expect(spelling.spellingMarks()(text).map((m) => text.slice(m.from, m.to))).toEqual(["jardin"]);
  });
});

test("the mark that ends at the cursor — the word being typed — is left out until the cursor moves on", () => {
  const key = new PluginKey("spellTest");
  const marks = decorationExtension("spellTest", key).configure({
    ranges: () => (text) => [...text.matchAll(/walkd/g)].map((m) => ({ from: m.index, to: m.index + 5, attrs: { class: "spell-error" } })),
    hideAtCursor: true,
  });
  const editor = new Editor({ extensions: [...editorExtensions(), marks], content: "<p>I walkd home</p>" });
  const plugin = editor.state.plugins.find((p) => p.spec.key === key);
  const shown = () => plugin.props.decorations.call(plugin, editor.state).find().length;
  // "walkd" is at 2..7 in the paragraph's text, 3..8 in the document
  editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 8)));
  expect(shown()).toBe(0);
  editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 5)));
  expect(shown()).toBe(1);
  editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 9)));
  expect(shown()).toBe(1);
  editor.destroy();
});
