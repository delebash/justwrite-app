// AI drafting of a character (2026-10-11, the AI drafting plan Task 7) — from the writer's
// description, a sheet section at a time, and new characters suggested from the book. The
// counterpart of Fill from book (characterProfile.js), which drafts from the scenes: the same
// sanitizers, review rows and apply path, so nothing lands without the writer's review.
//
// The input is composed here (the Lab sends this same layout — seed_presets.js "Character
// from a description" / "Character sheet section" / "Suggest characters"):
//   BOOK CONTEXT (services/storyContext.js — premise, genre, world rules, Setting, main cast)
//   CHARACTER PROFILE (the audit's profile text — one source)
//   THE WRITER'S DESCRIPTION
//   FIELDS TO DRAFT (a section draft)  ·  ALREADY IN THE CAST / WHAT THE WRITER IS LOOKING FOR (suggestions)
// The prompts live server-side (seed_feature_prompts.js: characterProfileDraft,
// characterVoiceDraft, characterSection, suggestCharacters). Name ideas (Task 10) runs Brainstorm's
// own `brainstorm` action: the book, the profile and the cast, then Brainstorm's round
// (services/brainstorm.js).

import { fieldKey, fieldLabelKeys, SHEET_SECTIONS } from "../characterSheet.js";
import { brainstormAction, brainstormPrompt } from "../brainstorm.js";
import { runJsonAnalysis } from "../runJson.js";
import { composeBookContext, storyBudgetFor } from "../storyContext.js";
import { buildProfileText } from "./characterAudit.js";
import { sanitizeProfile, sanitizeVoice } from "./characterProfile.js";
import { t } from "../../i18n/index.js";

const block = (heading, body) => (String(body || "").trim() ? `${heading}\n${String(body).trim()}` : "");
const join = (...blocks) => blocks.filter(Boolean).join("\n\n");

/* eslint-disable i18next/no-literal-string -- text the AI model reads stays English (ruled 2026-10-13) */
function bookBlock(project, budgetTokens) {
  return block("BOOK CONTEXT", composeBookContext(project, { budgetTokens }).text);
}
/* eslint-enable i18next/no-literal-string */

/* eslint-disable i18next/no-literal-string -- text the AI model reads stays English (ruled 2026-10-13) */
function profileBlock(project, characterId) {
  const character = (project.characters || []).find((c) => c.id === characterId);
  if (!character) throw new Error("Character not found.");
  return block("CHARACTER PROFILE", buildProfileText(character, project.characterExtras?.[characterId] || null));
}
/* eslint-enable i18next/no-literal-string */

/** The input for a draft from a description (profile and voice share it). */
export function composeDescriptionInput(project, characterId, description, { budgetTokens = null } = {}) {
  const user_content = join(
    bookBlock(project, budgetTokens),
    profileBlock(project, characterId),
    block("THE WRITER'S DESCRIPTION", description),
  );
  return { variables: { user_content } };
}

/** The input for a section draft: the description input plus the section's fields, each with
 *  its label and what it asks for (`t` translates the catalog keys). */
export function composeSectionInput(project, characterId, sectionKey, { description = "", t, budgetTokens = null } = {}) {
  const section = SHEET_SECTIONS.find((s) => s.key === sectionKey);
  if (!section) throw new Error(`Unknown sheet section: ${sectionKey}`);
  const lines = section.fields.map((f) => {
    const k = fieldLabelKeys(f);
    return `- ${fieldKey(f)} — ${t(k.label)}: ${t(k.hint)}`;
  });
  const user_content = join(
    bookBlock(project, budgetTokens),
    profileBlock(project, characterId),
    block("THE WRITER'S DESCRIPTION", description),
    block("FIELDS TO DRAFT", lines.join("\n")),
  );
  return { variables: { user_content }, keys: section.fields.map(fieldKey) };
}

/* eslint-disable i18next/no-literal-string -- text the AI model reads stays English (ruled 2026-10-13) */
function castBlock(project) {
  const names = (project.characters || []).map((c) => c.name).filter(Boolean);
  return block("ALREADY IN THE CAST", names.map((n) => `- ${n}`).join("\n"));
}
/* eslint-enable i18next/no-literal-string */

/** The input for suggestions: the book, the names already taken, what the writer wants. */
export function composeSuggestInput(project, { lookingFor = "", budgetTokens = null } = {}) {
  const user_content = join(
    bookBlock(project, budgetTokens),
    castBlock(project),
    block("WHAT THE WRITER IS LOOKING FOR", lookingFor),
  );
  return { variables: { user_content } };
}

/** Name ideas' round: the book, the character's profile and the cast, then Brainstorm's own
 *  request (category Character names), its seed pointing at the blocks above it. `liked` / `seen`
 *  as on the Brainstorm page. */
/* eslint-disable i18next/no-literal-string -- text the AI model reads stays English (ruled 2026-10-13) */
export function composeNameIdeasInput(project, characterId, { liked = [], seen = [], budgetTokens = null } = {}) {
  const { action, variables } = brainstormAction("character_name");
  const book = bookBlock(project, budgetTokens);
  const seed = book
    ? "names for the character in CHARACTER PROFILE, fitting the book in BOOK CONTEXT"
    : "names for the character in CHARACTER PROFILE";
  const user_content = join(
    book,
    profileBlock(project, characterId),
    castBlock(project),
    brainstormPrompt({ category: "character_name", seed, liked, seen }),
  );
  return { action, variables: { ...variables, user_content } };
}
/* eslint-enable i18next/no-literal-string */

// ── sanitizers ────────────────────────────────────────────────────────────

const clamp = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
// A sheet field's cap: the backstory is a paragraph (Fill from book's 2000), the rest are a
// sentence or two.
const fieldMax = (key) => (key === "backstory" ? 2000 : 600);

/** A section draft's reply → exactly the section's keys, as clamped strings ("" when absent). */
export function sanitizeSection(parsed, keys) {
  const out = {};
  for (const k of keys) out[k] = clamp(parsed?.[k], fieldMax(k));
  return out;
}

/** Flat draft keys ("group.k", "backstory") → the nested shape the review rows read. */
export function nestFields(flat) {
  const out = {};
  for (const [key, value] of Object.entries(flat || {})) {
    const [g, k] = key.split(".");
    if (k) out[g] = { ...(out[g] || {}), [k]: value };
    else out[g] = value;
  }
  return out;
}

const norm = (s) => String(s || "").trim().toLowerCase();

/** Every name the cast already uses — names and aliases. */
export function castNames(cast) {
  return (cast || []).flatMap((c) => [c.name, ...(c.aliases || [])]).filter(Boolean);
}

/** Suggested characters → `{ name, role, oneLiner }`, dropping a name the cast already uses (a
 *  name or an alias) and any repeat within the reply. */
export function sanitizeSuggestions(parsed, cast) {
  const taken = new Set(castNames(cast).map(norm));
  const out = [];
  for (const c of Array.isArray(parsed?.characters) ? parsed.characters : []) {
    const name = clamp(c?.name, 80);
    if (!name || taken.has(norm(name))) continue;
    taken.add(norm(name));
    out.push({ name, role: clamp(c?.role, 120), oneLiner: clamp(c?.oneLiner, 400) });
  }
  return out;
}

// ── the draft calls ───────────────────────────────────────────────────────

/** Profile fields from the writer's description — Fill from book's field shape. */
export async function profileFromDescription({ project, characterId, description, signal, budgetTokens } = {}) {
  const budget = await storyBudgetFor("characterProfile", "characterProfileDraft", budgetTokens);
  const { variables } = composeDescriptionInput(project, characterId, description, { budgetTokens: budget });
  const meta = { characterId, kind: "character-profile-draft" };
  const { result, parsed } = await runJsonAnalysis({
    action: "characterProfileDraft", feature: "characterProfile", variables, signal, meta,
    task: { label: t("characterDraft.taskProfile"), meta },
  });
  return { fields: sanitizeProfile(parsed), model: result.model };
}

/** Voice fields from the writer's description — Fill from book's field shape (the sample lines
 *  are composed, which the prompt tells the model and the review tells the writer). */
export async function voiceFromDescription({ project, characterId, description, signal, budgetTokens } = {}) {
  const budget = await storyBudgetFor("characterVoice", "characterVoiceDraft", budgetTokens);
  const { variables } = composeDescriptionInput(project, characterId, description, { budgetTokens: budget });
  const meta = { characterId, kind: "character-voice-draft" };
  const { result, parsed } = await runJsonAnalysis({
    action: "characterVoiceDraft", feature: "characterVoice", variables, signal, meta,
    task: { label: t("characterDraft.taskVoice"), meta },
  });
  return { fields: sanitizeVoice(parsed), model: result.model };
}

/** One sheet section, every field it shows. @returns {{ fields: object, model: string }} —
 *  `fields` nested for the review rows. */
export async function draftSection({ project, characterId, sectionKey, description = "", t, signal, budgetTokens } = {}) {
  const budget = await storyBudgetFor("characterProfile", "characterSection", budgetTokens);
  const { variables, keys } = composeSectionInput(project, characterId, sectionKey, { description, t, budgetTokens: budget });
  const meta = { characterId, sectionKey, kind: "character-section" };
  const { result, parsed } = await runJsonAnalysis({
    action: "characterSection", feature: "characterProfile", variables, signal, meta,
    task: { label: t("characterDraft.taskSection"), meta },
  });
  return { fields: nestFields(sanitizeSection(parsed, keys)), model: result.model };
}

/** Characters the book doesn't have yet. @returns {Promise<Array<{name, role, oneLiner}>>} */
export async function suggestCharacters({ project, lookingFor = "", signal, budgetTokens } = {}) {
  const budget = await storyBudgetFor("brainstorm", "suggestCharacters", budgetTokens);
  const { variables } = composeSuggestInput(project, { lookingFor, budgetTokens: budget });
  const meta = { kind: "suggest-characters" };
  const { parsed } = await runJsonAnalysis({
    action: "suggestCharacters", feature: "brainstorm", variables, signal, meta,
    task: { label: t("characterDraft.taskSuggest"), meta },
  });
  return sanitizeSuggestions(parsed, project.characters);
}

/** Name ideas' request for useBrainstorm: the composed round, with the cast's names (and aliases)
 *  never shown as ideas. */
export async function nameIdeasRequest({ project, characterId, liked = [], seen = [], budgetTokens } = {}) {
  const budget = await storyBudgetFor("brainstorm", "brainstorm", budgetTokens);
  const request = composeNameIdeasInput(project, characterId, { liked, seen, budgetTokens: budget });
  return { ...request, exclude: castNames(project.characters) };
}
