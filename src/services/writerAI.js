// writerAI — selection-level writing assistance.
//
// Each public function takes a string of HTML (or plain text) and returns
// a Promise that resolves to the LLM's reply. The stream plumbing (server-side
// provider resolution, cancel signal, friendly errors, task-panel
// registration) is the kit's runAiFeatureStream (@delebash/llm-ui) — we only
// write the prompt variables.

import { runAiFeatureStream } from "@delebash/llm-ui";
import { useProjectStore } from "../stores/project.js";
import { htmlToText, textToHtml } from "./text.js";
import { buildVoiceFingerprint } from "./voiceFingerprint.js";
import { t } from "../i18n/index.js";

// The voice-canon fingerprint as a server-prompt variable: the project's
// measured voice block (prefixed with a blank line) when canonical chapters are
// marked, else "". The server's writerAI system template is
// "<base>{{voiceCanon}}", so this reproduces the old client system exactly.
// Exported: the Lab's passage picker sends the SAME voiceCanon a real writer
// run sends (QC-35 composer reuse).
export function voiceCanonVar() {
  try {
    const project = useProjectStore();
    const fp = buildVoiceFingerprint(project);
    if (fp.block) return `\n\n${fp.block}`;
  } catch {}
  return "";
}

// The story context as a server-prompt variable (slice 2, the AI drafting spec §4): "" or the
// composed context (services/storyContext.js) under its STORY CONTEXT heading, prefixed with a
// blank line — the prose actions' seeded system ends "{{voiceCanon}}{{storyContext}}" and says
// how to use the block when it's there. Line edits don't get it (spec §9.5). Exported: the Lab
// sends the SAME block a real run sends.
export function storyContextVar(text) {
  const t = String(text || "").trim();
  return t ? `\n\nSTORY CONTEXT\n${t}` : "";
}

// htmlToText/textToHtml come from the shared services/text.js. The calls
// below pass { stripSceneMarks: false, trim: false } to preserve writerAI's
// prior behavior; the shared htmlToText additionally strips pending AI-diff
// marks (.ai-del/.ai-ins) so the model never rewrites its own suggestions
// back to itself (the I1 latent-bug fix — the local copy never did).

// Wrapping the LLM reply back into editor HTML (blank-line paragraphs,
// single newlines as <br>) is the shared textToHtml's default grammar
// (services/text.js).

// ─── Action metadata ─────────────────────────────────────────────────────
// Labels for the editor AI dropdown. The PROMPTS (system base + per-action
// instructions) live server-side in `feature_prompts` (keys "writerAI.*"),
// rendered by /v1/ai/stream — so they're Lab-editable and headless-capable.

const ACTIONS = {
  rewrite: { labelKey: "richEditor.actionName.rewrite", description: "Make the passage more vivid and specific while keeping meaning, tense, and voice." },
  expand: { labelKey: "richEditor.actionName.expand", description: "Add sensory detail, interiority, and small actions — roughly double the length." },
  tighten: { labelKey: "richEditor.actionName.tighten", description: "Cut filler, hedges, and redundancy; keep meaning and voice. Noticeably shorter." },
  continue: { labelKey: "richEditor.actionName.continue", description: "Write 2–4 more paragraphs from where the passage ends, matching voice and POV." },
  describe: { labelKey: "richEditor.actionName.describe", description: "Fresh sensory prose about the named subject, to insert after the passage." },
};

// ─── Line edits ─────────────────────────────────────────────────────────
// Surgical, single-issue revisions a writer might run on a final pass —
// line editing in the professional editorial sense (between developmental
// editing and copyediting). Surfaced in the editor AI dropdown and in
// the Tasks tab's Lab under "Line edits".

export const PROSE_RULES = {
  "show-dont-tell": {
    labelKey: "richEditor.rules.showDontTell.label",
    descriptionKey: "richEditor.rules.showDontTell.description",
  },
  "passive-voice": {
    labelKey: "richEditor.rules.passiveVoice.label",
    descriptionKey: "richEditor.rules.passiveVoice.description",
  },
  "filter-words": {
    labelKey: "richEditor.rules.filterWords.label",
    descriptionKey: "richEditor.rules.filterWords.description",
  },
  "dialogue-tags": {
    labelKey: "richEditor.rules.dialogueTags.label",
    descriptionKey: "richEditor.rules.dialogueTags.description",
  },
  "sensory-grounding": {
    labelKey: "richEditor.rules.sensoryGrounding.label",
    descriptionKey: "richEditor.rules.sensoryGrounding.description",
  },
  "sentence-variety": {
    labelKey: "richEditor.rules.sentenceVariety.label",
    descriptionKey: "richEditor.rules.sentenceVariety.description",
  },
  "prose-tightening": {
    labelKey: "richEditor.rules.proseTightening.label",
    descriptionKey: "richEditor.rules.proseTightening.description",
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


// B5-7 (#43): every writerAI run is an editor run — its completion notice
// renders on the scene editor's bottom bar, not as a toast. Stamp the task
// meta so the kit's task store skips the success toast (failures still toast).
function editorTask(task, fallbackLabel, meta) {
  const base = task || { label: fallbackLabel, meta };
  return { ...base, meta: { ...(base.meta || meta || {}), silentToast: true } };
}

// `storyContext` (the prose actions): the composed text for the scene the passage is in
// (storyContext.js proseStoryContext), "" when there is none — the variable is always sent.
async function runAction(actionKey, { html, storyContext = "", signal, onDelta, meta, provider, model, temperature, task } = {}) {
  const action = ACTIONS[actionKey];
  if (!action) throw new Error(`Unknown action: ${actionKey}`);
  const source = htmlToText(html, { stripSceneMarks: false, trim: false });
  if (!source.trim()) throw new Error(t("richEditor.err.nothingToWorkOn"));

  // The prompt (system + instruction) is rendered server-side from the
  // "writerAI.<action>" feature_prompts row; we send the live editor context
  // as variables. Server resolves the writerAI provider/model + records usage.
  const result = await runAiFeatureStream({
    action: `writerAI.${actionKey}`, feature: "writerAI",
    variables: { passage: source, voiceCanon: voiceCanonVar(), storyContext: storyContextVar(storyContext) },
    temperature: typeof temperature === "number" ? temperature : undefined,
    signal, onDelta, provider, model, meta,
    task: editorTask(task, t("richEditor.taskLabel", { action: t(action.labelKey) }), meta),
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
 * @param {string} [opts.storyContext] — the scene's composed story context ("" = none)
 * @param {AbortSignal} [opts.signal]
 * @param {(d,c)=>void} [opts.onDelta]
 * @param {object} [opts.meta]
 * @param {object} [opts.provider]
 * @param {string} [opts.model]
 */
export function guidedContinue(opts = {}) {
  return runDirected("writerAI.guided-continue", "richEditor.actionName.continueGuided", opts, {
    empty: t("richEditor.err.nothingToContinue"),
    noDirection: t("richEditor.err.guidedNeedsDirection"),
  });
}

/** Rewrite with direction… (the AI drafting plan Task 14): the selection rewritten the way the
 *  writer's one-line `instruction` says. Same options as guidedContinue. */
export function guidedRewrite(opts = {}) {
  return runDirected("writerAI.guided-rewrite", "richEditor.actionName.rewriteDirected", opts);
}

/** Write dialogue… (Task 14): dialogue from the passage before the cursor, about what the
 *  writer's `instruction` says, in the voices of the characters the story context carries. Same
 *  options as guidedContinue. */
export function writeDialogue(opts = {}) {
  return runDirected("writerAI.dialogue", "richEditor.actionName.dialogue", opts);
}

// The direction actions share one shape: the passage, the writer's {{direction}}, the voice canon
// and the story context, rendered server-side from the action's seeded prompt.
async function runDirected(action, labelKey, { html, instruction, storyContext = "", signal, onDelta, meta, provider, model, temperature, task } = {}, messages = {}) {
  const source = htmlToText(html, { stripSceneMarks: false, trim: false });
  if (!source.trim()) throw new Error(messages.empty || t("richEditor.err.nothingToWorkOn"));
  const trimmed = String(instruction || "").trim();
  if (!trimmed) throw new Error(messages.noDirection || t("richEditor.err.noDirection"));

  const result = await runAiFeatureStream({
    action, feature: "writerAI",
    variables: { passage: source, direction: trimmed, voiceCanon: voiceCanonVar(), storyContext: storyContextVar(storyContext) },
    temperature: typeof temperature === "number" ? temperature : undefined,
    signal, onDelta, provider, model, meta,
    task: editorTask(task, t("richEditor.taskLabel", { action: t(labelKey) }), meta),
  });
  return { html: textToHtml(result.content), raw: result.content, usage: result.usage };
}

export async function applyRule(ruleKey, { html, signal, onDelta, meta, provider, model, temperature, task } = {}) {
  const rule = PROSE_RULES[ruleKey];
  if (!rule) throw new Error(`Unknown rule: ${ruleKey}`);
  const source = htmlToText(html, { stripSceneMarks: false, trim: false });
  if (!source.trim()) throw new Error(t("richEditor.err.nothingToWorkOn"));

  // Instruction lives server-side in "writerAI.rule.<key>" (seeded at 0.6).
  const result = await runAiFeatureStream({
    action: `writerAI.rule.${ruleKey}`, feature: "writerAI",
    variables: { passage: source, voiceCanon: voiceCanonVar() },
    temperature: typeof temperature === "number" ? temperature : undefined,
    signal, onDelta, provider, model, meta,
    task: editorTask(task, t("richEditor.taskLabel", { action: t(rule.labelKey) }), meta),
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
