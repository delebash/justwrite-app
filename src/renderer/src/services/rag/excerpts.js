// The cited-excerpt formatter for the two RAG chats ("Ask the book" +
// character chat). Extracted from chat.js / characterChat.js where it lived
// as a duplicated function (QC-35: one source, no copies) — the Lab's chapter
// picker reuses it so a test excerpts block matches a real run's byte-shape.
//
// Move 1 (RAG build): chunks are now scenes OR story-bible cards (kind +
// entityId, built by cards.js). citationLabel(chunk) is THE one label source
// — formatExcerpts AND the ChatPanel citation row both render it (the row's
// old inline template was a drifted duplicate; converged 2026-07-11).

import { CARD_KIND_LABELS } from "./cards.js";

// Scene prose truncates at 1200 chars (unchanged); bible cards are dense
// facts and get a little more room so a whole card usually fits.
const SCENE_EXCERPT_CHARS = 1200;
const CARD_EXCERPT_CHARS = 2000;

/**
 * THE citation label for a chunk — scene chunks keep their historical
 * chapter/scene form byte-for-byte; card chunks read
 * "Story Bible — Character: Aria".
 */
export function citationLabel(chunk) {
  if (chunk?.kind) {
    const kindLabel = CARD_KIND_LABELS[chunk.kind] || "Entry";
    return `Story Bible — ${kindLabel}: ${chunk.title || chunk.entityId || ""}`;
  }
  const sceneLabel = chunk.sceneTitle
    ? `, scene "${chunk.sceneTitle}"`
    : chunk.sceneIdx != null
      ? `, scene ${chunk.sceneIdx + 1}`
      : "";
  return `Ch. ${chunk.chapterNum} "${chunk.chapterTitle}"${sceneLabel}`;
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
