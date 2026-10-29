// ProviderBackend — JustWrite's synchronous BOOT CACHE for the shared provider
// list (/v1/llm-providers, llm_runner.llm.provider_api). Pulled once before Vue
// mounts so the AI store's synchronous bootstrap can read it (the same pattern
// as routingBackend). READ-ONLY on purpose: provider create/update/delete lives
// in the shared @delebash/ui views (AiModelsArea → ProviderForm write the
// endpoint directly) — the old per-app CRUD wrappers here were dead code once
// the kit took over editing and were removed by the 2026-07-06
// everything-LLM-shared audit (C4).
//
// The list shape IS the shared camelCase contract:
//   { id, name, providerType, baseUrl, defaultModel, embeddingModel,
//     timeoutSeconds, hasApiKey, registered }
// `apiKey` is write-only — held server-side, never returned.

import { get } from "@delebash/ui";

let _providers = null; // null = not yet booted
let _booted = false;

/**
 * Pull the provider list into the cache. MUST be awaited (after bootSettings,
 * before mounting Vue) so the AI store's synchronous bootstrap can read it.
 */
export async function bootProviders() {
  if (_booted) return;
  // One GET: the server seeds before it listens (server/src/serve.js `build`, then the kit's
  // listen; the phone's worker seeds before "ready"), so the connection gate's /health answer
  // means the providers are there. The 2026-07-11 retry loop raced the Python server's seeding,
  // which no longer exists. A failed GET still self-heals through refreshProviders below.
  try {
    const data = await get("/v1/llm-providers");
    if (Array.isArray(data?.providers)) _providers = data.providers;
  } catch (err) {
    console.error("providerBackend.bootProviders failed:", err);
  }
  _booted = true;
}

/**
 * Re-pull the provider list into the cache — the self-heal half of the boot cache
 * (2026-07-11): when the boot fetch failed, the AI store's ensureEmbeddingDefaults
 * calls this so one bad boot can't brick provider resolution for the session.
 */
export async function refreshProviders() {
  try {
    const data = await get("/v1/llm-providers");
    if (Array.isArray(data?.providers)) _providers = data.providers;
  } catch (err) {
    console.error("providerBackend.refreshProviders failed:", err);
  }
  _booted = true;
}

/** Sync read of the cached list (null if the server had none / boot failed). */
export function listProviders() {
  return _providers;
}
