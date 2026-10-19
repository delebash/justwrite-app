// SPDX-License-Identifier: MIT
// The story bible's names aren't spelling mistakes (2026-10-18, the editor-expansion plan's piece
// 4): every word of a character's name or alias, a location's, an object's or a group's, wherever
// it stands in the editor, carries spellcheck="false" — the HTML attribute
// (html.spec.whatwg.org/multipage/interaction.html#spelling-and-grammar-checking), so the
// browser's spellchecker passes over it in the desktop app, a browser tab and the phone alike.
// Rejected on the second look: Electron's addWordToSpellCheckerDictionary, which on Windows 10+
// and macOS writes every book's names into the OS's own dictionary, and does nothing in a browser.
// Drawn as editorDecorations.js draws every view-only mark.
import { PluginKey } from "@tiptap/pm/state";
import { decorationExtension } from "./editorDecorations.js";

export const storyNamesKey = new PluginKey("storyNames");

const WORD = /[\p{L}\p{M}][\p{L}\p{M}'’-]*[\p{L}\p{M}]/gu;

/**
 * The words of the book's names, longest first: each name and alias split into its words (2
 * letters or more), so "Cael Ferren" also covers "Cael" alone. Case kept — a name is written with
 * its capitals, and a lowercase "brick" isn't Brick — and a word that starts lowercase is left
 * out ("the" in the alias "the Brass Girl" would mark every "the" in the book). A script without
 * capitals keeps all its words.
 */
export function storyNameWords(book) {
  const words = new Set();
  const add = (name) => {
    for (const m of String(name || "").matchAll(WORD)) if (!/^\p{Ll}/u.test(m[0])) words.add(m[0]);
  };
  for (const c of book.characters || []) {
    add(c.name);
    for (const a of c.aliases || []) add(a);
  }
  for (const kind of ["locations", "objects", "groups"]) for (const e of book[kind] || []) add(e.name);
  return [...words].sort((a, b) => b.length - a.length || a.localeCompare(b));
}

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The marks' `ranges` for editorDecorations: each name word — with its possessive ("Cael's") —
 * standing as a whole word, or null when the book has no names.
 */
export function storyNameRanges(words) {
  if (!words.length) return null;
  const re = new RegExp(`(?<![\\p{L}\\p{M}\\p{N}])(?:${words.map(escapeRegExp).join("|")})(?:['’]s)?(?![\\p{L}\\p{M}\\p{N}])`, "gu");
  return (text) => {
    const out = [];
    for (const m of text.matchAll(re)) out.push({ from: m.index, to: m.index + m[0].length, attrs: { spellcheck: "false", class: "story-name" } });
    return out;
  };
}

export const StoryNames = decorationExtension("storyNames", storyNamesKey);
