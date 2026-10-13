// The cited-excerpt formatter for the two RAG chats ("Ask the book" +
// character chat). Extracted from chat.js / characterChat.js where it lived
// as a duplicated function (QC-35: one source, no copies) — the Lab's chapter
// picker reuses it so a test excerpts block matches a real run's byte-shape.
//
// Move 1 (RAG build): chunks are now scenes OR story-bible cards (kind +
// entityId, built by cards.js). citationLabel(chunk) is THE one label source
// — formatExcerpts AND the ChatPanel citation row both render it (the row's
// old inline template was a drifted duplicate; converged 2026-07-11).

import { CARD_KIND_LABEL_KEYS } from "./cards.js";
import { tEnglish } from "../../i18n/index.js";

// Scene prose truncates at 1200 chars (unchanged); bible cards are dense
// facts and get a little more room so a whole card usually fits.
const SCENE_EXCERPT_CHARS = 1200;
const CARD_EXCERPT_CHARS = 2000;

/**
 * THE citation label for a chunk — scene chunks read `Ch. 3 "Title", scene "Name"`; card chunks
 * read "Story Bible — Character: Aria". `translate` is the screen's `t`; the default, English, is
 * what the excerpts block the model reads carries (ruled 2026-10-13: prompts stay English).
 */
export function citationLabel(chunk, translate = tEnglish) {
  if (chunk?.kind) {
    const kindKey = CARD_KIND_LABEL_KEYS[chunk.kind] || "chat.citation.kind.entry";
    return translate("chat.citation.bible", { kind: translate(kindKey), title: chunk.title || chunk.entityId || "" });
  }
  const at = { num: chunk.chapterNum, chapter: chunk.chapterTitle, scene: chunk.sceneTitle, n: chunk.sceneIdx != null ? chunk.sceneIdx + 1 : null };
  const where = chunk.sceneTitle ? "sceneTitled" : chunk.sceneIdx != null ? "sceneN" : "chapter";
  // (c): two excerpts of one long scene stay distinguishable in citations.
  const base = translate(`chat.citation.${where}`, at);
  return chunk.scenePart ? translate("chat.citation.part", { base, part: chunk.scenePart }) : base;
}

/**
 * Format ranked hits into the cited excerpt block sent as the {{excerpts}}
 * variable (preserves the [1]/[2] reference numbers the citations panel and
 * the prompts' citation rules use).
 *
 * @param {Array<{ chunk: object }>} hits — scene or card chunks
 * @returns {string}
 */
export function formatExcerpts(hits) {
  return hits
    .map(({ chunk }, i) => {
      const cap = chunk.kind ? CARD_EXCERPT_CHARS : SCENE_EXCERPT_CHARS;
      // Truncate very long chunks so we don't blow the context window.
      const excerpt = chunk.text.length > cap ? `${chunk.text.slice(0, cap)}…` : chunk.text;
      // Move 3: a scene's entity-links line rides under its header so the
      // LLM sees who/where even when the prose never names them.
      const links = !chunk.kind && chunk.links ? `(${chunk.links})\n` : "";
      return `[${i + 1}] ${citationLabel(chunk)}:\n${links}${excerpt}`;
    })
    .join("\n\n");
}
