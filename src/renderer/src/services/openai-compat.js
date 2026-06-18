// LLM client — thin front-end to the JustWrite server's gateway.
//
// The SERVER is the LLM client (see docs/plans/2026-06-18-server-side-llm-
// architecture.md). This class no longer calls providers directly: every method
// hits `/v1/llm/{providerId}/…` on the JW server, which looks the provider up in
// its table, injects the server-held API key, applies any provider-specific
// quirks (Ollama /api/chat + think:false, model enrichment), and streams the
// response straight back. So the client holds no keys, speaks one shape
// (OpenAI), and a thin phone client works identically.
//
// Constructor takes a provider object; only `provider.id` is used for routing
// (plus `chatModel` / `embeddingModel` as per-call defaults). baseUrl/apiKey
// live on the server now.

import { serverUrl } from "./serverApi.js";

// URL-runner heuristic, kept for the Settings editor's "API format" hint (pure
// UI — no network). The gateway does its own server-side detection for routing;
// this just mirrors it so the editor can show the auto-detected value.
export function detectRunner(provider) {
  if (provider?.runner) return provider.runner;
  const url = (provider?.baseUrl || "").toLowerCase();
  if (/:11434(\/|$)/.test(url) || /\bollama\b/.test(url)) return "ollama";
  return "openai-compat";
}

// Fetch a model list for an UNSAVED provider draft (Settings → provider editor
// "Fetch models"). The draft has no server row to resolve by id, so its config
// rides in the POST body to the gateway's ad-hoc probe — keeping the key
// server-bound and the client off direct provider calls.
//   kind: "chat" strips embedding/whisper/tts ids; "all" returns everything.
export async function probeModels(draft, { kind = "chat", signal, timeoutMs = 20000 } = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  if (signal) signal.addEventListener?.("abort", () => ctl.abort(), { once: true });
  try {
    const res = await fetch(serverUrl("/v1/llm/probe/models"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: ctl.signal,
      body: JSON.stringify({
        baseUrl: draft?.baseUrl, apiKey: draft?.apiKey, runner: draft?.runner, kind,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Fetch models failed: ${res.status} ${text || res.statusText}`);
    }
    const json = await res.json();
    return Array.isArray(json?.models) ? json.models : [];
  } finally {
    clearTimeout(t);
  }
}

export class OpenAICompatClient {
  constructor(provider) {
    this.provider = provider;
  }

  // Gateway URL for this provider + suffix. All calls are same-server (the JW
  // server), so no Authorization — the gateway injects the server-held key.
  _gw(suffix) {
    const id = encodeURIComponent(this.provider?.id || "");
    return serverUrl(`/v1/llm/${id}/${suffix}`);
  }

  // ─── Chat / completion ──────────────────────────────────────────────────
  //
  // POST /v1/llm/{id}/chat/completions (stream:false). Returns the assistant
  // message content (string). `extra` (e.g. think, response_format) rides in
  // the body; the gateway lifts think:false for Ollama providers.
  async chat({ messages, model, temperature = 0.3, signal, extra } = {}) {
    const res = await fetch(this._gw("chat/completions"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({
        model: model || this.provider.chatModel,
        messages,
        temperature,
        stream: false,
        ...(extra || {}),
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Chat error ${res.status}: ${text || res.statusText}`);
    }
    const json = await res.json();
    return json?.choices?.[0]?.message?.content ?? "";
  }

  // ─── Streaming chat ─────────────────────────────────────────────────────
  //
  // POST /v1/llm/{id}/chat/completions with stream:true. The gateway always
  // emits OpenAI-style SSE (it normalizes Ollama's NDJSON), so there's a single
  // parser here. Async generator yielding { delta, content, usage? } per chunk:
  //   delta   — new text in this chunk
  //   content — full accumulated text so far
  //   usage   — present on the final chunk when the server reports it
  async *chatStream({ messages, model, temperature = 0.3, signal, extra } = {}) {
    const res = await fetch(this._gw("chat/completions"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({
        model: model || this.provider.chatModel,
        messages,
        temperature,
        stream: true,
        stream_options: { include_usage: true },
        ...(extra || {}),
      }),
    });
    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => "");
      throw new Error(`Chat stream error ${res.status}: ${text || res.statusText}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let content = "";

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // SSE frames are separated by blank lines; each frame is one or more
        // `data: <json>` lines (or `data: [DONE]`).
        let sep;
        // biome-ignore lint/suspicious/noAssignInExpressions: SSE frame loop — drain buffer one delimiter at a time.
        while ((sep = buffer.indexOf("\n\n")) !== -1) {
          const frame = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);
          for (const line of frame.split("\n")) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            const payload = trimmed.slice(5).trim();
            if (!payload || payload === "[DONE]") continue;
            let json;
            try { json = JSON.parse(payload); } catch { continue; }
            // Surface a proxied upstream error rather than ending silently.
            if (json?.error) throw new Error(json.error.message || "Upstream LLM error");
            const delta = json?.choices?.[0]?.delta?.content || "";
            if (delta) content += delta;
            const usage = json?.usage || undefined;
            if (delta || usage) yield { delta, content, usage };
          }
        }
      }
    } finally {
      try { reader.releaseLock(); } catch {}
    }
  }

  // ─── Embeddings ─────────────────────────────────────────────────────────
  //
  // POST /v1/llm/{id}/embeddings. Accepts a string or string[]; the gateway
  // normalizes provider quirks (Ollama /api/embed) to the OpenAI
  // { data: [{ embedding }] } shape. Returns Array<number[]> in input order.
  async embed({ input, model, signal } = {}) {
    if (input == null) throw new Error("embed: input is required.");
    const arr = Array.isArray(input) ? input : [input];
    if (!arr.length) return [];
    const res = await fetch(this._gw("embeddings"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({ model: model || this.provider.embeddingModel || "", input: arr }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Embeddings error ${res.status}: ${text || res.statusText}`);
    }
    const json = await res.json();
    const data = Array.isArray(json?.data) ? json.data : [];
    return data.map((d) => d?.embedding).filter(Array.isArray);
  }

  // ─── List models — enriched ────────────────────────────────────────────
  //
  // GET /v1/llm/{id}/models. The gateway does the multi-endpoint probe
  // server-side (LM Studio quant/state, OpenAI /v1/models, Ollama /api/tags)
  // and returns [{ id, variant, quant, state, type, publisher, arch }].
  //   kind: "chat" (default) strips embedding/whisper/tts ids; "all" keeps them.
  async enrichedModels({ signal, timeoutMs = 20000, kind = "chat" } = {}) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeoutMs);
    if (signal) signal.addEventListener?.("abort", () => ctl.abort(), { once: true });
    try {
      const res = await fetch(this._gw(`models?kind=${encodeURIComponent(kind)}`), { signal: ctl.signal });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Fetch models failed: ${res.status} ${text || res.statusText}`);
      }
      const json = await res.json();
      return Array.isArray(json?.models) ? json.models : [];
    } finally {
      clearTimeout(t);
    }
  }

  // Bare model-id list (a thin wrapper over enrichedModels for callers that
  // only need ids).
  async models({ signal, timeoutMs = 20000 } = {}) {
    const list = await this.enrichedModels({ signal, timeoutMs, kind: "all" });
    return list.map((m) => m?.id).filter(Boolean);
  }

  // ─── Health check ───────────────────────────────────────────────────────
  //
  // GET /v1/llm/{id}/ping — the gateway does one quick upstream probe and
  // returns { ok }. Reflects PROVIDER reachability, not just the gateway's.
  async ping({ timeoutMs = 6000 } = {}) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const res = await fetch(this._gw("ping"), { signal: ctl.signal });
      if (!res.ok) return false;
      const json = await res.json().catch(() => null);
      return !!json?.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(t);
    }
  }
}
