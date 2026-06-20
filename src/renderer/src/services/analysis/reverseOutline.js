// Reverse-outline ("StorySnap") — read the finished draft, produce
// the act structure the book actually has.
//
// One LLM call gets a digest of every chapter (title + word count +
// existing structural-analysis summary if present, or a first-paragraph
// snippet otherwise) and returns a structured outline:
//
//   {
//     structureName: "3-act" | "5-act" | "loose",
//     summary:       "2-3 sentences naming the shape the book has",
//     actBreaks:     [{ afterChapterNum, name }],
//     plotPoints:    [{ name, chapterNum, description }],
//     chapterBeats:  [{ chapterNum, beat }]
//   }
//
// The model is told to produce its best READING of what the book
// actually does, not map it to a preconceived framework — that's #12's
// job. If the book really does follow Save the Cat or 7-point, the
// model will identify the 3- or 5-act shape that maps to it.

import { runAiStream } from "../aiStream.js";
import { parseJsonLoose } from "../llmText.js";

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

export const STRUCTURE_LABELS = {
  "3-act":  "Three-act",
  "5-act":  "Five-act",
  "loose":  "Loose / episodic",
};

const SYSTEM = `You are a structural editor reading a novelist's complete draft and producing a REVERSE OUTLINE — that is, the act structure the book actually has, not the structure it should have.

You will be given a chapter-by-chapter digest. For each chapter you'll see the chapter number, title, word count, and a short summary or opening snippet. You will NOT see the full prose — you have to read the book through this digest.

Return ONLY a JSON object:

{
  "structureName": "3-act" | "5-act" | "loose",
  "summary":      "2-3 sentence overview of the book's shape — what kind of story it tells and where the beats land",
  "actBreaks":    [ { "afterChapterNum": number, "name": "End of Act I" | "Midpoint" | ... } ],
  "plotPoints":   [
    { "name": "Inciting incident" | "Plot point 1" | "Midpoint" | "Plot point 2" | "Climax" | "Resolution" | other,
      "chapterNum": number,
      "description": "one sentence naming what specifically happens at this beat" }
  ],
  "chapterBeats": [
    { "chapterNum": number, "beat": "one sentence summarizing this chapter's purpose in the overall structure" }
  ]
}

Rules:
  - Identify the structure the book ACTUALLY does, not the one it "should". Many books are loosely episodic; say so if true.
  - Plot points: 4-7 entries. Always include an Inciting incident and a Climax if present. Midpoint when identifiable.
  - actBreaks: 2-4 entries for 3-act / 5-act; can be empty for "loose".
  - chapterBeats: one entry per chapter, even if the beat is "transition" or "interlude". One short sentence each.
  - Be honest. If the book has structural issues (no clear inciting incident, no real midpoint, climax that lands too early or not at all), the summary should say so plainly. The writer is asking what shape they have, not what shape they wish they had.
  - Don't add Save-the-Cat-style beat names unless the book maps to that framework cleanly. "Fun and games" / "All is lost" are framework-specific — only use them if the book really does follow that beat sheet. Otherwise use generic plot-point names.

Return ONLY the JSON object. No preface, no markdown fences.`;

/**
 * Build the per-chapter digest. Prefers existing structural-analysis
 * summaries (from chapter.critique.structure.summary) when present;
 * falls back to the first paragraph of the chapter otherwise.
 */
function buildChapterDigest(project) {
  return project.allChapters.map((c) => {
    const struct = c.critique?.structure;
    let summary = "";
    if (struct?.summary) {
      summary = struct.summary;
    } else {
      const html = project.chapterBody[c.id] || "";
      const text = htmlToText(html);
      summary = firstParagraph(text);
    }
    return {
      num: c.num,
      title: c.title || "",
      words: c.words || 0,
      tension: struct?.tension ?? null,
      pacing: struct?.pacing ?? null,
      endingClass: struct?.endingClass ?? null,
      summary: summary.slice(0, 600),
    };
  });
}

export async function generateReverseOutline({
  project,
  signal,
  onDelta,
  provider,
  model,
  task,
  meta,
} = {}) {
  if (!project) throw new Error("generateReverseOutline: project store is required.");
  const chapters = buildChapterDigest(project);
  const eligible = chapters.filter((c) => c.summary && c.summary.trim().length > 0);
  if (eligible.length < 3) {
    const err = new Error("Need at least three chapters with content to build a reverse outline.");
    err.code = "too-few-chapters";
    throw err;
  }

  const body = [];
  body.push(`The book has ${chapters.length} chapter${chapters.length === 1 ? "" : "s"} totalling ${chapters.reduce((s, c) => s + c.words, 0).toLocaleString()} words.`);
  body.push("");
  body.push("Chapter digest:");
  for (const c of chapters) {
    const meta = [];
    if (c.tension != null) meta.push(`tension ${c.tension}/10`);
    if (c.pacing) meta.push(`${c.pacing} pacing`);
    if (c.endingClass) meta.push(`${c.endingClass} ending`);
    body.push(`Ch. ${c.num}${c.title ? ` — ${c.title}` : ""} (${c.words.toLocaleString()} words${meta.length ? ` · ${meta.join(", ")}` : ""})`);
    body.push(c.summary || "(no summary — chapter is empty or hasn't been analysed)");
    body.push("");
  }

  const messages = [
    { role: "system", content: SYSTEM },
    { role: "user", content: body.join("\n") },
  ];

  const outlineMeta = { ...(meta || {}), totalChapters: chapters.length };
  const result = await runAiStream({
    feature: "reverseOutline",
    messages,
    temperature: 0.3,
    extra: { think: false },
    signal,
    onDelta,
    provider,
    model,
    meta: outlineMeta,
    task: task || { label: "Reverse outline", meta: outlineMeta },
  });

  const parsed = parseJsonLoose(result.content) || {};
  const structureName = ["3-act", "5-act", "loose"].includes(parsed.structureName)
    ? parsed.structureName
    : "loose";
  const summary = typeof parsed.summary === "string" ? parsed.summary.trim().slice(0, 700) : "";

  const actBreaks = Array.isArray(parsed.actBreaks)
    ? parsed.actBreaks
        .map((b) => ({
          afterChapterNum: Number.isFinite(b?.afterChapterNum) ? Math.round(b.afterChapterNum) : null,
          name: typeof b?.name === "string" ? b.name.trim().slice(0, 60) : "",
        }))
        .filter((b) => b.afterChapterNum != null && b.name)
        .slice(0, 6)
    : [];

  const plotPoints = Array.isArray(parsed.plotPoints)
    ? parsed.plotPoints
        .map((p, i) => ({
          id: `pp_${i}`,
          name: typeof p?.name === "string" ? p.name.trim().slice(0, 60) : "",
          chapterNum: Number.isFinite(p?.chapterNum) ? Math.round(p.chapterNum) : null,
          description: typeof p?.description === "string" ? p.description.trim().slice(0, 400) : "",
        }))
        .filter((p) => p.name && p.chapterNum != null)
        .slice(0, 10)
    : [];

  const chapterBeats = Array.isArray(parsed.chapterBeats)
    ? parsed.chapterBeats
        .map((b) => ({
          chapterNum: Number.isFinite(b?.chapterNum) ? Math.round(b.chapterNum) : null,
          beat: typeof b?.beat === "string" ? b.beat.trim().slice(0, 300) : "",
        }))
        .filter((b) => b.chapterNum != null && b.beat)
    : [];

  return {
    structureName,
    summary,
    actBreaks,
    plotPoints,
    chapterBeats,
    totalChapters: chapters.length,
    raw: result.content,
    model: result.model,
    providerId: result.providerId,
    generatedAt: Date.now(),
  };
}
