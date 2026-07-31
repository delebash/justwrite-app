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

import { runJsonAnalysis } from "./runJson.js";
import { htmlToText, tailWords } from "./text.js";

export const MOVE_KINDS = [
  "goal-shift", "interrupt", "setting", "reveal", "timeframe",
];

// Was MOVE_KIND_LABELS / MOVE_KIND_BLURBS holding English. Display strings in a service are
// unreachable by i18n and invisible to no-raw-text, so these are message keys now and
// StuckDiagnosticModal resolves them. The object keys stay as the model's wire values.
export const MOVE_KIND_I18N = {
  "goal-shift": "stuck.moveKinds.goalShift",
  interrupt:    "stuck.moveKinds.interrupt",
  setting:      "stuck.moveKinds.setting",
  reveal:       "stuck.moveKinds.reveal",
  timeframe:    "stuck.moveKinds.timeframe",
};

export const MOVE_BLURB_I18N = {
  "goal-shift": "stuck.moveBlurbs.goalShift",
  interrupt:    "stuck.moveBlurbs.interrupt",
  setting:      "stuck.moveBlurbs.setting",
  reveal:       "stuck.moveBlurbs.reveal",
  timeframe:    "stuck.moveBlurbs.timeframe",
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
  const { result, parsed } = await runJsonAnalysis({
    action: "unstuck",
    feature: "unstuck",
    variables,
    signal,
    provider,
    model,
    meta: stuckMeta,
    task: task || { label: "Stuck diagnostic", meta: stuckMeta },
  });

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
    // No kindLabel: it was a pre-resolved English string baked onto the move. `kind` is the
    // wire value and the modal resolves the label from it at render time.
    moves.push({
      id: `mv_${moves.length}_${kind}`,
      kind,
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
  return tailWords(text, maxWords, { ellipsis: true });
}
