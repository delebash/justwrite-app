// Voice-drift analytics.
//
// Pure deterministic computation over the per-chapter rows that
// styleMetrics already produces. No LLM needed for the headline view:
// for each tracked metric, we compute the book-wide mean and standard
// deviation, then per-chapter z-scores, then flag chapters that sit
// more than ±1 stdev from the mean as outliers.
//
// The "drift" framing comes from the trend signal — a per-metric linear
// fit (using simple early-thirds-vs-late-thirds means since it's cheap
// and noise-resistant) tells the writer whether the metric is rising,
// falling, or flat across the manuscript. A consistent rise in
// dialogue-ratio plus a consistent fall in filter-words-per-1k, for
// example, is a real voice shift — register has tightened.
//
// `explainOutlier` is an optional LLM call: hand it an outlier chapter
// plus a baseline cluster of "typical" chapters, and the model produces
// a 2-3 sentence prose comparison naming the specific shifts. Cheap
// enough to run per-chapter on demand.

import { runAiFeature } from "@delebash/llm-ui";
import { bookMetrics } from "./styleMetrics.js";

// Which metrics from bookMetrics rows are worth tracking for drift.
// Each entry: { key, label, unit, format }. `format` is a function that
// renders the value for display.
export const TRACKED_METRICS = [
  { key: "avgSentenceLength",    label: "Avg sentence length", unit: "words", format: (v) => v.toFixed(1) },
  { key: "avgParagraphLength",   label: "Avg paragraph length", unit: "words", format: (v) => v.toFixed(1) },
  { key: "dialogueRatio",        label: "Dialogue ratio",       unit: "%",    format: (v) => `${Math.round(v * 100)}%`,
                                  display: (v) => v * 100 },
  { key: "filterWordsPer1k",     label: "Filter words / 1k",    unit: "",     format: (v) => v.toFixed(1) },
  { key: "adverbsPer1k",         label: "Adverbs / 1k",         unit: "",     format: (v) => v.toFixed(1) },
  { key: "passivePer1k",         label: "Passive / 1k",         unit: "",     format: (v) => v.toFixed(1) },
];

function mean(arr) {
  if (!arr.length) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function stdev(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  const variance = arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length;
  return Math.sqrt(variance);
}

// Trend across the book using the difference between the early third
// and the late third's means, scaled by the project stdev. More robust
// against a single outlier than a full linear regression.
// Returns: { direction: 'rising'|'falling'|'flat', earlyMean, lateMean, delta }.
function trend(values, sd) {
  const n = values.length;
  if (n < 6) return { direction: "flat", earlyMean: mean(values), lateMean: mean(values), delta: 0 };
  const k = Math.max(2, Math.floor(n / 3));
  const earlyMean = mean(values.slice(0, k));
  const lateMean = mean(values.slice(-k));
  const delta = lateMean - earlyMean;
  // Threshold: the late vs. early shift must be at least 0.5 stdev to
  // count as a real trend. Below that we call it flat.
  const direction = sd > 0 && Math.abs(delta) >= 0.5 * sd
    ? (delta > 0 ? "rising" : "falling")
    : "flat";
  return { direction, earlyMean, lateMean, delta };
}

/**
 * Compute drift analytics over per-chapter style rows.
 *
 * @param {Array} rows  — the `rows` array from bookMetrics()
 *                        Each row carries chapterId, num, title, words,
 *                        and every tracked metric.
 * @returns {{
 *   metrics: [{
 *     key, label, unit,
 *     values: number[],         // per-chapter raw values, in order
 *     displayValues: number[],  // scaled for visualisation (e.g. dialogueRatio×100)
 *     mean: number,
 *     stdev: number,
 *     min: number,
 *     max: number,
 *     zScores: number[],        // per-chapter z-scores (0 if stdev=0)
 *     outliers: Array<{ chapterId, num, title, value, z }>,
 *     trend: { direction, earlyMean, lateMean, delta },
 *   }],
 *   chapters: Array<{ chapterId, num, title, words, driftScore }>,
 *                                // driftScore = sum of |z| across metrics
 *   hotChapters: Array,           // chapters with ≥2 outlier metrics, sorted by driftScore
 *   driftIndex: number,           // 0..1 — share of the book's chapters that are hot
 * }}
 */
export function computeVoiceDrift(rows = []) {
  // Drop empty chapters — their zeros would distort the means.
  const real = rows.filter((r) => r.words > 0);
  const total = real.length;

  if (total < 3) {
    return { metrics: [], chapters: [], hotChapters: [], driftIndex: 0, eligible: false };
  }

  const perMetric = [];

  // Track per-chapter outlier counts for the hot-chapter rollup.
  const outlierCounts = new Map(); // chapterId -> count
  // Track per-chapter |z| sum for the drift score.
  const zSums = new Map();         // chapterId -> sum |z|

  for (const m of TRACKED_METRICS) {
    const values = real.map((r) => Number(r[m.key]) || 0);
    const displayValues = m.display ? values.map(m.display) : values.slice();
    const mu = mean(values);
    const sd = stdev(values);
    const lo = Math.min(...values);
    const hi = Math.max(...values);

    const zScores = values.map((v) => sd > 0 ? (v - mu) / sd : 0);
    const outliers = [];
    for (let i = 0; i < real.length; i++) {
      const z = zScores[i];
      if (Math.abs(z) > 1) {
        outliers.push({
          chapterId: real[i].chapterId,
          num: real[i].num,
          title: real[i].title,
          value: values[i],
          z,
        });
        outlierCounts.set(real[i].chapterId, (outlierCounts.get(real[i].chapterId) || 0) + 1);
      }
      zSums.set(real[i].chapterId, (zSums.get(real[i].chapterId) || 0) + Math.abs(z));
    }

    perMetric.push({
      key: m.key,
      label: m.label,
      unit: m.unit,
      format: m.format,
      values,
      displayValues,
      mean: mu,
      stdev: sd,
      min: lo,
      max: hi,
      zScores,
      outliers,
      trend: trend(values, sd),
    });
  }

  const chapters = real.map((r) => ({
    chapterId: r.chapterId,
    num: r.num,
    title: r.title,
    words: r.words,
    outlierCount: outlierCounts.get(r.chapterId) || 0,
    driftScore: zSums.get(r.chapterId) || 0,
  }));

  const hotChapters = chapters
    .filter((c) => c.outlierCount >= 2)
    .sort((a, b) => b.driftScore - a.driftScore);

  const driftIndex = total ? hotChapters.length / total : 0;

  return {
    metrics: perMetric,
    chapters,
    hotChapters,
    driftIndex,
    eligible: true,
  };
}

// ─── Optional LLM explainer ──────────────────────────────────────────

function htmlToText(html) {
  if (!html) return "";
  const div = document.createElement("div");
  div.innerHTML = html;
  div.querySelectorAll(".ai-del").forEach((el) => { el.remove(); });
  div.querySelectorAll(".ai-ins").forEach((el) => { el.replaceWith(...el.childNodes); });
  div.querySelectorAll(".scene-mark").forEach((el) => { el.remove(); });
  return (div.textContent || "").trim();
}

function tailWords(text, max) {
  if (!text) return "";
  const parts = text.split(/\s+/);
  if (parts.length <= max) return text;
  return parts.slice(0, max).join(" ");
}

// The prompt lives server-side (features.py, action "voiceDrift").

/**
 * Derive the explain-call context from a computeVoiceDrift result: the
 * baseline = the 3 LOWEST-driftScore chapters (most typical of the writer's
 * voice), and the metrics where the given chapter is an outlier. THE one
 * derivation for AnalysisView's explain button and the Lab's chapter picker.
 *
 * @returns {{ baselineChapterIds: string[], divergentMetrics: Array }}
 */
export function deriveVoiceDriftContext(drift, outlierChapterId) {
  const baselineChapterIds = [...(drift?.chapters || [])]
    .filter((c) => c.chapterId !== outlierChapterId)
    .sort((a, b) => a.driftScore - b.driftScore)
    .slice(0, 3)
    .map((c) => c.chapterId);
  const divergentMetrics = [];
  for (const m of drift?.metrics || []) {
    const out = m.outliers.find((o) => o.chapterId === outlierChapterId);
    if (!out) continue;
    const direction = out.z > 0 ? "higher" : "lower";
    const baselineMean = m.format ? m.format(m.mean) : m.mean.toFixed(1);
    const outlierValue = m.format ? m.format(out.value) : out.value.toFixed(1);
    divergentMetrics.push({ label: m.label, direction, baselineMean, outlierValue });
  }
  return { baselineChapterIds, divergentMetrics };
}

/**
 * Compose the voiceDrift input (outlier prose + baseline excerpts + the
 * divergent-metric lines). THE composer for both the real explain call below
 * and the Lab's chapter picker (QC-35: one source, no copies).
 *
 * @returns {{ variables: {user_content} }}
 */
export function composeVoiceDriftBody({
  project,
  outlierChapterId,
  baselineChapterIds = [],
  divergentMetrics = [],
} = {}) {
  if (!project || !outlierChapterId) throw new Error("composeVoiceDriftBody: project + outlierChapterId required.");

  const outlierHtml = project.chapterBody[outlierChapterId] || "";
  const outlierText = tailWords(htmlToText(outlierHtml), 1100);
  if (!outlierText) throw new Error("Outlier chapter has no prose to compare.");

  const outlier = project.allChapters.find((c) => c.id === outlierChapterId);
  const outlierLabel = outlier
    ? `Chapter ${outlier.num}${outlier.title ? ` — "${outlier.title}"` : ""}`
    : "Outlier chapter";

  // Build baseline samples — up to 3 short excerpts.
  const baselineSamples = [];
  for (const id of baselineChapterIds.slice(0, 3)) {
    const html = project.chapterBody[id] || "";
    const text = tailWords(htmlToText(html), 600);
    if (!text) continue;
    const ch = project.allChapters.find((c) => c.id === id);
    const label = ch ? `Chapter ${ch.num}${ch.title ? ` — "${ch.title}"` : ""}` : "Baseline";
    baselineSamples.push({ label, text });
  }

  const divergentLines = divergentMetrics
    .filter((d) => d?.label)
    .slice(0, 6)
    .map((d) => `- ${d.label}: ${d.direction || ""} (outlier ${d.outlierValue}; baseline ~${d.baselineMean})`);

  const body = [];
  body.push(`OUTLIER — ${outlierLabel}`);
  body.push(outlierText);
  body.push("");
  for (const s of baselineSamples) {
    body.push(`BASELINE — ${s.label}`);
    body.push(s.text);
    body.push("");
  }
  if (divergentLines.length) {
    body.push("Metrics that differ:");
    body.push(...divergentLines);
  }

  return { variables: { user_content: body.join("\n") } };
}

/**
 * Compose the voiceDrift input for one chapter straight from the project —
 * computes the style rows + drift analytics and auto-derives the baselines
 * and divergent metrics exactly as the Analysis view's explain button does.
 * The Lab's chapter-picker entry point.
 */
export function composeVoiceDriftInput(project, outlierChapterId) {
  if (!project) throw new Error("composeVoiceDriftInput: project store is required.");
  const rows = bookMetrics(project.allChapters, project.chapterBody).rows;
  const drift = computeVoiceDrift(rows);
  if (!drift.eligible) throw new Error("Need at least three chapters with prose to compare voice.");
  const { baselineChapterIds, divergentMetrics } = deriveVoiceDriftContext(drift, outlierChapterId);
  return composeVoiceDriftBody({ project, outlierChapterId, baselineChapterIds, divergentMetrics });
}

/**
 * Generate a 2-4 sentence diagnosis of why one chapter's voice differs
 * from the project baseline.
 *
 * @param {object} opts
 * @param {object} opts.project              project store
 * @param {string} opts.outlierChapterId
 * @param {string[]} opts.baselineChapterIds  — typically the 3 chapters with the smallest driftScore
 * @param {Array} opts.divergentMetrics       — [{ label, outlierValue, baselineMean, direction }]
 * @param {AbortSignal} [opts.signal]
 * @param {(d,c)=>void} [opts.onDelta]
 */
export async function explainVoiceDrift({
  project,
  outlierChapterId,
  baselineChapterIds = [],
  divergentMetrics = [],
  signal,
  provider,
  model,
  task,
  meta,
} = {}) {
  if (!project || !outlierChapterId) throw new Error("explainVoiceDrift: project + outlierChapterId required.");
  const { variables } = composeVoiceDriftBody({
    project, outlierChapterId, baselineChapterIds, divergentMetrics,
  });

  const driftMeta = { ...(meta || {}), chapterId: outlierChapterId };
  const result = await runAiFeature({
    action: "voiceDrift",
    feature: "voiceDrift",
    variables,
    signal,
    provider,
    model,
    meta: driftMeta,
    task: task || { label: "Voice drift", meta: driftMeta },
  });

  return {
    text: (result.content || "").trim(),
    model: result.model,
    providerId: result.providerId,
    generatedAt: Date.now(),
  };
}
