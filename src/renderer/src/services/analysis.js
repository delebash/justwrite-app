// ============================================================
// analysis.js — pure derivation functions for the Analysis view.
//
// Everything is computed off the project store snapshot — no
// persistence, no side effects. Inputs are plain objects so this
// file is unit-testable without Vue.
// ============================================================

import { tokenize } from "./search.js";

/**
 * Status counts across all chapters.
 *   { todo, draft, revise, done, total }
 */
export function statusCounts(allChapters) {
  const counts = { todo: 0, draft: 0, revise: 0, done: 0, total: allChapters.length };
  for (const c of allChapters) counts[c.status] = (counts[c.status] || 0) + 1;
  return counts;
}

/**
 * Strand distribution — words per strand, plus an unattributed bucket.
 * Chapters can belong to multiple strands; each strand they're tagged
 * with gets full credit for the chapter's word count, so the row totals
 * may exceed the manuscript's total words (this is intentional — each
 * row is "words spent on this thread", not "% of book").
 * Returns rows sorted by total words descending.
 *   [{ strandId, name, color, chapters, words }]
 */
export function strandDistribution(strands, allChapters) {
  const byId = new Map(strands.map((s) => [s.id, { ...s, chapters: 0, words: 0 }]));
  const unassigned = { strandId: null, name: "Unattributed", color: "var(--border-strong)", chapters: 0, words: 0 };
  for (const c of allChapters) {
    const list = Array.isArray(c.strands) ? c.strands : [];
    if (list.length === 0) {
      unassigned.chapters++;
      unassigned.words += c.words || 0;
      continue;
    }
    for (const pid of list) {
      const target = byId.get(pid);
      if (target) {
        target.chapters++;
        target.words += c.words || 0;
      }
    }
  }
  const rows = [...byId.values()].map((s) => ({ strandId: s.id, name: s.name, color: s.color, chapters: s.chapters, words: s.words }));
  if (unassigned.chapters) rows.push(unassigned);
  return rows.sort((a, b) => b.words - a.words);
}

/**
 * Character presence — for every (character, chapter) pair, returns
 * a 0/1/2 weight indicating absence / mentioned / featured.
 *
 *   0 — no signal
 *   1 — name appears in body, OR character is on a `beats` entry, OR
 *       a stored script analysis lists them as a speaker
 *   2 — character has dialogue in the chapter's script analysis, OR
 *       first-name mention count > 5 (carrying the scene)
 *
 * `speakersByChapter` is optional — pass null/undefined to derive
 * presence from prose alone.
 */
export function characterPresence(characters, characterExtras, allChapters, chapterBody, speakersByChapter = null) {
  // Pre-tokenise each chapter body to a Map<token, count>.
  const tokenCountsByChapter = new Map();
  for (const c of allChapters) {
    const html = chapterBody[c.id] || "";
    const text = stripHtml(html);
    const counts = new Map();
    for (const t of tokenize(text)) counts.set(t, (counts.get(t) || 0) + 1);
    tokenCountsByChapter.set(c.id, counts);
  }

  // Build the matrix.
  const matrix = [];
  for (const ch of characters) {
    const first = (ch.name.split(/\s+/)[0] || "").toLowerCase();
    const beatChapters = new Set((characterExtras[ch.id]?.beats || []).map((b) => b.ch));
    const row = { character: ch, cells: [] };
    for (const c of allChapters) {
      let weight = 0;
      const counts = tokenCountsByChapter.get(c.id) || new Map();
      const mentions = first ? (counts.get(first) || 0) : 0;
      const speaks = speakersByChapter?.[c.id]?.has?.(ch.id) || false;
      if (speaks || mentions > 5) weight = 2;
      else if (mentions > 0) weight = 1;
      else if (beatChapters.has(c.num)) weight = 1;
      row.cells.push({ chapter: c, weight, mentions, speaks });
    }
    matrix.push(row);
  }
  return matrix;
}

/**
 * Scenes per chapter — flat array for a small bar chart.
 */
export function scenesPerChapter(allChapters) {
  return allChapters.map((c) => ({ num: c.num, title: c.title, scenes: c.scenes || 0 }));
}

/**
 * Overall KPIs for the dashboard header.
 */
export function projectKpis(project, allChapters) {
  const total = allChapters.reduce((s, c) => s + (c.words || 0), 0);
  const done = allChapters.filter((c) => c.status === "done").length;
  const goal = project.project.wordsGoal || 1;
  return {
    totalWords: total,
    chaptersDone: done,
    chaptersTotal: allChapters.length,
    goalPct: Math.round((total / goal) * 100),
    avgChapterLength: allChapters.length ? Math.round(total / allChapters.length) : 0,
  };
}

/**
 * Build a smoothed series for the pace chart from a daily history.
 * Returns { points: [{i, words}], total, avg, max }.
 */
export function paceSeries(history) {
  const total = history.reduce((a, b) => a + b, 0);
  const max = Math.max(1, ...history);
  return {
    points: history.map((words, i) => ({ i, words })),
    total,
    avg: history.length ? Math.round(total / history.length) : 0,
    max,
  };
}

/**
 * Dialogue vs narration mix, by WORD COUNT, from Studio script analysis.
 * `scripts` is studio.scripts — { [chapterId]: [{ speaker, kind, text }] }
 * where kind ∈ "narration"|"dialogue"|"interior"|"scene". "scene" markers
 * (and any unknown kind) are excluded. Only chapters with a stored script
 * contribute; chapters never analyzed in Studio are skipped entirely.
 *
 * Returns:
 *   {
 *     analyzed,                       // chapters that contributed
 *     totals: { dialogue, narration, interior, total },
 *     overallDialoguePct,
 *     perChapter: [{ id, num, title, dialogue, narration, interior, total, dialoguePct }]
 *   }
 */
export function dialogueMix(scripts, allChapters) {
  const KINDS = ["dialogue", "narration", "interior"];
  const wc = (t) => (t ? t.trim().split(/\s+/).filter(Boolean).length : 0);
  const totals = { dialogue: 0, narration: 0, interior: 0 };
  const perChapter = [];
  for (const ch of allChapters) {
    const lines = scripts[ch.id];
    if (!lines || !lines.length) continue;
    const row = { id: ch.id, num: ch.num, title: ch.title, dialogue: 0, narration: 0, interior: 0 };
    for (const l of lines) {
      if (!KINDS.includes(l.kind)) continue;
      const n = wc(l.text);
      row[l.kind] += n;
      totals[l.kind] += n;
    }
    const total = row.dialogue + row.narration + row.interior;
    if (!total) continue;
    row.total = total;
    row.dialoguePct = Math.round((row.dialogue / total) * 100);
    perChapter.push(row);
  }
  const grand = totals.dialogue + totals.narration + totals.interior;
  return {
    analyzed: perChapter.length,
    totals: { ...totals, total: grand },
    overallDialoguePct: grand ? Math.round((totals.dialogue / grand) * 100) : 0,
    perChapter,
  };
}

function stripHtml(html) {
  if (!html) return "";
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  return (tmp.textContent || "").replace(/\s+/g, " ").trim();
}
