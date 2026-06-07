// Speechify (SIMBA 3.0) client.
//
// Speechify uses a proprietary REST API. The key endpoints:
//   POST /v1/audio/speech     — single-call synthesis (audiobook-friendly).
//                              Body: { input, voice_id, audio_format,
//                                      model, language? }
//                              Returns base64-encoded audio in JSON, plus
//                              speech_marks for word/sentence timestamps.
//   GET  /v1/voices           — voice library (shared + user clones).
//
// We only need /v1/audio/speech for the render pipeline; /v1/voices feeds
// the Studio voice library. Method names parallel OpenAICompatClient
// (speech / voices / ping) so services/tts.js can branch on provider id.
//
// Auth: `Authorization: Bearer <key>`.

const DEFAULT_BASE = "https://api.sws.speechify.com";

export class SpeechifyClient {
  constructor(provider) {
    this.provider = provider;
  }

  get baseUrl() {
    return (this.provider?.baseUrl || DEFAULT_BASE).replace(/\/$/, "");
  }

  get headers() {
    const h = { "Content-Type": "application/json" };
    if (this.provider?.apiKey) h["Authorization"] = `Bearer ${this.provider.apiKey}`;
    return h;
  }

  get authHeaders() {
    return this.provider?.apiKey ? { Authorization: `Bearer ${this.provider.apiKey}` } : {};
  }

  // POST /v1/audio/speech. Returns an audio Blob. Speechify replies with
  // a JSON envelope { audio_data: <base64>, audio_format, speech_marks }
  // rather than raw bytes, so we decode the base64 on this side.
  async speech({ input, voice, model, signal } = {}) {
    if (!voice) throw new Error("Speechify: voice is required.");
    if (!this.provider?.apiKey) throw new Error("Speechify: API key is required. Add it in Settings → AI providers.");
    const params = this.provider.params || {};
    const body = {
      input,
      voice_id: voice,
      model: model || this.provider.ttsModel || "simba-multilingual",
      audio_format: params.audio_format || "mp3",
    };
    if (params.language) body.language = params.language;
    const res = await fetch(`${this.baseUrl}/v1/audio/speech`, {
      method: "POST",
      headers: this.headers,
      signal,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Speechify TTS error ${res.status}: ${text || res.statusText}`);
    }
    const json = await res.json();
    const fmt = (json?.audio_format || body.audio_format || "mp3").toLowerCase();
    const b64 = json?.audio_data || "";
    if (!b64) throw new Error("Speechify TTS: response missing audio_data.");
    return base64ToBlob(b64, fmt === "wav" ? "audio/wav" : "audio/mpeg");
  }

  // GET /v1/voices. Normalize to the { id, name, gender, accent, age, tone }
  // shape services/tts.js → listVoices() emits.
  async voices({ signal, timeoutMs = 15000 } = {}) {
    if (!this.provider?.apiKey) return [];
    let res;
    try {
      res = await fetchWithTimeout(
        `${this.baseUrl}/v1/voices`,
        { headers: this.authHeaders, signal },
        timeoutMs,
      );
    } catch {
      return [];
    }
    if (!res.ok) return [];
    const json = await res.json().catch(() => null);
    // Accept several response shapes — { data: [...] }, { voices: [...] },
    // or a bare array.
    const arr = Array.isArray(json) ? json
              : Array.isArray(json?.data) ? json.data
              : Array.isArray(json?.voices) ? json.voices : [];
    return arr.map((v) => ({
      id: v.id || v.voice_id || v.name,
      name: v.display_name || v.name || v.id,
      gender: (v.gender || "").toLowerCase(),
      accent: v.locale || v.accent || "",
      age: v.age || "",
      tone: v.tone || v.description || "",
    })).filter((v) => v.id);
  }

  async ping({ timeoutMs = 2500 } = {}) {
    if (!this.provider?.apiKey) return false;
    try {
      const res = await fetchWithTimeout(
        `${this.baseUrl}/v1/voices`,
        { headers: this.authHeaders },
        timeoutMs,
      );
      return res.ok;
    } catch {
      return false;
    }
  }
}

function base64ToBlob(b64, mime) {
  // atob produces a binary string; iterate to bytes.
  const bin = atob(b64);
  const len = bin.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

async function fetchWithTimeout(url, init, timeoutMs) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: init?.signal ?? ctl.signal });
  } finally {
    clearTimeout(timer);
  }
}

export const SPEECHIFY_MODELS = [
  { id: "simba-multilingual", label: "SIMBA 3.0 Multilingual", hint: "Default. ~$10/M chars, top-10 on Artificial Analysis TTS." },
  { id: "simba-english",      label: "SIMBA English",         hint: "English-optimised, slightly lower per-char cost." },
];

export function isSpeechify(provider) {
  return provider?.id === "speechify";
}
