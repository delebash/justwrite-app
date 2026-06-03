// Shared per-provider model list cache. Module-scoped reactive object so
// every ModelPicker instance (and any other caller) sees the same data
// without redundant model-list fetches when several pickers share a
// provider.
//
// Persisted to IndexedDB under `justwrite:modelList` so the cache
// survives page reloads — refetching a 200-model list every time the
// user opens Settings is wasteful and slow against cloud APIs that
// charge for /v1/models calls (Anthropic, OpenRouter, …).
//
// Cache shape: Record<providerId, ModelEntry[]> where
//   ModelEntry = { id, quant, state, type, publisher, arch }
// Fields are null when the server didn't provide them. See
// `OpenAICompatClient.enrichedModels()` for which paths populate which
// fields (LM Studio native API → full; OpenAI-spec fallback → id only).

import { reactive } from "vue";
import { OpenAICompatClient } from "../services/openai-compat.js";
import { useAiStore } from "../stores/ai.js";
import { getItem, setItem } from "../services/storage.js";

const STORAGE_KEY = "justwrite:modelList";

function loadCache() {
  try {
    const raw = getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch { return {}; }
}

function persist(cache) {
  try { setItem(STORAGE_KEY, JSON.stringify(cache)); } catch {}
}

// Reactive cache hydrated from storage at module load — the storage
// adapter's sync get() returns whatever was put in IDB during boot.
const modelsByProvider = reactive(loadCache());

export function useModelList() {
  const ai = useAiStore();

  // Force a re-fetch even when the cache is populated. The Refresh
  // button on ModelPicker (and any explicit user-initiated reload)
  // calls this.
  async function refreshModels(providerId) {
    if (!providerId) return;
    const provider = ai.providerById(providerId);
    if (!provider) return;
    try {
      const list = await new OpenAICompatClient(provider).enrichedModels();
      modelsByProvider[providerId] = list;
    } catch {
      // Leave the cache alone on failure — better to show stale results
      // than a blank list while the user is mid-pick. Explicit refresh
      // is the user's path to "this is wrong, try again."
      if (!modelsByProvider[providerId]) modelsByProvider[providerId] = [];
    }
    persist(modelsByProvider);
  }

  // Fetch only when the cache is empty for this provider — the lazy
  // path used by SettingsView's auto-load and ChatPanel's on-open
  // refresh. Users still get fresh data on first pick of a new
  // provider, but switching back to a previously-fetched one is
  // instant (and doesn't re-bill the cloud API).
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
