// ProviderBackend — the shared seam between the LLM-provider UI and the
// server's provider list (/v1/llm-providers). Mirrors storage.js / projectApi's
// sync-cache + debounced-write pattern so the AI store's SYNCHRONOUS bootstrap
// keeps working: bootProviders() pulls the list into a cache before Vue mounts;
// the store reads it synchronously; writes debounce a bulk PUT.
//
// This is the adapter a common llm-ui builds on — JustWrite points it at JW's
// server; JustVoice would point an equivalent at /v1/llm-providers on its own.
// Moves the provider registry off the justwrite:ai kv blob.

import { serverUrl } from "./serverApi.js";

let _providers = null; // null = server had no list yet (use kv/defaults)
let _booted = false;
let _timer = null;
const PUT_DEBOUNCE_MS = 500;

/**
 * Pull the provider list into the cache. MUST be awaited (after bootStorage,
 * before mounting Vue) so the AI store's synchronous bootstrap can read it.
 * Leaves the cache null on failure/empty so the store falls back to the kv
 * blob or the seeded defaults (and then write-through migrates them).
 */
export async function bootProviders() {
  if (_booted) return;
  try {
    const res = await fetch(serverUrl("/v1/llm-providers"));
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data?.providers) && data.providers.length) _providers = data.providers;
    }
  } catch (err) {
    console.error("providerBackend.bootProviders failed:", err);
  }
  _booted = true;
}

/** Sync read of the cached list (null if the server had none). */
export function listProviders() {
  return _providers;
}

function _flush(list) {
  return fetch(serverUrl("/v1/llm-providers"), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ providers: list }),
    keepalive: true,
  }).catch((err) => console.error("providerBackend PUT failed:", err));
}

/** Cache the list synchronously, queue a debounced bulk PUT. */
export function saveProviders(list) {
  _providers = list;
  if (_timer) clearTimeout(_timer);
  _timer = setTimeout(() => { _timer = null; void _flush(list); }, PUT_DEBOUNCE_MS);
}

export function flushProviders() {
  if (_timer) { clearTimeout(_timer); _timer = null; }
  return _providers ? _flush(_providers) : Promise.resolve();
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", flushProviders);
  window.addEventListener("beforeunload", flushProviders);
}
