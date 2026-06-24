// writerLab.js — shared helpers for WriterLabView and WriterLabDebugView.
//
// No Vue refs, no components. Import freely from either view.

import * as writerAI from "./writerAI.js";
import { PROSE_RULES, PROSE_RULE_ORDER, ACTIONS, ACTION_ORDER } from "./writerAI.js";
import { runCritique, runStructuralAnalysis } from "./analysis/critique.js";
import { extractEntities } from "./analysis/entityExtraction.js";

// ─── Helpers ──────────────────────────────────────────────────────────────

export function stripHtml(html) {
  if (!html) return "";
  const div = document.createElement("div");
  div.innerHTML = html;
  return div.textContent || "";
}

export function textToHtml(text) {
  if (!text) return "";
  const esc = (s) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

export function countWords(s) {
  return s.trim() ? s.trim().split(/\s+/).length : 0;
}

export function fmtMs(ms) {
  if (!ms || !Number.isFinite(ms)) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// ─── Action groups ────────────────────────────────────────────────────────

export const ACTION_GROUPS = [
  {
    label: "Prose actions",
    items: ACTION_ORDER.map((k) => ({
      kind: "writerAction",
      key: k,
      label: ACTIONS[k].label,
      description: ACTIONS[k].description,
    })),
  },
  {
    label: "Line edits",
    items: PROSE_RULE_ORDER.map((k) => ({
      kind: "rule",
      key: k,
      label: PROSE_RULES[k].label,
      description: PROSE_RULES[k].description,
    })),
  },
  {
    label: "Analysis",
    items: [
      { kind: "analysis", key: "critique",  label: "Notes",       description: "Editorial notes grouped by severity (flag / suggest / info)." },
      { kind: "analysis", key: "structure", label: "Structure",   description: "Tension, hook quality, pacing, ending classification, summary." },
      { kind: "analysis", key: "entities",  label: "Entity sweep", description: "Propose characters, locations, objects to add to the story bible." },
    ],
  },
];

// ─── Dispatch ─────────────────────────────────────────────────────────────
//
// action  — { kind, key } descriptor from ACTION_GROUPS
// opts    — { html, signal, onDelta, provider, model, project }
//
// `project` is the Pinia project store instance (needed for entities call).
// `provider` and `model` are optional overrides; omit them to use the
// store's default LLM.
//
// Returns the service's return value as-is so callers can branch on shape.

export async function dispatchRun(action, { html, signal, onDelta, provider, model, project, task } = {}) {
  if (action.kind === "writerAction") {
    const fn = {
      rewrite:  writerAI.rewrite,
      expand:   writerAI.expand,
      tighten:  writerAI.tighten,
      continue: writerAI.continueFrom,
    }[action.key];
    return fn({ html, signal, onDelta, provider, model, task });
  }

  if (action.kind === "rule") {
    return writerAI.applyRule(action.key, { html, signal, onDelta, provider, model, task });
  }

  if (action.key === "critique") {
    return runCritique({ html, chapterTitle: "Lab", chapterNum: 0, signal, onDelta, provider, model, task });
  }

  if (action.key === "structure") {
    return runStructuralAnalysis({ html, chapterTitle: "Lab", chapterNum: 0, signal, onDelta, provider, model, task });
  }

  if (action.key === "entities") {
    return extractEntities({
      html,
      chapterTitle: "Lab",
      chapterNum: 0,
      existingCharacters: project?.characters || [],
      existingLocations:  project?.locations  || [],
      existingObjects:    project?.objects    || [],
      signal,
      onDelta,
      provider,
      model,
      task,
    });
  }

  throw new Error(`Unknown action: ${action.kind}/${action.key}`);
}

// ─── Prompt reconstruction ─────────────────────────────────────────────────
//
// Returns { system, user } strings approximating what the service would
// build internally — used for the "Reconstructed prompt" display panel.
// Returns null when action or text is missing.

const SYSTEM_BASE_DISPLAY = "[system: fiction editor — returns revisions as plain paragraphs, same voice and tense, no commentary]";

export function reconstructPrompt(action, inputText) {
  if (!action || !inputText?.trim()) return null;
  const text = inputText.trim();

  if (action.kind === "writerAction") {
    return {
      system: SYSTEM_BASE_DISPLAY,
      user: `[instruction for "writerAI.${action.key}" is rendered server-side — view/edit it in AI → Feature prompts]\n\n--- BEGIN PASSAGE ---\n${text}\n--- END PASSAGE ---`,
    };
  }

  if (action.kind === "rule") {
    return {
      system: SYSTEM_BASE_DISPLAY,
      user: `[instruction for "writerAI.rule.${action.key}" is rendered server-side — view/edit it in AI → Feature prompts]\n\n--- BEGIN PASSAGE ---\n${text}\n--- END PASSAGE ---`,
    };
  }

  if (action.key === "critique") {
    return {
      system: "[system: sharp fiction editor — returns JSON { notes[] } with severity flag/suggest/info]",
      user: `--- BEGIN CHAPTER ---\n${text}\n--- END CHAPTER ---`,
    };
  }

  if (action.key === "structure") {
    return {
      system: "[system: fiction editor — returns JSON { tension, hookQuality, pacing, endingClass, summary }]",
      user: `--- BEGIN CHAPTER ---\n${text}\n--- END CHAPTER ---`,
    };
  }

  if (action.key === "entities") {
    return {
      system: "[system: story-bible assistant — returns JSON { characters[], locations[], objects[] }]",
      user: `[existing entities omitted for brevity]\n\n--- BEGIN CHAPTER ---\n${text}\n--- END CHAPTER ---`,
    };
  }

  return null;
}
