// Character-action consistency audit.
//
// Per character: hand the model the character profile + a digest of the
// scenes featuring them (chapter context + the prose tail of each scene
// that names them). Ask: "Are any of this character's actions in these
// scenes inconsistent with the established psychology?"
//
// Output: a list of structured concerns with severity, the action that
// looks inconsistent, the chapter/scene where it appears, a short
// evidence quote, and a one-line reasoning. The shape mirrors
// chapter.critique.notes so the existing UI patterns translate.

import { buildCharacterProfile } from "../rag/profile.js";
import { runJsonAnalysis } from "../runJson.js";
import { htmlToText, tailWords } from "../text.js";

// The prompt lives server-side (features.py, action "characterAudit").

const SEVERITY_LIST = ["flag", "suggest", "info"];

/**
 * Build the character profile block for the prompt.
 *
 * QC-35 (one source, no copies): this now reuses the canonical
 * buildCharacterProfile (rag/profile.js) instead of a local copy. The old copy
 * stringified the voice / arc / motivation OBJECTS — it emitted
 * "Voice: [object Object]" etc. and never saw the extras subfields at all, so
 * the audit + Fill-from-book have been fed a broken profile. Reusing the
 * canonical builder fixes that AND brings every v3 sheet field into both. We
 * prepend the name because buildCharacterProfile omits it (chat sets the
 * persona name separately); the third-person voice reads as reference prose.
 */
function buildProfileText(character, extras) {
  return `Name: ${character.name || ""}${buildCharacterProfile(character, extras, { voice: "third" })}`;
}

/**
 * Collect a digest of the scenes that feature this character.
 * For each scene, includes the chapter context + a tail of the scene
 * prose (because the character's actions usually live in the latter
 * part of a scene, and we have to stay under context limits).
 */
function buildSceneDigest(project, characterId) {
  const digest = [];
  for (const ch of project.allChapters) {
    const scenes = project.scenesFor(ch.id) || [];
    for (let si = 0; si < scenes.length; si++) {
      const scn = scenes[si];
      const characters = Array.isArray(scn.characters) ? scn.characters : [];
      if (!characters.includes(characterId)) continue;
      const text = htmlToText(scn.body);
      if (!text) continue;
      digest.push({
        chapterNum: ch.num,
        chapterTitle: ch.title || "",
        sceneIdx: si,
        sceneTitle: scn.title || "",
        sceneText: tailWords(text, 700, { ellipsis: true }),
      });
    }
  }
  return digest;
}

/**
 * Audit a single character.
 *
 * @param {object} opts
 * @param {object} opts.project         project store
 * @param {string} opts.characterId
 * @param {AbortSignal} [opts.signal]
 * @param {object} [opts.provider]
 * @param {string} [opts.model]
 * @param {object} [opts.meta]
 */
/**
 * Compose one character's audit input (the profile block + the digest of the
 * scenes that feature them). THE composer for both the real audit below and
 * the Lab's character picker (QC-35: one source, no copies). Returns null
 * when the character has no linked scenes (the audit's no-scenes case).
 *
 * @returns {{ variables: {user_content}, sceneCount: number, character: object } | null}
 */
export function composeCharacterAuditInput(project, characterId) {
  if (!project) throw new Error("composeCharacterAuditInput: project store is required.");
  const character = (project.characters || []).find((c) => c.id === characterId);
  if (!character) throw new Error("Character not found.");
  const extras = project.characterExtras?.[characterId] || null;

  const scenes = buildSceneDigest(project, characterId);
  if (!scenes.length) return null;

  const profile = buildProfileText(character, extras);
  const sceneBlocks = scenes.map((s) => {
    const header = `--- Chapter ${s.chapterNum}${s.chapterTitle ? ` — ${s.chapterTitle}` : ""} · Scene ${s.sceneIdx + 1}${s.sceneTitle ? ` — ${s.sceneTitle}` : ""} ---`;
    return `${header}\n${s.sceneText}`;
  });

  const userBody =
    `CHARACTER PROFILE\n${profile}\n\n` +
    `SCENES FEATURING THIS CHARACTER (${scenes.length} total)\n\n` +
    sceneBlocks.join("\n\n");

  return { variables: { user_content: userBody }, sceneCount: scenes.length, character };
}

export async function auditCharacter({
  project,
  characterId,
  signal,
  provider,
  model,
  meta = {},
  task,
} = {}) {
  if (!project) throw new Error("auditCharacter: project store is required.");
  const composed = composeCharacterAuditInput(project, characterId);
  if (!composed) {
    const character = (project.characters || []).find((c) => c.id === characterId);
    return {
      character: { id: character.id, name: character.name, main: !!character.main },
      concerns: [],
      verdict: "no-scenes",
      noteCount: 0,
      generatedAt: Date.now(),
      model: null,
      providerId: null,
    };
  }
  const { variables, sceneCount, character } = composed;

  const auditMeta = { ...meta, characterId };
  const { result, parsed } = await runJsonAnalysis({
    action: "characterAudit",
    feature: "characterAudit",
    variables,
    signal,
    provider,
    model,
    meta: auditMeta,
    task: task || { label: "Character audit", meta: auditMeta },
  });

  const rawConcerns = Array.isArray(parsed.concerns) ? parsed.concerns : [];

  const concerns = rawConcerns
    .map((c, i) => ({
      id: `cn_${characterId}_${i}`,
      severity: SEVERITY_LIST.includes(c?.severity) ? c.severity : "info",
      chapterNum: Number.isFinite(c?.chapterNum) ? Math.round(c.chapterNum) : null,
      sceneSummary: String(c?.sceneSummary || "").trim().slice(0, 160),
      issue: String(c?.issue || "").trim(),
      quote: String(c?.quote || "").trim().slice(0, 200),
      reason: String(c?.reason || "").trim().slice(0, 400),
      fix: String(c?.fix || "").trim().slice(0, 400),
    }))
    .filter((c) => c.issue || c.quote);

  const verdict = ["consistent", "minor-drift", "significant-drift"].includes(parsed.verdict)
    ? parsed.verdict
    : (concerns.some((c) => c.severity === "flag") ? "significant-drift"
       : concerns.length ? "minor-drift"
       : "consistent");

  return {
    character: { id: character.id, name: character.name, main: !!character.main },
    concerns,
    verdict,
    noteCount: concerns.length,
    sceneCount,
    raw: result.content,
    generatedAt: Date.now(),
    model: result.model,
    providerId: result.providerId,
  };
}

/**
 * Bulk audit of every main character (or every character if includeSupporting).
 * Sequential so the local-model case stays gentle on the box.
 */
export async function auditAllCharacters({
  project,
  includeSupporting = false,
  signal,
  onProgress,
  provider,
  model,
} = {}) {
  if (!project) throw new Error("auditAllCharacters: project store is required.");

  const targets = (project.characters || [])
    .filter((c) => includeSupporting || c.main);
  const results = [];
  let completed = 0;

  for (const ch of targets) {
    if (signal?.aborted) break;
    onProgress?.({
      phase: "start",
      character: { id: ch.id, name: ch.name },
      completed, total: targets.length,
    });
    try {
      const r = await auditCharacter({
        project,
        characterId: ch.id,
        signal, provider, model,
        meta: { kind: "character-audit-sweep" },
      });
      results.push(r);
      completed += 1;
      onProgress?.({
        phase: "done",
        character: { id: ch.id, name: ch.name },
        completed, total: targets.length, result: r,
      });
    } catch (err) {
      const msg = String(err?.message || err || "");
      if (signal?.aborted || /abort/i.test(msg)) break;
      completed += 1;
      onProgress?.({
        phase: "error",
        character: { id: ch.id, name: ch.name },
        completed, total: targets.length, reason: msg.slice(0, 200),
      });
    }
  }

  return { results, totalTargets: targets.length };
}
