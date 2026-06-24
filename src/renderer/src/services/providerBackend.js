// ProviderBackend — JustWrite's client adapter for the SHARED provider-CRUD
// router (/v1/llm-providers, llm_runner.llm.provider_api) — the same surface
// JustVoice's llmBackend.js talks to. Per-provider create/update/delete plus a
// synchronous boot cache so the AI store's bootstrap reads the list before Vue
// mounts. Replaces the old whole-list bulk-PUT seam.
//
// The list/draft shape IS the shared camelCase contract:
//   { id, name, providerType, baseUrl, defaultModel, embeddingModel,
//     timeoutSeconds, hasApiKey, registered }
// `apiKey` is write-only — sent on create/update, never returned (the server
// holds it). This is the shape the shared @delebash/llm-ui consumes too, so
// Unit 4 can drop this per-app file for the shared backend.

import { get, post, patch, del } from "@delebash/llm-ui";

let _providers = null; // null = not yet booted
let _booted = false;

// Form draft -> the server's UpsertLLMProviderRequest (camelCase). apiKey is
// only sent when the field is present; an empty string on PATCH means "keep the
// existing key" (the server's write-only semantics).
function _toUpsert(d) {
  const body = {
    id: d.id,
    name: d.name,
    providerType: d.providerType || "openai-compat",
    baseUrl: d.baseUrl || "",
    defaultModel: d.defaultModel || "",
    embeddingModel: d.embeddingModel || "",
  };
  if (d.apiKey !== undefined) body.apiKey = d.apiKey;
  if (d.timeoutSeconds !== undefined) body.timeoutSeconds = d.timeoutSeconds;
  return body;
}

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

/** POST a new provider; resolves to the created provider (shared shape). */
export async function createProvider(draft) {
  return post("/v1/llm-providers", _toUpsert(draft));
}

/** PATCH an existing provider (full upsert; id immutable). */
export async function updateProvider(id, draft) {
  return patch(`/v1/llm-providers/${encodeURIComponent(id)}`, _toUpsert({ ...draft, id }));
}

/** DELETE a provider. */
export async function deleteProvider(id) {
  await del(`/v1/llm-providers/${encodeURIComponent(id)}`);
}
