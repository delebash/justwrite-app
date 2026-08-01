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

import { runJsonAnalysis } from "../runJson.js";
import { htmlToText, tailWords } from "../text.js";

function firstParagraph(text, maxWords = 60) {
  if (!text) return "";
  const first = text.split(/\n\s*\n/)[0] || text;
  const words = first.split(/\s+/);
  if (words.length <= maxWords) return first;
  return `${words.slice(0, maxWords).join(" ")}…`;
}
const SEVERITY_LIST = ["flag", "suggest", "info"];
const KIND_LIST = ["contradiction", "timeline", "continuity", "character-knowledge", "object", "other"];

// KIND_LABELS lived here and held the English badge text. A display string in the service layer
// is unreachable by i18n and invisible to the no-raw-text lint, so the labels now live in
// `plotHoles.kinds.*` and are resolved by the one component that renders them. KIND_LIST above
// remains the wire contract with the model and stays English.

// The base prompt lives server-side (features.py, action "plotHoles"). The
// optional world-rules enforcement section is dynamic per-project, so it's
// composed here and sent as the world_rules_section variable.
function worldRulesSection(rules) {
  const trimmed = String(rules || "").trim();
  if (!trimmed) return "";
  return `

EXTRA: WORLD RULES TO ENFORCE.

The writer has explicitly stated the following rules this world enforces. When you scan the manuscript, ALSO check whether any chapter violates these rules without an on-page explanation. Flag violations as "kind": "continuity" with severity "flag" (or "suggest" if the rule is fuzzy). Quote the violating prose in the evidence field and name the specific rule that was broken in the reason field. If a chapter appears to break a rule but the prose explicitly establishes an exception (a workaround, a cost paid, a rule-bound character bypassing it for a stated reason), do NOT flag — that's the writer earning the exception.

World rules (verbatim from the writer):
"""
${trimmed.slice(0, 4000)}
"""

End of world rules.`;
}

/**
 * Compose the plotHoles input from the live project — the whole-book digest
 * (summary + prose tail per chapter) plus the world-rules enforcement section.
 * THE composer for both the real scan below and the Lab's "From this book"
 * test fill (QC-35: one source, no copies). Throws the same too-few-chapters
 * error the scan always raised.
 *
 * @returns {{ variables: {user_content, world_rules_section}, totalChapters: number }}
 */
export function composePlotHolesInput(project) {
  if (!project) throw new Error("composePlotHolesInput: project store is required.");

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

  return {
    variables: {
      user_content: body.join("\n"),
      world_rules_section: worldRulesSection(project.worldRules),
    },
    totalChapters: chapters.length,
  };
}

export async function scanPlotHoles({
  project,
  signal,
  provider,
  model,
  task,
  meta,
} = {}) {
  if (!project) throw new Error("scanPlotHoles: project store is required.");
  const { variables, totalChapters } = composePlotHolesInput(project);

  const chaptersMeta = { ...(meta || {}), totalChapters };
  const { result, parsed } = await runJsonAnalysis({
    action: "plotHoles",
    feature: "plotHoles",
    variables,
    signal,
    provider,
    model,
    meta: chaptersMeta,
    task: task || { label: "Plot hole scan", meta: chaptersMeta },
  });

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
    totalChapters,
    raw: result.content,
    model: result.model,
    providerId: result.providerId,
    generatedAt: Date.now(),
  };
}
