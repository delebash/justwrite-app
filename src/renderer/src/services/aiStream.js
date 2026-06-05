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
import { useAiTasksStore } from "../stores/aiTasks.js";
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
// `signal`         — optional caller-supplied AbortSignal (typically
//                    omitted; pass `task` instead and the wrapper
//                    threads its own signal automatically).
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
// `task`           — optional. When supplied, registers a task in the
//                    global aiTasks store so the call appears in the
//                    header status panel with elapsed/tokens/cancel.
//                    The task survives component unmount, so callers
//                    can navigate away mid-stream without orphaning
//                    the call.
//                      true            → label = feature
//                      { label, meta } → labelled task
//                    When `task` is set, the store's AbortSignal is
//                    threaded into the stream automatically — any
//                    `signal` the caller passes is ORed with it (the
//                    store's signal aborts on user cancel; the caller's
//                    signal can still abort for component-level reasons).
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
  task,
}) {
  const ai = useAiStore();
  const actualProvider = provider || ai.providerForFeature(feature);
  if (!actualProvider) {
    throw new Error("No LLM provider is configured. Add one in Settings → AI providers.");
  }
  const actualModel = model || ai.modelForFeature(feature) || actualProvider.chatModel;
  const tier = ai.resolveTier(actualModel);
  const client = new OpenAICompatClient(actualProvider);

  // Register with the global task panel when requested. The handle owns
  // its own AbortController; we merge it with the caller's optional
  // signal so cancelling from either side still works.
  let taskHandle = null;
  let effectiveSignal = signal;
  let effectiveOnDelta = onDelta;
  if (task) {
    const tasks = useAiTasksStore();
    const opts = (typeof task === "object" && task) || {};
    taskHandle = tasks.start({
      feature,
      label: opts.label || feature,
      meta: opts.meta || meta || {},
    });
    if (signal) {
      // Caller already passed a signal — abort the store-side controller
      // when it fires so the panel reflects the cancel.
      const onCallerAbort = () => {
        try { taskHandle.cancel(); } catch {}
      };
      if (signal.aborted) onCallerAbort();
      else signal.addEventListener?.("abort", onCallerAbort, { once: true });
    }
    effectiveSignal = taskHandle.signal;
    const callerOnDelta = onDelta;
    effectiveOnDelta = (delta, content) => {
      taskHandle.onDelta(delta, content);
      if (callerOnDelta) callerOnDelta(delta, content);
    };
  }

  let content = "";
  let usage = null;
  const stream = client.chatStream({
    messages,
    model: actualModel,
    signal: effectiveSignal,
    temperature,
    extra: { think: tier?.think === true, ...(extra || {}) },
  });
  try {
    for await (const chunk of stream) {
      if (chunk.delta && effectiveOnDelta) effectiveOnDelta(chunk.delta, chunk.content);
      if (chunk.content) content = chunk.content;
      if (chunk.usage) usage = chunk.usage;
    }
  } catch (err) {
    const wrapped = friendlyAiError(err, actualProvider);
    if (taskHandle) taskHandle.fail(wrapped);
    throw wrapped;
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

  if (taskHandle) {
    taskHandle.finish({ usage, providerId: actualProvider.id, model: actualModel });
  }

  return { content, usage, providerId: actualProvider.id, model: actualModel };
}
