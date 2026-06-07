// Voicebox client.
//
// Voicebox (https://github.com/jamiepine/voicebox) is a desktop AI voice
// studio that ships a Python FastAPI inference server as a Tauri sidecar.
// Listening on 127.0.0.1:8000 by default. JustWrite uses it as a backend
// for cross-platform local GPU TTS — Metal on Apple Silicon (via MLX),
// CUDA on Windows/Linux NVIDIA. Per-engine caveats apply (Chatterbox is
// CPU-only on Mac, by voicebox's deliberate choice — see their
// chatterbox_backend.py `force_cpu_on_mac=True`).
//
// API shape — NOT OpenAI-compatible. Async / polling:
//   POST /generate                   { profile_id, text, engine, model_size, ... }
//                                    → { id, status: "generating" }
//   GET  /generate/{id}/status       → { id, status, audio_url?, error? }
//   GET  /generate/{id}/audio        → raw audio bytes (when status = "completed")
//   GET  /profiles                   → [{ id, name, engine, language, ... }, ...]
//   POST /profiles/{id}/samples      → upload reference audio (multipart) for cloning
//   POST /watchdog/disable           → keep server alive without the GUI window
//   GET  /health                     → { status, backend, gpu, ... }
//
// Method names parallel the other TTS clients (speech / voices / ping) so
// services/tts.js → clientFor() can branch on provider id and the rest of
// the renderer stays ignorant.
//
// ttsModel encoding: "engine:size" pair, e.g. "qwen:1.7B", "chatterbox:default",
// "chatterbox_turbo:default", "kokoro:default", "luxtts:default", "tada:3B".
// Split on colon to recover engine + size for the /generate body.

const DEFAULT_BASE = "http://127.0.0.1:8000";

// Hard limits on the polling loop. /generate is queued serially by voicebox
// — a 90-second chapter on Qwen3-TTS at 1× realtime takes ~30s of inference
// + queue wait, so 120s is a comfortable cap for one line. Beyond that
// something has hung server-side.
const POLL_MAX_MS = 120_000;
const POLL_START_MS = 250;
const POLL_MAX_INTERVAL_MS = 2000;

export class VoiceboxClient {
  constructor(provider) {
    this.provider = provider;
  }

  get baseUrl() {
    return (this.provider?.baseUrl || DEFAULT_BASE).replace(/\/$/, "");
  }

  get headers() {
    // Voicebox uses no auth (localhost-only by design). We still send
    // Content-Type so the server's request parser is happy on every POST.
    return { "Content-Type": "application/json" };
  }

  // Decode "qwen:1.7B" → { engine: "qwen", modelSize: "1.7B" }.
  // Engines that don't have multiple sizes (chatterbox, kokoro, luxtts)
  // get "default".
  _engineAndSize(model) {
    const m = String(model || this.provider?.ttsModel || "qwen:1.7B").trim();
    const [engine, size] = m.split(":");
    return {
      engine: engine || "qwen",
      modelSize: size || "default",
    };
  }

  // Speech is async + polling. We POST /generate, poll the status route,
  // then download the rendered audio when ready. Returns a Blob.
  async speech({ input, voice, model, signal } = {}) {
    if (!voice) throw new Error("Voicebox: voice (profile_id) is required.");
    if (!input)  throw new Error("Voicebox: input text is required.");

    const { engine, modelSize } = this._engineAndSize(model);
    const params = this.provider?.params || {};

    const body = {
      profile_id: voice,
      text: input,
      engine,
      model_size: modelSize,
    };
    // Voicebox per-engine knobs the writer can set in provider params —
    // spread last so they don't override our core fields. Unknown fields
    // are accepted by FastAPI's pydantic models as long as `extra = "allow"`
    // is on; if not, voicebox returns a 422 with a useful error.
    for (const k of ["language", "seed", "instruct", "personality", "max_chunk_chars", "crossfade_ms"]) {
      if (params[k] !== undefined && params[k] !== "") body[k] = params[k];
    }

    // Kick off generation.
    const startRes = await fetch(`${this.baseUrl}/generate`, {
      method: "POST",
      headers: this.headers,
      signal,
      body: JSON.stringify(body),
    });
    if (!startRes.ok) {
      const text = await startRes.text().catch(() => "");
      throw new Error(`Voicebox /generate error ${startRes.status}: ${text || startRes.statusText}`);
    }
    const startJson = await startRes.json();
    const jobId = startJson?.id;
    if (!jobId) throw new Error("Voicebox /generate response missing job id.");

    // Poll status until completed or aborted. Exponential backoff so we
    // don't hammer the server on quick jobs but still feel responsive.
    const deadline = Date.now() + POLL_MAX_MS;
    let interval = POLL_START_MS;
    let lastStatus = "generating";

    while (Date.now() < deadline) {
      if (signal?.aborted) throw new DOMException("aborted", "AbortError");
      await sleep(interval, signal);
      const statusRes = await fetch(`${this.baseUrl}/generate/${encodeURIComponent(jobId)}/status`, {
        method: "GET",
        signal,
      });
      if (!statusRes.ok) {
        const text = await statusRes.text().catch(() => "");
        throw new Error(`Voicebox status error ${statusRes.status}: ${text || statusRes.statusText}`);
      }
      const statusJson = await statusRes.json();
      lastStatus = statusJson?.status || lastStatus;
      if (lastStatus === "completed" || lastStatus === "succeeded") {
        // Audio either comes back as a URL or via a dedicated /audio route.
        // The server returns the relative path in `audio_path` or `audio_url`
        // depending on build; fall back to /generate/{id}/audio.
        const audioUrl = statusJson?.audio_url
          ? this._absolutizeUrl(statusJson.audio_url)
          : `${this.baseUrl}/generate/${encodeURIComponent(jobId)}/audio`;
        const audioRes = await fetch(audioUrl, { signal });
        if (!audioRes.ok) {
          const text = await audioRes.text().catch(() => "");
          throw new Error(`Voicebox audio fetch error ${audioRes.status}: ${text || audioRes.statusText}`);
        }
        return audioRes.blob();
      }
      if (lastStatus === "failed" || lastStatus === "error") {
        throw new Error(`Voicebox generation failed: ${statusJson?.error || "unknown error"}`);
      }
      interval = Math.min(interval * 1.4, POLL_MAX_INTERVAL_MS);
    }
    throw new Error(`Voicebox generation timed out after ${POLL_MAX_MS / 1000}s (last status: ${lastStatus}).`);
  }

  // GET /profiles. Voicebox profiles are the voice library — preset voices
  // from each engine plus any the user has cloned in voicebox's GUI.
  async voices({ signal, timeoutMs = 15000 } = {}) {
    let res;
    try {
      res = await fetchWithTimeout(
        `${this.baseUrl}/profiles`,
        { signal },
        timeoutMs,
      );
    } catch {
      return [];
    }
    if (!res.ok) return [];
    const json = await res.json().catch(() => null);
    const arr = Array.isArray(json) ? json
              : Array.isArray(json?.profiles) ? json.profiles
              : Array.isArray(json?.data) ? json.data : [];
    return arr.map((p) => ({
      id: p.id || p.profile_id,
      // Profile name often includes the engine ("Qwen — Vivian"); voicebox's
      // UI also exposes `display_name`. Prefer it when present.
      name: p.display_name || p.name || p.id || "Voice",
      gender: (p.gender || "").toLowerCase(),
      accent: p.language || p.locale || p.accent || "",
      age: p.age || "",
      tone: p.tone || p.description || p.engine || "",
    })).filter((v) => v.id);
  }

  // GET /health — also doubles as our "is the server reachable?" probe.
  async ping({ timeoutMs = 2500 } = {}) {
    try {
      const res = await fetchWithTimeout(
        `${this.baseUrl}/health`,
        {},
        timeoutMs,
      );
      return res.ok;
    } catch {
      return false;
    }
  }

  // Voicebox's server has a watchdog that kills it when the parent GUI
  // exits. Calling this once on first successful ping lets the server
  // outlive the GUI so JustWrite can use it independently. Best-effort —
  // returns true on success, false on any error.
  async disableWatchdog({ timeoutMs = 5000 } = {}) {
    try {
      const res = await fetchWithTimeout(
        `${this.baseUrl}/watchdog/disable`,
        { method: "POST", headers: this.headers },
        timeoutMs,
      );
      return res.ok;
    } catch {
      return false;
    }
  }

  _absolutizeUrl(url) {
    if (/^https?:\/\//i.test(url)) return url;
    if (url.startsWith("/")) return `${this.baseUrl}${url}`;
    return `${this.baseUrl}/${url}`;
  }
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

async function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    const onAbort = () => {
      cleanup();
      reject(new DOMException("aborted", "AbortError"));
    };
    const cleanup = () => {
      clearTimeout(t);
      if (signal) signal.removeEventListener("abort", onAbort);
    };
    if (signal) {
      if (signal.aborted) {
        cleanup();
        reject(new DOMException("aborted", "AbortError"));
        return;
      }
      signal.addEventListener("abort", onAbort);
    }
  });
}

// Engine + model_size options exposed by voicebox. Curated to match what
// their backend allowlist regex accepts — `^(qwen|qwen_custom_voice|luxtts|chatterbox|chatterbox_turbo|tada|kokoro)$`.
// The Settings provider editor surfaces these as a dropdown for the
// ttsModel field. Encoded as "engine:size" so a single string captures
// both.
export const VOICEBOX_MODELS = [
  { id: "qwen:1.7B",                label: "Qwen3-TTS 1.7B",     hint: "Best published English WER (0.77%). Voice cloning from 3s reference. Uses MLX on Mac (Metal), CUDA on NVIDIA, CPU fallback." },
  { id: "qwen:0.6B",                label: "Qwen3-TTS 0.6B",     hint: "Lighter — runs on more modest GPUs. Same cloning capability." },
  { id: "qwen_custom_voice:default", label: "Qwen CustomVoice",  hint: "Voicebox's preset voice library on Qwen — no reference clip needed." },
  { id: "chatterbox:default",       label: "Chatterbox",         hint: "Voice cloning + paralinguistic tags ([laugh], [sigh]). NVIDIA + Linux only on GPU; CPU-only on Mac (voicebox decision due to MPS issues)." },
  { id: "chatterbox_turbo:default", label: "Chatterbox Turbo",   hint: "Faster Chatterbox variant. Same Mac CPU caveat." },
  { id: "kokoro:default",           label: "Kokoro",             hint: "Tiny (82M), fast, preset voices only — no cloning. Works on every platform." },
  { id: "luxtts:default",           label: "LuxTTS",             hint: "Compact 1B model, multilingual. ~1 GB VRAM." },
  { id: "tada:3B",                  label: "HumeAI TADA 3B",     hint: "Hume's expressive emotion model. Higher quality, larger model." },
  { id: "tada:1B",                  label: "HumeAI TADA 1B",     hint: "Lighter TADA variant." },
];

export function isVoicebox(provider) {
  return provider?.id === "voicebox";
}
