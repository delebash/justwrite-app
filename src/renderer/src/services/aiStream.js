// One-stop wrapper for any AI chat-stream call across the app.
//
// Every AI feature (writerAI, critique, entity extraction, entity sweep,
// RAG indexer, RAG chat, …) routes through this single function. That gives
// us, for free and in one place:
//
//   - provider + model resolution (per-feature defaults, plus optional
//     overrides from the Writer Lab UI)
//   - AbortSignal threading so the Cancel button actually cancels the
//     network request all the way down
//   - friendlyAiError() wrapping so the user sees readable messages and
//     not raw OpenAI/Ollama error strings
//   - recordUsage() to the AI store so every call lands in the cost ledger
//   - the resolved tier's `think` recommendation (Ollama-style reasoning
//     models) without callers having to know about tiers
//
// Callers focus on prompts and streaming consumption. They cannot
// accidentally skip any of the pieces above — the signature forces them
// through this function. Updating the recipe is one edit here.

import { OpenAICompatClient } from "./openai-compat.js";
import { useAiStore } from "../stores/ai.js";
import { friendlyAiError } from "./aiErrors.js";

// Run an LLM chat stream end-to-end. Returns { content, usage, providerId, model }.
//
// `feature`        — id used for provider/model lookup (e.g. "writerAI",
//                    "critique", "entitySweep"). The user can pin a
//                    different provider/model per feature in Settings.
// `usageFeature`   — optional finer-grain id recorded into the usage
//                    ledger. Defaults to `feature`. Use this when the
//                    same provider serves multiple sub-actions you want
//                    to track separately (e.g. writerAI's rewrite /
//                    expand / tighten / continue).
// `messages`       — OpenAI-shape chat messages.
// `signal`         — AbortSignal from useAiProgress().signal.
// `onDelta`        — optional (delta, fullContent) callback per chunk.
// `temperature`    — defaults to 0.7.
// `extra`          — extra body fields; merged with the resolved tier's
//                    think recommendation (which the caller can override
//                    by passing `extra.think`).
// `provider`       — optional provider object override (Writer Lab uses
//                    this to test the same prompt against a different
//                    configured provider without touching the user's
//                    default).
// `model`          — optional model id override.
// `meta`           — opaque object attached to the usage record.
// `skipUsage`      — when true, don't write to the cost ledger. For
//                    benchmarks, sandboxes, model-compare runs, and
//                    anything else that shouldn't pollute "what I
//                    actually used" stats.
export async function runAiStream({
  feature,
  usageFeature,
  messages,
  signal,
  onDelta,
  temperature = 0.7,
  extra,
  provider,
  model,
  meta,
  skipUsage = false,
}) {
  const ai = useAiStore();
  const actualProvider = provider || ai.providerForFeature(feature);
  if (!actualProvider) {
    throw new Error("No LLM provider is configured. Add one in Settings → AI providers.");
  }
  const actualModel = model || ai.modelForFeature(feature) || actualProvider.chatModel;
  const tier = ai.resolveTier(actualModel);
  const client = new OpenAICompatClient(actualProvider);

  let content = "";
  let usage = null;
  const stream = client.chatStream({
    messages,
    model: actualModel,
    signal,
    temperature,
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

  if (usage && !skipUsage) {
    ai.recordUsage({
      feature: usageFeature || feature,
      providerId: actualProvider.id,
      model: actualModel,
      promptTokens: usage.prompt_tokens || 0,
      completionTokens: usage.completion_tokens || 0,
      meta: meta || {},
    });
  }

  return { content, usage, providerId: actualProvider.id, model: actualModel };
}
