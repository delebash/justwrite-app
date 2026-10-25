// "Fill from book" — draft a character's profile fields from their scenes
// (E, 2026-07-18, user report off the real Broken Eye import: the sweep got
// every character but "just one-liners" — its contract is DISCOVERY by
// design; depth needs a per-character pass over the whole book).
//
// Input rides composeCharacterAuditInput — the SAME profile-block + scene-
// digest composer the character audit uses (QC-35: one source, no copies).
// Output: the character page's own fields — oneLiner, motivation
// {want,need,lie,truth}, arc {start,midpoint,end}, backstory — every one a
// PROPOSAL the writer reviews before anything is saved (the sweep's
// nothing-lands-without-confirm rule).

import { SHEET_SECTIONS } from "../characterSheet.js";
import { runJsonAnalysis } from "../runJson.js";
import { composeCharacterAuditInput } from "./characterAudit.js";
import { t } from "../../i18n/index.js";
import { cutToLength } from "@delebash/core/platform/text";

// The prompt lives server-side (seed_feature_prompts.py, action "characterProfile").

// v2 (2026-07-18): the draft now also covers the identity basics
// (gender/pronouns/age/role) + fear/contradiction/stakes + physical constants.
const MOTIVATION_KEYS = ["want", "need", "lie", "truth", "fear", "contradiction", "stakes"];
const ARC_KEYS = ["start", "midpoint", "end"];

/** Clamp a model field to a clean bounded string ("" when absent/garbage). */
function s(v, max) {
  return typeof v === "string" ? cutToLength(v.trim(), max) : "";
}

/** Age → an integer in [0, 500], or null. The model is told to return null
 *  when the prose doesn't establish an age; anything non-numeric collapses to
 *  null so the character page never gets a garbage age. */
function ageOrNull(v) {
  const n = typeof v === "number" ? v : typeof v === "string" ? parseInt(v, 10) : NaN;
  if (!Number.isFinite(n)) return null;
  const r = Math.round(n);
  return r >= 0 && r <= 500 ? r : null;
}

/** Normalize a parsed model reply to the exact field shape the character page
 *  edits. Exported for tests — the modal trusts this, never `parsed` raw.
 *  Only keys the page stores are emitted (no model-invented key ever lands). */
export function sanitizeProfile(parsed) {
  const out = {
    identity: {
      gender: s(parsed?.identity?.gender, 60),
      pronouns: s(parsed?.identity?.pronouns, 40),
      role: s(parsed?.identity?.role, 120),
      age: ageOrNull(parsed?.identity?.age),
    },
    oneLiner: s(parsed?.oneLiner, 400),
    motivation: {},
    arc: {},
    continuity: { physicalConstants: s(parsed?.continuity?.physicalConstants, 500) },
    backstory: s(parsed?.backstory, 2000),
  };
  for (const k of MOTIVATION_KEYS) out.motivation[k] = s(parsed?.motivation?.[k], 300);
  for (const k of ARC_KEYS) out.arc[k] = s(parsed?.arc?.[k], 400);
  return out;
}

// ── WS8 (2026-07-19): the voice pass — a SECOND lean call, not more keys on
// the profile contract (two small JSON schemas beat one bloated one on local
// models). Flat 11-key model reply, mapped here onto the exact extras shape
// the character page edits: voice.{register,rhythm,vocabulary,subtext,humor,
// languages,tic,sample,sampleAngry,sampleLying} + presence.stressTells.
// sampleCalm → voice.sample (the page's pre-v3 calm-sample key).

const VOICE_KEYS = ["register", "rhythm", "vocabulary", "subtext", "humor", "languages", "tic"];

/** A field that may come back as a list of phrases (gemma sent `vocabulary` as one, 2026-10-16)
 *  → one string, the phrases separated by semicolons — the shape the prompt asks for. */
function phrases(v, max) {
  if (!Array.isArray(v)) return s(v, max);
  return s(v.filter((x) => typeof x === "string").map((x) => x.trim()).filter(Boolean).join("; "), max);
}

/** Normalize a parsed characterVoice reply to the extras shape the page edits.
 *  Exported for tests — the modal trusts this, never `parsed` raw. */
export function sanitizeVoice(parsed) {
  const voice = {};
  for (const k of VOICE_KEYS) voice[k] = phrases(parsed?.[k], 200);
  voice.sample = s(parsed?.sampleCalm, 300);
  voice.sampleAngry = s(parsed?.sampleAngry, 300);
  voice.sampleLying = s(parsed?.sampleLying, 300);
  return { voice, presence: { stressTells: phrases(parsed?.stressTells, 300) } };
}

/**
 * Draft voice fields for one character from their actual dialogue in the
 * scenes that feature them. Same composer + null-when-no-scenes contract as
 * profileFromBook (QC-35: one input source for audit/profile/voice).
 */
export async function voiceFromBook({ project, characterId, signal, provider, model, task } = {}) {
  if (!project) throw new Error("voiceFromBook: project store is required.");
  const composed = composeCharacterAuditInput(project, characterId);
  if (!composed) return null;

  const meta = { characterId, kind: "character-voice" };
  const { result, parsed } = await runJsonAnalysis({
    action: "characterVoice",
    feature: "characterVoice",
    variables: composed.variables,
    signal, provider, model, meta,
    task: task || { label: t("characterProfile.taskVoice", { name: composed.character?.name || t("characterProfile.characterFallback") }), meta },
  });

  return {
    character: { id: composed.character.id, name: composed.character.name },
    sceneCount: composed.sceneCount,
    fields: sanitizeVoice(parsed),
    model: result.model,
    providerId: result.providerId,
  };
}

/**
 * Draft profile fields for one character from the scenes that feature them.
 * Returns null when no scenes are linked to the character (nothing to ground
 * a profile in) — the caller shows its "link scenes first" state.
 */
export async function profileFromBook({ project, characterId, signal, provider, model, task } = {}) {
  if (!project) throw new Error("profileFromBook: project store is required.");
  const composed = composeCharacterAuditInput(project, characterId);
  if (!composed) return null;

  const meta = { characterId, kind: "character-profile" };
  const { result, parsed } = await runJsonAnalysis({
    action: "characterProfile",
    feature: "characterProfile",
    variables: composed.variables,
    signal, provider, model, meta,
    task: task || { label: t("characterProfile.taskProfile", { name: composed.character?.name || t("characterProfile.characterFallback") }), meta },
  });

  return {
    character: { id: composed.character.id, name: composed.character.name },
    sceneCount: composed.sceneCount,
    fields: sanitizeProfile(parsed),
    model: result.model,
    providerId: result.providerId,
  };
}

// ── Shared field-defs + apply layer (WS-A, 2026-07-19) ──────────────────────
// The single Fill-from-book modal AND the batch modal build their review rows
// and write their drafts through THESE (QC-35: one source, no copies). Field
// defs take the raw character record + extras object (not Vue refs).

/** The profile pass's field map — labels match the character page exactly.
 *  Identity facts (role/gender/pronouns/age) live on the character record;
 *  everything else lives in extras. */
export function profileFieldDefs(character, extras) {
  const c = character || {};
  const x = extras || {};
  return [
    { key: "identity.role",       label: t("characters.detail.role"), current: c.role || "" },
    { key: "identity.gender",     label: t("characters.detail.gender"), current: c.gender || "" },
    { key: "identity.pronouns",   label: t("characters.detail.pronouns"), current: c.pronouns || "" },
    { key: "identity.age",        label: t("characters.detail.age"), current: c.age != null ? String(c.age) : "" },
    { key: "oneLiner",            label: t("common.description"), current: c.oneLiner || "" },
    { key: "motivation.want",     label: t("characters.fields.motivation.want.label"), current: x.motivation?.want || "" },
    { key: "motivation.need",     label: t("characters.fields.motivation.need.label"), current: x.motivation?.need || "" },
    { key: "motivation.lie",      label: t("characters.fields.motivation.lie.label"), current: x.motivation?.lie || "" },
    { key: "motivation.truth",    label: t("characters.fields.motivation.truth.label"), current: x.motivation?.truth || "" },
    { key: "motivation.fear",          label: t("characters.fields.motivation.fear.label"), current: x.motivation?.fear || "" },
    { key: "motivation.contradiction", label: t("characters.fields.motivation.contradiction.label"), current: x.motivation?.contradiction || "" },
    { key: "motivation.stakes",        label: t("characters.fields.motivation.stakes.label"), current: x.motivation?.stakes || "" },
    { key: "arc.start",           label: t("characterDraft.field.arcStart"), current: x.arc?.start || "" },
    { key: "arc.midpoint",        label: t("characterDraft.field.arcMidpoint"), current: x.arc?.midpoint || "" },
    { key: "arc.end",             label: t("characterDraft.field.arcEnd"), current: x.arc?.end || "" },
    { key: "continuity.physicalConstants", label: t("characters.fields.continuity.physicalConstants.label"), current: x.continuity?.physicalConstants || "" },
    { key: "backstory",           label: t("characters.detail.backstory"), current: x.backstory || "" },
  ];
}

/** The voice pass's field map — labels match the Voice & presence section. */
export function voiceFieldDefs(extras) {
  const x = extras || {};
  const v = x.voice || {};
  return [
    { key: "voice.register",       label: t("characters.fields.voice.register.label"), current: v.register || "" },
    { key: "voice.rhythm",         label: t("characters.fields.voice.rhythm.label"), current: v.rhythm || "" },
    { key: "voice.vocabulary",     label: t("characters.fields.voice.vocabulary.label"), current: v.vocabulary || "" },
    { key: "voice.subtext",        label: t("characters.fields.voice.subtext.label"), current: v.subtext || "" },
    { key: "voice.humor",          label: t("characters.fields.voice.humor.label"), current: v.humor || "" },
    { key: "voice.languages",      label: t("characters.fields.voice.languages.label"), current: v.languages || "" },
    { key: "voice.tic",            label: t("characters.fields.voice.tic.label"), current: v.tic || "" },
    { key: "voice.sample",         label: t("characters.fields.voice.sample.label"), current: v.sample || "" },
    { key: "voice.sampleAngry",    label: t("characters.fields.voice.sampleAngry.label"), current: v.sampleAngry || "" },
    { key: "voice.sampleLying",    label: t("characters.fields.voice.sampleLying.label"), current: v.sampleLying || "" },
    { key: "presence.stressTells", label: t("characters.fields.presence.stressTells.label"), current: x.presence?.stressTells || "" },
  ];
}

/** The proposed value for a field key out of a sanitized draft. Handles both
 *  1-level (oneLiner, backstory) and 2-level (motivation.fear) keys. Private. */
function proposedFor(fields, key) {
  const [a, b] = key.split(".");
  return b ? fields?.[a]?.[b] || "" : fields?.[a] || "";
}

/** Build reviewable rows from field defs + a sanitized draft: one row per field
 *  the model actually grounded, ticked by default ONLY when the current value
 *  is empty. Shared by the single + batch review UIs.
 *  @returns {Array<{ key, label, current, proposed, accept }>} */
export function draftRows(defs, fields) {
  const out = [];
  for (const d of defs) {
    const proposed = proposedFor(fields, d.key);
    if (!proposed) continue; // fields the model left "" have nothing to review
    out.push({ key: d.key, label: d.label, current: d.current, proposed, accept: !d.current });
  }
  return out;
}

/** Auto-apply selector (the batch toggle): a field is picked ONLY when the
 *  model grounded it AND the writer's current value is empty — so this can
 *  NEVER overwrite anything the writer wrote. @returns {Array<{key,label,proposed}>} */
export function emptyOnlyPicks(defs, fields) {
  const out = [];
  for (const d of defs) {
    const proposed = proposedFor(fields, d.key);
    if (proposed && !d.current) out.push({ key: d.key, label: d.label, proposed });
  }
  return out;
}

// Every extras group the sheet edits (services/characterSheet.js) — a drafted key in one of
// them lands; any other key is dropped (a model-invented group never reaches the record).
const EXTRAS_GROUPS = [...new Set(SHEET_SECTIONS.flatMap((s) => s.fields.map((f) => f.group)))].filter((g) => g !== "_top");

/** Route accepted drafts onto a character. `picks` = [{ key, proposed }].
 *  Identity facts + oneLiner patch the record; every other key (group.field) merges into its
 *  extras group without clobbering siblings; "backstory" is the top-level extras string. One
 *  store action, so one Apply is ONE undo step (2026-10-11).
 *  THE one apply path — Fill from book (single + batch) and every AI draft call this.
 *  @returns {number} fields written */
export function applyProfileDrafts(project, characterId, picks) {
  if (!project || !characterId || !picks?.length) return 0;
  const extras = project.characterExtras?.[characterId] || {};
  const charPatch = {};
  const groups = Object.fromEntries(EXTRAS_GROUPS.map((g) => [g, {}]));
  let backstory;
  for (const p of picks) {
    const v = String(p.proposed ?? "").trim();
    if (p.key === "oneLiner") charPatch.oneLiner = v;
    else if (p.key === "identity.role") charPatch.role = v;
    else if (p.key === "identity.gender") charPatch.gender = v;
    else if (p.key === "identity.pronouns") charPatch.pronouns = v;
    else if (p.key === "identity.age") { const n = parseInt(v, 10); charPatch.age = Number.isFinite(n) ? n : null; }
    else if (p.key === "backstory") backstory = v;
    else { const [g, k] = p.key.split("."); if (groups[g]) groups[g][k] = v; }
  }
  let extrasPatch = null;
  if (backstory !== undefined) extrasPatch = { backstory };
  for (const [g, patch] of Object.entries(groups)) {
    if (!Object.keys(patch).length) continue;
    extrasPatch = { ...(extrasPatch || {}), [g]: { ...(extras[g] || {}), ...patch } };
  }
  project.applyCharacterDraft(characterId, { patch: charPatch, extras: extrasPatch });
  let written = Object.keys(charPatch).length + (backstory !== undefined ? 1 : 0);
  for (const patch of Object.values(groups)) written += Object.keys(patch).length;
  return written;
}
