// End-of-session recap — "Wrap up your day".
//
// One LLM call that hands the writer a recap of what they wrote today
// PLUS a structured list of "open threads" worth marking as Loose
// threads going into tomorrow. Saved on the project as a dailyRecap so
// the next day's resume briefing can fold yesterday's wrap-up into the
// orientation.
//
// Output shape:
//   {
//     text:    string  - 150-300 word prose recap addressed to the writer
//     threads: [{ snippet, label, chapterId, sceneId }]  - matched threads
//     day:     'yyyy-mm-dd'
//     chapterId, chapterNum, chapterTitle, totalWords
//     model, providerId, generatedAt
//   }

import { runAiFeature } from "@delebash/llm-ui";
import { parseJsonLoose } from "./llmText.js";

// ─── helpers ─────────────────────────────────────────────────────────

function htmlToText(html) {
  if (!html) return "";
  const div = document.createElement("div");
  div.innerHTML = html;
  div.querySelectorAll(".ai-del").forEach((el) => { el.remove(); });
  div.querySelectorAll(".ai-ins").forEach((el) => { el.replaceWith(...el.childNodes); });
  div.querySelectorAll(".scene-mark").forEach((el) => { el.remove(); });
  return (div.textContent || "").replace(/\s+\n/g, "\n").trim();
}

function tailWords(text, maxWords) {
  if (!text) return "";
  const parts = text.split(/\s+/);
  if (parts.length <= maxWords) return text;
  return `… ${parts.slice(-maxWords).join(" ")}`;
}

function todayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Locate which scene in a chapter contains the given snippet. Used to
// resolve thread snippets to sceneId so an "Add as marker" action knows
// where to write. Returns sceneId or null.
function findSceneForSnippet(project, chapterId, snippet) {
  if (!snippet) return null;
  const clean = String(snippet).replace(/\s+/g, " ").trim();
  if (!clean) return null;
  const scenes = project.scenesFor(chapterId) || [];
  for (const scn of scenes) {
    const text = htmlToText(scn.body).replace(/\s+/g, " ");
    if (text.includes(clean)) return scn.id;
  }
  return null;
}

// ─── Context composition ─────────────────────────────────────────────

export function buildRecapContext({ project, sessions, maxTailWords = 1200 }) {
  const chapterId = sessions.todayChapterId || sessions.lastWrite?.chapterId || null;
  if (!chapterId) {
    return { meta: { eligible: false, reason: "no-writing-today" }, prompt: null };
  }

  const chapter = project.allChapters.find((c) => c.id === chapterId);
  if (!chapter) {
    return { meta: { eligible: false, reason: "chapter-gone" }, prompt: null };
  }

  const sceneRows = project.scenesFor(chapter.id) || [];
  const fullProse = sceneRows.map((s) => htmlToText(s.body)).filter(Boolean).join("\n\n");
  const tail = tailWords(fullProse, maxTailWords);

  const todayWords = sessions.todayWords || 0;

  // Cast — main + present in this chapter.
  const sceneCharIds = new Set(
    sceneRows.flatMap((s) => Array.isArray(s.characters) ? s.characters : []),
  );
  const activeChars = (project.characters || [])
    .filter((c) => c.main || sceneCharIds.has(c.id))
    .slice(0, 10)
    .map((c) => ({
      name: c.name,
      role: c.role || "",
      gender: c.gender || "",
      pronouns: c.pronouns || "",
      aliases: c.aliases || [],
      lifeStatus: c.lifeStatus || "",
      oneLiner: c.oneLiner || "",
    }));

  const openStrands = (project.strands || [])
    .filter((s) => s.status === "open" || !s.status)
    .slice(0, 6)
    .map((s) => ({
      name: s.name,
      blurb: (s.blurb || "").slice(0, 220),
    }));

  const P = project.project || {};
  const projectMeta = {
    title: P.title || "",
    genre: P.genre || "",
    premise: (P.premise || "").slice(0, 400),
  };

  if (!tail) {
    return { meta: { eligible: false, reason: "no-prose", chapterId }, prompt: null };
  }

  const meta = {
    eligible: true,
    chapterId: chapter.id,
    chapterNum: chapter.num,
    chapterTitle: chapter.title || "",
    totalWords: todayWords,
    chapterWords: chapter.words || 0,
    day: todayKey(),
    activeChars,
    openStrands,
    projectMeta,
  };

  const lines = [];
  if (projectMeta.title) {
    lines.push(`Novel: ${projectMeta.title}${projectMeta.genre ? ` (${projectMeta.genre})` : ""}`);
    if (projectMeta.premise) lines.push(`Premise: ${projectMeta.premise}`);
    lines.push("");
  }
  lines.push(
    `Today the writer added roughly ${todayWords.toLocaleString()} words to this manuscript.`,
    `The chapter they touched most recently: Chapter ${chapter.num}${chapter.title ? ` — "${chapter.title}"` : ""} (now ${(chapter.words || 0).toLocaleString()} words total).`,
    "",
    "Current state of that chapter (last ~1200 words — most likely overlaps with what they wrote today):",
    tail,
    "",
  );
  if (activeChars.length) {
    lines.push("Active characters in/around this chapter:");
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

  return { meta, prompt: lines.join("\n") };
}

// ─── The recap call ──────────────────────────────────────────────────

// The prompt lives server-side (features.py, action "recap").

export async function generateSessionRecap({
  project,
  sessions,
  signal,
  provider,
  model,
  task,
  meta: callerMeta,
} = {}) {
  const { meta, prompt } = buildRecapContext({ project, sessions });
  if (!meta.eligible || !prompt) {
    const err = new Error(
      meta.reason === "no-writing-today"
        ? "No writing recorded today yet — write something first."
        : meta.reason === "chapter-gone"
          ? "Today's chapter no longer exists."
          : "Today's chapter has no prose to recap yet.",
    );
    err.code = meta.reason || "ineligible";
    throw err;
  }

  const recapMeta = { ...(callerMeta || {}), chapterId: meta.chapterId, day: meta.day, totalWords: meta.totalWords };
  const result = await runAiFeature({
    action: "recap",
    feature: "recap",
    variables: { user_content: prompt },
    signal,
    provider,
    model,
    meta: recapMeta,
    task: task || { label: "Session recap", meta: recapMeta },
  });

  const parsed = parseJsonLoose(result.content) || {};
  const text = typeof parsed.recap === "string" ? parsed.recap.trim() : "";
  const rawThreads = Array.isArray(parsed.threads) ? parsed.threads : [];

  // Resolve each thread snippet to its sceneId so the "Add marker"
  // action knows where to write. Drop threads whose snippet can't be
  // located — they'd be unmarkable anyway.
  const threads = [];
  for (const t of rawThreads) {
    if (!t || typeof t.snippet !== "string") continue;
    const snippet = t.snippet.trim();
    const label = typeof t.label === "string" ? t.label.trim().slice(0, 120) : "";
    if (!snippet || snippet.length < 4) continue;
    const sceneId = findSceneForSnippet(project, meta.chapterId, snippet);
    threads.push({
      id: `rt_${Date.now().toString(36)}_${threads.length}`,
      snippet,
      label,
      chapterId: meta.chapterId,
      sceneId,
      locatable: !!sceneId,
    });
    if (threads.length >= 6) break;
  }

  return {
    text,
    threads,
    day: meta.day,
    chapterId: meta.chapterId,
    chapterNum: meta.chapterNum,
    chapterTitle: meta.chapterTitle,
    totalWords: meta.totalWords,
    chapterWords: meta.chapterWords,
    generatedAt: Date.now(),
    model: result.model,
    providerId: result.providerId,
    raw: result.content,
  };
}
