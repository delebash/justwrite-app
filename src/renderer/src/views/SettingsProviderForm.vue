<script setup>
// Shared editor for an AI provider. Used twice in SettingsView:
//   - inline at the top of the provider list when adding (editingKey === "new")
//   - inline in place of a provider's read row when editing it
// The two render sites differ only in vertical position; everything inside
// this component is identical between them.

import { ref, computed } from "vue";
import { useI18n } from "vue-i18n";
import { OpenAICompatClient, detectRunner } from "../services/openai-compat.js";
import { entryLabel, TIERS, TIER_IDS } from "../services/modelMeta.js";
import { useAiStore } from "../stores/ai.js";
import Combobox from "../components/Combobox.vue";
import JwInput from "@renderer/components/ui/JwInput.vue";
import JwSelect from "@renderer/components/ui/JwSelect.vue";
import JwButton from "@renderer/components/ui/JwButton.vue";
import JwSegmented from "@renderer/components/ui/JwSegmented.vue";

useI18n();
const ai = useAiStore();


const props = defineProps({
  draft: { type: Object, required: true },
  editingKey: { type: String, required: true }, // "new" or provider id
});
const emit = defineEmits(["save", "cancel"]);

// ── Model discovery — enriched ────────────────────────────────────
// Uses OpenAICompatClient.enrichedModels() which tries LM Studio's
// /api/v0/models first (quant + state per entry) and falls back to
// /v1/models for other servers. Each entry gets a precomputed `label`
// so the Combobox can show "qwen/qwen3-8b · Q4_K_M · not loaded" while
// still binding the bare id to draft.chatModel / draft.embeddingModel.
// Unfiltered fetch — every model the server reports, regardless of type.
// Two computeds slice it into the chat and embedding dropdowns so a single
// Fetch populates both at once (chat hides nomic-embed-* and any voice/ASR
// models the server happens to report; embedding shows only the embed-* ones).
const fetchedModels = ref([]);
const modelsLoading = ref(false);
const modelsError = ref(null);

const EMBED_RX = /embed/i;
// Voice/ASR models a shared server may list — kept out of the chat dropdown.
// JustWrite has no audio; this is purely cosmetic list hygiene.
const NON_CHAT_RX = /tts|whisper|speech/i;
const chatFetchedModels = computed(() =>
  fetchedModels.value.filter((e) => !EMBED_RX.test(e.id) && !NON_CHAT_RX.test(e.id)),
);
const embeddingFetchedModels = computed(() =>
  fetchedModels.value.filter((e) => EMBED_RX.test(e.id)),
);

async function fetchModels() {
  if (!props.draft?.baseUrl) return;
  modelsError.value = null;
  modelsLoading.value = true;
  try {
    const list = await new OpenAICompatClient(props.draft).enrichedModels({ kind: "all" });
    fetchedModels.value = list.map((entry) => ({ ...entry, label: entryLabel(entry) }));
    if (!list.length) modelsError.value = "Server returned an empty list. Make sure a model is loaded.";
  } catch (e) {
    modelsError.value = e.message || "Failed to fetch.";
  } finally {
    modelsLoading.value = false;
  }
}

// ── Tier options for JwSegmented ─────────────────────────────────────
const TIER_OPTIONS = TIER_IDS.map((id) => ({ value: id, label: TIERS[id].label }));

// ── Runner (LLM endpoint family) ───────────────────────────────────
// Shows the explicit `draft.runner` if set, otherwise the URL-based
// auto-detect. Picking from the select writes to `draft.runner`, which
// pins the explicit choice from then on.
const runnerValue = computed(() => detectRunner(props.draft));

// ── Tier (attribution-pipeline capability bucket) ──────────────────
// Resolved tier for the currently-picked chat model. Driven by
// modelMeta's name heuristic, with an optional user pin in ai.modelTiers.
// "auto" = heuristic-derived; "pinned" = explicit override.
const currentTier = computed(() => {
  const id = props.draft.chatModel;
  return id ? ai.resolveTier(id) : null;
});
const tierSource = computed(() => {
  const id = props.draft.chatModel;
  return id ? ai.tierSource(id) : "auto";
});
function pinTier(tierId) {
  if (!props.draft.chatModel) return;
  ai.setModelTier(props.draft.chatModel, tierId);
}
function clearTierPin() {
  if (!props.draft.chatModel) return;
  ai.clearModelTier(props.draft.chatModel);
}

</script>

<template>
  <div style="padding:14px;border:1.5px solid var(--accent);border-radius:10px;background:var(--accent-soft)">
    <div style="display:grid;grid-template-columns:120px minmax(0,1fr);gap:8px 12px;font-size:12.5px;align-items:center">
      <span class="t-muted">{{ $t('settings.providerForm.fieldId') }}</span>
      <JwInput v-model="draft.id" :readonly="editingKey !== 'new'" :placeholder="$t('settings.providerForm.fieldIdPlaceholder')" />
      <span class="t-muted">{{ $t('settings.providerForm.fieldName') }}</span>
      <JwInput v-model="draft.name" :placeholder="$t('settings.providerForm.fieldNamePlaceholder')" />
      <span class="t-muted">{{ $t('settings.providerForm.fieldBaseUrl') }}</span>
      <JwInput v-model="draft.baseUrl" placeholder="http://localhost:11434/v1" />
      <span class="t-muted">{{ $t('settings.providerForm.fieldApiKey') }}</span>
      <JwInput v-model="draft.apiKey" type="password" :placeholder="$t('settings.providerForm.fieldApiKeyPlaceholder')" />

      <template>
        <span class="t-muted" :title="$t('settings.providerForm.fieldApiFormatTitle')">{{ $t('settings.providerForm.fieldApiFormat') }}</span>
        <JwSelect :model-value="runnerValue" @update:model-value="draft.runner = $event"
          :options="[
            { label: $t('settings.providerForm.runnerOpenai'), value: 'openai-compat' },
            { label: $t('settings.providerForm.runnerOllama'), value: 'ollama' },
          ]"
          optionLabel="label" optionValue="value" />
      </template>

      <template>
        <span class="t-muted">{{ $t('settings.providerForm.fieldChatModel') }}</span>
        <div style="display:flex;gap:6px;align-items:stretch;flex-wrap:wrap">
          <Combobox style="flex:1;min-width:160px"
            v-model="draft.chatModel"
            :items="chatFetchedModels"
            item-value="id"
            item-label="label"
            free-text
            :placeholder="chatFetchedModels.length ? `Type to filter or click ▾ to pick from ${chatFetchedModels.length} chat models` : $t('settings.providerForm.chatModelPlaceholder')"
            :chev-title="chatFetchedModels.length ? $t('settings.providerForm.chevShowFetched') : $t('settings.providerForm.chevFetchFirst')" />
          <JwButton intent="ghost" type="button"
            :disabled="modelsLoading || !draft.baseUrl"
            @click="fetchModels"
            v-tooltip.bottom="draft.baseUrl ? $t('settings.providerForm.tooltipFetchModels') : $t('settings.providerForm.tooltipFillBaseUrl')">
            {{ modelsLoading ? $t('settings.providerForm.btnLoading') : (fetchedModels.length ? $t('settings.providerForm.btnRefresh') : $t('settings.providerForm.btnFetchModels')) }}
          </JwButton>
          <div v-if="modelsError" class="t-muted" style="flex-basis:100%;font-size:11px;color:var(--danger,#c33)">
            {{ modelsError }}
          </div>
        </div>

        <template v-if="draft.chatModel">
          <span class="t-muted" :title="$t('settings.providerForm.fieldTierTitle')">{{ $t('settings.providerForm.fieldTier') }}</span>
          <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;font-size:11.5px">
            <JwSegmented
              :model-value="currentTier?.id"
              :options="TIER_OPTIONS"
              size="small"
              :aria-label="$t('settings.providerForm.fieldTier')"
              @update:model-value="pinTier($event)" />
            <span class="t-muted" style="font-size:11px">{{ tierSource === 'pinned' ? $t('settings.providerForm.tierPinned') : $t('settings.providerForm.tierAuto') }}</span>
            <JwButton v-if="tierSource === 'pinned'" intent="ghost" type="button"
              style="padding:2px 8px;font-size:11px"
              @click="clearTierPin"
              v-tooltip.bottom="$t('settings.providerForm.tooltipClearPin')">{{ $t('settings.providerForm.btnClearPin') }}</JwButton>
          </div>
        </template>

        <span class="t-muted" :title="$t('settings.providerForm.fieldEmbeddingModelTitle')">{{ $t('settings.providerForm.fieldEmbeddingModel') }}</span>
        <Combobox
          v-model="draft.embeddingModel"
          :items="embeddingFetchedModels"
          item-value="id"
          item-label="label"
          free-text
          :placeholder="embeddingFetchedModels.length ? `Type to filter or click ▾ to pick from ${embeddingFetchedModels.length} embedding models` : 'text-embedding-3-small  ·  nomic-embed-text  ·  …'"
          :chev-title="embeddingFetchedModels.length ? $t('settings.providerForm.chevShowFetched') : $t('settings.providerForm.chevFetchFirst')" />
      </template>
    </div>
    <div style="display:flex;gap:8px;margin-top:14px;justify-content:flex-end">
      <JwButton :label="$t('settings.providerForm.btnCancel')" intent="ghost" @click="emit('cancel')" />
      <JwButton :label="$t('settings.providerForm.btnSave')" intent="primary" @click="emit('save')" />
    </div>
  </div>
</template>
