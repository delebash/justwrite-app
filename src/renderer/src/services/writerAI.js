// writerAI — selection-level writing assistance.
//
// Each public function takes a string of HTML (or plain text) and returns
// a Promise that resolves to the LLM's reply. The chat-stream plumbing
// (provider resolution, cancel signal, friendly errors, token-usage
// ledger) lives in services/aiStream.js — we only write the prompts.

import { runAiFeatureStream } from "@delebash/llm-ui";
import { useProjectStore } from "../stores/project.js";
import { buildVoiceFingerprint } from "./voiceFingerprint.js";

// The voice-canon fingerprint as a server-prompt variable: the project's
// measured voice block (prefixed with a blank line) when canonical chapters are
// marked, else "". The server's writerAI system template is
// "<base>{{voiceCanon}}", so this reproduces the old client system exactly.
function voiceCanonVar() {
  try {
    const project = useProjectStore();
    const fp = buildVoiceFingerprint(project);
    if (fp.block) return `\n\n${fp.block}`;
  } catch {}
  return "";
}

// Strip HTML tags for prompts that work on plain text (passive voice
// rules, sentence variety, etc. — we don't want the LLM rewriting <em>
// into "em").
function htmlToText(html) {
  if (!html) return "";
  const div = document.createElement("div");
  div.innerHTML = html;
  return div.textContent || "";
}

// Wrap the LLM reply back into HTML so the editor can drop it in. The
// model returns plain text with paragraph breaks; we split on blank
// lines and wrap each paragraph in <p>.
function textToHtml(text) {
  if (!text) return "";
  const esc = (s) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

// ─── Action metadata ─────────────────────────────────────────────────────
// Labels for the editor AI dropdown. The PROMPTS (system base + per-action
// instructions) live server-side in `feature_prompts` (keys "writerAI.*"),
// rendered by /v1/ai/stream — so they're Lab-editable and headless-capable.

const ACTIONS = {
  rewrite: { label: "Rewrite", description: "Make the passage more vivid and specific while keeping meaning, tense, and voice." },
  expand: { label: "Expand", description: "Add sensory detail, interiority, and small actions — roughly double the length." },
  tighten: { label: "Tighten", description: "Cut filler, hedges, and redundancy; keep meaning and voice. Noticeably shorter." },
  continue: { label: "Continue", description: "Write 2–4 more paragraphs from where the passage ends, matching voice and POV." },
  describe: { label: "Describe", description: "Fresh sensory prose about the named subject, to insert after the passage." },
};

// ─── Line edits ─────────────────────────────────────────────────────────
// Surgical, single-issue revisions a writer might run on a final pass —
// line editing in the professional editorial sense (between developmental
// editing and copyediting). Surfaced in the editor AI dropdown and in
// Writers Lab under "Line edits".

export const PROSE_RULES = {
  "show-dont-tell": {
    label: "Show don't tell",
    description: "Trades told-emotion (\"she was nervous\") for the body language, behaviour, and dialogue that let the reader feel it firsthand.",
  },
  "passive-voice": {
    label: "Passive voice",
    description: "Switches to active voice when the actor matters. Leaves passive in place when the doer genuinely doesn't — crime scenes, mysteries, agentless states.",
  },
  "filter-words": {
    label: "Filter words",
    description: "Strips the layer of \"she saw / he heard / I felt\" between the POV character and what they're perceiving. The reader gets the perception direct.",
  },
  "dialogue-tags": {
    label: "Dialogue tags",
    description: "Plainer tags (\"exclaimed\", \"retorted\" → \"said\") and action beats that show how a line lands. Pulls out adverb-glued tags (\"said angrily\") the same way.",
  },
  "sensory-grounding": {
    label: "Sensory grounding",
    description: "Anchors abstract or interior prose in the body — sight, sound, smell, the feel of the air. Pulls a scene out of pure thought and back into the world.",
  },
  "sentence-variety": {
    label: "Sentence variety",
    description: "When sentences start marching in lockstep, breaks long ones up or joins short ones together. Lets the rhythm breathe.",
  },
  "prose-tightening": {
    label: "Prose tightening",
    description: "Cuts hedges (just, really, somewhat), filler phrases, and lines that don't move the scene. The result is shorter and usually sharper.",
  },
};

// ─── Public API ─────────────────────────────────────────────────────────
//
// Each action takes:
//   { html, signal, onDelta, meta }
// and returns:
//   Promise<{ html, raw, usage }>
// where `html` is the model's reply re-wrapped as HTML paragraphs, `raw`
// is the plain-text reply (for callers that want to diff at the text
// level), and `usage` is the raw usage info from the LLM (already
// recorded into ai.usage — exposed in case callers want to display it).

// Single-stream writer actions use the action's seeded server temperature
// (writerAI.* rows). Variations mode overrides it per-stream with these.
// Per-column temperatures when running an action in 3-variation mode.
// Lower is more conservative / closer to a literal rewrite; higher is
// more inventive / further from the source. The spread is large enough
// that the three columns read distinctly without any feeling forced.
export const VARIATION_TEMPERATURES = [0.55, 0.7, 0.95];

async function runAction(actionKey, { html, signal, onDelta, meta, provider, model, temperature, task } = {}) {
  const action = ACTIONS[actionKey];
  if (!action) throw new Error(`Unknown action: ${actionKey}`);
  const source = htmlToText(html);
  if (!source.trim()) throw new Error("There's nothing to work on.");

  // The prompt (system + instruction) is rendered server-side from the
  // "writerAI.<action>" feature_prompts row; we send the live editor context
  // as variables. Server resolves the writerAI provider/model + records usage.
  const result = await runAiFeatureStream({
    action: `writerAI.${actionKey}`, feature: "writerAI",
    variables: { passage: source, voiceCanon: voiceCanonVar() },
    temperature: typeof temperature === "number" ? temperature : undefined,
    signal, onDelta, provider, model, meta,
    task: task || { label: `Writer assist · ${action.label}`, meta },
  });
  return { html: textToHtml(result.content), raw: result.content, usage: result.usage };
}

export function rewrite(opts)   { return runAction("rewrite", opts); }
export function expand(opts)    { return runAction("expand", opts); }
export function tighten(opts)   { return runAction("tighten", opts); }
export function continueFrom(opts) { return runAction("continue", opts); }
export function describe(opts)  { return runAction("describe", opts); }

/**
 * Guided Continue — Continue with a one-line user instruction prepended
 * to the standard Continue prompt. Used by the Unstuck modal's "Use
 * this" buttons (and any "Continue with direction" surface).
 *
 * @param {object} opts
 * @param {string} opts.html         — context HTML (typically the prose
 *                                     leading up to the cursor)
 * @param {string} opts.instruction  — short user direction, e.g.
 *                                     "Elena confronts Marcus but he
 *                                     deflects with charm."
 * @param {AbortSignal} [opts.signal]
 * @param {(d,c)=>void} [opts.onDelta]
 * @param {object} [opts.meta]
 * @param {object} [opts.provider]
 * @param {string} [opts.model]
 */
export async function guidedContinue({ html, instruction, signal, onDelta, meta, provider, model, temperature, task } = {}) {
  const source = htmlToText(html);
  if (!source.trim()) throw new Error("There's nothing to continue from.");
  const trimmed = String(instruction || "").trim();
  if (!trimmed) throw new Error("Guided Continue needs a one-line direction.");

  // The directive (with the writer's {{direction}}) lives server-side in
  // "writerAI.guided-continue"; we send the direction + passage as variables.
  const result = await runAiFeatureStream({
    action: "writerAI.guided-continue", feature: "writerAI",
    variables: { passage: source, direction: trimmed, voiceCanon: voiceCanonVar() },
    temperature: typeof temperature === "number" ? temperature : undefined,
    signal, onDelta, provider, model, meta,
    task: task || { label: "Writer assist · Continue", meta },
  });
  return { html: textToHtml(result.content), raw: result.content, usage: result.usage };
}

export async function applyRule(ruleKey, { html, signal, onDelta, meta, provider, model, temperature, task } = {}) {
  const rule = PROSE_RULES[ruleKey];
  if (!rule) throw new Error(`Unknown rule: ${ruleKey}`);
  const source = htmlToText(html);
  if (!source.trim()) throw new Error("There's nothing to work on.");

  // Instruction lives server-side in "writerAI.rule.<key>" (seeded at 0.6).
  const result = await runAiFeatureStream({
    action: `writerAI.rule.${ruleKey}`, feature: "writerAI",
    variables: { passage: source, voiceCanon: voiceCanonVar() },
    temperature: typeof temperature === "number" ? temperature : undefined,
    signal, onDelta, provider, model, meta,
    task: task || { label: `Writer assist · ${rule.label}`, meta },
  });
  return { html: textToHtml(result.content), raw: result.content, usage: result.usage };
}

// Exposed for the scene-strip AI dropdown — gives a stable order + labels
// without reaching into PROSE_RULES directly.
export const PROSE_RULE_ORDER = [
  "show-dont-tell",
  "passive-voice",
  "filter-words",
  "dialogue-tags",
  "sensory-grounding",
  "sentence-variety",
  "prose-tightening",
];

export const ACTION_ORDER = ["rewrite", "expand", "tighten", "continue", "describe"];
export { ACTIONS };
