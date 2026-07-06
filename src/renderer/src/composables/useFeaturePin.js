// useFeaturePin — THE JustWrite binding between a feature's routing pin and
// the UI (C5). One place owns the inherit sentinel, the provider/model option
// building, the setFeaturePin writes, and the model-list refresh — consumed by
// BOTH the AiFeatureChip binding (the kit LuFeatureChip's host adapter) and
// ChatPanel's inline picker row, which previously duplicated all of this
// nearly line-for-line. Model lists come from the kit's shared cache
// (useProviderModels); pin state lives in the ai store (the same per-feature
// pins Settings → AI → Feature routing edits).
//
// `feature` may be a string or a Ref/computed (ChatPanel passes the ACTIVE
// chat feature — chat | characterChat — so the row edits the pin the run
// actually routes on).

import { computed, unref } from "vue";
import { useProviderModels } from "@delebash/llm-ui";
import { useAiStore } from "../stores/ai.js";

// The "no explicit pin" sentinel for the provider select.
export const INHERIT = "__inherit__";

export function useFeaturePin(feature) {
  const ai = useAiStore();
  const { modelsFor, ensureModels, refreshModels } = useProviderModels();
  const key = computed(() => unref(feature));

  // Resolved display values — providerForFeature already falls back to the
  // default; modelForFeature returns null when nothing's pinned (then the
  // provider's configured default shows).
  const resolvedProvider = computed(() => ai.providerForFeature(key.value));
  const resolvedModel = computed(
    () => ai.modelForFeature(key.value) || resolvedProvider.value?.defaultModel || "—",
  );

  // Raw pin state — drives the selects.
  const pinnedProviderId = computed(() => ai.featurePins?.[key.value]?.providerId || INHERIT);
  const pinnedModel = computed(() => ai.featurePins?.[key.value]?.model || "");
  const isPinned = computed(() => pinnedProviderId.value !== INHERIT);

  // Provider options — Inherit + every ready LLM provider.
  const providerOptions = computed(() => {
    const opts = [{ value: INHERIT, label: `Inherit default · ${ai.llmProvider?.name || "—"}` }];
    for (const p of ai.readyLlmProviders) opts.push({ value: p.id, label: p.name });
    return opts;
  });

  // Model options — the provider's saved default first (always selectable
  // even if the live fetch failed), then the fetched list, de-duped.
  const modelOptions = computed(() => {
    if (pinnedProviderId.value === INHERIT) return [];
    const provider = ai.providerById(pinnedProviderId.value);
    const list = modelsFor(pinnedProviderId.value);
    const seen = new Set();
    const out = [];
    if (provider?.defaultModel) {
      out.push({ value: provider.defaultModel, label: `${provider.defaultModel} (configured default)` });
      seen.add(provider.defaultModel);
    }
    for (const id of list) {
      if (id && !seen.has(id)) { out.push({ value: id, label: id }); seen.add(id); }
    }
    return out;
  });

  function setProvider(providerId) {
    if (!providerId || providerId === INHERIT) {
      ai.setFeaturePin(key.value, null);
      return;
    }
    const p = ai.providerById(providerId);
    ai.setFeaturePin(key.value, { providerId, model: p?.defaultModel || "" });
    // Force a fresh fetch — the lazy ensure would skip if a prior failed
    // attempt left an empty list in the cache.
    refreshModels(providerId);
  }

  function setModel(model) {
    const pin = ai.featurePins?.[key.value];
    if (!pin?.providerId) return;
    ai.setFeaturePin(key.value, { providerId: pin.providerId, model: model || pin.model });
  }

  // The Refresh affordance (button / popover-open) for the pinned provider.
  function refresh() {
    if (isPinned.value) refreshModels(pinnedProviderId.value);
  }

  return {
    resolvedProvider, resolvedModel,
    pinnedProviderId, pinnedModel, isPinned,
    providerOptions, modelOptions,
    setProvider, setModel, refresh, ensureModels,
  };
}
