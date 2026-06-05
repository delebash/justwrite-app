// Voice fingerprint — "match my style".
//
// Given a project with a `voiceCanonChapterIds` list, builds a text
// block describing the writer's voice: a 500-700 word excerpt
// concatenated from those chapters, plus a one-paragraph style
// summary derived deterministically from styleMetrics (sentence
// length, dialogue ratio, filter words, etc.).
//
// The block is designed to be prepended to writerAI's system prompt
// so every Rewrite / Expand / Continue / Describe matches the
// established voice without the user having to retype guidance.
//
// Pure deterministic — no LLM call. Cheap to recompute on every
// writer action.

import { chapterMetrics } from "./analysis/styleMetrics.js";

function htmlToText(html) {
  if (!html) return "";
  const div = document.createElement("div");
  div.innerHTML = html;
  div.querySelectorAll(".ai-del").forEach((el) => el.remove());
  div.querySelectorAll(".ai-ins").forEach((el) => el.replaceWith(...el.childNodes));
  div.querySelectorAll(".scene-mark").forEach((el) => el.remove());
  return (div.textContent || "").replace(/\s+/g, " ").trim();
}

function pickExcerpt(text, targetWords) {
  if (!text) return "";
  const words = text.split(/\s+/);
  if (words.length <= targetWords) return text;
  // Pick from the middle — the opening of a chapter often differs
  // structurally from the middle/end (scene-setting headers), so a
  // middle slice is more representative of the writer's run-of-prose
  // voice.
  const start = Math.floor((words.length - targetWords) / 2);
  return words.slice(start, start + targetWords).join(" ");
}

// Average a metric across multiple per-chapter rows, weighted by words.
function weightedAvg(rows, key) {
  let sum = 0, weight = 0;
  for (const r of rows) {
    const w = r.words || 0;
    if (!w) continue;
    sum += (r[key] || 0) * w;
    weight += w;
  }
  return weight ? sum / weight : 0;
}

function describeMetrics(rows) {
  if (!rows.length) return "";
  const avgSent = weightedAvg(rows, "avgSentenceLength");
  const avgPara = weightedAvg(rows, "avgParagraphLength");
  const dialogue = weightedAvg(rows, "dialogueRatio");
  const filter = weightedAvg(rows, "filterWordsPer1k");
  const adverb = weightedAvg(rows, "adverbsPer1k");
  const passive = weightedAvg(rows, "passivePer1k");

  const povCounts = { first: 0, second: 0, third: 0, mixed: 0 };
  for (const r of rows) povCounts[r.povHint || "mixed"] = (povCounts[r.povHint || "mixed"] || 0) + 1;
  const dominantPov = Object.entries(povCounts).sort((a, b) => b[1] - a[1])[0][0];

  const parts = [];
  parts.push(`Sentence rhythm: average ~${avgSent.toFixed(1)} words.`);
  parts.push(`Paragraph length: average ~${avgPara.toFixed(0)} words.`);
  parts.push(`Dialogue share: ~${Math.round(dialogue * 100)}% of words inside spoken lines.`);
  if (filter < 5) parts.push(`Low filter-word density (${filter.toFixed(1)} per 1k) — perceptions land direct, not mediated.`);
  else parts.push(`Filter words at ${filter.toFixed(1)} per 1k.`);
  if (adverb < 5) parts.push(`Lean on adverbs is light (${adverb.toFixed(1)} per 1k).`);
  else parts.push(`Adverbs at ${adverb.toFixed(1)} per 1k.`);
  if (passive < 5) parts.push(`Passive voice is rare (${passive.toFixed(1)} per 1k).`);
  else parts.push(`Passive voice at ${passive.toFixed(1)} per 1k.`);
  if (dominantPov && dominantPov !== "mixed") parts.push(`POV is predominantly ${dominantPov} person.`);
  return parts.join(" ");
}

/**
 * Build the voice fingerprint text block.
 *
 * @param {object} project   project store
 * @param {object} [opts]
 * @param {number} [opts.targetWords=600]  approx total excerpt length
 * @returns {{
 *   block: string,            // full text block to inject (or "" if no canon)
 *   excerpt: string,
 *   styleDescription: string,
 *   chapterTitles: string[],
 *   sampleWordCount: number,
 * }}
 */
export function buildVoiceFingerprint(project, { targetWords = 600 } = {}) {
  if (!project) return { block: "", excerpt: "", styleDescription: "", chapterTitles: [], sampleWordCount: 0 };
  const ids = Array.isArray(project.voiceCanonChapterIds) ? project.voiceCanonChapterIds : [];
  if (!ids.length) return { block: "", excerpt: "", styleDescription: "", chapterTitles: [], sampleWordCount: 0 };

  const all = project.allChapters;
  const canonChapters = ids
    .map((id) => all.find((c) => c.id === id))
    .filter(Boolean);
  if (!canonChapters.length) return { block: "", excerpt: "", styleDescription: "", chapterTitles: [], sampleWordCount: 0 };

  const perChapterTarget = Math.max(120, Math.floor(targetWords / canonChapters.length));
  const slices = [];
  const titles = [];
  const metricRows = [];
  for (const ch of canonChapters) {
    const html = project.chapterBody[ch.id] || "";
    const text = htmlToText(html);
    if (!text) continue;
    const slice = pickExcerpt(text, perChapterTarget);
    if (slice) slices.push(slice);
    titles.push(`Ch. ${ch.num}${ch.title ? ` — ${ch.title}` : ""}`);
    metricRows.push(chapterMetrics(html));
  }

  const excerpt = slices.join("\n\n---\n\n");
  const styleDescription = describeMetrics(metricRows);
  const sampleWordCount = excerpt ? excerpt.split(/\s+/).length : 0;

  if (!excerpt) return { block: "", excerpt: "", styleDescription, chapterTitles: titles, sampleWordCount: 0 };

  const lines = [];
  lines.push("VOICE CANON — match this writer's established voice.");
  lines.push("");
  if (styleDescription) {
    lines.push(`Measured patterns from the canon chapters: ${styleDescription}`);
    lines.push("");
  }
  lines.push("Sample passages drawn from the canon chapters (this is what the writer's voice sounds like; do not paraphrase or quote these, only match their rhythm, diction, and POV distance):");
  lines.push("");
  lines.push(excerpt);
  return {
    block: lines.join("\n"),
    excerpt,
    styleDescription,
    chapterTitles: titles,
    sampleWordCount,
  };
}
