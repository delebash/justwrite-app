// THE shared deterministic entity matcher (Move 2 + E1 + E2 of the RAG
// build — docs/plans/2026-07-11-rag-story-bible-build.md §T3/§T5). Scans a
// text for story-bible entity names and aliases:
//   * ask-time pinning (chat.js / characterChat.js) — a named entity's card
//     is injected regardless of retrieval rank;
//   * E1 — the entity-sweep accept path sets scene presence links by
//     scanning the origin chapters' scenes;
//   * E2 — the reviewable link-backfill sweep over all scenes.
// No LLM involved — a word-boundary scan over a few hundred strings is
// sub-millisecond. Built ON the shared text primitives (normalizeName /
// textMentionsTerm — foreshadowingScan's "key"/"monkey" guard), never a
// parallel matcher.

import { htmlToText, normalizeName, textMentionsTerm } from "../text.js";

// Names shorter than this never match — initials/junk rows would over-pin.
const MIN_NAME_CHARS = 3;

/**
 * Collect every matchable bible entity from a project store instance.
 * Aliases exist on characters only (today's schema; E3 feeds them).
 *
 * @returns {Array<{ kind, entityId, name, aliases: string[] }>}
 */
export function collectEntities(project) {
  const out = [];
  const push = (kind, list, aliasesOf = () => []) => {
    for (const e of list || []) {
      if (!e?.name && !e?.title) continue;
      out.push({ kind, entityId: e.id, name: e.name || e.title, aliases: aliasesOf(e) });
    }
  };
  push("character", project.characters, (c) => (c.aliases || []).filter(Boolean));
  push("location", project.locations);
  push("object", project.objects);
  push("group", project.groups);
  push("worldbuilding", project.worldbuilding);
  push("strand", project.strands);
  return out;
}

// The common-word guard (flag F5, refined at build): a single-token name
// matches case-insensitively at a word boundary, BUT when the text uses
// capitals at all (i.e. capitalization carries information), a lowercase-only
// occurrence does not count — "the rose garden" never pins Rose, while the
// all-lowercase "who is rose?" still does (lazy typing is the chat norm).
// Multi-word names are distinctive enough to match case-insensitively.
function termMatches(text, term) {
  if (normalizeName(term).length < MIN_NAME_CHARS) return false;
  if (!textMentionsTerm(text, term)) return false;
  if (/\s/.test(term.trim())) return true;
  if (!/[A-ZÀ-Þ]/.test(text)) return true; // all-lowercase text → case carries no signal
  return textMentionsTerm(text, term, { caseSensitive: true });
}

/**
 * Match bible entities against a text. Returns one hit per entity —
 * `exact: true` when the entity's NAME matched (outranks alias hits in the
 * pin ordering), `matched` = the term that hit.
 *
 * @param {string} text
 * @param {Array<{ kind, entityId, name, aliases }>} entities — collectEntities()
 * @returns {Array<{ kind, entityId, name, matched, exact }>}
 */
export function matchEntities(text, entities) {
  const hits = [];
  if (!text?.trim()) return hits;
  for (const e of entities) {
    if (termMatches(text, e.name)) {
      hits.push({ kind: e.kind, entityId: e.entityId, name: e.name, matched: e.name, exact: true });
      continue;
    }
    const alias = (e.aliases || []).find((a) => termMatches(text, a));
    if (alias) {
      hits.push({ kind: e.kind, entityId: e.entityId, name: e.name, matched: alias, exact: false });
    }
  }
  return hits;
}

// ── ask-time pinning (Move 2) ─────────────────────────────────────────────

// Pinned cards ride a token BUDGET (the SillyTavern World Info pattern) so
// they can never crowd out prose evidence — ~2-3 typical cards. Tokens are
// estimated at 4 chars each (module fact, not a user knob).
const PIN_TOKEN_BUDGET = 1200;
const CHARS_PER_TOKEN = 4;

/**
 * Pick the cards to pin for a question (+ recent user turns — follow-ups
 * like "what does SHE want" ride the prior turn's name). NAMED-ENTITY-ONLY
 * (the user's rec: no 1-hop relation fan-out — relations are already in the
 * card text). Exact-name hits outrank alias hits; the budget caps the total.
 *
 * `corpusFallback` (book-chat only, 2026-07-18): a question that names NO
 * bible entity ("what is this book about?") pins the premise card + the
 * main-character cards instead — ground-truthed incident: that question
 * retrieved a side character's card and never the protagonist's, and BOTH
 * thinking modes misnamed the protagonist; a retrieval gap no reasoning can
 * fix. Fallback pins ride the SAME budget and stay additive (retrieval keeps
 * its k), so named-entity questions and every other search are byte-identical.
 *
 * @param {object} opts
 * @param {string} opts.question
 * @param {Array<{role,content}>} [opts.history]
 * @param {object} opts.project           — live store instance
 * @param {Array}  opts.cards             — buildEntityCards(project) output
 * @param {string} [opts.excludeEntityId] — e.g. the interviewee in character chat
 * @param {boolean} [opts.corpusFallback] — pin premise + main cast when the CURRENT question names no entity
 * @returns {Array} card chunks to pin, in priority order
 */
export function pickPinnedCards({ question, history = [], project, cards, excludeEntityId, corpusFallback = false } = {}) {
  const recentUserTurns = history
    .filter((m) => m?.role === "user" && m.content)
    .slice(-2)
    .map((m) => m.content);
  const scanText = [question, ...recentUserTurns].join("\n");

  const entities = collectEntities(project);
  // Named pins ride the question + recent turns, so a pronoun follow-up ("what does
  // SHE want") resolves to the name from the prior turn.
  const hits = matchEntities(scanText, entities)
    .filter((h) => h.entityId !== excludeEntityId)
    .sort((a, b) => Number(b.exact) - Number(a.exact));
  // The corpus fallback keys on the CURRENT question ALONE: a broad question is broad
  // even mid-conversation, so a name carried in from history must NOT suppress it
  // ("who is Iven?" then "so what's the book about?" still pins premise + protagonist).
  const questionNamesEntity = matchEntities(question, entities).some((h) => h.entityId !== excludeEntityId);

  const byEntity = new Map();
  for (const card of cards) {
    if (!card.kind) continue;
    // A split article pins its first part only (the header part).
    if (!byEntity.has(`${card.kind}:${card.entityId}`)) {
      byEntity.set(`${card.kind}:${card.entityId}`, card);
    }
  }

  const pinned = [];
  let budget = PIN_TOKEN_BUDGET * CHARS_PER_TOKEN;
  for (const hit of hits) {
    const card = byEntity.get(`${hit.kind}:${hit.entityId}`);
    if (!card) continue;
    if (card.text.length > budget) continue;
    pinned.push(card);
    budget -= card.text.length;
    if (budget <= 0) break;
  }

  // Corpus-level fallback — when the CURRENT question names no entity (a whole-book
  // question, even mid-conversation). A matched-but-unpinnable entity in the current
  // question still means "about that entity", so questionNamesEntity (not pins) is the
  // gate. Premise first (the author's own "what this book is about"), then main-cast in
  // the author's list order. Additive under the same budget, skipping any card a name
  // pin already took (a main named in history is not doubled).
  if (corpusFallback && !questionNamesEntity) {
    const pinnedIds = new Set(pinned.map((c) => c.id));
    const fallbackKeys = [
      "architecture:premise",
      ...(project.characters || []).filter((c) => c?.main && c.id !== excludeEntityId).map((c) => `character:${c.id}`),
    ];
    for (const key of fallbackKeys) {
      const card = byEntity.get(key);
      if (!card || pinnedIds.has(card.id)) continue;
      if (card.text.length > budget) continue;
      pinned.push(card);
      budget -= card.text.length;
      if (budget <= 0) break;
    }
  }
  return pinned;
}

/**
 * Prepend pinned cards to the retrieved hits as [n]-cited excerpts —
 * pins are additive (retrieval keeps its k); a card that ALSO ranked drops
 * from the retrieved list so it never appears twice. ONE combiner for both
 * chats.
 */
export function combinePinsAndHits(pinnedCards, hits) {
  const pinnedIds = new Set(pinnedCards.map((c) => c.id));
  return [
    ...pinnedCards.map((card) => ({ chunk: card, pinned: true })),
    ...hits.filter((h) => !pinnedIds.has(h.chunk.id)),
  ];
}

// ── scene presence-link proposals (E1 + E2) ──────────────────────────────

const KIND_FIELD = { character: "characters", location: "locations", object: "objects" };

/**
 * Scan scenes for entity name/alias mentions and propose the presence links
 * (`scene.characters`/`.locations`/`.objects`) that are not set yet. ONE
 * scanner for both extraction moves: E1 feeds it the just-accepted entities
 * scoped to their origin chapters; E2's backfill sweep runs it over the
 * whole book with every bible entity. No LLM — string matching only.
 *
 * @param {object} project — live store instance
 * @param {Array<{ kind, entityId, name, aliases }>} entities — linkable
 *        kinds only (character/location/object); others are skipped
 * @param {object} [opts]
 * @param {Set<string>} [opts.chapterIds] — restrict the scan
 * @returns {Array<{ chapterId, sceneId, field, id, entityName, matched,
 *                   chapterNum, chapterTitle, sceneTitle, sceneIdx }>}
 */
export function proposeSceneLinks(project, entities, { chapterIds } = {}) {
  const linkable = entities.filter((e) => KIND_FIELD[e.kind]);
  if (!linkable.length) return [];
  const out = [];
  const allChapters = project.allChapters;
  for (let ci = 0; ci < allChapters.length; ci++) {
    const chapter = allChapters[ci];
    if (chapterIds && !chapterIds.has(chapter.id)) continue;
    const scenes = project.scenesFor(chapter.id);
    for (let si = 0; si < scenes.length; si++) {
      const scene = scenes[si];
      const text = htmlToText(scene.body || "");
      if (!text) continue;
      for (const hit of matchEntities(text, linkable)) {
        const field = KIND_FIELD[hit.kind];
        const existing = Array.isArray(scene[field]) ? scene[field] : [];
        if (existing.includes(hit.entityId)) continue;
        out.push({
          chapterId: chapter.id, sceneId: scene.id, field, id: hit.entityId,
          entityName: hit.name, matched: hit.matched,
          chapterNum: ci + 1, chapterTitle: chapter.title || "",
          sceneTitle: scene.title || "", sceneIdx: si,
        });
      }
    }
  }
  return out;
}
