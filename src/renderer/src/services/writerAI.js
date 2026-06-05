// writerAI — selection-level writing assistance.
//
// Each public function takes a string of HTML (or plain text) and returns
// a Promise that resolves to the LLM's reply. The chat-stream plumbing
// (provider resolution, cancel signal, friendly errors, token-usage
// ledger) lives in services/aiStream.js — we only write the prompts.

import { runAiStream } from "./aiStream.js";
import { useProjectStore } from "../stores/project.js";
import { buildVoiceFingerprint } from "./voiceFingerprint.js";

// Compose the system prompt for any writer action — SYSTEM_BASE plus,
// when the user has marked canonical chapters, the voice fingerprint
// (sample + measured style summary). Resolved lazily because Pinia
// stores can't be imported and used at module load.
function systemWithVoice() {
  try {
    const project = useProjectStore();
    const fp = buildVoiceFingerprint(project);
    if (fp.block) {
      return `${SYSTEM_BASE}\n\n${fp.block}`;
    }
  } catch {}
  return SYSTEM_BASE;
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

// ─── Prompts ────────────────────────────────────────────────────────────
// Kept inline rather than in a separate module — they're short, and the
// model/voice that fits them lives here too.

const SYSTEM_BASE = `You are an experienced fiction editor helping a novelist revise prose.
You return revisions in the same voice and tense as the source.
Do not add commentary, do not explain your choices, do not greet the user.
Return only the revised prose as plain paragraphs (blank line between paragraphs).
Preserve dialogue formatting and proper nouns.`;

const ACTIONS = {
  rewrite: {
    label: "Rewrite",
    instruction: "Rewrite the passage below to be more vivid and specific while preserving meaning, tense, and voice.",
  },
  expand: {
    label: "Expand",
    instruction: "Expand the passage below with sensory detail, interiority, and small actions. Roughly double its length. Keep the same voice and tense.",
  },
  tighten: {
    label: "Tighten",
    instruction: "Tighten the passage below. Remove filler words, hedges, and redundant phrases. Keep the meaning, voice, and tense intact. The result should be noticeably shorter.",
  },
  continue: {
    label: "Continue",
    instruction: "Continue writing from where the passage below ends. Match the voice, tense, and POV. Write 2–4 more paragraphs of prose. Do not summarize or repeat what came before.",
  },
  describe: {
    label: "Describe",
    instruction:
      "The passage below names a subject — a place, person, object, or moment — that the writer wants " +
      "to bring to life on the page. Write 1–2 paragraphs of fresh sensory prose ABOUT that subject: " +
      "sights, sounds, smells, textures, the feel of the air, small specific details that anchor it " +
      "in the body of the scene. Do not repeat or paraphrase the passage. Do not summarize. Match the " +
      "voice, tense, and POV of the passage. Return new prose only — it will be inserted right after " +
      "the passage in the manuscript.",
  },
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
    instruction:
      "Revise the passage to show rather than tell. Replace statements about emotion or state " +
      "(\"she was nervous\", \"he felt cold\") with concrete behaviour, body language, sensory detail, " +
      "and revealing dialogue. Keep the same events and voice.",
  },
  "passive-voice": {
    label: "Passive voice",
    description: "Switches to active voice when the actor matters. Leaves passive in place when the doer genuinely doesn't — crime scenes, mysteries, agentless states.",
    instruction:
      "Revise the passage to use active voice where it strengthens the prose. Leave passive " +
      "constructions in place when the actor genuinely doesn't matter or when active voice " +
      "would feel forced. Keep meaning, voice, and tense intact.",
  },
  "filter-words": {
    label: "Filter words",
    description: "Strips the layer of \"she saw / he heard / I felt\" between the POV character and what they're perceiving. The reader gets the perception direct.",
    instruction:
      "Revise the passage to remove filter words — words like saw, heard, felt, noticed, realized, " +
      "thought, watched, looked, when they sit between the POV character and direct perception. " +
      "Show the perception directly. Keep the same events and voice.",
  },
  "dialogue-tags": {
    label: "Dialogue tags",
    description: "Plainer tags (\"exclaimed\", \"retorted\" → \"said\") and action beats that show how a line lands. Pulls out adverb-glued tags (\"said angrily\") the same way.",
    instruction:
      "Revise the dialogue tags in the passage. Replace tags like \"exclaimed\", \"retorted\", \"queried\" " +
      "with \"said\" or \"asked\", or convert them to action beats that show how the line is delivered. " +
      "Remove adverbs in dialogue tags (\"she said angrily\"). Preserve the dialogue itself.",
  },
  "sensory-grounding": {
    label: "Sensory grounding",
    description: "Anchors abstract or interior prose in the body — sight, sound, smell, the feel of the air. Pulls a scene out of pure thought and back into the world.",
    instruction:
      "Revise the passage to anchor abstract or interior prose in concrete sensory detail. Where " +
      "the prose drifts into thought, summary, or generality, add a specific image, sound, smell, " +
      "texture, or bodily sensation that puts the POV character back in the room. Do not invent " +
      "new events or change what happens — only the felt texture. Keep voice and tense intact.",
  },
  "sentence-variety": {
    label: "Sentence variety",
    description: "When sentences start marching in lockstep, breaks long ones up or joins short ones together. Lets the rhythm breathe.",
    instruction:
      "Revise the passage to vary sentence length and structure. If sentences are uniformly long, " +
      "break some apart. If uniformly short, combine some with subordination or compound structure. " +
      "Aim for a mix that lets the rhythm breathe. Keep the meaning and voice intact.",
  },
  "prose-tightening": {
    label: "Prose tightening",
    description: "Cuts hedges (just, really, somewhat), filler phrases, and lines that don't move the scene. The result is shorter and usually sharper.",
    instruction:
      "Tighten the passage. Cut hedges (just, really, very, somewhat, a bit), redundant phrases, " +
      "and any sentence that doesn't move the scene forward or reveal something. Keep voice and " +
      "key beats. The result should be noticeably shorter.",
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

// Default temperature for single-stream writer actions. Variations mode
// (see VARIATION_TEMPERATURES below) overrides this per-stream so the
// three columns return materially different prose.
const DEFAULT_TEMPERATURE = 0.7;

// Per-column temperatures when running an action in 3-variation mode.
// Lower is more conservative / closer to a literal rewrite; higher is
// more inventive / further from the source. The spread is large enough
// that the three columns read distinctly without any feeling forced.
export const VARIATION_TEMPERATURES = [0.55, 0.7, 0.95];

async function runAction(actionKey, { html, signal, onDelta, meta, provider, model, temperature } = {}) {
  const action = ACTIONS[actionKey];
  if (!action) throw new Error(`Unknown action: ${actionKey}`);
  const source = htmlToText(html);
  if (!source.trim()) throw new Error("There's nothing to work on.");

  const messages = [
    { role: "system", content: systemWithVoice() },
    { role: "user", content: `${action.instruction}\n\n--- BEGIN PASSAGE ---\n${source}\n--- END PASSAGE ---` },
  ];
  // feature: "writerAI" drives provider/model lookup; usageFeature splits
  // the ledger per action so rewrite/expand/tighten/continue each show
  // up as separate rows in the usage dashboard.
  const result = await runAiStream({
    feature: "writerAI", usageFeature: actionKey,
    messages, signal, onDelta,
    temperature: typeof temperature === "number" ? temperature : DEFAULT_TEMPERATURE,
    provider, model, meta,
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
export async function guidedContinue({ html, instruction, signal, onDelta, meta, provider, model, temperature } = {}) {
  const source = htmlToText(html);
  if (!source.trim()) throw new Error("There's nothing to continue from.");
  const trimmed = String(instruction || "").trim();
  if (!trimmed) throw new Error("Guided Continue needs a one-line direction.");

  const directive =
    "Continue writing from where the passage below ends. " +
    "Follow this specific direction the writer has given you: " +
    `"${trimmed}". ` +
    "Match the voice, tense, and POV of the passage. Write 2–4 more paragraphs of prose. " +
    "Do not summarize what came before. Do not echo the direction back as a header.";

  const messages = [
    { role: "system", content: systemWithVoice() },
    { role: "user", content: `${directive}\n\n--- BEGIN PASSAGE ---\n${source}\n--- END PASSAGE ---` },
  ];

  const result = await runAiStream({
    feature: "writerAI", usageFeature: "guided-continue",
    messages, signal, onDelta,
    temperature: typeof temperature === "number" ? temperature : DEFAULT_TEMPERATURE,
    provider, model, meta,
  });
  return { html: textToHtml(result.content), raw: result.content, usage: result.usage };
}

export async function applyRule(ruleKey, { html, signal, onDelta, meta, provider, model, temperature } = {}) {
  const rule = PROSE_RULES[ruleKey];
  if (!rule) throw new Error(`Unknown rule: ${ruleKey}`);
  const source = htmlToText(html);
  if (!source.trim()) throw new Error("There's nothing to work on.");

  const messages = [
    { role: "system", content: systemWithVoice() },
    { role: "user", content: `${rule.instruction}\n\n--- BEGIN PASSAGE ---\n${source}\n--- END PASSAGE ---` },
  ];
  const result = await runAiStream({
    feature: "writerAI", usageFeature: `rule:${ruleKey}`,
    messages, signal, onDelta,
    temperature: typeof temperature === "number" ? temperature : 0.6,
    provider, model, meta,
  });
  return { html: textToHtml(result.content), raw: result.content, usage: result.usage };
}

// Exposed for the bubble menu UI — gives a stable order + labels without
// reaching into PROSE_RULES directly.
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
