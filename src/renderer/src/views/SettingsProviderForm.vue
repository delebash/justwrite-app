<script setup>
// Shared editor for an AI provider. Used twice in SettingsView:
//   - inline at the top of the provider list when adding (editingKey === "new")
//   - inline in place of a provider's read row when editing it
// The two render sites differ only in vertical position; everything inside
// this component is identical between them.

import { ref, reactive, computed, onBeforeUnmount, onMounted, nextTick, watch } from "vue";
import { useI18n } from "vue-i18n";
import { getParamSchema } from "../domain/providerParams.js";
import { OpenAICompatClient, detectRunner, isChatterbox, isDia, CHATTERBOX_MODELS, DIA_MODELS } from "../services/openai-compat.js";
import { entryLabel, TIERS, TIER_IDS } from "../services/modelMeta.js";
import { useAiStore } from "../stores/ai.js";
import { pushToast } from "../services/toastBridge.js";
import Icon from "../components/Icon.vue";
import Combobox from "../components/Combobox.vue";
import JwInput from "@renderer/components/ui/JwInput.vue";
import JwTextarea from "@renderer/components/ui/JwTextarea.vue";
import JwCheckbox from "@renderer/components/ui/JwCheckbox.vue";
import JwNumber from "@renderer/components/ui/JwNumber.vue";
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
// still binding the bare id to draft.chatModel / draft.ttsModel.
// Unfiltered fetch — every model the server reports, regardless of type.
// Three computeds slice it into the per-purpose dropdowns below so a single
// Fetch populates the chat, embedding, and TTS Combobox simultaneously
// (chat dropdown hides nomic-embed-* and similar; the embedding dropdown
// shows only those).
const fetchedModels = ref([]);
const modelsLoading = ref(false);
const modelsError = ref(null);

const EMBED_RX = /embed/i;
const TTS_RX = /tts|whisper|speech/i;
const chatFetchedModels = computed(() =>
  fetchedModels.value.filter((e) => !EMBED_RX.test(e.id) && !TTS_RX.test(e.id)),
);
const embeddingFetchedModels = computed(() =>
  fetchedModels.value.filter((e) => EMBED_RX.test(e.id)),
);
const ttsFetchedModels = computed(() =>
  fetchedModels.value.filter((e) => TTS_RX.test(e.id)),
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

// ── Voice discovery (GET /v1/audio/voices on the draft's baseUrl) ──
// Probe with an empty ttsVoices override so we get the server's actual
// list rather than the provider's existing voices echoed back.
const fetchedVoices = ref([]);
const voicesLoading = ref(false);
const voicesError = ref(null);

async function fetchVoices() {
  if (!props.draft?.baseUrl) return;
  voicesError.value = null;
  voicesLoading.value = true;
  try {
    const probe = { ...props.draft, ttsVoices: [] };
    const list = await new OpenAICompatClient(probe).voices();
    fetchedVoices.value = list.map((v) => v.id || v.name).filter(Boolean);
    if (!fetchedVoices.value.length) voicesError.value = "Server didn't return any voices.";
  } catch (e) {
    voicesError.value = e.message || "Failed to fetch.";
  } finally {
    voicesLoading.value = false;
  }
}

// ── Voices combobox (multi-select toggle) ─────────────────────────
// Same look as the model combo, but each click toggles a voice in/out
// of the comma list and the dropdown stays open so the user can pick
// several at once. The input itself stays freely editable.
function makeVoicesCombo() {
  const state = reactive({ open: false, hover: -1 });
  let boxEl = null;
  let listEl = null;

  const currentList = computed(() =>
    Array.isArray(props.draft.ttsVoices) ? props.draft.ttsVoices : [],
  );
  const items = computed(() => fetchedVoices.value);

  function isSelected(v) { return currentList.value.includes(v); }
  function toggle(v) {
    const cur = [...currentList.value];
    const i = cur.indexOf(v);
    if (i >= 0) cur.splice(i, 1);
    else cur.push(v);
    props.draft.ttsVoices = cur;
  }

  function openIt() {
    if (!items.value.length) return;
    state.open = true;
    state.hover = Math.max(0, state.hover);
    nextTick(scrollActive);
  }
  function closeIt() { state.open = false; }
  function toggleIt() { state.open ? closeIt() : openIt(); }
  function scrollActive() {
    const el = listEl?.children?.[state.hover];
    el?.scrollIntoView({ block: "nearest" });
  }
  function onKey(e) {
    if (!items.value.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!state.open) return openIt();
      state.hover = Math.min(items.value.length - 1, state.hover + 1);
      scrollActive();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!state.open) return openIt();
      state.hover = Math.max(0, state.hover - 1);
      scrollActive();
    } else if (e.key === "Enter") {
      if (state.open && items.value[state.hover]) {
        e.preventDefault();
        toggle(items.value[state.hover]);
      }
    } else if (e.key === "Escape") {
      if (state.open) { e.preventDefault(); closeIt(); }
    }
  }
  function onDocClick(e) {
    if (state.open && boxEl && !boxEl.contains(e.target)) closeIt();
  }
  document.addEventListener("mousedown", onDocClick);
  onBeforeUnmount(() => document.removeEventListener("mousedown", onDocClick));

  return {
    state, items, isSelected, toggle,
    setBoxRef: (el) => { boxEl = el; },
    setListRef: (el) => { listEl = el; },
    openIt, closeIt, toggleIt, onKey,
  };
}

const voices = makeVoicesCombo();

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

// ── Engine-specific param fields ──────────────────────────────────
const paramSchema = computed(() => getParamSchema(props.draft));

function getParam(key) {
  return props.draft?.params?.[key];
}
function setParam(key, value) {
  if (!props.draft) return;
  const next = { ...(props.draft.params || {}) };
  if (value === undefined || value === "" || Number.isNaN(value)) {
    delete next[key];
  } else {
    next[key] = value;
  }
  props.draft.params = next;
}
function resetParam(key) { setParam(key, undefined); }

// ── Chatterbox model + live engine state ──────────────────────────
// Shown only when editing the Chatterbox provider. /v1/models doesn't
// exist on this server, so the picker is the hard-coded CHATTERBOX_MODELS
// constant. Applying a choice POSTs /save_settings + /restart_server on
// the draft's baseUrl — server hot-swaps the model (no process restart),
// then we refresh /api/model-info so the active type label and any
// paralinguistic-tag chips reflect the new state.
const isChatterboxDraft = computed(() => isChatterbox(props.draft));
const CHATTERBOX_MODEL_OPTIONS = CHATTERBOX_MODELS.map((m) => ({
  value: m.id, label: m.label,
}));
const chatterboxInfo = ref(null);
const chatterboxInfoError = ref(null);
const chatterboxApplying = ref(false);

async function refreshChatterboxInfo() {
  if (!isChatterboxDraft.value || !props.draft.baseUrl) return;
  chatterboxInfoError.value = null;
  try {
    chatterboxInfo.value = await new OpenAICompatClient(props.draft).chatterboxModelInfo();
  } catch (e) {
    chatterboxInfo.value = null;
    chatterboxInfoError.value = e.message || "Couldn't reach the server.";
  }
}

async function applyChatterboxModel() {
  if (!isChatterboxDraft.value) return;
  const repoId = props.draft.ttsModel;
  if (!repoId) return;
  chatterboxApplying.value = true;
  try {
    const { restarted } = await new OpenAICompatClient(props.draft).chatterboxSetModel(repoId);
    pushToast({
      message: restarted
        ? `Switched Chatterbox to ${repoId} (hot-swapped).`
        : `Chatterbox is already running ${repoId}.`,
    });
    await refreshChatterboxInfo();
  } catch (e) {
    pushToast({ message: `Couldn't switch model: ${e.message || e}` });
  } finally {
    chatterboxApplying.value = false;
  }
}

// Refresh on mount when editing Chatterbox, and again if the user pastes
// a different baseUrl (e.g. running the server on a non-default port).
onMounted(() => { if (isChatterboxDraft.value) refreshChatterboxInfo(); });
watch(() => props.draft?.baseUrl, () => {
  if (isChatterboxDraft.value) refreshChatterboxInfo();
});

const chatterboxParalingTags = computed(() => {
  const info = chatterboxInfo.value;
  if (!info?.supports_paralinguistic_tags) return [];
  return info.available_paralinguistic_tags || [];
});

// ── Dia model + live engine state (same shape as Chatterbox) ─────
// devnen/Dia-TTS-Server v2.0.0+ hot-swaps between Dia 1.6B and the
// Dia2 family via the same /save_settings + /restart_server control
// plane as Chatterbox. The model list prefers a live
// GET /api/model-registry response so newer server builds with extra
// models surface without a JustWrite update; we fall back to the
// hard-coded DIA_MODELS when the registry endpoint isn't available
// (pre-v2 servers).
const isDiaDraft = computed(() => isDia(props.draft));
const diaModels = ref([...DIA_MODELS]);
const diaInfo = ref(null);
const diaInfoError = ref(null);
const diaApplying = ref(false);

const diaModelOptions = computed(() =>
  diaModels.value.map((m) => ({ value: m.id, label: m.label })),
);

async function refreshDiaInfo() {
  if (!isDiaDraft.value || !props.draft.baseUrl) return;
  diaInfoError.value = null;
  const client = new OpenAICompatClient(props.draft);
  try {
    const [info, registry] = await Promise.all([
      client.diaModelInfo().catch((e) => { throw e; }),
      client.diaModelRegistry().catch(() => null),
    ]);
    diaInfo.value = info;
    if (registry && registry.length) diaModels.value = registry;
  } catch (e) {
    diaInfo.value = null;
    diaInfoError.value = e.message || "Couldn't reach the server.";
  }
}

async function applyDiaModel() {
  if (!isDiaDraft.value) return;
  const repoId = props.draft.ttsModel;
  if (!repoId) return;
  diaApplying.value = true;
  try {
    const { restarted } = await new OpenAICompatClient(props.draft).diaSetModel(repoId);
    pushToast({
      message: restarted
        ? `Switched Dia to ${repoId} (hot-swapped).`
        : `Dia is already running ${repoId}.`,
    });
    await refreshDiaInfo();
  } catch (e) {
    pushToast({ message: `Couldn't switch model: ${e.message || e}` });
  } finally {
    diaApplying.value = false;
  }
}

onMounted(() => { if (isDiaDraft.value) refreshDiaInfo(); });
watch(() => props.draft?.baseUrl, () => {
  if (isDiaDraft.value) refreshDiaInfo();
});
</script>

<template>
  <div style="padding:14px;border:1.5px solid var(--accent);border-radius:10px;background:var(--accent-soft)">
    <div style="display:grid;grid-template-columns:120px minmax(0,1fr);gap:8px 12px;font-size:12.5px;align-items:center">
      <span class="t-muted">{{ $t('settings.providerForm.fieldId') }}</span>
      <JwInput v-model="draft.id" :readonly="editingKey !== 'new'" :placeholder="$t('settings.providerForm.fieldIdPlaceholder')" />
      <span class="t-muted">{{ $t('settings.providerForm.fieldName') }}</span>
      <JwInput v-model="draft.name" :placeholder="$t('settings.providerForm.fieldNamePlaceholder')" />
      <span class="t-muted">{{ $t('settings.providerForm.fieldKind') }}</span>
      <JwSelect v-model="draft.kind" :options="[{ label: $t('settings.providerForm.kindLlm'), value: 'llm' }, { label: $t('settings.providerForm.kindTts'), value: 'tts' }, { label: $t('settings.providerForm.kindBoth'), value: 'both' }]" optionLabel="label" optionValue="value" />
      <span class="t-muted">{{ $t('settings.providerForm.fieldBaseUrl') }}</span>
      <JwInput v-model="draft.baseUrl" placeholder="http://localhost:11434/v1" />
      <span class="t-muted">{{ $t('settings.providerForm.fieldApiKey') }}</span>
      <JwInput v-model="draft.apiKey" type="password" :placeholder="$t('settings.providerForm.fieldApiKeyPlaceholder')" />

      <template v-if="draft.kind === 'llm' || draft.kind === 'both'">
        <span class="t-muted" :title="$t('settings.providerForm.fieldApiFormatTitle')">{{ $t('settings.providerForm.fieldApiFormat') }}</span>
        <JwSelect :model-value="runnerValue" @update:model-value="draft.runner = $event"
          :options="[
            { label: $t('settings.providerForm.runnerOpenai'), value: 'openai-compat' },
            { label: $t('settings.providerForm.runnerOllama'), value: 'ollama' },
          ]"
          optionLabel="label" optionValue="value" />
      </template>

      <template v-if="draft.kind === 'llm' || draft.kind === 'both'">
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

      <template v-if="draft.kind === 'tts' || draft.kind === 'both'">
        <template v-if="!isChatterboxDraft && !isDiaDraft">
          <span class="t-muted">{{ $t('settings.providerForm.fieldTtsModel') }}</span>
          <div style="display:flex;gap:6px;align-items:stretch;flex-wrap:wrap">
            <Combobox style="flex:1;min-width:160px"
              v-model="draft.ttsModel"
              :items="ttsFetchedModels"
              item-value="id"
              item-label="label"
              free-text
              :placeholder="ttsFetchedModels.length ? `Type to filter or click ▾ to pick from ${ttsFetchedModels.length} TTS models` : $t('settings.providerForm.ttsModelPlaceholder')"
              :chev-title="ttsFetchedModels.length ? $t('settings.providerForm.chevShowFetched') : $t('settings.providerForm.chevFetchFirstTts')" />
            <JwButton v-if="draft.kind === 'tts'" intent="ghost" type="button"
              :disabled="modelsLoading || !draft.baseUrl"
              @click="fetchModels"
              v-tooltip.bottom="draft.baseUrl ? $t('settings.providerForm.tooltipFetchModels') : $t('settings.providerForm.tooltipFillBaseUrl')">
              {{ modelsLoading ? $t('settings.providerForm.btnLoading') : (fetchedModels.length ? $t('settings.providerForm.btnRefresh') : $t('settings.providerForm.btnFetchModels')) }}
            </JwButton>
            <div v-if="draft.kind === 'tts' && modelsError" class="t-muted" style="flex-basis:100%;font-size:11px;color:var(--danger,#c33)">
              {{ modelsError }}
            </div>
          </div>
        </template>
        <span class="t-muted">{{ $t('settings.providerForm.fieldVoices') }}</span>
        <div style="display:flex;gap:6px;align-items:stretch;flex-wrap:wrap">
          <div class="model-combo" :class="{ open: voices.state.open }" :ref="voices.setBoxRef" style="flex:1;min-width:160px;position:relative">
            <JwInput class="input model-combo-input"
              :value="draft.ttsVoices?.join(', ') || ''"
              @input="draft.ttsVoices = $event.target.value.split(',').map(v => v.trim()).filter(Boolean)"
              @focus="voices.openIt"
              @click="voices.openIt"
              @keydown="voices.onKey"
              :placeholder="voices.items.length ? `Type or click ▾ to pick from ${voices.items.length} fetched voices` : $t('settings.providerForm.voicesPlaceholder')" />
            <button type="button" class="model-combo-chev"
              :disabled="!voices.items.length"
              v-tooltip.bottom="voices.items.length ? $t('settings.providerForm.tooltipPickVoices') : $t('settings.providerForm.tooltipFetchVoicesFirst')"
              @mousedown.prevent
              @click="voices.toggleIt">
              <Icon name="ChevDown" :size="13" class="model-combo-chev-icon" />
            </button>
            <ul v-if="voices.state.open && voices.items.length" :ref="voices.setListRef" class="model-combo-list">
              <li v-for="(v, i) in voices.items" :key="v"
                :class="{ active: i === voices.state.hover, selected: voices.isSelected(v) }"
                @mousedown.prevent="voices.toggle(v)"
                @mouseenter="voices.state.hover = i">
                <span class="voice-check">
                  <Icon v-if="voices.isSelected(v)" name="Check" :size="11" />
                </span>
                {{ v }}
              </li>
            </ul>
          </div>
          <JwButton intent="ghost" type="button"
            :disabled="voicesLoading || !draft.baseUrl"
            @click="fetchVoices"
            v-tooltip.bottom="draft.baseUrl ? $t('settings.providerForm.tooltipFetchVoices') : $t('settings.providerForm.tooltipFillBaseUrl')">
            {{ voicesLoading ? $t('settings.providerForm.btnLoading') : (fetchedVoices.length ? $t('settings.providerForm.btnRefresh') : $t('settings.providerForm.btnFetchVoices')) }}
          </JwButton>
          <div v-if="voicesError" class="t-muted" style="flex-basis:100%;font-size:11px;color:var(--danger,#c33)">
            {{ voicesError }}
          </div>
        </div>

        <template v-if="isChatterboxDraft">
          <div style="grid-column:1/-1;display:flex;align-items:baseline;gap:8px;margin-top:8px;padding-top:10px;border-top:1px dashed var(--border)">
            <span class="t-eyebrow" style="font-size:10.5px">Chatterbox engine</span>
            <span class="t-muted" style="font-size:11px">Three models share the same server, hot-swapped via <code>/save_settings</code> + <code>/restart_server</code>.</span>
          </div>
          <span class="t-muted" title="The model the writer wants loaded — applied to the live server via Apply.">Model</span>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <JwSegmented
              :model-value="draft.ttsModel || 'chatterbox-turbo'"
              :options="CHATTERBOX_MODEL_OPTIONS"
              size="small"
              aria-label="Chatterbox model"
              @update:model-value="(v) => draft.ttsModel = v" />
            <JwButton type="button" intent="primary" size="small"
              :disabled="chatterboxApplying || !draft.baseUrl || !draft.ttsModel"
              @click="applyChatterboxModel"
              v-tooltip.bottom="'POST /save_settings then /restart_server — first load of a model may take 10–30s while it downloads.'">
              {{ chatterboxApplying ? "Switching…" : "Apply" }}
            </JwButton>
            <JwButton type="button" intent="ghost" size="small"
              :disabled="chatterboxApplying || !draft.baseUrl"
              @click="refreshChatterboxInfo"
              v-tooltip.bottom="'GET /api/model-info — refresh the live engine state below.'">
              Refresh
            </JwButton>
          </div>
          <span class="t-muted">Active on server</span>
          <div style="display:flex;flex-direction:column;gap:4px;font-size:11.5px">
            <div v-if="chatterboxInfoError" style="color:var(--danger,#c33)">
              {{ chatterboxInfoError }}
            </div>
            <div v-else-if="!chatterboxInfo" class="t-muted" style="font-style:italic">
              Probing…
            </div>
            <template v-else>
              <div>
                <code>{{ chatterboxInfo.type || "unknown" }}</code>
                <span class="t-muted"> · {{ chatterboxInfo.class_name }} · {{ chatterboxInfo.device }} · {{ chatterboxInfo.sample_rate }} Hz</span>
              </div>
              <div v-if="chatterboxParalingTags.length" style="display:flex;gap:4px;align-items:center;flex-wrap:wrap;margin-top:4px">
                <span class="t-muted">Paralinguistic tags:</span>
                <code v-for="tag in chatterboxParalingTags" :key="tag"
                  style="font-size:10.5px;padding:1px 5px;background:var(--surface-3);border-radius:3px">[{{ tag }}]</code>
                <span class="t-muted" style="font-size:10.5px"> — drop into your manuscript text to cue them.</span>
              </div>
              <div v-if="chatterboxInfo.supports_multilingual && chatterboxInfo.supported_languages" class="t-muted" style="margin-top:2px">
                Languages: {{ Object.keys(chatterboxInfo.supported_languages).join(", ") }}
              </div>
            </template>
          </div>
        </template>

        <template v-if="isDiaDraft">
          <div style="grid-column:1/-1;display:flex;align-items:baseline;gap:8px;margin-top:8px;padding-top:10px;border-top:1px dashed var(--border)">
            <span class="t-eyebrow" style="font-size:10.5px">Dia engine</span>
            <span class="t-muted" style="font-size:11px">Dia 1.6B and the Dia2 family hot-swap on one server (devnen v2.0+). VRAM grows with model size.</span>
          </div>
          <span class="t-muted" title="The model the writer wants loaded — applied to the live server via Apply.">Model</span>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <JwSegmented
              :model-value="draft.ttsModel || 'ttj/dia-1.6b-safetensors'"
              :options="diaModelOptions"
              size="small"
              aria-label="Dia model"
              @update:model-value="(v) => draft.ttsModel = v" />
            <JwButton type="button" intent="primary" size="small"
              :disabled="diaApplying || !draft.baseUrl || !draft.ttsModel"
              @click="applyDiaModel"
              v-tooltip.bottom="'POST /save_settings then /restart_server — first load of a Dia2 model may take 30–90s while it downloads from HuggingFace.'">
              {{ diaApplying ? "Switching…" : "Apply" }}
            </JwButton>
            <JwButton type="button" intent="ghost" size="small"
              :disabled="diaApplying || !draft.baseUrl"
              @click="refreshDiaInfo"
              v-tooltip.bottom="'GET /api/model-info — refresh the live engine state below.'">
              Refresh
            </JwButton>
          </div>
          <span class="t-muted">Active on server</span>
          <div style="display:flex;flex-direction:column;gap:4px;font-size:11.5px">
            <div v-if="diaInfoError" style="color:var(--danger,#c33)">
              {{ diaInfoError }}
              <span class="t-muted" style="display:block;margin-top:2px;font-size:10.5px">If you're on devnen Dia-TTS-Server v1.x, model-switching needs v2.0+. Dia 1.6B will still synth from the legacy code path.</span>
            </div>
            <div v-else-if="!diaInfo" class="t-muted" style="font-style:italic">
              Probing…
            </div>
            <template v-else>
              <div>
                <code>{{ diaInfo.repo_id || diaInfo.type || "unknown" }}</code>
                <span class="t-muted"> · {{ diaInfo.class_name || "" }} · {{ diaInfo.device || "" }}<span v-if="diaInfo.sample_rate"> · {{ diaInfo.sample_rate }} Hz</span></span>
              </div>
            </template>
          </div>
        </template>

        <template v-if="paramSchema.length">
          <div style="grid-column:1/-1;display:flex;align-items:baseline;gap:8px;margin-top:8px;padding-top:10px;border-top:1px dashed var(--border)">
            <span class="t-eyebrow" style="font-size:10.5px">{{ $t('settings.providerForm.engineParamsHeading') }}</span>
            <span class="t-muted" style="font-size:11px">{{ $t('settings.providerForm.engineParamsHint') }}</span>
          </div>
          <template v-for="f in paramSchema" :key="f.key">
            <span class="t-muted" :title="f.help || ''"
              :style="f.help ? 'cursor:help;text-decoration:underline dotted var(--border-strong);text-underline-offset:3px' : ''">
              {{ f.label }}
            </span>
            <div style="display:flex;gap:6px;align-items:center">
              <JwNumber v-if="f.type === 'number'"
                :min="f.min" :max="f.max" :step="f.step"
                :placeholder="f.placeholder || (f.default !== undefined ? `default ${f.default}` : '')"
                :model-value="getParam(f.key) ?? null"
                @update:model-value="(v) => setParam(f.key, v === null ? undefined : v)" />
              <JwSelect v-else-if="f.type === 'select'"
                :model-value="getParam(f.key) ?? f.default ?? ''"
                @update:model-value="(v) => setParam(f.key, v)"
                :options="f.options.map(opt => ({ label: f.optionLabels?.[opt] ?? (opt === '' ? $t('settings.providerForm.selectDefaultOption') : opt), value: opt }))"
                optionLabel="label" optionValue="value" />
              <label v-else-if="f.type === 'boolean'" style="display:flex;align-items:center;gap:6px;font-size:12.5px">
                <JwCheckbox
                  :model-value="getParam(f.key) ?? f.default ?? false"
                  @update:model-value="(v) => setParam(f.key, v)" />
                <span class="t-muted">{{ (getParam(f.key) ?? f.default) ? $t('settings.providerForm.boolOn') : $t('settings.providerForm.boolOff') }}</span>
              </label>
              <JwTextarea v-else-if="f.type === 'textarea'" auto-resize
                rows="2" :placeholder="f.placeholder || ''"
                :model-value="getParam(f.key) ?? ''"
                @update:model-value="(v) => setParam(f.key, v || undefined)" />
              <JwInput v-else
                :placeholder="f.placeholder || ''"
                :model-value="getParam(f.key) ?? ''"
                @update:model-value="(v) => setParam(f.key, v || undefined)" />
              <JwButton v-if="getParam(f.key) !== undefined" type="button"
                label="↺" intent="ghost" size="small" v-tooltip.bottom="`Reset ${f.label}`"
                style="padding:4px 8px" @click="resetParam(f.key)" />
            </div>
          </template>
        </template>
      </template>
    </div>
    <div style="display:flex;gap:8px;margin-top:14px;justify-content:flex-end">
      <JwButton :label="$t('settings.providerForm.btnCancel')" intent="ghost" @click="emit('cancel')" />
      <JwButton :label="$t('settings.providerForm.btnSave')" intent="primary" @click="emit('save')" />
    </div>
  </div>
</template>

<style scoped>

.model-combo { display: flex; }
.model-combo-input {
  width: 100%;
  padding-right: 30px;
}
.model-combo-chev {
  position: absolute;
  top: 50%;
  right: 4px;
  transform: translateY(-50%);
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
  border: 0;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  border-radius: 4px;
}
.model-combo-chev:hover:not(:disabled) { color: var(--ink); background: var(--surface-3); }
.model-combo-chev:disabled { opacity: 0.35; cursor: not-allowed; }
.model-combo-chev-icon { transition: transform 0.15s ease; }
.model-combo.open .model-combo-chev-icon { transform: rotate(180deg); }
.model-combo-list {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  z-index: 50;
  margin: 0;
  padding: 4px;
  list-style: none;
  background: var(--surface);
  border: 1px solid var(--border-strong, var(--border));
  border-radius: 8px;
  box-shadow: 0 8px 24px var(--shadow-medium);
  max-height: 240px;
  overflow-y: auto;
}
.model-combo-list li {
  padding: 6px 10px;
  font-size: 12.5px;
  font-family: var(--font-mono, ui-monospace, monospace);
  border-radius: 5px;
  cursor: pointer;
  color: var(--ink);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.model-combo-list li.active { background: var(--surface-3); }
.model-combo-list li.selected { color: var(--accent-ink, var(--accent)); font-weight: 600; }
.model-combo-list li.selected.active { background: var(--accent-soft); }
.voice-check {
  display: inline-grid;
  place-items: center;
  width: 14px;
  height: 14px;
  margin-right: 6px;
  vertical-align: middle;
  color: var(--accent, currentColor);
}
</style>
