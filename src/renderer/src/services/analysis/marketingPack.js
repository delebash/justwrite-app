// Marketing pack ("Shrink Ray" equivalent).
//
// One LLM call over a whole-book digest returns four artifacts:
//   - logline: one sentence (15-30 words)
//   - blurbs:  3 back-cover variants (~150 words each, different angles)
//   - synopsis: one-page plot summary (~600 words, present tense)
//   - pitch:   3-paragraph elevator pitch (~250 words)
//
// All four are written for querying agents, pitching to publishers,
// and back-cover copy. The writer can copy each artifact individually.

import { runAiStream } from "../aiStream.js";

function htmlToText(html) {
  if (!html) return "";
  const div = document.createElement("div");
  div.innerHTML = html;
  div.querySelectorAll(".ai-del").forEach((el) => { el.remove(); });
  div.querySelectorAll(".ai-ins").forEach((el) => { el.replaceWith(...el.childNodes); });
  div.querySelectorAll(".scene-mark").forEach((el) => { el.remove(); });
  return (div.textContent || "").trim();
}
function firstParagraph(text, maxWords = 60) {
  if (!text) return "";
  const first = text.split(/\n\s*\n/)[0] || text;
  const words = first.split(/\s+/);
  if (words.length <= maxWords) return first;
  return `${words.slice(0, maxWords).join(" ")}…`;
}
function parseJsonLoose(text) {
  if (!text) return null;
  const s = text.replace(/```(?:json)?/gi, "").replace(/<think>[\s\S]*?<\/think>/gi, "");
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

const BLURB_ANGLES = [
  { key: "hook",      label: "Hook-driven",      description: "Leads with the central conflict or question; closes with stakes." },
  { key: "character", label: "Character-driven", description: "Leads with the protagonist; closes with what they stand to lose." },
  { key: "premise",   label: "Premise-driven",   description: "Leads with the world or situation; closes with the human pull." },
];

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

const SYSTEM = `You write marketing copy for a novelist preparing to query agents and pitch publishers.

You will be given:
  - the book's title, genre, and premise (as the writer has set them)
  - a chapter-by-chapter digest (titles + word counts + short summaries)

Produce FOUR artifacts that work together — same characters, same stakes, written for the back cover, the query letter, the synopsis, and the elevator pitch.

Return ONLY a JSON object:

{
  "logline":  "one sentence, 15-30 words, naming protagonist + central conflict + stakes",
  "blurbs":   [
    { "angle": "hook",      "text": "~120-180 word back-cover paragraph, hook-driven (leads with the central conflict/question, closes with stakes)" },
    { "angle": "character", "text": "~120-180 word back-cover paragraph, character-driven (leads with the protagonist, closes with what they stand to lose)" },
    { "angle": "premise",   "text": "~120-180 word back-cover paragraph, premise-driven (leads with the world or situation, closes with the human pull)" }
  ],
  "synopsis": "one-page synopsis (~500-700 words) of the WHOLE plot including the ending, present tense, third person, naming characters by name. This is for a query package — agents need to know the ending.",
  "pitch":    "3-paragraph elevator pitch (~200-300 words). Paragraph 1: the hook in 1-2 sentences. Paragraph 2: the story's spine — who/what/where/stakes. Paragraph 3: what makes this book matter / why this writer / comp register.",
  "comps":    [
    {
      "title":      "the book's title",
      "author":     "the author's name",
      "year":       4-digit year or null,
      "rationale":  "one sentence naming WHAT specifically this book and the writer's book share — structure, register, subgenre, voice, protagonist archetype — not generic resemblance",
      "confidence": "high" | "medium" | "low" — your confidence the comp ACTUALLY exists as you've named it
    }
  ]
}

Style rules:
  - Blurbs and pitch: present tense, third person, prose register.
  - Synopsis: present tense, third person. INCLUDE the ending. Don't tease.
  - Logline: one declarative sentence. Protagonist + want + obstacle + stakes.
  - No "in this novel, ..." / "this is a story about ..." / other meta phrasings. Write IN the world.
  - Don't use AI-tell phrases ("delved into", "navigated the complexities", "tapestry of", "testament to", "in a world where").
  - Don't editorialise about quality ("a riveting read", "a poignant exploration"). Show the story.
  - Don't pad the word counts with filler; the targets are upper bounds.

COMP-TITLE RULES — these are different and matter:
  - Return 3-6 comps. Quality over quantity. If you only know 3 good ones, return 3.
  - Agents want comps PUBLISHED IN THE LAST 5 YEARS. Older books are weak comps — only include a "classic" comp if it's genuinely load-bearing.
  - Prefer mid-list and well-regarded titles to bestsellers. "Like Gone Girl" tells an agent nothing; "like Mona Awad's Bunny for the unstable narrator" tells them everything.
  - The rationale must name a SPECIFIC craft connection — structure, voice, register, subgenre, protagonist archetype. Not "thriller fans will enjoy".
  - HALLUCINATION WARNING: you may not know what books actually exist. If you are NOT SURE a title-and-author combination is real, set confidence to "low" and SAY in the rationale that the writer should verify. If you are confident it exists, set "high". If you've heard of one or the other but not both together, "medium". Be honest. Bad comps are worse than fewer comps.

Return ONLY the JSON object. No preface, no markdown fences.`;

export async function generateMarketingPack({
  project,
  signal,
  onDelta,
  provider,
  model,
  task,
  meta,
} = {}) {
  if (!project) throw new Error("generateMarketingPack: project store is required.");
  const chapters = buildChapterDigest(project);
  const eligible = chapters.filter((c) => c.summary && c.summary.trim().length > 0);
  if (eligible.length < 3) {
    const err = new Error("Need at least three chapters with content to generate a marketing pack.");
    err.code = "too-few-chapters";
    throw err;
  }

  const P = project.project || {};
  const body = [];
  body.push(`TITLE: ${P.title || "Untitled"}`);
  if (P.subtitle) body.push(`SUBTITLE: ${P.subtitle}`);
  if (P.genre) body.push(`GENRE: ${P.genre}`);
  if (P.premise) body.push(`PREMISE: ${P.premise}`);
  body.push("");
  body.push(`CHAPTER DIGEST (${chapters.length} chapters):`);
  body.push("");
  for (const c of chapters) {
    body.push(`Ch. ${c.num}${c.title ? ` — ${c.title}` : ""} (${c.words.toLocaleString()} words)`);
    body.push(c.summary || "(no summary)");
    body.push("");
  }

  const messages = [
    { role: "system", content: SYSTEM },
    { role: "user", content: body.join("\n") },
  ];

  const packMeta = { ...(meta || {}), totalChapters: chapters.length };
  const result = await runAiStream({
    feature: "marketingPack",
    messages,
    temperature: 0.5,
    extra: { think: false },
    signal,
    onDelta,
    provider,
    model,
    meta: packMeta,
    task: task || { label: "Marketing pack", meta: packMeta },
  });

  const parsed = parseJsonLoose(result.content) || {};
  const logline = typeof parsed.logline === "string" ? parsed.logline.trim().slice(0, 400) : "";
  const synopsis = typeof parsed.synopsis === "string" ? parsed.synopsis.trim() : "";
  const pitch = typeof parsed.pitch === "string" ? parsed.pitch.trim() : "";

  const rawBlurbs = Array.isArray(parsed.blurbs) ? parsed.blurbs : [];
  const blurbs = BLURB_ANGLES.map((angle) => {
    const hit = rawBlurbs.find((b) => b?.angle === angle.key);
    return {
      angle: angle.key,
      label: angle.label,
      description: angle.description,
      text: typeof hit?.text === "string" ? hit.text.trim() : "",
    };
  });

  const rawComps = Array.isArray(parsed.comps) ? parsed.comps : [];
  const comps = rawComps
    .map((c, i) => {
      if (!c) return null;
      const title = typeof c.title === "string" ? c.title.trim() : "";
      const author = typeof c.author === "string" ? c.author.trim() : "";
      if (!title && !author) return null;
      const yearRaw = c.year;
      const year = Number.isFinite(yearRaw) && yearRaw > 1800 && yearRaw < 2100 ? Math.round(yearRaw) : null;
      const rationale = typeof c.rationale === "string" ? c.rationale.trim().slice(0, 400) : "";
      const confidence = ["high", "medium", "low"].includes(c.confidence) ? c.confidence : "low";
      return {
        id: `comp_${i}`,
        title, author, year, rationale, confidence,
      };
    })
    .filter(Boolean)
    .slice(0, 8);

  return {
    logline,
    blurbs,
    synopsis,
    pitch,
    comps,
    totalChapters: chapters.length,
    raw: result.content,
    model: result.model,
    providerId: result.providerId,
    generatedAt: Date.now(),
  };
}
