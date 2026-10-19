// SPDX-License-Identifier: MIT
// The spellchecker's worker (Vite's module Web Worker, vite.dev/guide/features#web-workers): it
// holds the dictionary, so loading one — Spanish takes about 650 ms — never freezes the editor.
// Its messages (services/spelling/index.js sends them, in this order):
//   { type: "words", words }               the book's own words (kept for the next dictionary too)
//   { type: "load", code, aff, dic }       → { type: "loaded", code }
//   { type: "check", gen, words }          → { type: "checked", gen, words, wrong }
//   { type: "suggest", id, word }          → { type: "suggested", id, list }
import { createChecker } from "./checker.js";

let checker = null;
let words = [];

self.onmessage = ({ data }) => {
  if (data.type === "words") {
    words = data.words;
    checker?.setWords(words);
  } else if (data.type === "load") {
    checker = createChecker(data);
    checker.setWords(words);
    self.postMessage({ type: "loaded", code: data.code });
  } else if (data.type === "check" && checker) {
    self.postMessage({ type: "checked", gen: data.gen, words: data.words, wrong: data.words.filter((w) => !checker.correct(w)) });
  } else if (data.type === "suggest") {
    self.postMessage({ type: "suggested", id: data.id, list: checker ? checker.suggest(data.word) : [] });
  }
};
