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

// Speechmatics TTS uses a proprietary endpoint shape (voice in URL path,
// { text } body, no model selector). Detected by hostname so the public
// speech()/voices()/ping() APIs can branch without callers caring.
export function isSpeechmatics(provider) {
  return /\.speechmatics\.com(\/|$)/i.test(provider?.baseUrl || "");
}

// devnen/Dia-TTS-Server. /v1/audio/speech is OpenAI-shaped, but voice
// listing lives behind two non-standard routes
// (/get_predefined_voices, /get_reference_files) at the server root —
// not under /v1. Detected by the seeded provider id rather than the
// host so a writer who runs Dia on a non-default port still wires up
// correctly.
export function isDia(provider) {
  return provider?.id === "dia";
}

// devnen/Chatterbox-TTS-Server. Its /v1/audio/speech is a thin OpenAI
// compatibility layer — only model/voice/input/response_format/speed,
// no exaggeration/cfg_weight/temperature. The richer engine lives at
// the root /tts route, with /get_predefined_voices + /get_reference_files
// for voice discovery and /save_settings + /restart_server for hot-
// swapping the active model. We route every TTS call through /tts so
// the engine knobs in providerParams.js → chatterbox actually reach the
// model, and merge predefined + clone voices in voices().
export function isChatterbox(provider) {
  return provider?.id === "chatterbox";
}

// Chatterbox engine knobs that map 1:1 onto /tts body fields. Listed
// here (not just in providerParams.js) so _chatterboxSpeech can spread
// only the fields it understands and ignore anything else.
const CHATTERBOX_TTS_KNOBS = [
  "temperature", "exaggeration", "cfg_weight",
  "speed_factor", "language", "chunk_size", "seed",
];

// The three repo_ids accepted by Chatterbox's model.repo_id config field.
// /v1/models doesn't exist on this server, so the dropdown is hard-coded.
// Confirmed against devnen/Chatterbox-TTS-Server v2.0.x (full Chatterbox
// family — original + multilingual + turbo, all hot-swappable).
export const CHATTERBOX_MODELS = [
  { id: "chatterbox",              label: "Base",          hint: "0.5B, English, exaggeration + cfg_weight emotion knobs" },
  { id: "chatterbox-turbo",        label: "Turbo",         hint: "350M, fastest, supports paralinguistic tags like [laugh]" },
  { id: "chatterbox-multilingual", label: "Multilingual",  hint: "0.5B, 23 languages, voice cloning + emotion" },
];

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
        // biome-ignore lint/suspicious/noAssignInExpressions: NDJSON line loop — drain buffer one newline at a time.
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

  // ─── Embeddings ─────────────────────────────────────────────────────────
  //
  // POST /v1/embeddings (OpenAI-shape) or /api/embeddings (Ollama native).
  // Both accept either a single string or an array of strings; the OpenAI
  // shape returns { data: [{ embedding: number[] }] }, Ollama returns
  // { embedding: number[] } for single and { embeddings: number[][] } for
  // batches. We normalize to always return Array<number[]> in input order.
  //
  // Pass `input` as a string or string[]. `model` defaults to the
  // provider's `embeddingModel` if set.
  async embed({ input, model, signal } = {}) {
    if (input == null) throw new Error("embed: input is required.");
    const arr = Array.isArray(input) ? input : [input];
    if (!arr.length) return [];
    const useModel = model || this.provider.embeddingModel || "";

    if (detectRunner(this.provider) === "ollama") {
      return this._ollamaEmbed({ input: arr, model: useModel, signal });
    }
    const res = await fetch(this.url("/embeddings"), {
      method: "POST",
      headers: this.headers,
      signal,
      body: JSON.stringify({ model: useModel, input: arr }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Embeddings error ${res.status}: ${text || res.statusText}`);
    }
    const json = await res.json();
    const data = Array.isArray(json?.data) ? json.data : [];
    return data.map((d) => d?.embedding).filter(Array.isArray);
  }

  async _ollamaEmbed({ input, model, signal } = {}) {
    // Ollama batches via { input: string[] } at /api/embed; single-shot
    // legacy is { prompt: string } at /api/embeddings. We use /api/embed
    // (current API, batch-capable) and fall back to single-shot if the
    // server doesn't recognize it (older builds).
    try {
      const res = await fetch(this.nativeUrl("/api/embed"), {
        method: "POST",
        headers: this.headers,
        signal,
        body: JSON.stringify({ model, input }),
      });
      if (res.ok) {
        const json = await res.json();
        const arr = Array.isArray(json?.embeddings) ? json.embeddings : [];
        if (arr.length) return arr;
      }
    } catch { /* fall through to legacy */ }

    // Legacy single-shot — one request per input.
    const out = [];
    for (const text of input) {
      const res = await fetch(this.nativeUrl("/api/embeddings"), {
        method: "POST",
        headers: this.headers,
        signal,
        body: JSON.stringify({ model, prompt: text }),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(`Embeddings error ${res.status}: ${t || res.statusText}`);
      }
      const json = await res.json();
      const v = Array.isArray(json?.embedding) ? json.embedding : null;
      if (!v) throw new Error("Embeddings response missing `embedding` field.");
      out.push(v);
    }
    return out;
  }

  // ─── Text-to-speech ─────────────────────────────────────────────────────
  //
  // POST /v1/audio/speech (OpenAI-shaped) — body shape:
  //   { model, voice, input, response_format, speed, ...providerParams }
  //
  // `provider.params` holds engine-specific knobs configured in Settings
  // (OpenAI `instructions`, and whatever a local TTS server exposes). They are
  // spread into the body so each engine receives what it expects; the
  // core OpenAI fields override any conflicting keys.
  //
  // Speechmatics is NOT OpenAI-shaped — voice goes in the URL path and the
  // body is just { text }. Branch by hostname so the public speech() API
  // stays the same for callers.
  //
  // Returns an audio Blob (mp3 by default; WAV for Speechmatics).
  //
  async speech({ input, voice, model, format, speed, signal } = {}) {
    if (isSpeechmatics(this.provider)) {
      return this._speechmaticsSpeech({ input, voice, signal });
    }
    if (isChatterbox(this.provider)) {
      return this._chatterboxSpeech({ input, voice, signal });
    }
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

  // ─── Speechmatics text-to-speech ─────────────────────────────────────────
  //
  // POST {baseUrl}/generate/{voice} with body { text }. Auth via Bearer.
  // Voice is part of the path (sarah | theo | megan | jack). Returns WAV
  // bytes by default (wav_16000); pcm_16000 available via output_format
  // query param. No model selector, no speed, no language.
  //
  // The render pipeline expects WAV — let the default ride.
  async _speechmaticsSpeech({ input, voice, signal } = {}) {
    if (!voice) throw new Error("Speechmatics: voice is required (e.g. 'sarah', 'theo', 'megan', 'jack').");
    const base = this.provider.baseUrl.replace(/\/$/, "");
    const url = `${base}/generate/${encodeURIComponent(voice)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: this.headers,
      signal,
      body: JSON.stringify({ text: input }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Speechmatics TTS error ${res.status}: ${text || res.statusText}`);
    }
    return res.blob();
  }

  // Dia-TTS-Server doesn't expose /v1/audio/voices. Voices live behind
  // two custom root-level routes:
  //   GET /get_predefined_voices  → [{ display_name, filename }, ...]
  //   GET /get_reference_files    → [filename, ...]  (clones)
  // Both directories scan on every call, so the writer can drop a new
  // reference clip in and a refresh in the cast picker picks it up
  // without restarting Dia. The first two synthetic mode tokens (S1 /
  // S2) are appended so the writer can immediately render dialogue
  // mode without first choosing a clip.
  async _diaVoices({ signal, timeoutMs = 15000 } = {}) {
    const fetchJson = async (path) => {
      try {
        const res = await this._fetchWithTimeout(
          this.nativeUrl(path),
          { headers: this.authHeaders },
          { signal, timeoutMs },
        );
        if (!res.ok) return [];
        return await res.json();
      } catch { return []; }
    };
    const [predefined, references] = await Promise.all([
      fetchJson("/get_predefined_voices"),
      fetchJson("/get_reference_files"),
    ]);
    const out = [];
    out.push({ id: "S1", name: "S1 (default speaker)", gender: "neutral" });
    out.push({ id: "S2", name: "S2 (alternate speaker)", gender: "neutral" });
    for (const v of Array.isArray(predefined) ? predefined : []) {
      if (typeof v === "string") {
        out.push({ id: v, name: v.replace(/\.[^.]+$/, "") });
      } else if (v?.filename) {
        out.push({ id: v.filename, name: v.display_name || v.filename });
      }
    }
    for (const f of Array.isArray(references) ? references : []) {
      if (typeof f === "string") {
        out.push({ id: f, name: `${f.replace(/\.[^.]+$/, "")} (cloned)` });
      }
    }
    return out;
  }

  // ─── Chatterbox text-to-speech ─────────────────────────────────────────
  //
  // POST /tts on the server root (not /v1/audio/speech, which only honors
  // model/voice/speed/format and drops the engine knobs). Body shape:
  //   {
  //     text, voice_mode: "predefined"|"clone",
  //     predefined_voice_id?: filename, reference_audio_filename?: filename,
  //     output_format: wav|opus|mp3, split_text, chunk_size, stream,
  //     temperature, exaggeration, cfg_weight, speed_factor, language, seed
  //   }
  //
  // Voice id convention: clone voices are tagged with a "clone:" prefix
  // by _chatterboxVoices() so that the writer's existing cast (which
  // stored bare filenames against the old OpenAI-compat path) keeps
  // resolving as predefined. Anything new the writer picks from the
  // "(clone)" list gets the prefix and routes to voice_mode="clone".
  async _chatterboxSpeech({ input, voice, signal } = {}) {
    if (!voice) throw new Error("Chatterbox: voice is required.");
    const params = this.provider.params || {};
    const isClone = voice.startsWith("clone:");
    const voiceFile = isClone ? voice.slice("clone:".length) : voice;

    const body = {
      text: input,
      voice_mode: isClone ? "clone" : "predefined",
      output_format: params.output_format ?? "wav",
      split_text: true,
    };
    if (isClone) body.reference_audio_filename = voiceFile;
    else body.predefined_voice_id = voiceFile;

    for (const k of CHATTERBOX_TTS_KNOBS) {
      if (params[k] !== undefined && params[k] !== "") body[k] = params[k];
    }

    const res = await fetch(this.nativeUrl("/tts"), {
      method: "POST",
      headers: this.headers,
      signal,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Chatterbox TTS error ${res.status}: ${text || res.statusText}`);
    }
    return res.blob();
  }

  // Chatterbox voice listing — merge predefined and clone references.
  //   GET /get_predefined_voices  → [{ display_name, filename }, ...]  (voices/ folder)
  //   GET /get_reference_files    → [filename, ...]                    (reference_audio/ folder)
  // Clone entries get a "clone:" id prefix so synth can route them to
  // voice_mode="clone", and a " (clone)" suffix on the display name so
  // the cast picker shows them distinctly from a same-named predefined.
  async _chatterboxVoices({ signal, timeoutMs = 15000 } = {}) {
    const fetchJson = async (path) => {
      try {
        const res = await this._fetchWithTimeout(
          this.nativeUrl(path),
          { headers: this.authHeaders },
          { signal, timeoutMs },
        );
        if (!res.ok) return [];
        return await res.json();
      } catch { return []; }
    };
    const [predefined, references] = await Promise.all([
      fetchJson("/get_predefined_voices"),
      fetchJson("/get_reference_files"),
    ]);
    const out = [];
    for (const v of Array.isArray(predefined) ? predefined : []) {
      if (typeof v === "string") {
        out.push({ id: v, name: v.replace(/\.[^.]+$/, "") });
      } else if (v?.filename) {
        out.push({ id: v.filename, name: v.display_name || v.filename });
      }
    }
    for (const f of Array.isArray(references) ? references : []) {
      if (typeof f === "string") {
        out.push({ id: `clone:${f}`, name: `${f.replace(/\.[^.]+$/, "")} (clone)` });
      }
    }
    return out;
  }

  // Hot-swap the loaded Chatterbox model. Two-step:
  //   POST /save_settings { model: { repo_id } }   → merges into config.yaml
  //   POST /restart_server                          → unload + clear VRAM + load
  // /restart_server can take 10–30s the first time a model is downloaded
  // from HuggingFace; subsequent swaps are fast (model_cache hit). We
  // skip /restart_server when save_settings reports restart_needed: false.
  async chatterboxSetModel(repoId, { signal, timeoutMs = 90000 } = {}) {
    const saveRes = await this._fetchWithTimeout(
      this.nativeUrl("/save_settings"),
      {
        method: "POST",
        headers: this.headers,
        body: JSON.stringify({ model: { repo_id: repoId } }),
      },
      { signal, timeoutMs: 10000 },
    );
    if (!saveRes.ok) {
      const text = await saveRes.text().catch(() => "");
      throw new Error(`save_settings failed: ${saveRes.status} ${text || saveRes.statusText}`);
    }
    const saveJson = await saveRes.json().catch(() => ({}));
    if (saveJson?.restart_needed === false) return { restarted: false, message: saveJson?.message };

    const restartRes = await this._fetchWithTimeout(
      this.nativeUrl("/restart_server"),
      { method: "POST", headers: this.headers },
      { signal, timeoutMs },
    );
    if (!restartRes.ok) {
      const text = await restartRes.text().catch(() => "");
      throw new Error(`restart_server failed: ${restartRes.status} ${text || restartRes.statusText}`);
    }
    const restartJson = await restartRes.json().catch(() => ({}));
    return { restarted: true, message: restartJson?.message };
  }

  // Probe the live state of the loaded Chatterbox model. Used by the
  // Settings UI to show what's actually active on the server (separate
  // from the writer's preferred selection persisted in provider.ttsModel)
  // and to surface the paralinguistic tags the active model supports.
  // Shape: { loaded, type, class_name, device, sample_rate,
  //          supports_paralinguistic_tags, available_paralinguistic_tags,
  //          supports_multilingual, supported_languages }
  async chatterboxModelInfo({ signal, timeoutMs = 5000 } = {}) {
    const res = await this._fetchWithTimeout(
      this.nativeUrl("/api/model-info"),
      { headers: this.authHeaders },
      { signal, timeoutMs },
    );
    if (!res.ok) throw new Error(`model-info failed: ${res.status} ${res.statusText}`);
    return res.json();
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
    if (isDia(this.provider)) {
      return this._diaVoices({ signal, timeoutMs });
    }
    if (isChatterbox(this.provider)) {
      return this._chatterboxVoices({ signal, timeoutMs });
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
    // Speechmatics has no health/list endpoint; treat "API key present"
    // as the only check we can do without spending a synthesis credit.
    if (isSpeechmatics(this.provider)) return !!this.provider.apiKey;
    // Edge TTS doesn't go through HTTP — bridge presence + a successful
    // voice fetch is the closest health signal we have.
    if (this.provider.id === "edgeTts") {
      if (!window.justwrite?.tts?.edge?.voices) return false;
      try {
        const list = await window.justwrite.tts.edge.voices();
        return Array.isArray(list) && list.length > 0;
      } catch { return false; }
    }
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
