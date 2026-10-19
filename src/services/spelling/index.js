// SPDX-License-Identifier: MIT
// Spelling JustWrite checks itself (2026-10-19, docs/plans/2026-10-19-spelling.md). The desktop
// app's spellchecker was Chromium's, and on Windows it flags nothing since Electron 41
// (electron/electron#54729; RESEARCH, "The writer's editor"). This is TipTap's documented second
// route (tiptap.dev/docs/guides/spellcheck): nspell in a worker, its misspellings drawn as
// decorations — the same in the desktop app, a browser tab and the phone, in the book's language,
// knowing the story bible's names and the book's own dictionary.
//
// Answers are cached per word, so a paragraph being edited keeps its marks: only a new word waits
// for the worker (a few milliseconds), and its answer redraws. The editor's `ranges` stay
// synchronous (editorDecorations.js).
import { PluginKey } from "@tiptap/pm/state";
import { decorationExtension } from "../editorDecorations.js";
import { dictionaryCode, loadDictionary } from "./dictionaries.js";
import { spellWords } from "./words.js";

export { dictionaryCode };
export const spellingKey = new PluginKey("spelling");
export const Spelling = decorationExtension("spelling", spellingKey);

const MAX_KNOWN = 50_000;
let worker = null;
let code = null; // the dictionary asked for last
let ready = false; // the worker has it
let on = false;
let words = []; // the book's own words, as last sent
let gen = 0; // bumps when what's correct may change; an older answer is dropped
let known = new Map(); // word → correct?
const queued = new Set();
const inflight = new Set();
let flushing = false;
const listeners = new Set();
let nextId = 0;
const waiting = new Map();

const changed = () => {
  for (const fn of listeners) fn();
};

function startWorker() {
  worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
  worker.onmessage = ({ data }) => {
    if (data.type === "loaded") {
      if (data.code !== code) return;
      ready = true;
      changed();
    } else if (data.type === "checked") {
      if (data.gen !== gen) return;
      const wrong = new Set(data.wrong);
      let redraw = false;
      for (const w of data.words) {
        inflight.delete(w);
        const ok = !wrong.has(w);
        if (known.get(w) !== ok) redraw = redraw || !ok || known.has(w);
        known.set(w, ok);
      }
      if (redraw) changed();
    } else if (data.type === "suggested") {
      waiting.get(data.id)?.(data.list);
      waiting.delete(data.id);
    }
  };
}

function ask(word) {
  if (inflight.has(word)) return;
  queued.add(word);
  if (flushing) return;
  flushing = true;
  // one message per pause: a paragraph's words go together
  setTimeout(() => {
    flushing = false;
    if (!queued.size || !worker) return;
    if (known.size > MAX_KNOWN) known = new Map();
    const list = [...queued];
    queued.clear();
    for (const w of list) inflight.add(w);
    worker.postMessage({ type: "check", gen, words: list });
  }, 30);
}

/** A new round: older answers are dropped, and `stale` words are asked again (their marks stay
 *  until the answer). */
function newRound(stale) {
  gen++;
  queued.clear();
  inflight.clear();
  for (const w of stale) ask(w);
}

/**
 * What to check with — Writing settings' Spell check, the book's language, the book's own words
 * (its names, its dictionary). Every editor calls it; the same values change nothing.
 */
export async function configureSpelling({ enabled, language, words: own }) {
  const want = enabled ? dictionaryCode(language) : null;
  const wasOn = on;
  on = !!want;
  if (want && !worker) startWorker();
  const key = own.join("\n");
  if (key !== words.join("\n")) {
    const removed = new Set(words.filter((w) => !own.includes(w)).map((w) => w.replaceAll("’", "'")));
    const stem = (w) => w.replaceAll("’", "'").replace(/'s?$/i, "");
    words = [...own];
    worker?.postMessage({ type: "words", words });
    // a word now in the book's list may be right; one taken out (or its possessive) may be wrong
    newRound([...known].filter(([w, ok]) => !ok || removed.has(stem(w))).map(([w]) => w));
  }
  if (want && want !== code) {
    code = want;
    ready = false;
    known = new Map();
    newRound([]);
    changed();
    const dict = await loadDictionary(want);
    if (code === want) worker.postMessage({ type: "load", code: want, ...dict });
    return;
  }
  if (on !== wasOn) changed();
}

/** The editor's `ranges` for the spelling marks — null while there is nothing to check with. */
export function spellingMarks() {
  if (!on || !ready) return null;
  return (text) => {
    const out = [];
    for (const w of spellWords(text)) {
      const ok = known.get(w.word);
      if (ok === undefined) ask(w.word);
      else if (!ok) out.push({ from: w.from, to: w.to, attrs: { class: "spell-error" } });
    }
    return out;
  };
}

/** Up to five corrections for a marked word ([] when there are none, or no dictionary). */
export function suggestSpelling(word) {
  if (!worker || !ready) return Promise.resolve([]);
  const id = ++nextId;
  return new Promise((resolve) => {
    waiting.set(id, resolve);
    worker.postMessage({ type: "suggest", id, word });
  });
}

/** Called when the marks should be drawn again (an answer, a new dictionary, the switch). */
export function onSpellingChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
