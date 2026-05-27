// TTS service — synthesize text via any OpenAI-compatible TTS provider.
//
// Returns audio Blobs that can be played directly via an <audio> tag
// or stitched together for chapter-level rendering.

import { OpenAICompatClient } from "./openai-compat.js";

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

export async function synthesize({ provider, voice, input, model, speed = 1.0, signal, useCache = true }) {
  const model_ = model || provider.ttsModel || "tts-1";
  const paramsHash = hashParams(provider.params);
  const key = cacheKey({ providerId: provider.id, voice, model: model_, input, speed, paramsHash });
  if (useCache && cache.has(key)) return cache.get(key);

  const client = new OpenAICompatClient(provider);
  const blob = await client.speech({ input, voice, model: model_, speed, signal });
  if (useCache) cache.set(key, blob);
  return blob;
}

/**
 * Play a preview of the given voice. Synthesizes → blob → object URL.
 * Returns `{ blob, url, kind: "blob" }`.
 */
export async function preview({ provider, voice, input, model, speed = 1.0, signal } = {}) {
  const blob = await synthesize({ provider, voice, input, model, speed, signal });
  const url = URL.createObjectURL(blob);
  return { kind: "blob", blob, url };
}

/**
 * Enumerate the voices a provider exposes via the OpenAI-compat
 * /v1/audio/voices endpoint (with engine-specific fallbacks inside
 * OpenAICompatClient).
 */
export async function listVoices(provider, signal) {
  const client = new OpenAICompatClient(provider);
  return client.voices({ signal });
}

export function clearCache() {
  cache.clear();
}
