// SPDX-License-Identifier: MIT
// One language's spellchecker: nspell (wooorm's Hunspell-compatible checker — the engine of
// TipTap's spellcheck guide, tiptap.dev/docs/guides/spellcheck) over a Hunspell dictionary, plus
// the book's own words (its story bible's names and its dictionary). It runs in the spelling
// worker (worker.js); the tests use it directly.
import nspell from "nspell";

const plain = (word) => word.replaceAll("’", "'");

export function createChecker({ aff, dic }) {
  const spell = nspell({ aff, dic });
  // Only the words this book added, so taking one back never removes a word the dictionary has.
  let added = new Set();
  const known = (w) => spell.correct(w);
  return {
    /** Correct — or a possessive of a correct word ("Cael's", "the Fenns'"). */
    correct(word) {
      const w = plain(word);
      if (known(w)) return true;
      if (/'s$/i.test(w)) return known(w.slice(0, -2));
      if (w.endsWith("'")) return known(w.slice(0, -1));
      return false;
    },
    /** Up to five corrections, with the word's own apostrophe. */
    suggest(word) {
      const list = spell.suggest(plain(word)).slice(0, 5);
      return word.includes("’") ? list.map((s) => s.replaceAll("'", "’")) : list;
    },
    /** The book's own words, replacing the ones set before. */
    setWords(words) {
      for (const w of added) spell.remove(w);
      added = new Set();
      for (const w of new Set(words.map(plain))) {
        if (!w || known(w)) continue;
        spell.add(w);
        added.add(w);
      }
    },
  };
}
