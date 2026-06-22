// Shared per-provider model list cache. Module-scoped reactive object so
// every ModelPicker instance (and any other caller) sees the same data
// without redundant model-list fetches when several pickers share a
// provider.
//
// In-memory only (NOT persisted). It's a cache of provider /v1/models
// responses — re-fetchable and quick to go stale — so it's rebuilt per
// session on first pick of each provider rather than stored. (It used to
// live in IndexedDB under justwrite:modelList; the storage rewrite dropped
// that rather than give a disposable cache a SQL home.)
//
// Cache shape: Record<providerId, ModelEntry[]> where
//   ModelEntry = { id, quant, state, type, publisher, arch }
// The shared `/v1/llm-providers/{id}/models` endpoint returns plain model ids
// (the server-side registry adapter's `models()`), so the enriched fields are
// null; ModelPicker reads `.id` and renders a quant badge only when present.

import { reactive } from "vue";
import { serverUrl } from "../services/serverApi.js";

// Reactive cache, empty at session start; populated lazily by ensureModels /
// refreshModels and shared across all pickers.
const modelsByProvider = reactive({});

export function useModelList() {
  // Force a re-fetch even when the cache is populated. The Refresh
  // button on ModelPicker (and any explicit user-initiated reload)
  // calls this. Hits the shared provider-models endpoint (server holds the
  // key + the live adapter); a 404 (unregistered provider) → empty list.
  async function refreshModels(providerId) {
    if (!providerId) return;
    try {
      const res = await fetch(serverUrl(`/v1/llm-providers/${encodeURIComponent(providerId)}/models`));
      if (!res.ok) throw new Error(`models -> ${res.status}`);
      const { models = [] } = await res.json();
      modelsByProvider[providerId] = models.map((id) => ({
        id, quant: null, state: null, type: null, publisher: null, arch: null,
      }));
    } catch {
      // Leave the cache alone on failure — better to show stale results
      // than a blank list while the user is mid-pick. Explicit refresh
      // is the user's path to "this is wrong, try again."
      if (!modelsByProvider[providerId]) modelsByProvider[providerId] = [];
    }
  }

  // Fetch only when the cache is empty for this provider — the lazy
  // path used by SettingsView's auto-load and ChatPanel's on-open
  // refresh. Users still get fresh data on first pick of a new
  // provider, but switching back to a previously-fetched one is
  // instant within the session.
  function ensureModels(providerId) {
    if (!providerId) return;
    const cached = modelsByProvider[providerId];
    if (cached && cached.length > 0) return;
    refreshModels(providerId);
  }

  function modelsFor(providerId) {
    return modelsByProvider[providerId] || [];
  }

  return { modelsFor, refreshModels, ensureModels };
}
