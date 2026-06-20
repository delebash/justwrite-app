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

import { runAiStream } from "./aiStream.js";

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

// Same balanced-brace JSON extractor used by analysis/critique.js — kept
// inline here rather than imported to avoid coupling two service trees.
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

const RECAP_SYSTEM = `You write an end-of-session recap for a novelist wrapping up their writing day.

You will be given:
  - today's word count
  - the chapter they touched most recently
  - the current state of that chapter's tail prose
  - active characters
  - open narrative strands

Return ONLY a JSON object with two fields:

  {
    "recap":   string,  // 150-300 words of warm second-person prose
    "threads": [        // 0-5 entries; can be empty if nothing's open
      {
        "snippet": string,  // exact verbatim phrase from the tail prose
        "label":   string   // short reminder, <= 90 chars
      }
    ]
  }

The "recap" prose:
  - Addresses the writer in second person ("You wrapped up the rooftop scene…")
  - Names what actually happened in concrete terms drawn from the passage
  - Identifies 1-2 character decisions or shifts that matter
  - Closes with one concrete next-action suggestion (a scene to write, a thread to plant or pay off, a decision to make)
  - No editorializing ("great work", "you're crushing it"), no headings, no bullets, no markdown

The "threads" array lists items the writer planted today that haven't paid off — setups, promises, questions, abilities, secrets — worth dropping a Loose-thread pin on so they don't forget. RULES for threads:
  - Each snippet MUST be copied verbatim from the prose you were shown. No paraphrasing. No invention.
  - Each snippet should be 4-15 words — enough to locate the spot uniquely, short enough to read.
  - Each label is the writer-facing reminder: what's set up, why it matters.
  - If nothing meaningful was set up, return an empty array. Do not invent threads.

Return ONLY the JSON object, no preface, no markdown fences, no commentary.`;

export async function generateSessionRecap({
  project,
  sessions,
  signal,
  onDelta,
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

  const messages = [
    { role: "system", content: RECAP_SYSTEM },
    { role: "user", content: prompt },
  ];

  const recapMeta = { ...(callerMeta || {}), chapterId: meta.chapterId, day: meta.day, totalWords: meta.totalWords };
  const result = await runAiStream({
    feature: "recap",
    messages,
    temperature: 0.4,
    extra: { think: false },
    signal,
    onDelta,
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
