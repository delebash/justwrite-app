// OpenAI-compatible client.
//
// Works with any service that implements the OpenAI HTTP API shape — OpenAI
// itself (cloud) or any local server that speaks /v1/chat/completions and/or
// /v1/audio/speech (Ollama, LM Studio, llama.cpp, vLLM, Kokoro-FastAPI,
// etc.).
//
// Constructor takes a provider object: { baseUrl, apiKey?, chatModel?, ttsModel? }.
// All methods accept overrides per call.

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

  url(path) {
    const base = this.provider.baseUrl.replace(/\/$/, "");
    return `${base}${path.startsWith("/") ? path : "/" + path}`;
  }

  // ─── Chat / completion ──────────────────────────────────────────────────
  //
  // POST /v1/chat/completions
  // Returns: assistant message content (string).
  //
  async chat({ messages, model, temperature = 0.3, signal } = {}) {
    const res = await fetch(this.url("/chat/completions"), {
      method: "POST",
      headers: this.headers,
      signal,
      body: JSON.stringify({
        model: model || this.provider.chatModel,
        messages,
        temperature,
        stream: false,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Chat error ${res.status}: ${text || res.statusText}`);
    }
    const json = await res.json();
    return json?.choices?.[0]?.message?.content ?? "";
  }

  // ─── List models ────────────────────────────────────────────────────────
  //
  // GET /v1/models
  // Used to populate model dropdowns in Settings.
  //
  async models({ signal } = {}) {
    try {
      const res = await fetch(this.url("/models"), { headers: this.headers, signal });
      if (!res.ok) return [];
      const json = await res.json();
      const list = json?.data || json?.models || [];
      return list.map((m) => m?.id || m?.name || String(m)).filter(Boolean);
    } catch {
      return [];
    }
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
  async voices({ signal } = {}) {
    if (this.provider.ttsVoices?.length) {
      return this.provider.ttsVoices.map((v) =>
        typeof v === "string" ? { id: v, name: v } : v,
      );
    }
    try {
      const res = await fetch(this.url("/audio/voices"), { headers: this.headers, signal });
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
      const res = await fetch(this.url(path), { headers: this.headers, signal: ctl.signal });
      return res.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(t);
    }
  }
}
