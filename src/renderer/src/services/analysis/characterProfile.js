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

import { runJsonAnalysis } from "../runJson.js";
import { composeCharacterAuditInput } from "./characterAudit.js";

// The prompt lives server-side (seed_feature_prompts.py, action "characterProfile").

// v2 (2026-07-18): the draft now also covers the identity basics
// (gender/pronouns/age/role) + fear/contradiction/stakes + physical constants.
const MOTIVATION_KEYS = ["want", "need", "lie", "truth", "fear", "contradiction", "stakes"];
const ARC_KEYS = ["start", "midpoint", "end"];

/** Clamp a model field to a clean bounded string ("" when absent/garbage). */
function s(v, max) {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
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
    task: task || { label: `Profile: ${composed.character?.name || "character"}`, meta },
  });

  return {
    character: { id: composed.character.id, name: composed.character.name },
    sceneCount: composed.sceneCount,
    fields: sanitizeProfile(parsed),
    model: result.model,
    providerId: result.providerId,
  };
}
