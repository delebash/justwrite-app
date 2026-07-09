// Stuck-on-this-chapter diagnostic — the "I'm blocked" menu.
//
// Single LLM call that, given the prose leading up to the writer's
// cursor, returns FIVE distinct moves that could unblock the scene.
// The moves cover different categories so the writer gets a real menu,
// not five variations of the same thing:
//
//   goal-shift   — change the POV character's goal mid-scene
//   interrupt    — someone or something interrupts
//   setting      — shift the setting / leave this location
//   reveal       — reveal something the POV doesn't yet know
//   timeframe    — cut to a different moment (later, earlier, elsewhere)
//
// Each returned move has a one-line "label" (the move name) and a
// short "instruction" that can be fed verbatim into the writerAI
// continueFrom call as a guided-write direction.

import { runAiFeature } from "@delebash/llm-ui";
import { parseJsonLoose } from "./llmText.js";

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
  return `… ${parts.slice(-max).join(" ")}`;
}

export const MOVE_KINDS = [
  "goal-shift", "interrupt", "setting", "reveal", "timeframe",
];

export const MOVE_KIND_LABELS = {
  "goal-shift": "Goal shift",
  interrupt:    "Interrupt",
  setting:      "Setting shift",
  reveal:       "Reveal",
  timeframe:    "Time cut",
};

export const MOVE_KIND_BLURBS = {
  "goal-shift": "Change what the POV character is trying to do mid-scene.",
  interrupt:    "Someone or something interrupts the current action.",
  setting:      "Move the scene to a different place, or have the setting itself shift.",
  reveal:       "Reveal something the POV character doesn't yet know.",
  timeframe:    "Cut to a different moment — later, earlier, or somewhere else entirely.",
};

// The prompt lives server-side (features.py, action "unstuck").

/**
 * Generate five unblock moves given the prose leading up to the writer's
 * stuck point.
 *
 * @param {object} opts
 * @param {string} opts.contextText  — the prose tail (already plain text)
 * @param {string} [opts.chapterTitle]
 * @param {number} [opts.chapterNum]
 * @param {AbortSignal} [opts.signal]
 * @param {(d,c)=>void} [opts.onDelta]
 * @param {object} [opts.provider]
 * @param {string} [opts.model]
 */
/**
 * Compose the unstuck input (the framed prose the writer is stuck at the end
 * of). THE composer for both the real call below and the Lab's chapter picker
 * (QC-35: one source, no copies). Throws the same no-prose error the call
 * always raised.
 *
 * @returns {{ variables: {user_content} }}
 */
export function composeUnstuckInput({ contextText, chapterTitle = "", chapterNum = null } = {}) {
  const text = String(contextText || "").trim();
  if (!text) throw new Error("There's no prose to brainstorm from yet — write a few lines first.");

  const header = chapterTitle
    ? `Chapter ${chapterNum != null ? `${chapterNum} — ` : ""}${chapterTitle}\n\n`
    : "";

  return {
    variables: {
      user_content: `${header}--- BEGIN PROSE (writer is stuck at the end of this) ---\n${text}\n--- END PROSE ---`,
    },
  };
}

export async function generateUnstuckMoves({
  contextText,
  chapterTitle = "",
  chapterNum = null,
  signal,
  provider,
  model,
  task,
  meta,
} = {}) {
  const { variables } = composeUnstuckInput({ contextText, chapterTitle, chapterNum });

  const stuckMeta = { ...(meta || {}), kind: "unstuck" };
  const result = await runAiFeature({
    action: "unstuck",
    feature: "unstuck",
    variables,
    signal,
    provider,
    model,
    meta: stuckMeta,
    task: task || { label: "Stuck diagnostic", meta: stuckMeta },
  });

  const parsed = parseJsonLoose(result.content) || {};
  const raw = Array.isArray(parsed.moves) ? parsed.moves : Array.isArray(parsed) ? parsed : [];

  const seenKinds = new Set();
  const moves = [];
  for (const m of raw) {
    if (!m || typeof m.instruction !== "string") continue;
    const kind = MOVE_KINDS.includes(m.kind) ? m.kind : null;
    if (!kind || seenKinds.has(kind)) continue;
    const label = typeof m.label === "string" ? m.label.trim().slice(0, 110) : "";
    const instruction = m.instruction.trim().slice(0, 500);
    if (!instruction) continue;
    moves.push({
      id: `mv_${moves.length}_${kind}`,
      kind,
      kindLabel: MOVE_KIND_LABELS[kind],
      label,
      instruction,
    });
    seenKinds.add(kind);
    if (moves.length >= 5) break;
  }

  return {
    moves,
    model: result.model,
    providerId: result.providerId,
    generatedAt: Date.now(),
    raw: result.content,
  };
}

// Helper for callers that want to grab the prose tail from a chapter's
// HTML. Mirrors the writerAI grabContextBeforeCursor shape — keeps the
// stuck modal from having to reach into the editor.
export function extractContextTail(html, maxWords = 900) {
  const text = htmlToText(html);
  if (!text) return "";
  return tailWords(text, maxWords);
}
