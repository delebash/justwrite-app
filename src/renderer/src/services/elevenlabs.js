// ElevenLabs client.
//
// ElevenLabs uses a proprietary REST API rather than OpenAI's TTS shape:
//   - Auth: `xi-api-key: <key>` header (not Bearer)
//   - Voice goes in the URL path: POST /v1/text-to-speech/{voice_id}
//   - Body: { text, model_id, voice_settings: { stability, similarity_boost,
//                                                style, use_speaker_boost } }
//   - Voice library: GET /v1/voices → { voices: [{ voice_id, name,
//                                                  labels: { gender, ... } }, ...] }
//
// We keep the public method names parallel to OpenAICompatClient
// (speech / voices / ping) so services/tts.js can branch on provider id
// and keep the rest of the renderer ignorant.
//
// Audio tags (v3 only): writers can drop [whispering] / [sorrowful] /
// [laughs] inline in their text and the model performs them. Tags are a
// model-level feature — they only work when `model_id` is `eleven_v3`.
// On Flash / Multilingual / Turbo they're ignored (silently rendered as
// plain text "[laughs]" if you forget to switch model).

const DEFAULT_BASE = "https://api.elevenlabs.io/v1";

export class ElevenLabsClient {
  constructor(provider) {
    this.provider = provider;
  }

  get baseUrl() {
    return (this.provider?.baseUrl || DEFAULT_BASE).replace(/\/$/, "");
  }

  get headers() {
    const h = { "Content-Type": "application/json" };
    if (this.provider?.apiKey) h["xi-api-key"] = this.provider.apiKey;
    return h;
  }

  get authHeaders() {
    return this.provider?.apiKey ? { "xi-api-key": this.provider.apiKey } : {};
  }

  // POST /v1/text-to-speech/{voice_id}. Returns an audio Blob (MP3 by
  // default, but `output_format` can override). Voice settings are
  // pulled from provider.params with sensible defaults — the writer
  // tunes them per voice via the Studio voice library's ⚙ Tune modal.
  async speech({ input, voice, model, signal } = {}) {
    if (!voice) throw new Error("ElevenLabs: voice is required.");
    if (!this.provider?.apiKey) throw new Error("ElevenLabs: API key is required. Add it in Settings → AI providers.");
    const modelId = model || this.provider.ttsModel || "eleven_flash_v2_5";
    const params = this.provider.params || {};
    const outputFormat = params.output_format || "mp3_44100_128";
    const voiceSettings = {
      stability:        clamp(params.stability,        0, 1, 0.5),
      similarity_boost: clamp(params.similarity_boost, 0, 1, 0.75),
      style:            clamp(params.style,            0, 1, 0),
      use_speaker_boost: params.use_speaker_boost !== false,
    };
    const body = {
      text: input,
      model_id: modelId,
      voice_settings: voiceSettings,
    };
    const url = `${this.baseUrl}/text-to-speech/${encodeURIComponent(voice)}?output_format=${encodeURIComponent(outputFormat)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: this.headers,
      signal,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`ElevenLabs TTS error ${res.status}: ${text || res.statusText}`);
    }
    return res.blob();
  }

  // GET /v1/voices. Returns the writer's library — the shared catalogue
  // plus any voices they've personally cloned. We map ElevenLabs' label
  // structure (`labels: { gender, age, accent, description }`) onto the
  // shape services/tts.js → listVoices() emits so the rest of the app
  // sees ElevenLabs voices and OpenAI voices identically.
  async voices({ signal, timeoutMs = 15000 } = {}) {
    if (!this.provider?.apiKey) return [];
    let res;
    try {
      res = await fetchWithTimeout(
        `${this.baseUrl}/voices`,
        { headers: this.authHeaders, signal },
        timeoutMs,
      );
    } catch {
      return [];
    }
    if (!res.ok) return [];
    const json = await res.json().catch(() => ({}));
    const arr = Array.isArray(json?.voices) ? json.voices : [];
    return arr.map((v) => {
      const labels = v?.labels || {};
      return {
        id: v.voice_id,
        name: v.name,
        gender: (labels.gender || "").toLowerCase(),
        accent: labels.accent || labels.descriptive || "",
        age: labels.age || "",
        tone: labels.description || labels.use_case || "",
      };
    }).filter((v) => v.id);
  }

  // GET /v1/models — used by the ping path. We don't surface the model
  // list separately because the Settings provider editor uses a static
  // ELEVENLABS_MODELS list (defined below).
  async ping({ timeoutMs = 2500 } = {}) {
    if (!this.provider?.apiKey) return false;
    try {
      const res = await fetchWithTimeout(
        `${this.baseUrl}/models`,
        { headers: this.authHeaders },
        timeoutMs,
      );
      return res.ok;
    } catch {
      return false;
    }
  }
}

function clamp(v, min, max, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
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

// Models exposed in Settings → ElevenLabs provider editor. Updated when
// ElevenLabs ships a new generation — they don't expose all of these via
// /v1/models in a useful order, so we curate here for clarity.
export const ELEVENLABS_MODELS = [
  { id: "eleven_v3",            label: "v3 (audio tags, multi-speaker, highest quality)", hint: "1 credit/char. Supports [whispering] / [sorrowful] / [laughs] inline tags." },
  { id: "eleven_multilingual_v2", label: "Multilingual v2 (29 languages, very natural)", hint: "1 credit/char. Older but still excellent for non-English audiobooks." },
  { id: "eleven_flash_v2_5",    label: "Flash v2.5 (fast, half cost)",                    hint: "0.5 credit/char. Lower latency, same voice library. Audio tags NOT honored." },
  { id: "eleven_turbo_v2_5",    label: "Turbo v2.5 (lowest latency)",                     hint: "0.5 credit/char. Streaming-first; quality between Flash and Multilingual v2." },
];

export function isElevenLabs(provider) {
  return provider?.id === "elevenlabs";
}
