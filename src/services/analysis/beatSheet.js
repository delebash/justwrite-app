// Beat-sheet overlay — map the user's chapters to a named narrative
// framework (Save the Cat, Hero's Journey, 7-Point Story Structure)
// and flag which beats are missing.
//
// Three templates ship with the feature. The user picks one; the model
// receives the same chapter digest the reverse-outline service uses,
// PLUS the beat definitions, and returns a mapping:
//
//   {
//     templateKey, generatedAt, model,
//     mapping: [
//       { beatKey, chapterNum: number | null, justification: string }
//     ],
//     missingCount: number,
//     summary: "1-2 sentences on coverage and gaps"
//   }

import { runJsonAnalysis } from "../runJson.js";
import { htmlToText } from "../text.js";
import { t, tEnglish } from "../../i18n/index.js";
import { cutToLength } from "@delebash/core/platform/text";

// ─── Templates ───────────────────────────────────────────────────────

export const BEAT_TEMPLATES = {
  "save-the-cat": {
    nameKey: "beatSheet.framework.saveTheCat.name",
    blurbKey: "beatSheet.framework.saveTheCat.blurb",
    beats: [
      { key: "opening-image", nameKey: "beatSheet.framework.saveTheCat.beat.openingImage.name", descKey: "beatSheet.framework.saveTheCat.beat.openingImage.desc" },
      { key: "theme-stated", nameKey: "beatSheet.framework.saveTheCat.beat.themeStated.name", descKey: "beatSheet.framework.saveTheCat.beat.themeStated.desc" },
      { key: "setup", nameKey: "beatSheet.framework.saveTheCat.beat.setup.name", descKey: "beatSheet.framework.saveTheCat.beat.setup.desc" },
      { key: "catalyst", nameKey: "beatSheet.framework.saveTheCat.beat.catalyst.name", descKey: "beatSheet.framework.saveTheCat.beat.catalyst.desc" },
      { key: "debate", nameKey: "beatSheet.framework.saveTheCat.beat.debate.name", descKey: "beatSheet.framework.saveTheCat.beat.debate.desc" },
      { key: "break-into-two", nameKey: "beatSheet.framework.saveTheCat.beat.breakIntoTwo.name", descKey: "beatSheet.framework.saveTheCat.beat.breakIntoTwo.desc" },
      { key: "b-story", nameKey: "beatSheet.framework.saveTheCat.beat.bStory.name", descKey: "beatSheet.framework.saveTheCat.beat.bStory.desc" },
      { key: "fun-and-games", nameKey: "beatSheet.framework.saveTheCat.beat.funAndGames.name", descKey: "beatSheet.framework.saveTheCat.beat.funAndGames.desc" },
      { key: "midpoint", nameKey: "beatSheet.framework.saveTheCat.beat.midpoint.name", descKey: "beatSheet.framework.saveTheCat.beat.midpoint.desc" },
      { key: "bad-guys-close-in", nameKey: "beatSheet.framework.saveTheCat.beat.badGuysCloseIn.name", descKey: "beatSheet.framework.saveTheCat.beat.badGuysCloseIn.desc" },
      { key: "all-is-lost", nameKey: "beatSheet.framework.saveTheCat.beat.allIsLost.name", descKey: "beatSheet.framework.saveTheCat.beat.allIsLost.desc" },
      { key: "dark-night-of-soul", nameKey: "beatSheet.framework.saveTheCat.beat.darkNightOfSoul.name", descKey: "beatSheet.framework.saveTheCat.beat.darkNightOfSoul.desc" },
      { key: "break-into-three", nameKey: "beatSheet.framework.saveTheCat.beat.breakIntoThree.name", descKey: "beatSheet.framework.saveTheCat.beat.breakIntoThree.desc" },
      { key: "finale", nameKey: "beatSheet.framework.saveTheCat.beat.finale.name", descKey: "beatSheet.framework.saveTheCat.beat.finale.desc" },
      { key: "final-image", nameKey: "beatSheet.framework.saveTheCat.beat.finalImage.name", descKey: "beatSheet.framework.saveTheCat.beat.finalImage.desc" },
    ],
  },
  "heros-journey": {
    nameKey: "beatSheet.framework.herosJourney.name",
    blurbKey: "beatSheet.framework.herosJourney.blurb",
    beats: [
      { key: "ordinary-world", nameKey: "beatSheet.framework.herosJourney.beat.ordinaryWorld.name", descKey: "beatSheet.framework.herosJourney.beat.ordinaryWorld.desc" },
      { key: "call-to-adventure", nameKey: "beatSheet.framework.herosJourney.beat.callToAdventure.name", descKey: "beatSheet.framework.herosJourney.beat.callToAdventure.desc" },
      { key: "refusal-of-call", nameKey: "beatSheet.framework.herosJourney.beat.refusalOfCall.name", descKey: "beatSheet.framework.herosJourney.beat.refusalOfCall.desc" },
      { key: "meeting-mentor", nameKey: "beatSheet.framework.herosJourney.beat.meetingMentor.name", descKey: "beatSheet.framework.herosJourney.beat.meetingMentor.desc" },
      { key: "crossing-threshold", nameKey: "beatSheet.framework.herosJourney.beat.crossingThreshold.name", descKey: "beatSheet.framework.herosJourney.beat.crossingThreshold.desc" },
      { key: "tests-allies-enemies", nameKey: "beatSheet.framework.herosJourney.beat.testsAlliesEnemies.name", descKey: "beatSheet.framework.herosJourney.beat.testsAlliesEnemies.desc" },
      { key: "approach-inmost-cave", nameKey: "beatSheet.framework.herosJourney.beat.approachInmostCave.name", descKey: "beatSheet.framework.herosJourney.beat.approachInmostCave.desc" },
      { key: "ordeal", nameKey: "beatSheet.framework.herosJourney.beat.ordeal.name", descKey: "beatSheet.framework.herosJourney.beat.ordeal.desc" },
      { key: "reward", nameKey: "beatSheet.framework.herosJourney.beat.reward.name", descKey: "beatSheet.framework.herosJourney.beat.reward.desc" },
      { key: "road-back", nameKey: "beatSheet.framework.herosJourney.beat.roadBack.name", descKey: "beatSheet.framework.herosJourney.beat.roadBack.desc" },
      { key: "resurrection", nameKey: "beatSheet.framework.herosJourney.beat.resurrection.name", descKey: "beatSheet.framework.herosJourney.beat.resurrection.desc" },
      { key: "return-with-elixir", nameKey: "beatSheet.framework.herosJourney.beat.returnWithElixir.name", descKey: "beatSheet.framework.herosJourney.beat.returnWithElixir.desc" },
    ],
  },
  "seven-point": {
    nameKey: "beatSheet.framework.sevenPoint.name",
    blurbKey: "beatSheet.framework.sevenPoint.blurb",
    beats: [
      { key: "hook", nameKey: "beatSheet.framework.sevenPoint.beat.hook.name", descKey: "beatSheet.framework.sevenPoint.beat.hook.desc" },
      { key: "plot-turn-1", nameKey: "beatSheet.framework.sevenPoint.beat.plotTurn1.name", descKey: "beatSheet.framework.sevenPoint.beat.plotTurn1.desc" },
      { key: "pinch-1", nameKey: "beatSheet.framework.sevenPoint.beat.pinch1.name", descKey: "beatSheet.framework.sevenPoint.beat.pinch1.desc" },
      { key: "midpoint", nameKey: "beatSheet.framework.sevenPoint.beat.midpoint.name", descKey: "beatSheet.framework.sevenPoint.beat.midpoint.desc" },
      { key: "pinch-2", nameKey: "beatSheet.framework.sevenPoint.beat.pinch2.name", descKey: "beatSheet.framework.sevenPoint.beat.pinch2.desc" },
      { key: "plot-turn-2", nameKey: "beatSheet.framework.sevenPoint.beat.plotTurn2.name", descKey: "beatSheet.framework.sevenPoint.beat.plotTurn2.desc" },
      { key: "resolution", nameKey: "beatSheet.framework.sevenPoint.beat.resolution.name", descKey: "beatSheet.framework.sevenPoint.beat.resolution.desc" },
    ],
  },
};

// The picker's options name their keys; BeatSheetModal translates them (a list built here would
// keep the language it was built in).
export const TEMPLATE_OPTIONS = Object.entries(BEAT_TEMPLATES).map(([key, tpl]) => ({
  value: key,
  labelKey: tpl.nameKey,
  blurbKey: tpl.blurbKey,
}));

// ─── helpers ─────────────────────────────────────────────────────────

function firstParagraph(text, maxWords = 60) {
  if (!text) return "";
  const first = text.split(/\n\s*\n/)[0] || text;
  const words = first.split(/\s+/);
  if (words.length <= maxWords) return first;
  return `${words.slice(0, maxWords).join(" ")}…`;
}

function buildChapterDigest(project) {
  return project.allChapters.map((c) => {
    const struct = c.critique?.structure;
    let summary = "";
    if (struct?.summary) summary = struct.summary;
    else {
      const html = project.chapterBody[c.id] || "";
      summary = firstParagraph(htmlToText(html));
    }
    return {
      num: c.num,
      title: c.title || "",
      words: c.words || 0,
      summary: cutToLength(summary, 500),
    };
  });
}

// ─── the LLM call ────────────────────────────────────────────────────

// The prompt lives server-side (features.py, action "beatSheet").

/**
 * Compose the beatSheet input (framework beats + chapter digest) from the
 * live project. THE composer for both the real mapping below and the Lab's
 * "From this book" fill — the Lab passes the modal's default framework
 * (TEMPLATE_OPTIONS[0], the same expression BeatSheetModal seeds its picker
 * with; the user's decided default for the compose button).
 *
 * @returns {{ variables: {user_content}, totalChapters: number, template: object }}
 */
/* eslint-disable i18next/no-literal-string -- text the AI model reads stays English (ruled 2026-10-13) */
export function composeBeatSheetInput(project, templateKey = TEMPLATE_OPTIONS[0].value) {
  if (!project) throw new Error("composeBeatSheetInput: project store is required.");
  const template = BEAT_TEMPLATES[templateKey];
  if (!template) throw new Error(`Unknown beat template: ${templateKey}`);

  const chapters = buildChapterDigest(project);
  const eligible = chapters.filter((c) => c.summary && c.summary.trim().length > 0);
  if (eligible.length < 3) {
    const err = new Error("Need at least three chapters with content to map to a beat sheet.");
    err.code = "too-few-chapters";
    throw err;
  }

  const beatLines = template.beats.map((b) => `- "${b.key}" — ${tEnglish(b.nameKey)}: ${tEnglish(b.descKey)}`).join("\n");
  const chapterLines = chapters.map((c) => {
    const header = `Ch. ${c.num}${c.title ? ` — ${c.title}` : ""} (${c.words.toLocaleString("en-US")} words)`;
    return `${header}\n${c.summary || "(no summary)"}`;
  }).join("\n\n");

  const userBody = [
    `FRAMEWORK: ${tEnglish(template.nameKey)}`,
    tEnglish(template.blurbKey),
    "",
    "BEATS (in canonical order):",
    beatLines,
    "",
    `CHAPTER DIGEST (${chapters.length} chapters):`,
    chapterLines,
  ].join("\n");

  return { variables: { user_content: userBody }, totalChapters: chapters.length, template };
}
/* eslint-enable i18next/no-literal-string */

export async function mapToBeatSheet({
  project,
  templateKey,
  signal,
  provider,
  model,
  task,
  meta,
} = {}) {
  if (!project) throw new Error("mapToBeatSheet: project store is required.");
  const { variables, totalChapters, template } = composeBeatSheetInput(project, templateKey);

  const beatMeta = { ...(meta || {}), templateKey, totalChapters };
  const { result, parsed } = await runJsonAnalysis({
    action: "beatSheet",
    feature: "beatSheet",
    variables,
    signal,
    provider,
    model,
    meta: beatMeta,
    task: task || { label: t("beatSheet.taskShort"), meta: beatMeta },
  });

  const summary = typeof parsed.summary === "string" ? cutToLength(parsed.summary.trim(), 600) : "";

  const rawMapping = Array.isArray(parsed.mapping) ? parsed.mapping : [];
  const seenKeys = new Set();
  const mapping = [];

  // Walk the template beats in canonical order; pick the first entry
  // from rawMapping that targets each beatKey.
  for (const beat of template.beats) {
    const hit = rawMapping.find((m) => m?.beatKey === beat.key && !seenKeys.has(beat.key));
    seenKeys.add(beat.key);
    if (!hit) {
      mapping.push({
        beatKey: beat.key,
        chapterNum: null,
        justification: "",
        missing: true,
      });
      continue;
    }
    const chapterNum = Number.isFinite(hit.chapterNum) ? Math.round(hit.chapterNum) : null;
    const justification = typeof hit.justification === "string" ? cutToLength(hit.justification.trim(), 400) : "";
    mapping.push({
      beatKey: beat.key,
      chapterNum,
      justification,
      missing: chapterNum == null,
    });
  }
  // Any extra rawMapping entries with valid keys we already used are dropped.

  const missingCount = mapping.filter((m) => m.missing).length;

  return {
    templateKey,
    summary,
    mapping,
    missingCount,
    totalBeats: mapping.length,
    raw: result.content,
    model: result.model,
    providerId: result.providerId,
    generatedAt: Date.now(),
  };
}
