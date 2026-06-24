// Client wrapper for SERVER-SIDE AI features — the non-streaming counterpart to
// aiStream.js. The migrated services/analysis/* features POST to /v1/ai/run,
// where the server renders the action's prompt template and dispatches through
// the shared llm_runner dispatch (resolving the provider from the user's pins /
// default, and recording usage via the host-sink). So this helper holds NO
// provider/model resolution — only the cross-cutting pieces a caller shouldn't
// re-implement: global task-panel registration (elapsed / cancel) and readable
// error wrapping.
//
// Returns { content, model }. `content` is the raw model output (callers parse
// JSON with parseJsonLoose, exactly as before).

import { serverUrl } from "./serverApi.js";
import { useAiTasksStore } from "../stores/aiTasks.js";
import { friendlyAiError } from "./aiErrors.js";

// `action`   — catalog id on the server (e.g. "critique", "critiqueStructure").
// `feature`  — routing key for the task panel label/grouping (defaults to action).
// `variables`— filled into the action's server-side user_template ({{var}}).
// `provider` — optional provider OBJECT override (Writer Lab compares providers);
//              only its id is sent — the server resolves + injects the key.
// `model`    — optional model id override.
// `signal`   — optional caller AbortSignal (ORed with the task's own).
// `task`     — true | { label, meta } to register in the global AI task panel.
export async function runAiFeature({ action, feature, variables = {}, provider, model, signal, meta, task } = {}) {
  let handle = null;
  let effectiveSignal = signal;
  if (task) {
    const tasks = useAiTasksStore();
    const opts = (typeof task === "object" && task) || {};
    handle = tasks.start({ feature: feature || action, label: opts.label || action, meta: opts.meta || meta || {} });
    effectiveSignal = handle.signal;
    if (signal) {
      if (signal.aborted) handle.cancel();
      else signal.addEventListener?.("abort", () => handle.cancel(), { once: true });
    }
  }

  const body = { action, variables };
  if (provider?.id) body.providerId = provider.id;
  if (model) body.model = model;

  try {
    const res = await fetch(serverUrl("/v1/ai/run"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: effectiveSignal,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`AI feature ${action} failed: ${res.status} ${text || res.statusText}`);
    }
    const json = await res.json();
    if (handle) handle.finish({ model: json.model });
    return { content: json.content || "", model: json.model || "" };
  } catch (err) {
    const wrapped = friendlyAiError(err, provider || null);
    if (handle) handle.fail(wrapped);
    throw wrapped;
  }
}

// Streaming counterpart — POSTs /v1/ai/stream and consumes the SSE frames the
// server emits (`{delta}` per chunk, a final `{done, promptTokens,
// completionTokens}`, then `[DONE]`). For the interactive features (writerAI /
// chat / rag) that show live tokens. Same task-panel + error wrapping; the
// SERVER records usage (host-sink) so this doesn't. Returns { content, usage }.
// `onDelta(delta, content)` fires per chunk.
export async function runAiFeatureStream({ action, feature, variables = {}, history, provider, model, temperature, system, userTemplate, think, maxTokens, signal, onDelta, meta, task } = {}) {
  let handle = null;
  let effectiveSignal = signal;
  let effectiveOnDelta = onDelta;
  if (task) {
    const tasks = useAiTasksStore();
    const opts = (typeof task === "object" && task) || {};
    handle = tasks.start({ feature: feature || action, label: opts.label || action, meta: opts.meta || meta || {} });
    effectiveSignal = handle.signal;
    if (signal) {
      if (signal.aborted) handle.cancel();
      else signal.addEventListener?.("abort", () => handle.cancel(), { once: true });
    }
    const callerOnDelta = onDelta;
    effectiveOnDelta = (delta, content) => {
      handle.onDelta(delta, content);
      if (callerOnDelta) callerOnDelta(delta, content);
    };
  }

  const body = { action, variables };
  if (provider?.id) body.providerId = provider.id;
  if (model) body.model = model;
  if (typeof temperature === "number") body.temperature = temperature;
  if (Array.isArray(history) && history.length) body.history = history;
  // In-editor candidate overrides (the Lab test panel streams the draft prompt,
  // not just the live one) — forwarded to /v1/ai/stream's RunRequest.
  if (system != null) body.system = system;
  if (userTemplate != null) body.userTemplate = userTemplate;
  if (typeof think === "boolean") body.think = think;
  if (maxTokens) body.maxTokens = maxTokens;

  let content = "";
  let usage = null;
  try {
    const res = await fetch(serverUrl("/v1/ai/stream"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: effectiveSignal,
      body: JSON.stringify(body),
    });
    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => "");
      throw new Error(`AI stream ${action} failed: ${res.status} ${text || res.statusText}`);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let sep;
      // biome-ignore lint/suspicious/noAssignInExpressions: SSE frame loop.
      while ((sep = buffer.indexOf("\n\n")) !== -1) {
        const frame = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        for (const line of frame.split("\n")) {
          const t = line.trim();
          if (!t.startsWith("data:")) continue;
          const payload = t.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          let json;
          try { json = JSON.parse(payload); } catch { continue; }
          if (json.error) throw new Error(json.error);
          if (json.delta) {
            content += json.delta;
            if (effectiveOnDelta) effectiveOnDelta(json.delta, content);
          }
          if (json.done) usage = { prompt_tokens: json.promptTokens || 0, completion_tokens: json.completionTokens || 0 };
        }
      }
    }
    if (handle) handle.finish({ usage, model });
    return { content, model: model || "", usage };
  } catch (err) {
    const wrapped = friendlyAiError(err, provider || null);
    if (handle) handle.fail(wrapped);
    throw wrapped;
  }
}
