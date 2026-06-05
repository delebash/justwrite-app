// Plot-hole / continuity audit.
//
// Single-pass LLM call over a whole-book digest — chapter summaries
// (from structural analysis when available, first-paragraph fallback
// otherwise) PLUS a ~300-word tail of each chapter's actual prose so
// the model can catch contradictions that don't show up in summaries
// (eye-color drift, a character being in two places, the timeline
// implying a year has passed when characters reference it as days).
//
// Returns a list of findings:
//   {
//     id, severity: "flag" | "suggest" | "info",
//     kind: "contradiction" | "timeline" | "continuity" | "character-knowledge" | "object" | "other",
//     summary: one-sentence statement of the issue,
//     chapterNums: number[] (the chapters whose content collides),
//     evidence: short verbatim quote naming the collision,
//     fix:     one-sentence suggestion for the cheapest resolution
//   }

import { runAiStream } from "../aiStream.js";

function htmlToText(html) {
  if (!html) return "";
  const div = document.createElement("div");
  div.innerHTML = html;
  div.querySelectorAll(".ai-del").forEach((el) => el.remove());
  div.querySelectorAll(".ai-ins").forEach((el) => el.replaceWith(...el.childNodes));
  div.querySelectorAll(".scene-mark").forEach((el) => el.remove());
  return (div.textContent || "").trim();
}
function firstParagraph(text, maxWords = 60) {
  if (!text) return "";
  const first = text.split(/\n\s*\n/)[0] || text;
  const words = first.split(/\s+/);
  if (words.length <= maxWords) return first;
  return words.slice(0, maxWords).join(" ") + "…";
}
function tailWords(text, max) {
  if (!text) return "";
  const parts = text.split(/\s+/);
  if (parts.length <= max) return text;
  return parts.slice(-max).join(" ");
}

function parseJsonLoose(text) {
  if (!text) return null;
  let s = text.replace(/```(?:json)?/gi, "").replace(/<think>[\s\S]*?<\/think>/gi, "");
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

const SEVERITY_LIST = ["flag", "suggest", "info"];
const KIND_LIST = ["contradiction", "timeline", "continuity", "character-knowledge", "object", "other"];

export const KIND_LABELS = {
  contradiction:        "Contradiction",
  timeline:             "Timeline",
  continuity:           "Continuity",
  "character-knowledge": "Character knowledge",
  object:               "Object / detail",
  other:                "Other",
};

const SYSTEM = `You audit a novelist's draft for plot holes and continuity drift.

You will be given a chapter-by-chapter digest. For each chapter you'll see the chapter number, title, word count, a short summary, and a TAIL of the chapter's actual prose (the last ~300 words) so you can catch details that don't show up in summaries.

Your job: identify CONTRADICTIONS, TIMELINE PROBLEMS, CONTINUITY DRIFT, and KNOWLEDGE-STATE inconsistencies that the writer should be aware of in revision.

Return ONLY a JSON object:

{
  "summary": "1-2 sentences on the overall consistency of the book",
  "findings": [
    {
      "severity":    "flag" | "suggest" | "info",
      "kind":        "contradiction" | "timeline" | "continuity" | "character-knowledge" | "object" | "other",
      "summary":     "one sentence naming the issue",
      "chapterNums": [number] (chapters whose content collides),
      "evidence":    "short verbatim quote naming the collision",
      "fix":         "one sentence on the cheapest resolution — revise the later chapter, or revise the earlier, or add a bridging sentence"
    }
  ]
}

Severity scale:
  - "flag"   — clear contradiction or impossibility (an in-prison character speaking to someone in the same chapter; a dead character returning without explanation)
  - "suggest" — borderline / possible drift (eye-color change between chapters with no on-page reason)
  - "info"   — minor note for awareness, not a real problem

Kinds:
  - contradiction — two prose moments that can't both be true
  - timeline — events happen in an order or pace the text can't support (a year passed but characters reference it as days; a journey that takes hours described as taking days)
  - continuity — small drift in a detail across chapters (eye colour, scar, weather, season)
  - character-knowledge — a character acting on information they couldn't yet have
  - object — an object appears, disappears, or changes (Elena had the locket in Ch.7 but it's never mentioned again, OR she has it in Ch.12 without retrieving it)
  - other — anything else worth surfacing

Rules:
  - Be SELECTIVE. A reasonable book has 0-10 findings. Most flagged issues should be real.
  - Be HONEST. If the book is internally consistent, return findings: [] and a summary saying so. The writer is asking what's broken, not asking you to pad.
  - The evidence field should be a short verbatim quote from one of the offending chapters. No paraphrasing.
  - Don't critique the WRITING — only the internal consistency of facts, events, objects, knowledge, and timeline.
  - Don't flag intentional ambiguity, deliberate withheld information, or unreliable-narrator effects unless something is clearly broken.

Return ONLY the JSON object. No preface, no markdown fences.`;

export async function scanPlotHoles({
  project,
  signal,
  onDelta,
  provider,
  model,
} = {}) {
  if (!project) throw new Error("scanPlotHoles: project store is required.");

  const chapters = project.allChapters.map((c) => {
    const struct = c.critique?.structure;
    const html = project.chapterBody[c.id] || "";
    const text = htmlToText(html);
    return {
      num: c.num,
      title: c.title || "",
      words: c.words || 0,
      summary: struct?.summary || firstParagraph(text),
      tail: tailWords(text, 320),
    };
  });

  const eligible = chapters.filter((c) => c.tail && c.tail.length > 30);
  if (eligible.length < 3) {
    const err = new Error("Need at least three chapters with prose to scan for plot holes.");
    err.code = "too-few-chapters";
    throw err;
  }

  const body = [];
  body.push(`The book has ${chapters.length} chapter${chapters.length === 1 ? "" : "s"} totalling ${chapters.reduce((s, c) => s + c.words, 0).toLocaleString()} words.`);
  body.push("");
  for (const c of chapters) {
    body.push(`=== Chapter ${c.num}${c.title ? ` — ${c.title}` : ""} (${c.words.toLocaleString()} words) ===`);
    if (c.summary) body.push(`Summary: ${c.summary}`);
    if (c.tail) {
      body.push(`Tail (last ~300 words of prose):`);
      body.push(c.tail);
    }
    body.push("");
  }

  const messages = [
    { role: "system", content: SYSTEM },
    { role: "user", content: body.join("\n") },
  ];

  const result = await runAiStream({
    feature: "plotHoles",
    messages,
    temperature: 0.3,
    extra: { think: false },
    signal,
    onDelta,
    provider,
    model,
    meta: { totalChapters: chapters.length },
  });

  const parsed = parseJsonLoose(result.content) || {};
  const summary = typeof parsed.summary === "string" ? parsed.summary.trim().slice(0, 600) : "";
  const rawFindings = Array.isArray(parsed.findings) ? parsed.findings : [];

  const findings = rawFindings
    .map((f, i) => ({
      id: `ph_${Date.now().toString(36)}_${i}`,
      severity: SEVERITY_LIST.includes(f?.severity) ? f.severity : "info",
      kind: KIND_LIST.includes(f?.kind) ? f.kind : "other",
      summary: String(f?.summary || "").trim().slice(0, 240),
      chapterNums: Array.isArray(f?.chapterNums)
        ? f.chapterNums.map((n) => Number.isFinite(n) ? Math.round(n) : null).filter((n) => n != null).slice(0, 6)
        : [],
      evidence: String(f?.evidence || "").trim().slice(0, 240),
      fix: String(f?.fix || "").trim().slice(0, 400),
      dismissed: false,
    }))
    .filter((f) => f.summary || f.evidence);

  return {
    summary,
    findings,
    totalChapters: chapters.length,
    raw: result.content,
    model: result.model,
    providerId: result.providerId,
    generatedAt: Date.now(),
  };
}
