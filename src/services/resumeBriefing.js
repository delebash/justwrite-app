// Resume-from-here briefing — "Previously on your novel".
//
// One LLM call that hands the writer a short orientation paragraph when
// they return to their manuscript after a break. The brief is grounded
// in real project state:
//
//   - the chapter they last wrote in (from sessions.lastWrite)
//   - the last ~500 words of prose from that chapter
//   - open Loose-thread and TODO markers within a few chapters of the
//     last edit
//   - active narrative strands
//   - main characters + anyone present in the last chapter
//
// The output is 150–250 words of second-person prose addressed to the
// writer, ending with one concrete next-action suggestion.

import { runAiFeature } from "@delebash/ui";
import { scanProjectMarkers } from "justwrite-server/editor/markers.js";
import { htmlToText, tailWords } from "./text.js";
import { t, tEnglish } from "../i18n/index.js";
import { cutToLength } from "@delebash/core/platform/text";

// ─── Context composition ───────────────────────────────────────────────

function daysBetween(fromYmd, toDate = new Date()) {
  if (!fromYmd) return null;
  const [y, m, d] = fromYmd.split("-").map(Number);
  if (!y || !m || !d) return null;
  const from = new Date(y, m - 1, d);
  const ms = toDate - from;
  return Math.max(0, Math.floor(ms / 86400000));
}

/** How long since the last session, as a phrase key — "yesterday", "3 days ago". The prompt reads
 *  it in English (describeGap); the Home page's meta line translates the same key. */
export function gapPhrase(days) {
  if (days == null) return { key: "home.gap.afterBreak", n: 0 };
  if (days <= 0) return { key: "home.gap.earlierToday", n: 0 };
  if (days === 1) return { key: "home.gap.yesterday", n: 1 };
  if (days < 7) return { key: "home.gap.days", n: days };
  if (days < 14) return { key: "home.gap.week", n: 1 };
  if (days < 30) return { key: "home.gap.weeks", n: Math.round(days / 7) };
  if (days < 60) return { key: "home.gap.month", n: 1 };
  return { key: "home.gap.months", n: Math.round(days / 30) };
}
function describeGap(days) {
  const { key, n } = gapPhrase(days);
  return tEnglish(key, { n });
}

// Pull the most-recent dailyRecap that's older than today. End-of-day
// recaps written before "now" get folded into tomorrow's briefing so
// the resume card knows how the writer summarised yesterday's work to
// themselves. Returns null if no eligible recap exists.
function priorRecap(project) {
  const recaps = project.dailyRecaps || {};
  const today = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();
  const keys = Object.keys(recaps).filter((k) => k < today).sort();
  if (!keys.length) return null;
  const last = keys[keys.length - 1];
  return recaps[last] || null;
}

// Build the structured context the prompt is grounded in. Pure data —
// no model calls. Returned as both a `meta` summary (for the UI) and a
// `prompt` string (for the LLM).
/* eslint-disable i18next/no-literal-string -- text the AI model reads stays English (ruled 2026-10-13) */
export function buildBriefingContext({ project, sessions, maxTailWords = 500 }) {
  const lastChapterId = sessions.lastWrite?.chapterId || null;
  const lastDay = sessions.lastWrite?.day || null;
  const daysSince = daysBetween(lastDay);

  const lastChapter = lastChapterId
    ? project.allChapters.find((c) => c.id === lastChapterId)
    : null;

  if (!lastChapter) {
    return {
      meta: { eligible: false, reason: "no-last-edit" },
      prompt: null,
    };
  }

  // Last chapter's prose tail.
  const sceneRows = project.scenesFor(lastChapter.id) || [];
  const fullProse = sceneRows
    .map((s) => htmlToText(s.body, { tidyLines: true }))
    .filter(Boolean)
    .join("\n\n");
  const tail = tailWords(fullProse, maxTailWords, { ellipsis: true });

  // Active characters: main cast + anyone @-linked in the last chapter.
  const sceneCharIds = new Set(
    sceneRows.flatMap((s) => Array.isArray(s.characters) ? s.characters : []),
  );
  const activeChars = (project.characters || [])
    .filter((c) => c.main || sceneCharIds.has(c.id))
    .slice(0, 8)
    .map((c) => ({
      name: c.name,
      role: c.role || "",
      gender: c.gender || "",
      pronouns: c.pronouns || "",
      aliases: c.aliases || [],
      lifeStatus: c.lifeStatus || "",
      oneLiner: c.oneLiner || "",
    }));

  // Open strands.
  const openStrands = (project.strands || [])
    .filter((s) => s.status === "open" || !s.status)
    .slice(0, 6)
    .map((s) => ({
      name: s.name,
      blurb: cutToLength(s.blurb || "", 220),
    }));

  // Open Loose-thread and TODO markers, weighted toward recent chapters.
  let nearbyMarkers = [];
  try {
    const allMarkers = scanProjectMarkers(project);
    nearbyMarkers = allMarkers
      .filter((m) => m.category === "thread" || m.category === "todo")
      .filter((m) => Math.abs((m.chapterNum || 0) - (lastChapter.num || 0)) <= 3)
      .slice(0, 10)
      .map((m) => ({
        kind: m.category,
        chapterNum: m.chapterNum,
        label: cutToLength(m.label || "", 120),
        snippet: cutToLength(m.snippet || "", 140),
      }));
  } catch {
    nearbyMarkers = [];
  }

  // Project-level orientation — title, genre, premise. Helps the model
  // keep the briefing in the right register.
  const P = project.project || {};
  const projectMeta = {
    title: P.title || "",
    genre: P.genre || "",
    subtitle: P.subtitle || "",
    premise: cutToLength(P.premise || "", 400),
  };

  // Pull the most recent end-of-session recap (from a previous day) —
  // it's the writer's own framing of where they left off, so it's a
  // strong grounding signal for the briefing.
  const prior = priorRecap(project);

  const meta = {
    eligible: !!tail,
    lastChapter: {
      id: lastChapter.id,
      num: lastChapter.num,
      title: lastChapter.title || "",
      partTitle: lastChapter.partTitle || "",
      words: lastChapter.words || 0,
    },
    lastDay,
    daysSince,
    gapLabel: describeGap(daysSince),
    activeChars,
    openStrands,
    nearbyMarkers,
    projectMeta,
    priorRecap: prior ? { day: prior.day, text: prior.text } : null,
  };

  if (!tail) {
    return { meta: { ...meta, eligible: false, reason: "no-prose" }, prompt: null };
  }

  // Compose the user-message body. Keep section labels short so smaller
  // models don't echo them back as headings.
  const lines = [];
  if (projectMeta.title) {
    lines.push(`Novel: ${projectMeta.title}${projectMeta.genre ? ` (${projectMeta.genre})` : ""}`);
    if (projectMeta.premise) lines.push(`Premise: ${projectMeta.premise}`);
    lines.push("");
  }

  lines.push(
    `The writer last worked on this manuscript ${meta.gapLabel}.`,
    `Last chapter touched: Chapter ${lastChapter.num}${lastChapter.title ? ` — "${lastChapter.title}"` : ""} (${(lastChapter.words || 0).toLocaleString("en-US")} words).`,
    "",
  );

  if (prior?.text) {
    lines.push(
      `The writer's own wrap-up note from ${prior.day || "their last session"} (in their own framing — trust this strongly):`,
      prior.text.trim(),
      "",
    );
  }

  lines.push(
    "Final passage of that chapter (tail):",
    tail,
    "",
  );

  if (activeChars.length) {
    lines.push("Active characters in or near this chapter:");
    for (const c of activeChars) {
      const desc = [c.role, c.gender, c.pronouns, c.lifeStatus, c.oneLiner].filter(Boolean).join(" — ");
      const aka = (c.aliases || []).length ? ` (a.k.a. ${c.aliases.join(", ")})` : "";
      lines.push(`- ${c.name}${aka}${desc ? `: ${desc}` : ""}`);
    }
    lines.push("");
  }

  if (openStrands.length) {
    lines.push("Open narrative strands:");
    for (const s of openStrands) {
      lines.push(`- ${s.name}${s.blurb ? `: ${s.blurb}` : ""}`);
    }
    lines.push("");
  }

  if (nearbyMarkers.length) {
    lines.push("Open threads & TODOs from nearby chapters (writer's own pins):");
    for (const m of nearbyMarkers) {
      const kindLabel = m.kind === "thread" ? "Loose thread" : "TODO";
      const body = m.label || m.snippet || "";
      lines.push(`- (Ch.${m.chapterNum}) ${kindLabel}: ${body}`);
    }
    lines.push("");
  }

  return { meta, prompt: lines.join("\n") };
}
/* eslint-enable i18next/no-literal-string */

// ─── The briefing call ─────────────────────────────────────────────────

// The prompt lives server-side (features.py, action "briefing").

export async function generateResumeBriefing({
  project,
  sessions,
  signal,
  provider,
  model,
  task,
  meta: callerMeta,
} = {}) {
  const { meta, prompt } = buildBriefingContext({ project, sessions });
  if (!meta.eligible || !prompt) {
    const err = new Error(
      meta.reason === "no-last-edit"
        ? "No previous writing session to brief on yet."
        : "Last chapter has no prose to brief on yet.",
    );
    err.code = meta.reason || "ineligible";
    throw err;
  }

  const briefingMeta = { ...(callerMeta || {}), chapterId: meta.lastChapter.id, daysSince: meta.daysSince };
  const result = await runAiFeature({
    action: "briefing",
    feature: "briefing",
    variables: { user_content: prompt },
    signal,
    provider,
    model,
    meta: briefingMeta,
    task: task || { label: t("home.briefingTaskShort"), meta: briefingMeta },
  });

  const text = (result.content || "").trim();
  return {
    text,
    chapterId: meta.lastChapter.id,
    chapterNum: meta.lastChapter.num,
    chapterTitle: meta.lastChapter.title,
    day: meta.lastDay,
    daysSince: meta.daysSince,
    gapLabel: meta.gapLabel,
    generatedAt: Date.now(),
    model: result.model,
    providerId: result.providerId,
    contextMeta: meta,
  };
}
