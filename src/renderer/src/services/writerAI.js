// writerAI — selection-level writing assistance.
//
// Each public function takes a string of HTML (or plain text) and returns
// a Promise that resolves to the LLM's reply. Every call is routed through
// chatStream() so we capture the `usage` field on the final chunk and feed
// it to ai.recordUsage(). Callers who want token-by-token streaming pass an
// onDelta callback; everything else just awaits the final string.

import { OpenAICompatClient } from "./openai-compat.js";
import { useAiStore } from "../stores/ai.js";
import { friendlyAiError } from "./aiErrors.js";

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

// Drive a chatStream to completion. Captures content, usage, and feeds
// per-chunk deltas to onDelta if supplied. Returns { content, usage }.
//
// `provider` and `model` are optional overrides — they let the Writer
// Lab run the same call against any configured provider/model without
// touching the user's default. When omitted, the AI store's default
// LLM is used.
async function runChat({ messages, signal, onDelta, temperature, extra, provider, model }) {
  const ai = useAiStore();
  const actualProvider = provider || ai.providerForFeature("writerAI");
  if (!actualProvider) throw new Error("No LLM provider is configured. Add one in Settings → AI providers.");
  const actualModel = model || ai.modelForFeature("writerAI") || actualProvider.chatModel;
  const tier = ai.resolveTier(actualModel);
  const client = new OpenAICompatClient(actualProvider);

  let content = "";
  let usage = null;
  // Creative-writing tasks benefit from the model thinking when it can,
  // so we hand the tier's recommendation in (no-op on non-Ollama).
  const stream = client.chatStream({
    messages,
    model: actualModel,
    signal,
    temperature: temperature ?? 0.7,
    extra: { think: tier?.think === true, ...(extra || {}) },
  });
  try {
    for await (const chunk of stream) {
      if (chunk.delta && onDelta) onDelta(chunk.delta, chunk.content);
      if (chunk.content) content = chunk.content;
      if (chunk.usage) usage = chunk.usage;
    }
  } catch (err) {
    throw friendlyAiError(err, actualProvider);
  }
  return { content, usage, providerId: actualProvider.id, model: actualModel };
}

// Common end-of-call bookkeeping: record token usage to the AI store.
function recordCall(feature, runResult, meta) {
  const { usage, providerId, model } = runResult;
  if (!usage) return; // Local providers sometimes omit usage — skip silently.
  const ai = useAiStore();
  ai.recordUsage({
    feature,
    providerId,
    model,
    promptTokens: usage.prompt_tokens || 0,
    completionTokens: usage.completion_tokens || 0,
    meta: meta || {},
  });
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
};

// ─── Named prose-pass rules ─────────────────────────────────────────────
// Each rule is a focused critique mode that produces a revision aimed at
// one specific category of weakness. Surfaced in the bubble menu under
// "Prose pass".

export const PROSE_RULES = {
  "show-dont-tell": {
    label: "Show don't tell",
    description: "Replace statements about emotion or state with concrete behaviour, sensory detail, and dialogue.",
    instruction:
      "Revise the passage to show rather than tell. Replace statements about emotion or state " +
      "(\"she was nervous\", \"he felt cold\") with concrete behaviour, body language, sensory detail, " +
      "and revealing dialogue. Keep the same events and voice.",
  },
  "passive-voice": {
    label: "Passive voice",
    description: "Convert passive constructions to active where it strengthens the prose.",
    instruction:
      "Revise the passage to use active voice where it strengthens the prose. Leave passive " +
      "constructions in place when the actor genuinely doesn't matter or when active voice " +
      "would feel forced. Keep meaning, voice, and tense intact.",
  },
  "filter-words": {
    label: "Filter words",
    description: "Remove filter words (saw, heard, felt, noticed, realized) that distance the reader from the POV.",
    instruction:
      "Revise the passage to remove filter words — words like saw, heard, felt, noticed, realized, " +
      "thought, watched, looked, when they sit between the POV character and direct perception. " +
      "Show the perception directly. Keep the same events and voice.",
  },
  "dialogue-tags": {
    label: "Dialogue tags",
    description: "Replace fancy dialogue tags with 'said' (or action beats) and trim adverbs.",
    instruction:
      "Revise the dialogue tags in the passage. Replace tags like \"exclaimed\", \"retorted\", \"queried\" " +
      "with \"said\" or \"asked\", or convert them to action beats that show how the line is delivered. " +
      "Remove adverbs in dialogue tags (\"she said angrily\"). Preserve the dialogue itself.",
  },
  "sentence-variety": {
    label: "Sentence variety",
    description: "Break up monotonous sentence rhythm with varied length and structure.",
    instruction:
      "Revise the passage to vary sentence length and structure. If sentences are uniformly long, " +
      "break some apart. If uniformly short, combine some with subordination or compound structure. " +
      "Aim for a mix that lets the rhythm breathe. Keep the meaning and voice intact.",
  },
  "prose-tightening": {
    label: "Prose tightening",
    description: "Cut hedges, qualifiers, and redundancy. Make every sentence pull its weight.",
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

async function runAction(actionKey, { html, signal, onDelta, meta, provider, model } = {}) {
  const action = ACTIONS[actionKey];
  if (!action) throw new Error(`Unknown action: ${actionKey}`);
  const source = htmlToText(html);
  if (!source.trim()) throw new Error("There's nothing to work on.");

  const messages = [
    { role: "system", content: SYSTEM_BASE },
    { role: "user", content: `${action.instruction}\n\n--- BEGIN PASSAGE ---\n${source}\n--- END PASSAGE ---` },
  ];
  const result = await runChat({ messages, signal, onDelta, temperature: 0.7, provider, model });
  recordCall(actionKey, result, meta);
  return { html: textToHtml(result.content), raw: result.content, usage: result.usage };
}

export function rewrite(opts)   { return runAction("rewrite", opts); }
export function expand(opts)    { return runAction("expand", opts); }
export function tighten(opts)   { return runAction("tighten", opts); }
export function continueFrom(opts) { return runAction("continue", opts); }

export async function applyRule(ruleKey, { html, signal, onDelta, meta, provider, model } = {}) {
  const rule = PROSE_RULES[ruleKey];
  if (!rule) throw new Error(`Unknown rule: ${ruleKey}`);
  const source = htmlToText(html);
  if (!source.trim()) throw new Error("There's nothing to work on.");

  const messages = [
    { role: "system", content: SYSTEM_BASE },
    { role: "user", content: `${rule.instruction}\n\n--- BEGIN PASSAGE ---\n${source}\n--- END PASSAGE ---` },
  ];
  const result = await runChat({ messages, signal, onDelta, temperature: 0.6, provider, model });
  recordCall(`rule:${ruleKey}`, result, meta);
  return { html: textToHtml(result.content), raw: result.content, usage: result.usage };
}

// Exposed for the bubble menu UI — gives a stable order + labels without
// reaching into PROSE_RULES directly.
export const PROSE_RULE_ORDER = [
  "show-dont-tell",
  "passive-voice",
  "filter-words",
  "dialogue-tags",
  "sentence-variety",
  "prose-tightening",
];

export const ACTION_ORDER = ["rewrite", "expand", "tighten", "continue"];
export { ACTIONS };
