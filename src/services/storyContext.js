// The story context — ONE composer for every drafting call (2026-10-11, the AI drafting spec
// §2, plan Task 4). Two scopes:
//   book  — the book's frame: premise, genre, world rules, the Setting document, the main cast;
//   scene — the frame plus what the scene links: its POV, the strand beats pinned to it, its
//           notes, the story-bible cards of its characters / locations / objects (in link
//           order), and the end of the scene before it.
// Entity text comes ONLY from the story-bible card builder (rag/cards.js — the same cards the
// index and both chats use): a linked entity sends its first card part (identity + arc lead a
// split card; backstory and appearances fall to later parts). An entity or note marked
// Exclude from AI is never sent. Over the budget, whole pieces drop from the end — the book's
// frame goes in first and comes out last.
//
// Each piece the composer keeps is also returned as a part — { id, name }: `id` names a fixed
// piece (premise, genre, worldRules, setting, mainCast, pov, beats, sceneNotes, previousScene)
// for the editor's Context line to translate; a linked entity has no id and shows its own name.

/* eslint-disable i18next/no-literal-string -- text the AI model reads stays English (ruled 2026-10-13) */
import { useResolvedRoute } from "@delebash/llm-ui";
import { useAiStore } from "../stores/ai.js";
import { povLabel } from "./povOptions.js";
import { buildEntityCards } from "./rag/cards.js";
import { CHARS_PER_TOKEN } from "./rag/entityMatcher.js";
import { htmlToText } from "./text.js";

// How much of the previous scene rides along: the same grain Continue reads before the cursor
// (components/RichEditor.vue — grabContextBeforeCursor(800)).
const PREVIOUS_SCENE_TAIL_CHARS = 800;

const tokensOf = (text) => Math.ceil(text.length / CHARS_PER_TOKEN);

/**
 * The story-context budget in tokens: `share` of the routed model's context window. null = no
 * ceiling (the window is unknown — a cloud route publishes none); 0 = send nothing (the share
 * was never seeded — no number is guessed in code).
 */
export function storyBudgetTokens(share, contextWindow) {
  if (typeof share !== "number" || !(share > 0)) return 0;
  if (!(contextWindow > 0)) return null;
  return Math.floor(share * contextWindow);
}

/** The Context line's word for each fixed piece (an existing key where one means the same). */
export const CONTEXT_PART_KEYS = {
  premise: "settings.project.fieldPremise",
  genre: "settings.project.fieldGenre",
  worldRules: "storyContext.parts.worldRules",
  setting: "events.kinds.setting",
  mainCast: "storyContext.parts.mainCast",
  pov: "readerKnowledge.povLabel",
  beats: "strands.beatsHeading",
  sceneNotes: "sceneNotes.ariaLabel",
  previousScene: "storyContext.parts.previousScene",
};

/** A piece of context: `name` (its heading for the model), its text, and `id` for a fixed piece
 *  (the Context line translates it; an entity's piece has none and shows its name). */
const piece = (name, text, id = null) => ({ id, name, text: String(text || "").trim() });

const excluded = (entity) => !!entity?.excludeFromAi;

/** The first card part per (kind, entity id) — the unsplit card or part 1 of a split one. */
function firstCardIndex(cards) {
  const out = new Map();
  for (const card of cards) {
    const key = `${card.kind}:${card.entityId}`;
    if (!out.has(key)) out.set(key, card);
  }
  return out;
}

function bookPieces(project, cards) {
  const meta = project.project || {};
  const premise = meta.premise || htmlToText(project.architecture?.premise?.body || "", { blockNewlines: true });
  const setting = cards.get("architecture:setting");
  const cast = cards.get("cast:main");
  return [
    piece("Premise", premise, "premise"),
    piece("Genre", meta.genre, "genre"),
    piece("World rules", project.worldRules, "worldRules"),
    piece("Setting", setting?.text, "setting"),
    piece("Main cast", cast?.text, "mainCast"),
  ].filter((p) => p.text);
}

function findScene(project, chapterId, sceneId) {
  const scenes = project.scenesFor?.(chapterId) || [];
  const idx = scenes.findIndex((s) => s.id === sceneId);
  return idx < 0 ? null : { scene: scenes[idx], idx, scenes };
}

/** The scene before this one — earlier in its chapter, else the last of the chapter before. */
function previousScene(project, chapterId, idx, scenes) {
  if (idx > 0) return scenes[idx - 1];
  const chapters = project.allChapters || [];
  const ci = chapters.findIndex((c) => c.id === chapterId);
  for (let i = ci - 1; i >= 0; i--) {
    const prior = project.scenesFor?.(chapters[i].id) || [];
    if (prior.length) return prior[prior.length - 1];
  }
  return null;
}

function scenePieces(project, cards, chapterId, sceneId) {
  const found = findScene(project, chapterId, sceneId);
  if (!found) return null;
  const { scene, idx, scenes } = found;
  const out = [];

  const pov = povLabel(scene.pov);
  if (pov) out.push(piece("POV", `Narration: ${pov}`, "pov"));

  const beats = [];
  for (const strand of project.strands || []) {
    if (excluded(strand)) continue;
    for (const b of strand.beats || []) {
      if (b.sceneId !== sceneId) continue;
      beats.push(`- ${strand.name}: ${b.label}${b.note ? ` — ${b.note}` : ""}`);
    }
  }
  if (beats.length) out.push(piece("Beats", ["Story beats pinned to this scene:", ...beats].join("\n"), "beats"));

  const notes = (project.notes || [])
    .filter((n) => n.anchor?.sceneId === sceneId && !excluded(n))
    .map((n) => htmlToText(n.body || "", { blockNewlines: true }))
    .filter(Boolean);
  if (notes.length) out.push(piece("Scene notes", ["The writer's notes for this scene:", ...notes].join("\n"), "sceneNotes"));

  const lists = [
    ["character", project.characters, scene.characters],
    ["location", project.locations, scene.locations],
    ["object", project.objects, scene.objects],
  ];
  for (const [kind, all, ids] of lists) {
    for (const id of ids || []) {
      const entity = (all || []).find((e) => e.id === id);
      if (!entity || excluded(entity)) continue;
      const card = cards.get(`${kind}:${id}`);
      if (card) out.push(piece(entity.name, card.text));
    }
  }

  const prev = previousScene(project, chapterId, idx, scenes);
  if (prev && !excluded(prev)) {
    const text = htmlToText(prev.body || "");
    if (text) {
      const tail = text.length > PREVIOUS_SCENE_TAIL_CHARS ? `…${text.slice(-PREVIOUS_SCENE_TAIL_CHARS)}` : text;
      out.push(piece("Previous scene", `How the previous scene ends:\n${tail}`, "previousScene"));
    }
  }
  return out;
}

/** Join pieces under their names, keeping whole pieces while they fit the budget. */
function assemble(pieces, budgetTokens) {
  if (budgetTokens === 0) return { text: "", names: [], parts: [], tokens: 0 };
  const kept = [];
  let text = "";
  for (const p of pieces) {
    const block = `## ${p.name}\n${p.text}`;
    const next = text ? `${text}\n\n${block}` : block;
    if (budgetTokens != null && tokensOf(next) > budgetTokens) break;
    text = next;
    kept.push(p);
  }
  return { text, names: kept.map((p) => p.name), parts: kept.map(({ id, name }) => ({ id, name })), tokens: tokensOf(text) };
}

/** The book's frame. @returns {{ text: string, names: string[], parts: Array<{id, name}>, tokens: number }} */
export function composeBookContext(project, { budgetTokens = null } = {}) {
  const cards = firstCardIndex(buildEntityCards(project));
  return assemble(bookPieces(project, cards), budgetTokens);
}

/** The book's frame plus the scene's links. An unknown scene → empty.
 *  @returns {{ text: string, names: string[], parts: Array<{id, name}>, tokens: number }} */
export function composeSceneContext(project, { chapterId, sceneId, budgetTokens = null } = {}) {
  const cards = firstCardIndex(buildEntityCards(project));
  const scene = scenePieces(project, cards, chapterId, sceneId);
  if (!scene) return { text: "", names: [], parts: [], tokens: 0 };
  return assemble([...bookPieces(project, cards), ...scene], budgetTokens);
}

/**
 * The story-context budget for an action: the seeded share of the window of the model it's
 * routed to, read fresh (one local request) so a window cached before the engine started can't
 * leave a call without a ceiling. A caller (a test, the Lab) may pass its own `budgetTokens`.
 */
export async function storyBudgetFor(feature, action, budgetTokens) {
  if (budgetTokens !== undefined) return budgetTokens;
  const row = await useResolvedRoute().refreshRoute(feature, action);
  return storyBudgetTokens(useAiStore().storyContextShare, row?.context ?? null);
}

/** A prose action's story context (slice 2): its scene's, within the budget of the model the
 *  action is routed to. No scene → nothing (the action runs on its passage alone). */
export async function proseStoryContext(project, { chapterId, sceneId, action, budgetTokens } = {}) {
  if (!chapterId || !sceneId) return { text: "", names: [], parts: [], tokens: 0 };
  const budget = await storyBudgetFor("writerAI", action, budgetTokens);
  return composeSceneContext(project, { chapterId, sceneId, budgetTokens: budget });
}
