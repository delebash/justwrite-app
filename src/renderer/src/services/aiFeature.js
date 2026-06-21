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
