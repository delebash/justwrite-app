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

import { runAiStream } from "../aiStream.js";

function htmlToText(html) {
  if (!html) return "";
  const div = document.createElement("div");
  div.innerHTML = html;
  div.querySelectorAll(".ai-del").forEach((el) => el.remove());
  div.querySelectorAll(".ai-ins").forEach((el) => el.replaceWith(...el.childNodes));
  div.querySelectorAll(".scene-mark").forEach((el) => el.remove());
  return (div.textContent || "").trim();
}
function tailWords(text, max) {
  if (!text) return "";
  const parts = text.split(/\s+/);
  if (parts.length <= max) return text;
  return parts.slice(-max).join(" ");
}

function parseJsonLoose(text) {
  if (!text) return null;
  let s = text.replace(/```(?:json)?/gi, "").replace(/<think>[\s\S]*?<\/think>/gi, "");
  const objIdx = s.indexOf("{");
  const arrIdx = s.indexOf("[");
  const objectFirst = objIdx !== -1 && (arrIdx === -1 || objIdx < arrIdx);
  const order = objectFirst ? [["{", "}"], ["[", "]"]] : [["[", "]"], ["{", "}"]];
  for (const [open, close] of order) {
    const slice = extractBalanced(s, open, close);
    if (slice) { try { return JSON.parse(slice); } catch {} }
  }
  return null;
}
function extractBalanced(s, open, close) {
  for (let start = s.indexOf(open); start !== -1; start = s.indexOf(open, start + 1)) {
    let depth = 0, inStr = false, esc = false;
    for (let i = start; i < s.length; i++) {
      const c = s[i];
      if (inStr) {
        if (esc) esc = false;
        else if (c === "\\") esc = true;
        else if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') { inStr = true; continue; }
      if (c === open) depth++;
      else if (c === close) {
        depth--;
        if (depth === 0) return s.slice(start, i + 1);
      }
    }
  }
  return null;
}

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

const SYSTEM = `You track a relationship between two characters across a novel — chapter by chapter.

You will be given:
  - Profile A
  - Profile B
  - The chapters where both characters appear together, with prose excerpts from the scenes they share

For EACH chapter where they share at least one scene, report:
  - warmth (1-10): how warm or cold the relationship feels in THIS chapter (1 = open hostility / icy; 5 = neutral / civil; 10 = deep intimacy / trust)
  - tension (1-10): how taut or calm THIS chapter is between them (1 = entirely calm; 10 = breaking point)
  - power: who holds the upper hand in THIS chapter — "A" (A dominates), "B" (B dominates), or "eq" (roughly equal / balanced)
  - moment: one short sentence (8-20 words) naming what specifically shifts or holds between them this chapter

Return ONLY a JSON object:

{
  "summary":    "2-3 sentences naming the overall shape of this relationship across the book",
  "trajectory": "warming" | "cooling" | "escalating" | "defusing" | "flipping" | "static",
  "chapters":   [ { "chapterNum": number, "warmth": int 1-10, "tension": int 1-10, "power": "A"|"B"|"eq", "moment": string } ]
}

Trajectory definitions:
  - warming   — warmth rises across the book; coldness gives way to closeness
  - cooling   — warmth falls across the book; closeness gives way to distance
  - escalating — tension rises across the book; conflict intensifies
  - defusing  — tension falls across the book; conflict resolves
  - flipping  — power dynamic inverts somewhere in the book (A-dominant → B-dominant, or vice versa)
  - static    — neither warmth, tension, nor power shifts meaningfully

Rules:
  - The "power" call should reflect agency in THIS chapter — who's setting the terms of the interaction, not who'd win a fight.
  - The "moment" must be specific to what actually happens in the chapter's shared scenes. No generic "they argue" — say what they argue about and what it costs.
  - Use only the chapter numbers you were given excerpts for. Don't invent chapters.

Return ONLY the JSON object. No preface, no markdown fences.`;

const VALID_TRAJECTORIES = new Set(["warming", "cooling", "escalating", "defusing", "flipping", "static"]);
const VALID_POWERS = new Set(["A", "B", "eq"]);

export async function analyseRelationship({
  project,
  characterAId,
  characterBId,
  signal,
  onDelta,
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

  const messages = [
    { role: "system", content: SYSTEM },
    { role: "user", content: body.join("\n") },
  ];

  const arcMeta = { ...(meta || {}), characterAId, characterBId };
  const result = await runAiStream({
    feature: "relationshipArc",
    messages,
    temperature: 0.3,
    extra: { think: false },
    signal,
    onDelta,
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
