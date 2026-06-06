// TTS service — synthesize text via any OpenAI-compatible TTS provider,
// or special-case providers wired through the Tauri bridge (currently:
// Microsoft Edge "Read Aloud" via the msedge-tts Rust crate).
//
// Returns audio Blobs that can be played directly via an <audio> tag
// or stitched together for chapter-level rendering.

import { OpenAICompatClient } from "./openai-compat.js";

// Providers that aren't OpenAI-shaped and route through Rust. Right
// now this is just Edge TTS — the renderer can't reach Microsoft's
// WebSocket directly (Sec-WebSocket-Version is blocked by the browser
// spec) so synth and voice listing both go through window.justwrite.
function isEdgeTts(provider) {
  return provider?.id === "edgeTts";
}

const cache = new Map();
function cacheKey({ providerId, voice, model, input, speed, paramsHash }) {
  return `${providerId}::${model}::${voice}::${speed}::${paramsHash}::${input}`;
}
function hashParams(params) {
  if (!params) return "";
  // Stable stringify — sort keys so {a:1,b:2} and {b:2,a:1} hash the same.
  const keys = Object.keys(params).sort();
  return keys.map((k) => `${k}=${params[k]}`).join("&");
}

// Merge a stack of param objects shallow-rightward, dropping empty
// strings / nulls / undefineds so an empty-string override doesn't
// blank out a provider default. Used by synthesize() to layer
// provider.params → voice.params → preset.params with later wins.
function mergeParams(...stacks) {
  const out = {};
  for (const layer of stacks) {
    if (!layer) continue;
    for (const [k, v] of Object.entries(layer)) {
      if (v === undefined || v === null || v === "") continue;
      out[k] = v;
    }
  }
  return out;
}

/**
 * Synthesize one line of text.
 *
 * Param resolution is a three-tier stack — later layers override earlier:
 *   1. provider.params         (Settings → Providers → Engine params)
 *   2. voiceParams             (Studio voice library → ⚙ Tune voice)
 *   3. presetParams            (Studio Render → chapter render preset)
 *
 * The merged object becomes the effective provider.params for this one
 * call; the underlying OpenAICompatClient reads provider.params verbatim
 * so no engine-side changes are needed. Cache key hashes the merged
 * params so a voice or preset tweak busts cache cleanly without
 * invalidating other lines.
 */
export async function synthesize({ provider, voice, input, model, speed = 1.0, signal, useCache = true, voiceParams, presetParams } = {}) {
  const model_ = model || provider.ttsModel || "tts-1";
  const mergedParams = mergeParams(provider.params, voiceParams, presetParams);
  const paramsHash = hashParams(mergedParams);
  const key = cacheKey({ providerId: provider.id, voice, model: model_, input, speed, paramsHash });
  if (useCache && cache.has(key)) return cache.get(key);

  let blob;
  if (isEdgeTts(provider)) {
    if (!window.justwrite?.tts?.edge?.speech) {
      throw new Error("Edge TTS requires the desktop app (Tauri build) — not available in browser dev mode.");
    }
    // Edge TTS doesn't honor provider.params — it routes through the Rust
    // bridge which currently only takes voice + text. Voice/preset
    // overrides for rate/pitch/volume would need bridge-side wiring.
    blob = await window.justwrite.tts.edge.speech({ voice, text: input });
  } else {
    // Shallow-clone the provider with merged params so the client reads
    // the effective set for this one call. provider.params is the only
    // engine-facing field the client looks at.
    const effectiveProvider = { ...provider, params: mergedParams };
    const client = new OpenAICompatClient(effectiveProvider);
    blob = await client.speech({ input, voice, model: model_, speed, signal });
  }
  if (useCache) cache.set(key, blob);
  return blob;
}

/**
 * Play a preview of the given voice. Synthesizes → blob → object URL.
 * Returns `{ blob, url, kind: "blob" }`.
 */
export async function preview({ provider, voice, input, model, speed = 1.0, signal, voiceParams, presetParams } = {}) {
  const blob = await synthesize({ provider, voice, input, model, speed, signal, voiceParams, presetParams });
  const url = URL.createObjectURL(blob);
  return { kind: "blob", blob, url };
}

/**
 * Enumerate the voices a provider exposes via the OpenAI-compat
 * /v1/audio/voices endpoint (with engine-specific fallbacks inside
 * OpenAICompatClient).
 */
export async function listVoices(provider, signal) {
  if (isEdgeTts(provider)) {
    if (!window.justwrite?.tts?.edge?.voices) return [];
    const voices = await window.justwrite.tts.edge.voices();
    // Normalize to the shape the renderer expects from listVoices:
    // { id, name, gender, accent, age, tone }. Locale becomes the
    // accent so the voice library's filter chip stays useful.
    return (voices || []).map((v) => ({
      id: v.id,
      name: v.name,
      gender: (v.gender || "").toLowerCase(),
      accent: v.locale || "",
      age: "",
      tone: "",
    }));
  }
  const client = new OpenAICompatClient(provider);
  return client.voices({ signal });
}

export function clearCache() {
  cache.clear();
}
