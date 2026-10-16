// AI planning (the AI drafting spec §5, slice 3; the plan 2026-10-15, Tasks P1–P3; built
// 2026-10-16): a scene's Summary from its prose, a plot template's beats filled for this book, the
// Fabula and Setting documents drafted from the premise. Everything lands in a review — the
// shared review window (DraftReviewModal.vue) or the editor's accept/reject diff — and nothing
// saves before.
//
// The inputs, composed here (the Lab sends this same layout — seed_presets.js "Scene to
// summarize" / "Template beats" / "Draft from the premise"):
//   THE SCENE (its place, title, POV, who and what it involves) · THE PROSE        (Summary)
//   BOOK CONTEXT · THE STRUCTURE · BEATS TO FILL (each with the template's note)   (a template)
//   BOOK CONTEXT · THE STRAND · ITS BEATS SO FAR · Brainstorm's request            (next beats, twists)
//   STORY CONTEXT · THE STORY SO FAR · Brainstorm's request          (the same, in the editor)
//   BOOK CONTEXT · THE DOCUMENT (its name, what it is for) · WHAT IT SAYS NOW      (Fabula, Setting)
// The prompts live server-side (seed_feature_prompts.js: sceneSummary, templateFill,
// premiseDraft under the feature planning); next beats and twists are Brainstorm's own
// brainstormPlot.

import { runAiFeature } from "@delebash/llm-ui";
import { brainstormAction, brainstormPrompt, freshIdeas, parseBrainstormLines } from "../brainstorm.js";
import { povLabel } from "../povOptions.js";
import { runJsonAnalysis } from "../runJson.js";
import { composeSceneContext, storyBudgetFor } from "../storyContext.js";
import { htmlToText, textToHtml } from "../text.js";
import { block, bookBlock, clamp, join } from "./draftInput.js";
import { t } from "../../i18n/index.js";

/** The feature slice 3's actions are routed under (Settings → AI → Routing by feature, "Planning"). */
export const PLANNING_FEATURE = "planning";

// A Summary is a sentence or three.
const SUMMARY_MAX = 600;

function sceneOf(project, chapterId, sceneId) {
  const scenes = project.scenesFor?.(chapterId) || project.scenes?.[chapterId] || [];
  const idx = scenes.findIndex((s) => s.id === sceneId);
  if (idx < 0) throw new Error(`No scene ${sceneId} in chapter ${chapterId}.`);
  const chapter = (project.allChapters || []).find((c) => c.id === chapterId) || null;
  return { scene: scenes[idx], idx, chapter };
}

const namesOf = (all, ids) => (ids || []).map((id) => (all || []).find((e) => e.id === id)?.name).filter(Boolean);

/* eslint-disable i18next/no-literal-string -- text the AI model reads stays English (ruled 2026-10-13) */
/** The input for a scene's Summary: where the scene sits and what it links, then its prose. */
export function composeSceneSummaryInput(project, chapterId, sceneId) {
  const { scene, idx, chapter } = sceneOf(project, chapterId, sceneId);
  const prose = htmlToText(scene.body || "", { blockNewlines: true }).trim();
  const lines = [];
  if (chapter) lines.push(`Chapter ${chapter.num ?? ""}${chapter.title ? ` "${chapter.title}"` : ""}`.trim());
  lines.push(`Scene ${idx + 1}${scene.title ? ` "${scene.title}"` : ""}`);
  const pov = povLabel(scene.pov);
  if (pov) lines.push(`Narration: ${pov}`);
  const who = namesOf(project.characters, scene.characters);
  if (who.length) lines.push(`Characters: ${who.join(", ")}`);
  const where = namesOf(project.locations, scene.locations);
  if (where.length) lines.push(`Locations: ${where.join(", ")}`);
  const what = namesOf(project.objects, scene.objects);
  if (what.length) lines.push(`Objects: ${what.join(", ")}`);
  const user_content = join(block("THE SCENE", lines.join("\n")), block("THE PROSE", prose));
  return { variables: { user_content }, hasProse: !!prose };
}
/* eslint-enable i18next/no-literal-string */

/** A model's summary → one clamped paragraph (quotes, a "Summary:" lead-in and newlines dropped). */
export function cleanSummary(text) {
  const s = String(text || "").trim()
    .replace(/^summary\s*:\s*/i, "")
    .replace(/^["“](.*)["”]$/s, "$1")
    .replace(/\s*\n+\s*/g, " ");
  return clamp(s, SUMMARY_MAX);
}

/** A scene's Summary drafted from its prose. @returns {Promise<{ summary: string, model: string }>} */
export async function summarizeScene({ project, chapterId, sceneId, signal } = {}) {
  const { variables, hasProse } = composeSceneSummaryInput(project, chapterId, sceneId);
  if (!hasProse) throw new Error(t("sceneSummary.noProse"));
  const { scene } = sceneOf(project, chapterId, sceneId);
  const meta = { kind: "scene-summary", sceneId };
  const result = await runAiFeature({
    action: "sceneSummary", feature: PLANNING_FEATURE, variables, signal, meta,
    task: { label: t("sceneSummary.task", { name: scene.title || t("sceneLinks.summary") }), meta },
  });
  return { summary: cleanSummary(result.content), model: result.model };
}

// ── Fill this template for my story (P2) ──────────────────────────────────

/** The plot template a strand was applied from, by its beats: the template with the most beat
 *  labels on the strand (in the interface language, as applyTemplate writes them), when at least
 *  half of its beats are there; else null. A strand keeps no template id. */
export function templateOfStrand(strand, templates, tr = t) {
  const labels = new Set((strand?.beats || []).map((b) => String(b.label || "").trim()));
  let best = null;
  let bestHits = 0;
  for (const tpl of Object.values(templates || {})) {
    const hits = tpl.beats.filter((b) => labels.has(tr(b.labelKey))).length;
    if (hits > bestHits) { best = tpl; bestHits = hits; }
  }
  return best && bestHits * 2 >= best.beats.length ? best : null;
}

/** The strand's beats that are the template's, each with its template note (the generic one
 *  applyTemplate wrote — a note still saying it counts as unwritten). */
export function templateBeats(strand, tpl, tr = t) {
  const byLabel = new Map(tpl.beats.map((b) => [tr(b.labelKey), tr(b.noteKey)]));
  return (strand.beats || [])
    .filter((b) => byLabel.has(String(b.label || "").trim()))
    .map((b, i) => ({ key: `beat${i + 1}`, beat: b, templateNote: byLabel.get(String(b.label || "").trim()) }));
}

/* eslint-disable i18next/no-literal-string -- text the AI model reads stays English (ruled 2026-10-13) */
/** The input for a template's beats: the book, the structure, then each beat with what it asks
 *  for (its label and the template's note). */
export function composeTemplateFillInput(project, strand, tpl, { budgetTokens = null, tr = t } = {}) {
  const beats = templateBeats(strand, tpl, tr);
  const lines = beats.map(({ key, beat, templateNote }) => `- ${key} — ${beat.label}: ${templateNote}`);
  const user_content = join(
    bookBlock(project, budgetTokens),
    block("THE STRUCTURE", `${tr(tpl.labelKey)} — ${tr(tpl.blurbKey)}`),
    block("BEATS TO FILL", lines.join("\n")),
  );
  return { variables: { user_content }, beats };
}
/* eslint-enable i18next/no-literal-string */

// A beat's note is a few sentences.
const BEAT_NOTE_MAX = 800;

/** The template's beats with notes for this book → review rows: one per beat with a note, the
 *  writer's note beside it. A note still the template's own counts as unwritten — no "replaces
 *  what you wrote" — and comes ticked; a written one doesn't. */
export async function fillTemplate({ project, strandId, templates, signal, budgetTokens } = {}) {
  const strand = (project.strands || []).find((s) => s.id === strandId);
  const tpl = strand && templateOfStrand(strand, templates);
  if (!tpl) throw new Error(t("plotBoard.ai.notATemplate"));
  const budget = await storyBudgetFor(PLANNING_FEATURE, "templateFill", budgetTokens);
  const { variables, beats } = composeTemplateFillInput(project, strand, tpl, { budgetTokens: budget });
  const meta = { kind: "template-fill", strandId };
  const { parsed } = await runJsonAnalysis({
    action: "templateFill", feature: PLANNING_FEATURE, variables, signal, meta,
    task: { label: t("plotBoard.ai.taskFill", { name: strand.name }), meta },
  });
  const rows = [];
  for (const { key, beat, templateNote } of beats) {
    const proposed = clamp(parsed?.[key], BEAT_NOTE_MAX);
    if (!proposed) continue;
    const note = String(beat.note || "").trim();
    const written = note && note !== templateNote ? note : "";
    rows.push({ key: beat.id, label: beat.label, current: written, proposed, accept: !written });
  }
  return rows;
}

// ── Suggest next beats / Plot twists (P2): Brainstorm's plot categories for a strand ─────────

/* eslint-disable i18next/no-literal-string -- text the AI model reads stays English (ruled 2026-10-13) */
/** Brainstorm's round for a strand: the book, the strand and its beats in order, then Brainstorm's
 *  own request in the category (next_beat / twist). */
export function composeStrandIdeasInput(project, strand, category, { budgetTokens = null } = {}) {
  const { action, variables } = brainstormAction(category);
  const beats = (strand.beats || []).map((b) => `- ${b.label}${b.note ? ` — ${b.note}` : ""}`);
  const about = [`Name: ${strand.name || ""}`];
  if (strand.blurb) about.push(`About: ${htmlToText(strand.blurb)}`);
  const book = bookBlock(project, budgetTokens);
  const what = category === "twist" ? "twists" : "next beats";
  const seed = `${what} for the strand in THE STRAND, after its last beat${book ? ", fitting the book in BOOK CONTEXT" : ""}`;
  const user_content = join(
    book,
    block("THE STRAND", about.join("\n")),
    block("ITS BEATS SO FAR", beats.join("\n")),
    brainstormPrompt({ category, seed }),
  );
  return { action, variables: { ...variables, user_content } };
}
/* eslint-enable i18next/no-literal-string */

/** A strand's ideas → review rows (none ticked: the writer picks), never a beat it already has. */
export async function strandIdeas({ project, strandId, category, signal, budgetTokens } = {}) {
  const strand = (project.strands || []).find((s) => s.id === strandId);
  if (!strand) throw new Error(`No strand ${strandId}.`);
  const budget = await storyBudgetFor("brainstorm", brainstormAction(category).action, budgetTokens);
  const { action, variables } = composeStrandIdeasInput(project, strand, category, { budgetTokens: budget });
  const meta = { kind: `strand-${category}`, strandId };
  const result = await runAiFeature({
    action, feature: "brainstorm", variables, signal, meta,
    task: { label: t("plotBoard.ai.taskIdeas", { name: strand.name }), meta },
  });
  const ideas = freshIdeas(parseBrainstormLines(result.content), { exclude: (strand.beats || []).map((b) => b.label) });
  return ideas.map((idea, i) => ({ key: `idea${i + 1}`, label: "", current: "", proposed: clamp(idea, BEAT_NOTE_MAX), accept: false }));
}

// ── Next plot beats and Plot twists in the editor's AI menu (P2; answered 2026-10-16) ──────────

/* eslint-disable i18next/no-literal-string -- text the AI model reads stays English (ruled 2026-10-13) */
/** The input for ideas at the cursor: the scene's story context (the book, the scene's links and
 *  Summary, how the previous scene ends), the prose up to the cursor, then Brainstorm's request —
 *  never an idea already shown (`seen`). */
export function composeSceneIdeasInput(project, { chapterId, sceneId, category, proseTail = "", seen = [], budgetTokens = null } = {}) {
  const { action, variables } = brainstormAction(category);
  const story = composeSceneContext(project, { chapterId, sceneId, budgetTokens }).text;
  const what = category === "twist" ? "twists" : "next beats";
  const seed = `${what} from where THE STORY SO FAR ends${story ? ", fitting STORY CONTEXT" : ""}`;
  const user_content = join(
    block("STORY CONTEXT", story),
    block("THE STORY SO FAR", proseTail),
    brainstormPrompt({ category, seed, seen }),
  );
  return { action, variables: { ...variables, user_content } };
}
/* eslint-enable i18next/no-literal-string */

/** Ideas for what happens next from the cursor, none already shown. @returns {Promise<string[]>} */
export async function sceneIdeas({ project, chapterId, sceneId, category, proseTail = "", seen = [], taskName = "", signal, budgetTokens } = {}) {
  const budget = await storyBudgetFor("brainstorm", brainstormAction(category).action, budgetTokens);
  const { action, variables } = composeSceneIdeasInput(project, { chapterId, sceneId, category, proseTail, seen, budgetTokens: budget });
  const meta = { kind: `scene-${category}`, sceneId };
  const result = await runAiFeature({
    action, feature: "brainstorm", variables, signal, meta,
    task: { label: t("plotBoard.ai.taskIdeas", { name: taskName }), meta },
  });
  return freshIdeas(parseBrainstormLines(result.content), { seen }).map((idea) => clamp(idea, BEAT_NOTE_MAX));
}

// ── Draft from the premise (P3): the Fabula or Setting document ───────────────────────────────

/* eslint-disable i18next/no-literal-string -- text the AI model reads stays English (ruled 2026-10-13) */
/** The input for an Architecture document: the book (its premise first), then the document — its
 *  name, what it is for, and what it says now. */
export function composePremiseDraftInput(project, docId, { title, purpose, budgetTokens = null } = {}) {
  const doc = project.architecture?.[docId];
  if (!doc) throw new Error(`No Architecture document ${docId}.`);
  const now = htmlToText(doc.body || "", { blockNewlines: true }).trim();
  const about = [`Name: ${title || docId}`];
  if (purpose) about.push(`What it is for: ${purpose}`);
  const user_content = join(
    bookBlock(project, budgetTokens),
    block("THE DOCUMENT", about.join("\n")),
    block("WHAT IT SAYS NOW", now),
  );
  return { variables: { user_content } };
}
/* eslint-enable i18next/no-literal-string */

/** An Architecture document drafted from the premise, as editor HTML for the accept/reject diff.
 *  `title`/`purpose` are the document's name and description in English (the model reads English). */
export async function draftFromPremise({ project, docId, title, purpose, signal, budgetTokens } = {}) {
  const budget = await storyBudgetFor(PLANNING_FEATURE, "premiseDraft", budgetTokens);
  const { variables } = composePremiseDraftInput(project, docId, { title, purpose, budgetTokens: budget });
  const meta = { kind: "premise-draft", docId };
  const result = await runAiFeature({
    action: "premiseDraft", feature: PLANNING_FEATURE, variables, signal, meta,
    task: { label: t("architecture.draft.task", { name: title || docId }), meta },
  });
  return { html: textToHtml(String(result.content || "").trim()), model: result.model };
}
