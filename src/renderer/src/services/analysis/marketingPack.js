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

import { runJsonAnalysis } from "../runJson.js";
import { htmlToText } from "../text.js";

function firstParagraph(text, maxWords = 60) {
  if (!text) return "";
  const first = text.split(/\n\s*\n/)[0] || text;
  const words = first.split(/\s+/);
  if (words.length <= maxWords) return first;
  return `${words.slice(0, maxWords).join(" ")}…`;
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

// The prompt lives server-side (features.py, action "marketingPack").

/**
 * Compose the marketingPack input (title/genre/premise + the chapter digest)
 * from the live project. THE composer for both the real run below and the
 * Lab's "From this book" fill (QC-35: one source, no copies).
 *
 * @returns {{ variables: {user_content}, totalChapters: number }}
 */
export function composeMarketingPackInput(project) {
  if (!project) throw new Error("composeMarketingPackInput: project store is required.");
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

  return { variables: { user_content: body.join("\n") }, totalChapters: chapters.length };
}

export async function generateMarketingPack({
  project,
  signal,
  provider,
  model,
  task,
  meta,
} = {}) {
  if (!project) throw new Error("generateMarketingPack: project store is required.");
  const { variables, totalChapters } = composeMarketingPackInput(project);

  const packMeta = { ...(meta || {}), totalChapters };
  const { result, parsed } = await runJsonAnalysis({
    action: "marketingPack",
    feature: "marketingPack",
    variables,
    signal,
    provider,
    model,
    meta: packMeta,
    task: task || { label: "Marketing pack", meta: packMeta },
  });

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
    totalChapters,
    raw: result.content,
    model: result.model,
    providerId: result.providerId,
    generatedAt: Date.now(),
  };
}
