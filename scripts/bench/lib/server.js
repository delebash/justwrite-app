// REST client for the JustWrite server (which mounts the shared just-llm-runner
// dispatch). Every route here was read from the runner source, not guessed:
//
//   /v1/ai/engine-presets            presets_api.py:132-155   (POST mints the id)
//   /v1/ai/preset-assignments        presets_api.py:178-194
//   /v1/ai/resolved-route            prompts.py:598
//   /v1/llm-runner/load|stop|status  runner/api.py:175,259,224
//   /v1/llm-runner/download          runner/api.py:201 (+ /download/status :211)
//   /v1/llm-runner/measure           runner/api.py:350
//   /v1/llm-runner/engine/status     runner/api.py:272

import { sleep } from "../../lib/smoke-common.js";

export class ServerError extends Error {
  constructor(method, path, status, body) {
    super(`${method} ${path} → HTTP ${status}: ${String(body).slice(0, 300)}`);
    this.status = status;
  }
}

export function makeClient(base = process.env.JW_SERVER || "http://127.0.0.1:17495") {
  async function call(method, path, body) {
    const res = await fetch(`${base}${path}`, {
      method,
      ...(body === undefined
        ? {}
        : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    });
    const text = await res.text();
    if (!res.ok) throw new ServerError(method, path, res.status, text);
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  const api = {
    base,
    get: (p) => call("GET", p),
    post: (p, b) => call("POST", p, b),
    put: (p, b) => call("PUT", p, b),

    // ── presets + assignments ───────────────────────────────────────────────
    listPresets: () => call("GET", "/v1/ai/engine-presets"),
    createPreset: (row) => call("POST", "/v1/ai/engine-presets", row),
    updatePreset: (id, row) => call("PUT", `/v1/ai/engine-presets/${encodeURIComponent(id)}`, row),
    getAssignments: () => call("GET", "/v1/ai/preset-assignments"),
    setFeaturePreset: (featureKey, presetId) =>
      call("PUT", "/v1/ai/preset-assignments/feature", { featureKey, presetId }),

    /**
     * The Bench preset row, found BY NAME (POST /engine-presets assigns its own
     * random id — presets_api.py:140 — so a fixed id can't be created), then
     * updated in place with this leg's tunables. Persisting between runs is
     * deliberate: the user asked to see it in the GUI.
     */
    async ensureBenchPreset(name, tunables) {
      const row = {
        name,
        providerId: tunables.providerId || "",
        model: tunables.model || "",
        temperature: tunables.temperature ?? null,
        topP: tunables.topP ?? null,
        maxTokens: Number(tunables.maxTokens) > 0 ? Number(tunables.maxTokens) : 0,
        reasoningEffort: tunables.reasoningEffort || "",
        think: !!tunables.think,
        samplers: (tunables.samplers || []).map((s) => ({
          flagName: String(s.flagName || ""),
          flagValue: String(s.flagValue ?? ""),
        })),
      };
      const before = await api.listPresets();
      const existing = (before?.presets || []).find((p) => p.name === name);
      // `presetName` is a config knob, so a typo could name a SEEDED preset
      // ("Grounded chat") — overwriting one would silently retune the app's real
      // routing with no restore path. Refuse instead.
      if (existing?.builtIn) {
        throw new Error(
          `refusing to overwrite the built-in preset ${JSON.stringify(name)} — ` +
          "choose a different \"presetName\" in the config",
        );
      }
      const after = existing
        ? await api.updatePreset(existing.id, { ...row, id: existing.id })
        : await api.createPreset(row);
      const saved = (after?.presets || []).find((p) => p.name === name);
      if (!saved) throw new Error(`Bench preset ${JSON.stringify(name)} was not saved`);
      return saved;
    },

    resolvedRoute: (feature, action) =>
      call("GET", `/v1/ai/resolved-route?feature=${encodeURIComponent(feature)}${action ? `&action=${encodeURIComponent(action)}` : ""}`),

    // ── the local runner ────────────────────────────────────────────────────
    engineStatus: () => call("GET", "/v1/llm-runner/engine/status"),
    // Single-model back-compat view: {status, modelId, url, detail, error,
    // downloaded, total} (lifecycle._idle / .status).
    runnerStatus: () => call("GET", "/v1/llm-runner/status"),
    // The LIVE resident set: {router, modelsMax, vramTotalMb, committedMb,
    // remainingMb, models:[{id, status, nParams, sizeBytes, nCtx, vramMb}]}
    // (RunnerResidentResponse, schema.py:187-215). This — not /status — is the
    // authority on "is MY model up".
    resident: () => call("GET", "/v1/llm-runner/resident"),
    stop: (modelId) => call("POST", "/v1/llm-runner/stop", modelId ? { modelId } : {}),
    load: (body) => call("POST", "/v1/llm-runner/load", body),
    // NOTE: /measure takes QUERY params, not a JSON body (api.py:350-354).
    measure: ({ prompt, maxTokens } = {}) => {
      const q = new URLSearchParams();
      if (prompt) q.set("prompt", prompt);
      if (Number(maxTokens) > 0) q.set("max_tokens", String(Number(maxTokens)));
      const qs = q.toString();
      return call("POST", `/v1/llm-runner/measure${qs ? `?${qs}` : ""}`);
    },
    // No download call here on purpose: POST /load is documented as
    // "Download (if needed) + spawn a model" (api.py:175), so a leg whose
    // weights are missing fetches them as part of its load. The separate
    // /download endpoint is download-WITHOUT-spawn, which the bench never wants.

    /** Poll `/resident` until this model reports loaded (or sleeping — it wakes
     *  on demand), or the deadline passes. `failed` short-circuits. */
    async waitLoaded(modelId, { timeoutMs = 900000, intervalMs = 2000, onTick } = {}) {
      const t0 = Date.now();
      let last = null;
      while (Date.now() - t0 < timeoutMs) {
        last = await api.resident().catch((e) => ({ error: String(e.message || e) }));
        const mine = (last?.models || []).find((m) => m?.id === modelId);
        const state = String(mine?.status || "");
        if (/^(loaded|sleeping)$/i.test(state)) {
          return { ok: true, waitedMs: Date.now() - t0, model: mine, resident: last };
        }
        if (/^(failed|unloaded)$/i.test(state)) {
          const detail = await api.runnerStatus().catch(() => null);
          return {
            ok: false, waitedMs: Date.now() - t0, resident: last,
            error: detail?.error || detail?.detail || `router reported ${state}`,
          };
        }
        onTick?.(last);
        await sleep(intervalMs);
      }
      return { ok: false, waitedMs: Date.now() - t0, resident: last, error: "timed out waiting for the model to load" };
    },

  };

  return api;
}
