// OpenAI-compatible client.
//
// Works with any service that implements the OpenAI HTTP API shape — OpenAI
// itself (cloud) or any local server that speaks /v1/chat/completions and/or
// /v1/audio/speech (Ollama, LM Studio, llama.cpp, vLLM, Kokoro-FastAPI,
// etc.).
//
// Constructor takes a provider object: { baseUrl, apiKey?, chatModel?, ttsModel? }.
// All methods accept overrides per call.

// All fetches use the global `fetch`. Inside Tauri, `tauri-bridge.js`
// has replaced `window.fetch` with a routing wrapper that sends external
// http(s) requests through the Tauri http plugin (no browser CORS, no
// COEP gating). In a plain browser tab (`npm run dev:vite`) the native
// fetch is used — local providers need to allow CORS on their end there.

// Detects which LLM runner is behind a provider's baseUrl. Drives the
// /v1/chat/completions vs /api/chat split in chat()/chatStream(). The
// explicit `provider.runner` override always wins; otherwise we fall back
// to a URL heuristic. Only Ollama needs special routing today because it
// is the only runner with a native disable for thinking-mode reasoning
// (`think: false` on /api/chat, silently ignored on /v1/chat/completions).
// LM Studio, llama.cpp, vLLM, OpenAI/Claude/Gemini all stay on the
// OpenAI-compat path — `think` has no effect there, but it's a safe
// no-op per the OpenAI spec (unknown body params are ignored).
export function detectRunner(provider) {
  if (provider?.runner) return provider.runner;
  const url = (provider?.baseUrl || "").toLowerCase();
  if (/:11434(\/|$)/.test(url) || /\bollama\b/.test(url)) return "ollama";
  return "openai-compat";
}

export class OpenAICompatClient {
  constructor(provider) {
    this.provider = provider;
  }

  get headers() {
    const h = { "Content-Type": "application/json" };
    if (this.provider.apiKey) {
      h["Authorization"] = `Bearer ${this.provider.apiKey}`;
    }
    return h;
  }

  // Auth-only headers for GET requests — Content-Type on a body-less
  // request is meaningless and some servers (and HTTP clients) misbehave
  // when they see it without a body.
  get authHeaders() {
    return this.provider.apiKey
      ? { Authorization: `Bearer ${this.provider.apiKey}` }
      : {};
  }

  url(path) {
    const base = this.provider.baseUrl.replace(/\/$/, "");
    return `${base}${path.startsWith("/") ? path : "/" + path}`;
  }

  // For non-OpenAI-spec endpoints living *next to* /v1 on the same host
  // (e.g. LM Studio's /api/v0/models native API). Strips a trailing
  // "/v1" off the configured baseUrl so the path lands at the host root,
  // not at /v1/api/v0/models.
  nativeUrl(path) {
    const base = this.provider.baseUrl.replace(/\/v1\/?$/, "").replace(/\/$/, "");
    return `${base}${path.startsWith("/") ? path : "/" + path}`;
  }

  // ─── Note on Ollama reasoning models ────────────────────────────────
  //
  // Ollama hosts reasoning models (Qwen3.5, DeepSeek-R1, …) that emit
  // reasoning by default. The reliable way to disable thinking is Ollama's
  // native `think: false` top-level body param. Empirically this is only
  // honored on /api/chat — /v1/chat/completions silently ignores it and
  // moves reasoning into a separate `message.reasoning` field, which makes
  // SSE streams stall (we only consume delta.content) until reasoning is
  // done. So when `detectRunner(provider) === "ollama"`, chat()/chatStream()
  // route to /api/chat instead. For every other runner the OpenAI-compat
  // path is unchanged — `think` in `extra` is spread into the body and
  // ignored by spec.
  //
  // We do NOT auto-inject `think: false` anywhere — thinking is task-
  // dependent:
  //   • Structured-JSON tasks (speaker attribution, smart-cast, scene
  //     parsing, anything parsed as JSON downstream) → callers pass
  //     `extra: { think: false }` to keep reasoning out of the body.
  //   • Creative/reasoning tasks (brainstorming, plot suggestions, arc
  //     analysis, freeform writing assistance) → omit it and let the model
  //     think; reasoning improves output quality.

  // Wrap any fetch with a hard timeout so a hung transport can't pin a
  // "Loading…" state forever. We race the fetch against a timeout promise
  // rather than relying on AbortController alone, because Tauri's http
  // plugin can't cancel an invoke mid-flight — only between awaits — so
  // a hung invoke would keep the await blocked past our deadline.
  // Caller's `signal` (if any) is honored too — whichever fires first wins.
  async _fetchWithTimeout(url, init, { timeoutMs = 15000, signal } = {}) {
    const ctl = new AbortController();
    const onAbort = () => ctl.abort();
    if (signal) {
      if (signal.aborted) ctl.abort();
      else signal.addEventListener("abort", onAbort);
    }
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        ctl.abort();
        reject(new Error(`Timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });
    try {
      return await Promise.race([
        fetch(url, { ...init, signal: ctl.signal }),
        timeout,
      ]);
    } finally {
      clearTimeout(timer);
      if (signal) signal.removeEventListener("abort", onAbort);
    }
  }

  // ─── Chat / completion ──────────────────────────────────────────────────
  //
  // POST /v1/chat/completions (or Ollama /api/chat for runner=ollama).
  // Returns: assistant message content (string).
  //
  async chat({ messages, model, temperature = 0.3, signal, extra } = {}) {
    if (detectRunner(this.provider) === "ollama") {
      return this._ollamaChat({ messages, model, temperature, signal, extra });
    }
    const res = await fetch(this.url("/chat/completions"), {
      method: "POST",
      headers: this.headers,
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
  // POST /v1/chat/completions with stream:true (or Ollama /api/chat with
  // NDJSON, for runner=ollama). Async generator yielding
  // { delta, content, usage? } per chunk:
  //   delta   — new text in this chunk (string, possibly empty)
  //   content — full accumulated assistant text so far
  //   usage   — present on the final chunk if the server reports it
  //             (OpenAI honors stream_options.include_usage; Ollama
  //             reports counts on the final done:true frame)
  // Extra body fields can be passed via `extra` (e.g. response_format,
  // think). The Ollama path lifts `extra.think` to a top-level field.
  //
  async *chatStream({ messages, model, temperature = 0.3, signal, extra } = {}) {
    if (detectRunner(this.provider) === "ollama") {
      yield* this._ollamaChatStream({ messages, model, temperature, signal, extra });
      return;
    }
    const body = {
      model: model || this.provider.chatModel,
      messages,
      temperature,
      stream: true,
      stream_options: { include_usage: true },
      ...(extra || {}),
    };
    const res = await fetch(this.url("/chat/completions"), {
      method: "POST",
      headers: this.headers,
      signal,
      body: JSON.stringify(body),
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

  // ─── Ollama-native chat (non-streaming) ─────────────────────────────────
  //
  // POST /api/chat with stream:false. Same return type as chat() — a
  // string with the assistant content. `extra.think` is lifted to a
  // top-level field where Ollama honors it; `extra.options` (if any) is
  // merged into the native `options` object alongside temperature.
  //
  async _ollamaChat({ messages, model, temperature, signal, extra } = {}) {
    const { body } = this._buildOllamaBody({ messages, model, temperature, extra, stream: false });
    const res = await fetch(this.nativeUrl("/api/chat"), {
      method: "POST",
      headers: this.headers,
      signal,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Ollama chat error ${res.status}: ${text || res.statusText}`);
    }
    const json = await res.json();
    return json?.message?.content ?? "";
  }

  // ─── Ollama-native streaming chat ───────────────────────────────────────
  //
  // POST /api/chat with stream:true. Ollama streams NDJSON (one JSON
  // object per line), not SSE — so the parse loop splits on "\n" rather
  // than "\n\n" + "data:" prefix. Each chunk shape:
  //   { message: { role, content }, done: false }                  (mid-stream)
  //   { done: true, prompt_eval_count, eval_count, total_duration } (final)
  // Translated to the OpenAI-style { delta, content, usage } contract so
  // callers don't special-case.
  //
  async *_ollamaChatStream({ messages, model, temperature, signal, extra } = {}) {
    const { body } = this._buildOllamaBody({ messages, model, temperature, extra, stream: true });
    const res = await fetch(this.nativeUrl("/api/chat"), {
      method: "POST",
      headers: this.headers,
      signal,
      body: JSON.stringify(body),
    });
    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => "");
      throw new Error(`Ollama chat stream error ${res.status}: ${text || res.statusText}`);
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

        let nl;
        while ((nl = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (!line) continue;
          let json;
          try { json = JSON.parse(line); } catch { continue; }
          const delta = json?.message?.content || "";
          if (delta) content += delta;
          let usage;
          if (json?.done && (json.prompt_eval_count != null || json.eval_count != null)) {
            const pt = json.prompt_eval_count ?? 0;
            const ct = json.eval_count ?? 0;
            usage = { prompt_tokens: pt, completion_tokens: ct, total_tokens: pt + ct };
          }
          if (delta || usage) yield { delta, content, usage };
        }
      }
    } finally {
      try { reader.releaseLock(); } catch {}
    }
  }

  // Build the body for an Ollama /api/chat request. Generation knobs
  // (temperature plus anything in extra.options) live inside `options`;
  // top-level fields like `think` are first-class on the native endpoint.
  // Any unrecognized keys in extra are spread top-level too so future
  // Ollama params (format, keep_alive, …) work without code changes.
  //
  // `num_ctx` defaults to 8192 — Ollama's runtime default is 4096
  // regardless of model capability, which silently truncates the prompt
  // server-side on long chapters (caught when Mistral-Small:24b only saw
  // 10/12 dialogue tags from a Halvard/Elen ch6 run). 8K fits a typical
  // chapter + system prompt + cast list with headroom. Callers can
  // override via `extra.options.num_ctx`.
  _buildOllamaBody({ messages, model, temperature, extra, stream }) {
    const { think, options: extraOptions, ...rest } = extra || {};
    const body = {
      model: model || this.provider.chatModel,
      messages,
      stream,
      options: { num_ctx: 8192, temperature, ...(extraOptions || {}) },
      ...rest,
    };
    if (think !== undefined) body.think = think;
    return { body };
  }

  // ─── List models — enriched ────────────────────────────────────────────
  //
  // Tries LM Studio's /api/v0/models (Beta REST API) first, which returns
  // per-model `quantization`, `state` ("loaded" / "not-loaded"), `type`
  // ("llm" / "embedding" / "vlm" / …), and other fields the OpenAI-spec
  // /v1/models hides. Falls back to /v1/models for any other server.
  //
  // Returns: [{ id, quant, state, type, publisher, arch }] — fields are
  // null when the source didn't provide them. Embeddings / STT / TTS are
  // filtered out since this powers the chat-model dropdowns.
  //
  async enrichedModels({ signal, timeoutMs = 15000 } = {}) {
    // Path 1 — LM Studio /api/v1/models (current Beta REST). Returns a
    // `models` array; each model has a `variants` array of quant names
    // and a `selected_variant` showing which is currently loaded. We
    // expand variants so each quant on disk gets its own dropdown row.
    try {
      const res = await this._fetchWithTimeout(
        this.nativeUrl("/api/v1/models"),
        { headers: this.authHeaders },
        { signal, timeoutMs },
      );
      if (res.ok) {
        const json = await res.json();
        const arr = Array.isArray(json?.models) ? json.models
                  : Array.isArray(json?.data) ? json.data : [];
        const out = [];
        for (const m of arr) {
          // LM Studio types: "llm", "vlm", "embedding", "stt", "tts".
          if (m.type && m.type !== "llm" && m.type !== "vlm") continue;
          const id = m.key || m.id;
          if (!id) continue;
          // Prefer the per-model variants array (one entry per quant on
          // disk). Fall back to a single entry using top-level quant info
          // when variants aren't reported.
          const variants = Array.isArray(m.variants) && m.variants.length
            ? m.variants
            : [m.quantization?.name || m.quantization || null];
          const selected = m.selected_variant || null;
          for (const v of variants) {
            const quant = typeof v === "string" ? v : (v?.name || null);
            out.push({
              id,
              variant: quant,
              quant,
              state: quant && selected && quant === selected ? "loaded" : "not-loaded",
              type: m.type || null,
              publisher: m.publisher || null,
              arch: m.architecture || m.arch || null,
            });
          }
        }
        if (out.length) return out;
        // Empty payload — fall through to older APIs.
      }
    } catch {
      // /api/v1/models unavailable — fall through to /api/v0/models.
    }

    // Path 2 — LM Studio /api/v0/models (older Beta API). Returns one
    // entry per model with a single `quantization` string. No variants
    // array, so we can't enumerate alternate quants this way — kept as
    // a fallback for LM Studio installs that haven't been upgraded.
    try {
      const res = await this._fetchWithTimeout(
        this.nativeUrl("/api/v0/models"),
        { headers: this.authHeaders },
        { signal, timeoutMs },
      );
      if (res.ok) {
        const json = await res.json();
        const arr = Array.isArray(json?.data) ? json.data : [];
        return arr
          .filter((m) => !m.type || m.type === "llm" || m.type === "vlm")
          .map((m) => ({
            id: m.id,
            variant: m.quantization || null,
            quant: m.quantization || null,
            state: m.state || null,
            type: m.type || null,
            publisher: m.publisher || null,
            arch: m.arch || null,
          }));
      }
    } catch {
      // fall through
    }

    // Path 3 — generic OpenAI-spec fallback. Quant is unknown from the
    // server side; ModelPicker will try to parse one from the id (Ollama
    // tags include it; cloud models don't).
    const ids = await this.models({ signal, timeoutMs });
    if (ids.length) {
      return ids
        .filter((id) => !/embed|embedding|whisper|tts/i.test(id))
        .map((id) => ({ id, variant: null, quant: null, state: null, type: null, publisher: null, arch: null }));
    }

    // Path 4 — Ollama /api/tags fallback. Some Ollama builds return an
    // empty /v1/models even when models are installed (the OpenAI-compat
    // path and the native registry can drift — `ollama list` and the GUI
    // use /api/tags, which stays correct). Try it before reporting empty.
    let tagsDiag = null;
    try {
      const res = await this._fetchWithTimeout(
        this.nativeUrl("/api/tags"),
        { headers: this.authHeaders },
        { signal, timeoutMs },
      );
      if (res.ok) {
        const json = await res.json();
        const arr = Array.isArray(json?.models) ? json.models : [];
        const mapped = arr
          .map((m) => {
            const id = m?.model || m?.name;
            if (!id) return null;
            const quant = m?.details?.quantization_level || null;
            return { id, variant: quant, quant, state: null, type: null,
                     publisher: null, arch: m?.details?.family || null };
          })
          .filter(Boolean)
          .filter((e) => !/embed|embedding|whisper|tts/i.test(e.id));
        if (mapped.length) return mapped;
        tagsDiag = `/api/tags returned ${arr.length} entr${arr.length === 1 ? "y" : "ies"} (after filtering: 0).`;
      } else {
        tagsDiag = `/api/tags fallback returned ${res.status} ${res.statusText}.`;
      }
    } catch (e) {
      tagsDiag = `/api/tags fallback unreachable: ${e?.message || e}`;
    }
    // Surface the diagnostic so the user can see whether /v1/models is
    // just broken on their server, or /api/tags is empty too (= the
    // server genuinely has no models installed for this instance).
    throw new Error(`Server returned 0 models from /v1/models. ${tagsDiag}`);
  }

  // ─── List models ────────────────────────────────────────────────────────
  //
  // GET /v1/models
  // Used to populate model dropdowns in Settings.
  //
  async models({ signal, timeoutMs = 15000 } = {}) {
    let res;
    try {
      res = await this._fetchWithTimeout(
        this.url("/models"),
        { headers: this.authHeaders },
        { signal, timeoutMs },
      );
    } catch (e) {
      // Network-level failure (DNS, refused, CORS in browser-only mode, our
      // own timeout, …). Bubble it up so Settings can show what actually
      // went wrong instead of a misleading "empty list" message.
      const msg = e?.message || String(e);
      if (/abort/i.test(msg)) {
        throw new Error(`Request timed out after ${timeoutMs}ms. Is the Base URL correct and the server running?`);
      }
      throw new Error(msg || "Could not reach the server. Is the Base URL correct and the server running?");
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`GET /models failed: ${res.status} ${text || res.statusText}`);
    }
    const json = await res.json();
    const list = json?.data || json?.models || [];
    return list.map((m) => m?.id || m?.name || String(m)).filter(Boolean);
  }

  // ─── Text-to-speech ─────────────────────────────────────────────────────
  //
  // POST /v1/audio/speech
  // body: { model, voice, input, response_format, speed, ...providerParams }
  //
  // `provider.params` holds engine-specific knobs configured in Settings
  // (OpenAI `instructions`, and whatever a local TTS server exposes). They are
  // spread into the body so each engine receives what it expects; the
  // core OpenAI fields override any conflicting keys.
  //
  // Returns an audio Blob (mp3 by default).
  //
  async speech({ input, voice, model, format, speed, signal } = {}) {
    const providerParams = this.provider.params || {};
    const body = {
      ...providerParams,
      model: model || this.provider.ttsModel || "tts-1",
      voice,
      input,
      response_format: format ?? providerParams.response_format ?? "mp3",
      speed: speed ?? providerParams.speed ?? 1.0,
    };
    const res = await fetch(this.url("/audio/speech"), {
      method: "POST",
      headers: this.headers,
      signal,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`TTS error ${res.status}: ${text || res.statusText}`);
    }
    return res.blob();
  }

  // ─── List voices ────────────────────────────────────────────────────────
  //
  // GET /v1/audio/voices — only some services implement this. For services
  // without it we fall back to the provider's `ttsVoices` override.
  //
  async voices({ signal, timeoutMs = 15000 } = {}) {
    if (this.provider.ttsVoices?.length) {
      return this.provider.ttsVoices.map((v) =>
        typeof v === "string" ? { id: v, name: v } : v,
      );
    }
    try {
      const res = await this._fetchWithTimeout(
        this.url("/audio/voices"),
        { headers: this.authHeaders },
        { signal, timeoutMs },
      );
      if (!res.ok) return [];
      const json = await res.json();
      // Accept three response shapes:
      //   { data: [...] } — OpenAI canonical
      //   { voices: [...] } — devnen's Chatterbox-TTS-Server and similar
      //   [...] — bare array (some Kokoro builds)
      // Items can be objects with id/name fields, or bare strings (filenames).
      const list = Array.isArray(json) ? json : (json?.data || json?.voices || []);
      return list.map((v) => {
        if (typeof v === "string") {
          // Filename-style entry — keep the filename as id (the server resolves
          // voices by it) and strip the extension for the display name.
          return { id: v, name: v.replace(/\.[^.]+$/, "") };
        }
        return {
          id: v?.id || v?.name,
          name: v?.name || v?.id,
          gender: v?.gender,
          age: v?.age,
          accent: v?.accent,
          tone: v?.tone || v?.description,
        };
      }).filter((v) => v.id);
    } catch {
      return [];
    }
  }

  // ─── Health check ───────────────────────────────────────────────────────
  //
  // Pings an endpoint that should exist for this provider's kind, with a
  // short timeout. TTS-only servers (e.g. devnen's Chatterbox-TTS-Server)
  // don't implement /v1/models, so we hit /v1/audio/voices instead.
  // Returns true/false.
  async ping({ timeoutMs = 2500 } = {}) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeoutMs);
    const path = this.provider.kind === "tts" ? "/audio/voices" : "/models";
    try {
      const res = await fetch(this.url(path), { headers: this.authHeaders, signal: ctl.signal });
      return res.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(t);
    }
  }
}
