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

import { runAiStream } from "./aiStream.js";

function htmlToText(html) {
  if (!html) return "";
  const div = document.createElement("div");
  div.innerHTML = html;
  div.querySelectorAll(".ai-del").forEach((el) => el.remove());
  div.querySelectorAll(".ai-ins").forEach((el) => el.replaceWith(...el.childNodes));
  div.querySelectorAll(".scene-mark").forEach((el) => el.remove());
  return (div.textContent || "").trim();
}

function tailWords(text, max) {
  if (!text) return "";
  const parts = text.split(/\s+/);
  if (parts.length <= max) return text;
  return "… " + parts.slice(-max).join(" ");
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

const SYSTEM = `You are a fiction editor helping a stuck writer get moving again.

You will be given the prose leading up to the writer's cursor — the place they're stuck. Your job is to propose FIVE distinct ways the scene could unblock from here. Each move belongs to a different category so the writer gets a real menu, not five variations of the same idea.

The five required categories, in order:

  1. "goal-shift"  — the POV character's goal changes mid-scene (they wanted X; now they want Y)
  2. "interrupt"   — someone or something interrupts the current action
  3. "setting"     — the scene moves to a different place, or the setting itself shifts (weather changes, lights go out, etc.)
  4. "reveal"      — reveal something the POV character doesn't yet know (about another character, about the situation, about themselves)
  5. "timeframe"   — cut to a different moment (later, earlier, or elsewhere)

For each move, return:

  {
    "kind":        one of the five strings above (one move per kind, no duplicates),
    "label":       a 3-7 word headline naming this specific move ("Marcus discovers the locket is fake"),
    "instruction": a 1-2 sentence direction you would give the AI's continue function to actually write this move (be concrete — name characters, state the specific action, set the new emotional temperature)
  }

Return ONLY a JSON object:

{
  "moves": [ {...}, {...}, {...}, {...}, {...} ]
}

Rules:
  - Each move must be GROUNDED in the prose you were shown. Name characters who are actually in the scene. Reference the specific situation. No generic suggestions.
  - The instruction should be specific enough that a 200-word continuation could be written from it cold.
  - Don't editorialise. Don't explain why the move is good. Just describe what happens.
  - Don't pick "goal-shift" twice and rename it. The kinds are constraints, not suggestions.

Return ONLY the JSON object. No preface, no markdown fences.`;

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
export async function generateUnstuckMoves({
  contextText,
  chapterTitle = "",
  chapterNum = null,
  signal,
  onDelta,
  provider,
  model,
} = {}) {
  const text = String(contextText || "").trim();
  if (!text) throw new Error("There's no prose to brainstorm from yet — write a few lines first.");

  const header = chapterTitle
    ? `Chapter ${chapterNum != null ? chapterNum + " — " : ""}${chapterTitle}\n\n`
    : "";

  const messages = [
    { role: "system", content: SYSTEM },
    { role: "user", content:
        `${header}--- BEGIN PROSE (writer is stuck at the end of this) ---\n${text}\n--- END PROSE ---`,
    },
  ];

  const result = await runAiStream({
    feature: "unstuck",
    messages,
    temperature: 0.7,
    extra: { think: false },
    signal,
    onDelta,
    provider,
    model,
    meta: { kind: "unstuck" },
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
