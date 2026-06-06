// High-level LLM operations used by the rest of the app.
// Wraps OpenAICompatClient with task-specific prompts.
//
// detectSpeakers / smartCast route through `runAiStream` so they show up
// in the global AI status panel (header chip → slide-in) with elapsed,
// token count, tokens/s, and a cancel button — and so the call survives
// component unmount. The legacy `provider`/`model`/`tier` args are still
// accepted for ad-hoc callers, but Studio (the only production caller)
// now relies on the wrapper's provider-pin resolution.
//
// `chat()` (freeform) still uses the non-streaming OpenAICompatClient
// directly for callers that don't need the panel surface.

import { OpenAICompatClient } from "./openai-compat.js";
import { friendlyAiError } from "./aiErrors.js";
import { runAiStream } from "./aiStream.js";
import { useAiStore } from "../stores/ai.js";
import {
  analyzeSpeakers,
  SYSTEM_BY_TIER_KEY,
  INLINE_SPEAKER_SYSTEM_GUIDED,
  INLINE_SPEAKER_USER_TEMPLATE,
} from "./speakerAttribution.js";

// ─── Speaker detection ──────────────────────────────────────────────────
//
// Given a chapter's text + the project character list, ask the LLM to
// label each paragraph with a speaker id ("narrator" or characterId)
// and a confidence 0..1.
//
// We split the chapter into paragraphs first and ask the LLM to return
// JSON. If the response is malformed we keep the original line and mark
// confidence low.
//
// Backwards-compat re-export. Lab + StudioView use this constant to
// reset their prompts to "what production uses".
export const SPEAKER_SYSTEM = INLINE_SPEAKER_SYSTEM_GUIDED;

// Production speaker-attribution entry point. Runs the inline-tag
// pipeline shared with Speaker Lab's Studio panel — paragraphs are
// split into narration / dialogue segments BEFORE the LLM, only the
// dialogue segments are attributed, and the result is a per-segment
// row list (multiple rows per paragraph). Narration is mechanically
// attributed to the narrator so a paragraph like `"I don't know,"
// she said.` no longer collapses to one speaker — the dialogue gets
// the character voice, the tag ("she said.") gets the narrator voice.
//
// Tier-aware: at call time we resolve the active model's tier
// (Guided / Direct / Reasoned) and pull `think`, `confidenceFloor`,
// and the system prompt body from the tier. Any individual knob can
// be overridden via `ai.featureConfigs.speakerAnalysis` (the user
// promotes a tuned Speaker Lab config there). When a key is undefined
// in the config, the tier-resolved default is used.
//
// Returns an array of ready-to-render line objects:
//   [{ paragraphIdx, kind: "narration"|"dialogue", speaker, confidence,
//      text, source?, intro?, ... }, ...]
// StudioView.reanalyze() pushes these directly into the script.
export async function detectSpeakers({ paragraphs, characters, chapter, task, meta } = {}) {
  const ai = useAiStore();
  // Active production config — null for the built-in Default (which
  // falls through to tier-resolved values below). When a named config
  // is active, its `settings` provide per-knob overrides.
  const cfg = ai.activeSettingsFor("speakerAnalysis") || {};

  // Tier resolution from the resolved model. providerForFeature +
  // modelForFeature already walk featurePins; chatModel is the final
  // fallback when neither a pin nor a default override sets a model.
  const provider = ai.providerForFeature("speakerAnalysis");
  const model = ai.modelForFeature("speakerAnalysis") || provider?.chatModel || "";
  const tier = ai.resolveTier(model) || {};

  // Default each knob from the tier; let featureConfigs override any
  // single one. `?? tierFallback` checks for explicit null/undefined so
  // a deliberate `temperature: 0` or `propagate: false` is respected.
  const systemPrompt = cfg.systemPrompt
    || SYSTEM_BY_TIER_KEY[tier.systemKey]
    || INLINE_SPEAKER_SYSTEM_GUIDED;
  const userTemplate = cfg.userTemplate || INLINE_SPEAKER_USER_TEMPLATE;
  const temperature = cfg.temperature ?? 0.2;
  const think = cfg.think ?? (tier.think === true);
  const propagate = cfg.propagate ?? true;
  const useFloor = cfg.useFloor ?? true;
  const confidenceFloor = cfg.confidenceFloor ?? (tier.floor ?? 0.7);

  return analyzeSpeakers({
    paragraphs,
    characters,
    chapter,
    systemPrompt,
    userTemplate,
    temperature,
    think,
    propagate,
    useFloor,
    confidenceFloor,
    feature: "speakerAnalysis",
    task: task || { label: "Script analysis", meta },
    meta,
  });
}

// ─── Smart cast assignment ──────────────────────────────────────────────
//
// Given a list of characters and a list of available voices, ask the LLM
// to pick the closest voice for each.
//
const DEFAULT_CAST_SYSTEM = `You are a casting director for an audiobook producer.
Given a list of characters with descriptions and a list of available voices
with descriptors, pick the best voice for each character. Return a JSON
object mapping characterId -> voiceId. Match on age, gender, tone,
and accent. Do not invent ids. If no voice fits, omit that character.`;

const DEFAULT_CAST_USER_TEMPLATE = `Characters:
{{characters}}

Available voices:
{{voices}}

Return only the JSON object.`;

export const CAST_SYSTEM = DEFAULT_CAST_SYSTEM;

export async function smartCast({ characters, voices, task, meta } = {}) {
  const ai = useAiStore();
  // Active production config for smart-cast. Default → built-in
  // hardcoded values below. Smart-Cast Lab (future) will populate
  // this with promoted configs the same way Speaker Lab does today.
  const cfg = ai.activeSettingsFor("smartCast") || {};

  const charList = characters
    .map((c) => `- id=${c.id}, name="${c.name}", role="${c.role || ""}", gender="${c.gender || ""}", pronouns="${c.pronouns || ""}", aliases="${(c.aliases || []).join(", ")}", description="${c.oneLiner || ""}"`)
    .join("\n");
  const voiceList = voices
    .map((v) => `- id="${v.id}", name="${v.name}", gender=${v.gender || "?"}, age=${v.age || "?"}, accent=${v.accent || "?"}, tone="${v.tone || ""}"`)
    .join("\n");

  const systemPrompt = cfg?.systemPrompt || DEFAULT_CAST_SYSTEM;
  const userTemplate = cfg?.userTemplate || DEFAULT_CAST_USER_TEMPLATE;
  const userMsg = userTemplate
    .replace(/\{\{characters\}\}/g, charList)
    .replace(/\{\{voices\}\}/g, voiceList);

  const { content } = await runAiStream({
    feature: "smartCast",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMsg },
    ],
    temperature: cfg?.temperature ?? 0.2,
    extra: { think: false },
    meta,
    task: task || { label: "Smart-assign cast", meta },
  });

  return parseJsonObject(content);
}

// ─── Generic chat ──────────────────────────────────────────────────────
// For freeform features (writing assistance, brainstorming) added later.
// `extra` is passed through to the underlying request body — callers can
// add `{ think: false }` if they need a JSON-parseable response from a
// reasoning model, or omit it and let the model think for creative tasks.
export async function chat({ provider, messages, model, signal, temperature, extra }) {
  const client = new OpenAICompatClient(provider);
  try {
    return await client.chat({ messages, model, signal, temperature, extra });
  } catch (err) {
    throw friendlyAiError(err, provider);
  }
}

// ─── helpers ────────────────────────────────────────────────────────────

function parseJsonArray(text, fallbackParagraphs) {
  const m = text.match(/\[[\s\S]*\]/);
  if (!m) return fallbackParagraphs.map(() => ({ speaker: "narrator", confidence: 0.5, kind: "narration" }));
  try {
    const arr = JSON.parse(m[0]);
    return arr.map((a) => ({
      speaker: a.speaker || "narrator",
      confidence: typeof a.confidence === "number" ? a.confidence : 0.5,
      kind: a.kind || "narration",
    }));
  } catch {
    return fallbackParagraphs.map(() => ({ speaker: "narrator", confidence: 0.4, kind: "narration" }));
  }
}

function parseJsonObject(text) {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return {};
  try {
    return JSON.parse(m[0]);
  } catch {
    return {};
  }
}
