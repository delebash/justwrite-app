// LLM entity extraction — scans chapter prose and proposes new
// characters, locations, and objects. Output is a review list, NOT a
// commit: callers display it for the user to tick-box and edit before
// anything lands in the project store.
//
// We dedupe against existing entity names so the LLM doesn't propose
// "Halvard" when there's already a Halvard in the cast.

import { runAiFeature } from "@delebash/llm-ui";
import { parseJsonLoose } from "../llmText.js";
import { htmlToText, normalizeName as norm } from "../text.js";
// norm(): "The Old Lighthouse" and "Old Lighthouse" still differ — we don't
// try to be clever; the writer can edit names in the review list before
// accepting. (The normalizer body converged into services/text.js, 2026-07-11.)

// The prompt lives server-side (features.py, action "entitySweep").

/**
 * Scan a chapter and return proposals.
 *
 * @param {object} opts
 * @param {string} opts.html         — chapter HTML
 * @param {string} opts.chapterTitle
 * @param {number} opts.chapterNum
 * @param {{name: string}[]} opts.existingCharacters
 * @param {{name: string}[]} opts.existingLocations
 * @param {{name: string}[]} opts.existingObjects
 * @returns {Promise<{characters: Proposal[], locations: Proposal[], objects: Proposal[]}>}
 */
/**
 * Compose one chapter's entitySweep input (the already-in-the-bible block +
 * the framed chapter prose). THE composer for both the real extraction below
 * and the Lab's chapter picker (QC-35: one source, no copies). Throws the
 * same no-prose error the extraction always raised.
 *
 * @returns {{ variables: {user_content} }}
 */
export function composeEntitySweepInput({
  html,
  chapterTitle = "",
  chapterNum = null,
  existingCharacters = [],
  existingLocations = [],
  existingObjects = [],
} = {}) {
  const text = htmlToText(html, { stripSceneMarks: false, trim: false }).trim();
  if (!text) throw new Error("This chapter has no prose to scan yet.");

  const existing = [
    "Already in the story bible — DO NOT re-propose:",
    `Characters: ${existingCharacters.length ? existingCharacters.map((c) => c.name).join(", ") : "(none)"}`,
    `Locations: ${existingLocations.length  ? existingLocations.map((l) => l.name).join(", ")  : "(none)"}`,
    `Objects: ${existingObjects.length    ? existingObjects.map((o) => o.name).join(", ")    : "(none)"}`,
  ].join("\n");

  const header = chapterTitle
    ? `Chapter ${chapterNum != null ? `${chapterNum} — ` : ""}${chapterTitle}\n\n`
    : "";

  return { variables: { user_content: `${existing}\n\n${header}--- BEGIN CHAPTER ---\n${text}\n--- END CHAPTER ---` } };
}

export async function extractEntities({
  html,
  chapterTitle = "",
  chapterNum = null,
  existingCharacters = [],
  existingLocations = [],
  existingObjects = [],
  meta = {},
  signal,
  provider,
  model,
  task,
} = {}) {
  const { variables } = composeEntitySweepInput({
    html, chapterTitle, chapterNum, existingCharacters, existingLocations, existingObjects,
  });

  const result = await runAiFeature({
    action: "entitySweep",
    feature: "entitySweep",
    variables,
    signal, provider, model, meta,
    task: task || { label: "Entity sweep", meta },
  });

  const parsed = parseJsonLoose(result.content) || {};
  const knownChar = new Set(existingCharacters.map((c) => norm(c.name)));
  const knownLoc  = new Set(existingLocations.map((l) => norm(l.name)));
  const knownObj  = new Set(existingObjects.map((o) => norm(o.name)));

  function clean(list, known) {
    if (!Array.isArray(list)) return [];
    const seen = new Set();
    const out = [];
    for (const item of list) {
      const name = String(item?.name || "").trim();
      if (!name) continue;
      const k = norm(name);
      if (!k || known.has(k) || seen.has(k)) continue;
      seen.add(k);
      out.push({
        name,
        role: typeof item?.role === "string" ? item.role.trim() : "",
        kind: typeof item?.kind === "string" ? item.kind.trim() : "",
        oneLiner: typeof item?.oneLiner === "string" ? item.oneLiner.trim() : "",
        note: typeof item?.note === "string" ? item.note.trim() : "",
        evidence: typeof item?.evidence === "string" ? item.evidence.trim() : "",
        // E3: other names the text uses for the same person (characters only;
        // the prompt/schema propose them). Validated to a clean string list,
        // never the entity's own name.
        aliases: Array.isArray(item?.aliases)
          ? item.aliases.map((a) => String(a).trim()).filter((a) => a && norm(a) !== k)
          : [],
      });
    }
    return out;
  }

  return {
    characters: clean(parsed.characters, knownChar),
    locations:  clean(parsed.locations,  knownLoc),
    objects:    clean(parsed.objects,    knownObj),
  };
}
