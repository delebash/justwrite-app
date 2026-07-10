// Relationship arc tracker.
//
// Given two characters and the scenes that feature both, ask the model
// to track how their relationship moves across the manuscript: warmth
// (cold ↔ warm), tension (calm ↔ taut), and power balance (who's in the
// dominant position in each chapter). Returns a chapter-by-chapter
// strip plus an overall trajectory summary.
//
// Per-chapter shape:
//   { chapterNum, warmth: 1-10, tension: 1-10, power: "A"|"B"|"eq",
//     moment: "one-line summary of where the relationship sits" }
//
// Overall shape:
//   { summary, trajectory: "warming"|"cooling"|"escalating"|"defusing"|
//                          "flipping"|"static", chapters: [...] }

import { runAiFeature } from "@delebash/llm-ui";
import { parseJsonLoose } from "../llmText.js";
import { htmlToText, tailWords } from "../text.js";

export const TRAJECTORY_LABELS = {
  warming:    "Warming",
  cooling:    "Cooling",
  escalating: "Escalating",
  defusing:   "Defusing",
  flipping:   "Flipping",
  static:     "Static",
};

// Canonical pair key — characters in sorted id order so (A,B) == (B,A).
export function pairKey(idA, idB) {
  if (!idA || !idB) return "";
  return idA < idB ? `${idA}::${idB}` : `${idB}::${idA}`;
}

function buildProfile(character, extras) {
  const parts = [];
  parts.push(character.name || "");
  if (character.role) parts.push(`Role: ${character.role}`);
  if (character.gender) parts.push(`Gender: ${character.gender}`);
  if (character.pronouns) parts.push(`Pronouns: ${character.pronouns}`);
  if (character.lifeStatus) parts.push(`Life status: ${character.lifeStatus}`);
  if ((character.aliases || []).length) parts.push(`Also known as: ${character.aliases.join(", ")}`);
  if (character.oneLiner) parts.push(`One-liner: ${character.oneLiner}`);
  if (extras?.motivation?.want) parts.push(`Wants: ${extras.motivation.want}`);
  if (extras?.motivation?.need) parts.push(`Needs: ${extras.motivation.need}`);
  if (extras?.arc?.start) parts.push(`Begins: ${extras.arc.start}`);
  if (extras?.arc?.end) parts.push(`Ends: ${extras.arc.end}`);
  return parts.join("\n");
}

function buildSharedSceneDigest(project, idA, idB) {
  const digest = [];
  for (const ch of project.allChapters) {
    const scenes = project.scenesFor(ch.id) || [];
    const sharedScenes = scenes.filter((s) => {
      const chars = Array.isArray(s.characters) ? s.characters : [];
      return chars.includes(idA) && chars.includes(idB);
    });
    if (!sharedScenes.length) continue;
    const text = sharedScenes.map((s) => htmlToText(s.body)).filter(Boolean).join("\n\n");
    if (!text) continue;
    digest.push({
      chapterNum: ch.num,
      chapterTitle: ch.title || "",
      scenes: sharedScenes.length,
      text: tailWords(text, 600),
    });
  }
  return digest;
}

// The prompt lives server-side (features.py, action "relationshipArc").

const VALID_TRAJECTORIES = new Set(["warming", "cooling", "escalating", "defusing", "flipping", "static"]);
const VALID_POWERS = new Set(["A", "B", "eq"]);

export async function analyseRelationship({
  project,
  characterAId,
  characterBId,
  signal,
  provider,
  model,
  task,
  meta,
} = {}) {
  if (!project) throw new Error("analyseRelationship: project store is required.");
  if (!characterAId || !characterBId || characterAId === characterBId) {
    throw new Error("Pick two different characters.");
  }

  const characters = project.characters || [];
  const chA = characters.find((c) => c.id === characterAId);
  const chB = characters.find((c) => c.id === characterBId);
  if (!chA || !chB) throw new Error("Character not found.");
  const exA = project.characterExtras?.[characterAId] || null;
  const exB = project.characterExtras?.[characterBId] || null;

  const digest = buildSharedSceneDigest(project, characterAId, characterBId);
  if (!digest.length) {
    const err = new Error(`${chA.name} and ${chB.name} don't share any scenes yet (according to the Links panel). Link both characters to at least one scene first.`);
    err.code = "no-shared-scenes";
    throw err;
  }

  const body = [];
  body.push(`PROFILE A — ${chA.name}`);
  body.push(buildProfile(chA, exA));
  body.push("");
  body.push(`PROFILE B — ${chB.name}`);
  body.push(buildProfile(chB, exB));
  body.push("");
  body.push(`SHARED CHAPTERS (${digest.length} total):`);
  body.push("");
  for (const d of digest) {
    body.push(`=== Ch. ${d.chapterNum}${d.chapterTitle ? ` — ${d.chapterTitle}` : ""} (${d.scenes} shared scene${d.scenes === 1 ? "" : "s"}) ===`);
    body.push(d.text);
    body.push("");
  }

  const arcMeta = { ...(meta || {}), characterAId, characterBId };
  const result = await runAiFeature({
    action: "relationshipArc",
    feature: "relationshipArc",
    variables: { user_content: body.join("\n") },
    signal,
    provider,
    model,
    meta: arcMeta,
    task: task || { label: "Relationship arc", meta: arcMeta },
  });

  const parsed = parseJsonLoose(result.content) || {};
  const summary = typeof parsed.summary === "string" ? parsed.summary.trim().slice(0, 600) : "";
  const trajectory = VALID_TRAJECTORIES.has(parsed.trajectory) ? parsed.trajectory : "static";

  const rawChapters = Array.isArray(parsed.chapters) ? parsed.chapters : [];
  const chapters = rawChapters
    .map((c) => {
      const chapterNum = Number.isFinite(c?.chapterNum) ? Math.round(c.chapterNum) : null;
      if (chapterNum == null) return null;
      const warmth = clamp1to10(c?.warmth);
      const tension = clamp1to10(c?.tension);
      const power = VALID_POWERS.has(c?.power) ? c.power : "eq";
      const moment = typeof c?.moment === "string" ? c.moment.trim().slice(0, 200) : "";
      return { chapterNum, warmth, tension, power, moment };
    })
    .filter(Boolean)
    .sort((a, b) => a.chapterNum - b.chapterNum);

  return {
    characterAId, characterAName: chA.name,
    characterBId, characterBName: chB.name,
    summary, trajectory,
    chapters,
    sharedScenes: digest.reduce((s, d) => s + d.scenes, 0),
    raw: result.content,
    model: result.model,
    providerId: result.providerId,
    generatedAt: Date.now(),
  };
}

function clamp1to10(v) {
  const n = typeof v === "number" ? v : parseInt(v, 10);
  if (!Number.isFinite(n)) return 5;
  return Math.max(1, Math.min(10, Math.round(n)));
}
