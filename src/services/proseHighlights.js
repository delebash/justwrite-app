// SPDX-License-Identifier: MIT
// Prose highlights (2026-10-18, the editor-expansion plan's piece 3): Writing settings' Filter
// words, Adverbs and AI-tell phrases, marked in the editor as you write. The catalogs are the ones
// Analysis counts with (styleMetrics' filter words and -ly adverbs, the AI-tell scan's phrases),
// so the editor and Analysis agree. They are English lists: English books only (RichEditor
// decides, from the book's language). Drawn as editorDecorations.js draws every view-only mark.
import { PluginKey } from "@tiptap/pm/state";
import { tellRanges } from "./analysis/aiTellScanner.js";
import { adverbRanges, filterWordRanges, repeatedWordRanges } from "./analysis/styleMetrics.js";
import { decorationExtension } from "./editorDecorations.js";

export const proseHighlightsKey = new PluginKey("proseHighlights");

/**
 * The ranges to mark in one block's text, for the lists that are on:
 * [{ from, to, kind: "filter" | "adverb" | "tell" | "repeat", noteKey, noteParams? }].
 * `on.repeats` = { within, skip } (2026-10-29: Repeated words — the window, the story's names) or null.
 */
export function highlightRanges(text, on) {
  const out = [];
  if (on.filter) for (const r of filterWordRanges(text)) out.push({ ...r, kind: "filter", noteKey: "richEditor.highlight.filterNote" });
  if (on.adverbs) for (const r of adverbRanges(text)) out.push({ ...r, kind: "adverb", noteKey: "richEditor.highlight.adverbNote" });
  if (on.tells) for (const r of tellRanges(text)) out.push({ from: r.from, to: r.to, kind: "tell", noteKey: r.blurbKey });
  if (on.repeats) {
    for (const r of repeatedWordRanges(text, on.repeats)) {
      out.push({ ...r, kind: "repeat", noteKey: "richEditor.highlight.repeatNote", noteParams: { n: on.repeats.within } });
    }
  }
  return out;
}

/**
 * The marks' `ranges` for editorDecorations: `on` = { filter, adverbs, tells, repeats } or null
 * (nothing on, or not an English book); `note(key, params)` = the hover note in the interface's language.
 */
export function proseHighlightRanges(on, note) {
  if (!on) return null;
  return (text) => highlightRanges(text, on).map((r) => ({ from: r.from, to: r.to, attrs: { class: `ph-${r.kind}`, title: note(r.noteKey, r.noteParams) } }));
}

export const ProseHighlights = decorationExtension("proseHighlights", proseHighlightsKey);
