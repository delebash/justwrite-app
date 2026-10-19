// SPDX-License-Identifier: MIT
// The words of a block of prose the spellchecker looks at (2026-10-19, docs/plans/2026-10-19-
// spelling.md): runs of letters, an apostrophe allowed inside ("don't", "Cael’s"). Left alone, as
// Word's and Chrome's checkers leave them: a token with a digit or an underscore ("3rd", "v2"), a
// word with no lowercase letter (an acronym, a shout), a single letter, and anything inside an
// address — a link, an email, a path.

const TOKEN = /[\p{L}\p{M}\p{N}_]+(?:['’][\p{L}\p{M}\p{N}_]+)*/gu;
const ADDRESS = /[@/\\]|www\.|:\/\//i;

/** @returns {{ from: number, to: number, word: string }[]} offsets into `text` */
export function spellWords(text) {
  const out = [];
  for (const m of text.matchAll(TOKEN)) {
    const word = m[0];
    if (word.length < 2 || /[\p{N}_]/u.test(word) || !/\p{Ll}/u.test(word)) continue;
    // the run of non-space characters the word stands in
    let a = m.index;
    while (a > 0 && !/\s/u.test(text[a - 1])) a--;
    let b = m.index + word.length;
    while (b < text.length && !/\s/u.test(text[b])) b++;
    if (ADDRESS.test(text.slice(a, b))) continue;
    out.push({ from: m.index, to: m.index + word.length, word });
  }
  return out;
}
