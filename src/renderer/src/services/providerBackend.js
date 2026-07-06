// ProviderBackend — JustWrite's synchronous BOOT CACHE for the shared provider
// list (/v1/llm-providers, llm_runner.llm.provider_api). Pulled once before Vue
// mounts so the AI store's synchronous bootstrap can read it (the same pattern
// as routingBackend). READ-ONLY on purpose: provider create/update/delete lives
// in the shared @delebash/llm-ui views (AiModelsArea → ProviderForm write the
// endpoint directly) — the old per-app CRUD wrappers here were dead code once
// the kit took over editing and were removed by the 2026-07-06
// everything-LLM-shared audit (C4).
//
// The list shape IS the shared camelCase contract:
//   { id, name, providerType, baseUrl, defaultModel, embeddingModel,
//     timeoutSeconds, hasApiKey, registered }
// `apiKey` is write-only — held server-side, never returned.

import { get } from "@delebash/llm-ui";

let _providers = null; // null = not yet booted
let _booted = false;

/**
 * Pull the provider list into the cache. MUST be awaited (after bootSettings,
 * before mounting Vue) so the AI store's synchronous bootstrap can read it.
 */
export async function bootProviders() {
  if (_booted) return;
  try {
    const data = await get("/v1/llm-providers");
    if (Array.isArray(data?.providers)) _providers = data.providers;
  } catch (err) {
    console.error("providerBackend.bootProviders failed:", err);
  }
  _booted = true;
}

/** Sync read of the cached list (null if the server had none / boot failed). */
export function listProviders() {
  return _providers;
}
