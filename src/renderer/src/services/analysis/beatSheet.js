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

// ─── Templates ───────────────────────────────────────────────────────

export const BEAT_TEMPLATES = {
  "save-the-cat": {
    name: "Save the Cat",
    blurb: "Blake Snyder's 15-beat sheet. Built for commercial film, widely used in genre novels.",
    beats: [
      { key: "opening-image",      name: "Opening Image",        desc: "A snapshot of the protagonist's status quo. The thing the story will change." },
      { key: "theme-stated",       name: "Theme Stated",         desc: "Someone, usually not the protagonist, states the story's thematic premise — often without realising its weight." },
      { key: "setup",              name: "Setup",                desc: "The protagonist's world, their want, their flaw, and the people who pull on them." },
      { key: "catalyst",           name: "Catalyst",             desc: "The inciting event that disrupts the status quo." },
      { key: "debate",             name: "Debate",               desc: "The protagonist resists or hesitates. Should they engage with the catalyst?" },
      { key: "break-into-two",     name: "Break Into Two",       desc: "The protagonist commits. The world of Act II begins." },
      { key: "b-story",            name: "B Story",              desc: "A second storyline (often relational or thematic) opens, usually with a new character." },
      { key: "fun-and-games",      name: "Fun and Games",        desc: "The promise of the premise — the scenes the reader came for." },
      { key: "midpoint",           name: "Midpoint",             desc: "A false victory or false defeat that raises the stakes." },
      { key: "bad-guys-close-in",  name: "Bad Guys Close In",    desc: "External pressure mounts; the protagonist's flaws start to undermine them." },
      { key: "all-is-lost",        name: "All Is Lost",          desc: "The lowest point. Often involves a death (literal or figurative)." },
      { key: "dark-night-of-soul", name: "Dark Night of the Soul", desc: "The protagonist faces themselves. The internal turn that enables the external turn." },
      { key: "break-into-three",   name: "Break Into Three",     desc: "A new understanding (often catalysed by the B Story) enables a new plan." },
      { key: "finale",             name: "Finale",               desc: "The protagonist executes the plan. The story's external and internal arcs converge." },
      { key: "final-image",        name: "Final Image",          desc: "A mirror of the Opening Image showing how the world has changed." },
    ],
  },
  "heros-journey": {
    name: "Hero's Journey",
    blurb: "Christopher Vogler's 12-stage adaptation of Joseph Campbell's monomyth. Strong for fantasy, sci-fi, and mythic structure.",
    beats: [
      { key: "ordinary-world",       name: "Ordinary World",          desc: "The hero's life before transformation." },
      { key: "call-to-adventure",    name: "Call to Adventure",       desc: "An invitation, a problem, or a wound that pulls them toward change." },
      { key: "refusal-of-call",      name: "Refusal of the Call",     desc: "The hero hesitates, doubts, or refuses outright." },
      { key: "meeting-mentor",       name: "Meeting the Mentor",      desc: "Wisdom, training, or a gift that enables the journey." },
      { key: "crossing-threshold",   name: "Crossing the Threshold",  desc: "The hero leaves the ordinary world and enters a new one." },
      { key: "tests-allies-enemies", name: "Tests, Allies, Enemies",  desc: "The hero learns the new world's rules and gathers a cast." },
      { key: "approach-inmost-cave", name: "Approach to the Inmost Cave", desc: "Preparation for the central ordeal. Plans, fears, last conversations." },
      { key: "ordeal",               name: "Ordeal",                  desc: "The central life-or-death confrontation. The hero touches death and finds something." },
      { key: "reward",               name: "Reward (Seizing the Sword)", desc: "The hero claims what the ordeal made possible." },
      { key: "road-back",            name: "The Road Back",           desc: "The hero starts the return. New dangers and the pull of the old world." },
      { key: "resurrection",         name: "Resurrection",            desc: "A final, harder test that proves the change is real." },
      { key: "return-with-elixir",   name: "Return with the Elixir",  desc: "The hero returns home, transformed, bringing something the ordinary world needed." },
    ],
  },
  "seven-point": {
    name: "7-Point Story Structure",
    blurb: "Dan Wells's compressed framework. Easy to apply, especially good for short novels and series planning.",
    beats: [
      { key: "hook",         name: "Hook",         desc: "The protagonist's starting state — the inverse of their ending state." },
      { key: "plot-turn-1",  name: "Plot Turn 1",  desc: "The event that calls the protagonist out of the ordinary world." },
      { key: "pinch-1",      name: "Pinch 1",      desc: "First major pressure from the antagonistic force. Often raises stakes." },
      { key: "midpoint",     name: "Midpoint",     desc: "The protagonist shifts from reactive to active." },
      { key: "pinch-2",      name: "Pinch 2",      desc: "Second major pressure. The plan falls apart; the mentor often dies here." },
      { key: "plot-turn-2",  name: "Plot Turn 2",  desc: "The protagonist gets what they need to resolve the story." },
      { key: "resolution",   name: "Resolution",   desc: "The protagonist executes; the story's questions are answered." },
    ],
  },
};

export const TEMPLATE_OPTIONS = Object.entries(BEAT_TEMPLATES).map(([key, t]) => ({
  value: key,
  label: t.name,
  blurb: t.blurb,
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
      summary: summary.slice(0, 500),
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

  const beatLines = template.beats.map((b) => `- "${b.key}" — ${b.name}: ${b.desc}`).join("\n");
  const chapterLines = chapters.map((c) => {
    const header = `Ch. ${c.num}${c.title ? ` — ${c.title}` : ""} (${c.words.toLocaleString()} words)`;
    return `${header}\n${c.summary || "(no summary)"}`;
  }).join("\n\n");

  const userBody = [
    `FRAMEWORK: ${template.name}`,
    template.blurb,
    "",
    "BEATS (in canonical order):",
    beatLines,
    "",
    `CHAPTER DIGEST (${chapters.length} chapters):`,
    chapterLines,
  ].join("\n");

  return { variables: { user_content: userBody }, totalChapters: chapters.length, template };
}

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
    task: task || { label: "Beat sheet", meta: beatMeta },
  });

  const summary = typeof parsed.summary === "string" ? parsed.summary.trim().slice(0, 600) : "";

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
        beatName: beat.name,
        beatDesc: beat.desc,
        chapterNum: null,
        justification: "",
        missing: true,
      });
      continue;
    }
    const chapterNum = Number.isFinite(hit.chapterNum) ? Math.round(hit.chapterNum) : null;
    const justification = typeof hit.justification === "string" ? hit.justification.trim().slice(0, 400) : "";
    mapping.push({
      beatKey: beat.key,
      beatName: beat.name,
      beatDesc: beat.desc,
      chapterNum,
      justification,
      missing: chapterNum == null,
    });
  }
  // Any extra rawMapping entries with valid keys we already used are dropped.

  const missingCount = mapping.filter((m) => m.missing).length;

  return {
    templateKey,
    templateName: template.name,
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
