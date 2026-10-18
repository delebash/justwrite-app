// AI drafting on the location, object and group pages and on Worldbuilding (the AI drafting spec
// §9.1; the plan 2026-10-15, Task S5; built 2026-10-16) — characterDraft.js's counterpart for the
// story-world sheets (services/storyWorldSheet.js), on the same pieces: the book's frame
// (draftInput.js), the review rows (characterProfile.js draftRows), nothing saved until Apply,
// one undo step (the store's applySheetDraft).
//
// The inputs, composed here (the Lab sends this same layout — seed_presets.js "Location from a
// description" / "Object from a description" / "Group from a description" / "Suggest locations" /
// "Worldbuilding article"):
//   BOOK CONTEXT · THE LOCATION|OBJECT|GROUP (its name, kind, description and filled fields)
//   · THE WRITER'S DESCRIPTION · FIELDS TO DRAFT (each key with its label and hint, in English)
//   BOOK CONTEXT · LOCATIONS ALREADY IN THE BOOK · WHAT THE WRITER IS LOOKING FOR (suggestions)
//   BOOK CONTEXT · THE ARTICLE (title, category, summary, what it says now) (an article's body)
// The prompts live server-side (seed_feature_prompts.js: locationDraft, objectDraft, groupDraft,
// worldbuildingDraft under the feature storyWorld; suggestLocations under brainstorm). Name ideas
// runs Brainstorm's own actions, as a character's does.

import { runAiFeature } from "@delebash/ui";
import { brainstormAction, brainstormPrompt } from "../brainstorm.js";
import { runJsonAnalysis } from "../runJson.js";
import { storyBudgetFor } from "../storyContext.js";
import {
  sheetDescription, sheetFieldDefs, sheetFieldLabelKeys, sheetFields, sheetValue, STORY_WORLD_SHEETS,
} from "../storyWorldSheet.js";
import { htmlToText, textToHtml } from "../text.js";
import { block, bookBlock, clamp, join } from "./draftInput.js";
import { t, tEnglish } from "../../i18n/index.js";

/** The feature the sheet and article drafts are routed under (Settings → AI → Routing by feature,
 *  "Story-world sheets"). */
export const STORY_WORLD_FEATURE = "storyWorld";
const SHEET_ACTIONS = { location: "locationDraft", object: "objectDraft", group: "groupDraft" };
// The page's own description (a group's Blurb) as a draft's key: proposed only while it's empty —
// it's rich text, so a plain-text draft never replaces one (a character's one-liner, plain text,
// is proposed either way). Answered 2026-10-16 (TASKS, the sixth round).
export const DESCRIPTION_FIELD = "description";
// Name ideas' Brainstorm category by page kind (spec §3.3); groups have none of their own.
const NAME_CATEGORY = { location: "place_name", object: "item_name", group: "free" };

/* eslint-disable i18next/no-literal-string -- text the AI model reads stays English (ruled 2026-10-13) */
const ENTRY_HEADING = { location: "THE LOCATION", object: "THE OBJECT", group: "THE GROUP" };
const TAKEN_HEADING = {
  location: "LOCATIONS ALREADY IN THE BOOK",
  object: "OBJECTS ALREADY IN THE BOOK",
  group: "GROUPS ALREADY IN THE BOOK",
};
/* eslint-enable i18next/no-literal-string */

function listOf(project, kind) {
  return project[STORY_WORLD_SHEETS[kind].plural] || [];
}

function entryOf(project, kind, entityId) {
  const entity = listOf(project, kind).find((x) => x.id === entityId);
  if (!entity) throw new Error(`No ${kind} with id ${entityId}.`);
  return entity;
}

/** The entry's own description, as plain text ("" when it has none). */
function descriptionOf(kind, entity) {
  return htmlToText(entity?.[sheetDescription(kind).key] || "").trim();
}

/* eslint-disable i18next/no-literal-string -- text the AI model reads stays English (ruled 2026-10-13) */
/** The entry as the model reads it: its name, kind, description and every filled sheet field. */
function entryBlock(kind, entity) {
  const lines = [`Name: ${entity.name || ""}`];
  if (entity.kind) lines.push(`Kind: ${entity.kind}`);
  const description = descriptionOf(kind, entity);
  if (description) lines.push(`Description: ${description}`);
  for (const k of sheetFields(kind)) {
    const v = sheetValue(entity, k).trim();
    if (v) lines.push(`${tEnglish(sheetFieldLabelKeys(kind, k).label)}: ${v}`);
  }
  return block(ENTRY_HEADING[kind], lines.join("\n"));
}
/* eslint-enable i18next/no-literal-string */

function takenBlock(project, kind) {
  const names = listOf(project, kind).map((x) => x.name).filter(Boolean);
  return block(TAKEN_HEADING[kind], names.map((n) => `- ${n}`).join("\n"));
}

/* eslint-disable i18next/no-literal-string -- text the AI model reads stays English (ruled 2026-10-13) */
/** The input for a sheet draft: the book, the entry, the writer's description and the fields to
 *  draft, each with its label and what it asks for — the entry's own description first while it
 *  has none, then the sheet. */
export function composeSheetInput(project, kind, entityId, description, { budgetTokens = null } = {}) {
  const entity = entryOf(project, kind, entityId);
  const keys = [...sheetFields(kind)];
  const fields = keys.map((k) => {
    const labels = sheetFieldLabelKeys(kind, k);
    return `- ${k} — ${tEnglish(labels.label)}: ${tEnglish(labels.hint)}`;
  });
  if (!descriptionOf(kind, entity)) {
    keys.unshift(DESCRIPTION_FIELD);
    fields.unshift(`- ${DESCRIPTION_FIELD} — Description: What the ${kind} is, in a few sentences: its main description.`);
  }
  const user_content = join(
    bookBlock(project, budgetTokens),
    entryBlock(kind, entity),
    block("THE WRITER'S DESCRIPTION", description),
    block("FIELDS TO DRAFT", fields.join("\n")),
  );
  return { action: SHEET_ACTIONS[kind], variables: { user_content }, keys };
}
/* eslint-enable i18next/no-literal-string */

/** The review's rows to fill: the entry's own description (under the page's label) first while it
 *  has none, then the sheet's fields. `t` is the i18n translate function. */
export function sheetDraftDefs(kind, entity, t) {
  const defs = sheetFieldDefs(kind, entity, t);
  if (descriptionOf(kind, entity)) return defs;
  return [{ key: DESCRIPTION_FIELD, label: t(sheetDescription(kind).label), current: "" }, ...defs];
}

// A sheet field is a few sentences.
const SHEET_FIELD_MAX = 1200;

/** A sheet draft's reply → exactly the sheet's keys, as clamped strings ("" when absent). */
export function sanitizeSheet(parsed, keys) {
  const out = {};
  for (const k of keys) out[k] = clamp(parsed?.[k], SHEET_FIELD_MAX);
  return out;
}

/** The sheet's fields from the writer's description. @returns {{ fields: object, model: string }} */
export async function draftSheet({ project, kind, entityId, description = "", signal, budgetTokens } = {}) {
  const budget = await storyBudgetFor(STORY_WORLD_FEATURE, SHEET_ACTIONS[kind], budgetTokens);
  const { action, variables, keys } = composeSheetInput(project, kind, entityId, description, { budgetTokens: budget });
  const name = entryOf(project, kind, entityId).name;
  const meta = { kind: `${kind}-draft`, entityId };
  const { result, parsed } = await runJsonAnalysis({
    action, feature: STORY_WORLD_FEATURE, variables, signal, meta,
    task: { label: t("sheetDraft.task", { name }), meta },
  });
  return { fields: sanitizeSheet(parsed, keys), model: result.model };
}

/** The review's ticked rows onto the entry, as ONE undo step. Only the sheet's own keys land, and
 *  the description while the entry still has none (as paragraphs).
 *  @returns {number} how many fields were written. */
export function applySheetDrafts(project, kind, entityId, picks) {
  const allowed = new Set(sheetFields(kind));
  const empty = !descriptionOf(kind, entryOf(project, kind, entityId));
  const patch = {};
  for (const p of picks || []) {
    const text = String(p.proposed ?? "").trim();
    if (allowed.has(p.key)) patch[p.key] = text;
    else if (p.key === DESCRIPTION_FIELD && empty && text) patch[sheetDescription(kind).key] = textToHtml(text);
  }
  const n = Object.keys(patch).length;
  if (n) project.applySheetDraft(STORY_WORLD_SHEETS[kind].plural, entityId, patch);
  return n;
}

// ── Name ideas ────────────────────────────────────────────────────────────

/* eslint-disable i18next/no-literal-string -- text the AI model reads stays English (ruled 2026-10-13) */
/** Name ideas' round for a location, object or group: the book, the entry and the names its kind
 *  already uses, then Brainstorm's own request in the page kind's category. */
export function composeSheetNameIdeasInput(project, kind, entityId, { liked = [], seen = [], budgetTokens = null } = {}) {
  const category = NAME_CATEGORY[kind];
  const { action, variables } = brainstormAction(category);
  const book = bookBlock(project, budgetTokens);
  const what = `names for the ${kind} in ${ENTRY_HEADING[kind]}`;
  const seed = book ? `${what}, fitting the book in BOOK CONTEXT` : what;
  const user_content = join(
    book,
    entryBlock(kind, entryOf(project, kind, entityId)),
    takenBlock(project, kind),
    brainstormPrompt({ category, seed, liked, seen }),
  );
  return { action, variables: { ...variables, user_content } };
}
/* eslint-enable i18next/no-literal-string */

/** Name ideas' request for useBrainstorm: the composed round, with the names the kind already
 *  uses never shown as ideas. */
export async function sheetNameIdeasRequest({ project, kind, entityId, liked = [], seen = [], budgetTokens } = {}) {
  const { action } = brainstormAction(NAME_CATEGORY[kind]);
  const budget = await storyBudgetFor("brainstorm", action, budgetTokens);
  const request = composeSheetNameIdeasInput(project, kind, entityId, { liked, seen, budgetTokens: budget });
  return { ...request, exclude: listOf(project, kind).map((x) => x.name).filter(Boolean) };
}

// ── Suggest locations ─────────────────────────────────────────────────────

/* eslint-disable i18next/no-literal-string -- text the AI model reads stays English (ruled 2026-10-13) */
/** The input for location suggestions: the book, the locations it has, what the writer wants. */
export function composeSuggestLocationsInput(project, { lookingFor = "", budgetTokens = null } = {}) {
  const user_content = join(
    bookBlock(project, budgetTokens),
    takenBlock(project, "location"),
    block("WHAT THE WRITER IS LOOKING FOR", lookingFor),
  );
  return { variables: { user_content } };
}
/* eslint-enable i18next/no-literal-string */

const norm = (s) => String(s || "").trim().toLowerCase();

/** Suggested locations → `{ name, kind, note }` (the review list's location row), dropping a name
 *  the book already has and any repeat within the reply. */
export function sanitizeLocationSuggestions(parsed, locations) {
  const taken = new Set((locations || []).map((l) => norm(l.name)).filter(Boolean));
  const out = [];
  for (const l of Array.isArray(parsed?.locations) ? parsed.locations : []) {
    const name = clamp(l?.name, 80);
    if (!name || taken.has(norm(name))) continue;
    taken.add(norm(name));
    out.push({ name, kind: clamp(l?.kind, 80), note: clamp(l?.note, 400) });
  }
  return out;
}

/** Locations the book doesn't have yet. @returns {Promise<Array<{name, kind, note}>>} */
export async function suggestLocations({ project, lookingFor = "", signal, budgetTokens } = {}) {
  const budget = await storyBudgetFor("brainstorm", "suggestLocations", budgetTokens);
  const { variables } = composeSuggestLocationsInput(project, { lookingFor, budgetTokens: budget });
  const meta = { kind: "suggest-locations" };
  const { parsed } = await runJsonAnalysis({
    action: "suggestLocations", feature: "brainstorm", variables, signal, meta,
    task: { label: t("locations.suggest.task"), meta },
  });
  return sanitizeLocationSuggestions(parsed, project.locations);
}

// ── A worldbuilding article's body ────────────────────────────────────────

/* eslint-disable i18next/no-literal-string -- text the AI model reads stays English (ruled 2026-10-13) */
/** The input for an article's body: the book, then the article's title, category, summary and
 *  what its body says now (a redraft builds on it). */
export function composeArticleInput(project, articleId, { budgetTokens = null } = {}) {
  const article = (project.worldbuilding || []).find((a) => a.id === articleId);
  if (!article) throw new Error(`No worldbuilding article with id ${articleId}.`);
  const category = (project.worldbuildingCategories || []).find((c) => c.id === article.category)?.label || "";
  const lines = [`Title: ${article.title || ""}`];
  if (category) lines.push(`Category: ${category}`);
  if (String(article.summary || "").trim()) lines.push(`Summary: ${article.summary.trim()}`);
  const now = htmlToText(article.body || "").trim();
  const user_content = join(
    bookBlock(project, budgetTokens),
    block("THE ARTICLE", lines.join("\n")),
    block("WHAT THE ARTICLE SAYS NOW", now),
  );
  return { variables: { user_content } };
}
/* eslint-enable i18next/no-literal-string */

/** An article's body, drafted — as editor HTML for the accept/reject diff.
 *  @returns {Promise<{ html: string, model: string }>} */
export async function draftArticle({ project, articleId, signal, budgetTokens } = {}) {
  const budget = await storyBudgetFor(STORY_WORLD_FEATURE, "worldbuildingDraft", budgetTokens);
  const { variables } = composeArticleInput(project, articleId, { budgetTokens: budget });
  const title = (project.worldbuilding || []).find((a) => a.id === articleId)?.title || "";
  const meta = { kind: "worldbuilding-draft", entityId: articleId };
  const result = await runAiFeature({
    action: "worldbuildingDraft", feature: STORY_WORLD_FEATURE, variables, signal, meta,
    task: { label: t("sheetDraft.task", { name: title }), meta },
  });
  return { html: textToHtml(String(result.content || "").trim()), model: result.model };
}
