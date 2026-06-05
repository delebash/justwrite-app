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

import { runAiStream } from "./aiStream.js";
import { scanProjectMarkers } from "./markers.js";

// ─── Context composition ───────────────────────────────────────────────

// Strip HTML and any pending AI-diff marks so the model sees the prose
// the writer would see, not the editor scaffolding.
function htmlToText(html) {
  if (!html) return "";
  const div = document.createElement("div");
  div.innerHTML = html;
  div.querySelectorAll(".ai-del").forEach((el) => el.remove());
  div.querySelectorAll(".ai-ins").forEach((el) => el.replaceWith(...el.childNodes));
  div.querySelectorAll(".scene-mark").forEach((el) => el.remove());
  return (div.textContent || "").replace(/\s+\n/g, "\n").trim();
}

// Cap a string to roughly N words from the tail (the most recent prose
// is what matters for "where did I leave off").
function tailWords(text, maxWords) {
  if (!text) return "";
  const parts = text.split(/\s+/);
  if (parts.length <= maxWords) return text;
  return "… " + parts.slice(-maxWords).join(" ");
}

function daysBetween(fromYmd, toDate = new Date()) {
  if (!fromYmd) return null;
  const [y, m, d] = fromYmd.split("-").map(Number);
  if (!y || !m || !d) return null;
  const from = new Date(y, m - 1, d);
  const ms = toDate - from;
  return Math.max(0, Math.floor(ms / 86400000));
}

function describeGap(days) {
  if (days == null) return "after a break";
  if (days <= 0) return "earlier today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 14) return "a week ago";
  if (days < 30) return `${Math.round(days / 7)} weeks ago`;
  if (days < 60) return "a month ago";
  return `${Math.round(days / 30)} months ago`;
}

// Build the structured context the prompt is grounded in. Pure data —
// no model calls. Returned as both a `meta` summary (for the UI) and a
// `prompt` string (for the LLM).
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
    .map((s) => htmlToText(s.body))
    .filter(Boolean)
    .join("\n\n");
  const tail = tailWords(fullProse, maxTailWords);

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
      oneLiner: c.oneLiner || "",
    }));

  // Open strands.
  const openStrands = (project.strands || [])
    .filter((s) => s.status === "open" || !s.status)
    .slice(0, 6)
    .map((s) => ({
      name: s.name,
      blurb: (s.blurb || "").slice(0, 220),
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
        label: (m.label || "").slice(0, 120),
        snippet: (m.snippet || "").slice(0, 140),
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
    premise: (P.premise || "").slice(0, 400),
  };

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
    `Last chapter touched: Chapter ${lastChapter.num}${lastChapter.title ? ` — "${lastChapter.title}"` : ""} (${(lastChapter.words || 0).toLocaleString()} words).`,
    "",
    "Final passage of that chapter (tail):",
    tail,
    "",
  );

  if (activeChars.length) {
    lines.push("Active characters in or near this chapter:");
    for (const c of activeChars) {
      const desc = [c.role, c.oneLiner].filter(Boolean).join(" — ");
      lines.push(`- ${c.name}${desc ? `: ${desc}` : ""}`);
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

// ─── The briefing call ─────────────────────────────────────────────────

const BRIEFING_SYSTEM = `You write a "previously on your novel" briefing for a novelist returning to their manuscript after a break.

You will be given:
  - the gap since their last session
  - the last chapter they worked on (title, number, word count)
  - the final passage of that chapter
  - active characters
  - open narrative strands
  - open Loose-thread and TODO pins the writer left for themselves

Write 150–250 words of warm, specific prose addressed to the writer ("You left off…", "Sarah is still…", "Marcus hasn't yet…"). Cover, in this order:

  1. Where they left off — what was happening at the end of the last chapter, in concrete terms drawn from the passage you were shown.
  2. What's currently in motion — which characters are mid-action, what's at stake, what the immediate next beat seems to want.
  3. What's still open — name 1–3 specific dangling threads or TODOs by reference to the chapter they came from, only if they appear in the context.
  4. One concrete next-action suggestion — a single sentence pointing them toward the next move (a scene to write, a decision to make, a thread to pay off).

Rules:
  - Be specific. Quote or paraphrase from the passage. Name characters by name.
  - Don't editorialize ("this is great", "you've built a wonderful world"). The writer doesn't want feedback; they want orientation.
  - Don't summarize the whole novel. Only the moment they're returning to.
  - Don't invent characters or events. If the context is thin, write a shorter briefing.
  - Write as plain prose paragraphs. No headings, no bullets, no markdown.
  - Do not greet the writer or thank them. Open in the middle of orientation.`;

export async function generateResumeBriefing({
  project,
  sessions,
  signal,
  onDelta,
  provider,
  model,
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

  const messages = [
    { role: "system", content: BRIEFING_SYSTEM },
    { role: "user", content: prompt },
  ];

  const result = await runAiStream({
    feature: "briefing",
    messages,
    temperature: 0.45,
    extra: { think: false },
    signal,
    onDelta,
    provider,
    model,
    meta: { chapterId: meta.lastChapter.id, daysSince: meta.daysSince },
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
