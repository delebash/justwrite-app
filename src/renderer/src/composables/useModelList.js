// Shared per-provider model list cache. Module-scoped reactive object so
// every ModelPicker instance (and any other caller) sees the same data
// without redundant model-list fetches when several pickers share a
// provider.
//
// Cache shape: Record<providerId, ModelEntry[]> where
//   ModelEntry = { id, quant, state, type, publisher, arch }
// Fields are null when the server didn't provide them. See
// `OpenAICompatClient.enrichedModels()` for which paths populate which
// fields (LM Studio native API → full; OpenAI-spec fallback → id only).

import { reactive } from "vue";
import { OpenAICompatClient } from "../services/openai-compat.js";
import { useAiStore } from "../stores/ai.js";

const modelsByProvider = reactive({});

export function useModelList() {
  const ai = useAiStore();

  async function refreshModels(providerId) {
    if (!providerId) return;
    const provider = ai.providerById(providerId);
    if (!provider) return;
    modelsByProvider[providerId] = modelsByProvider[providerId] || [];
    try {
      const list = await new OpenAICompatClient(provider).enrichedModels();
      modelsByProvider[providerId] = list;
    } catch {
      modelsByProvider[providerId] = [];
    }
  }

  function modelsFor(providerId) {
    return modelsByProvider[providerId] || [];
  }

  return { modelsFor, refreshModels };
}
