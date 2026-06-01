<script setup>
// Shared editor for an AI provider. Used twice in SettingsView:
//   - inline at the top of the provider list when adding (editingKey === "new")
//   - inline in place of a provider's read row when editing it
// The two render sites differ only in vertical position; everything inside
// this component is identical between them.

import { ref, reactive, computed, onBeforeUnmount, nextTick } from "vue";
import { getParamSchema } from "../domain/providerParams.js";
import { OpenAICompatClient, detectRunner } from "../services/openai-compat.js";
import { entryLabel, TIERS, TIER_IDS } from "../services/modelMeta.js";
import { useAiStore } from "../stores/ai.js";
import Icon from "../components/Icon.vue";
import Combobox from "../components/Combobox.vue";

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
const fetchedModels = ref([]);
const modelsLoading = ref(false);
const modelsError = ref(null);

async function fetchModels() {
  if (!props.draft?.baseUrl) return;
  modelsError.value = null;
  modelsLoading.value = true;
  try {
    const list = await new OpenAICompatClient(props.draft).enrichedModels();
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
</script>

<template>
  <div style="padding:14px;border:1.5px solid var(--accent);border-radius:10px;background:var(--accent-soft)">
    <div style="display:grid;grid-template-columns:120px 1fr;gap:8px 12px;font-size:12.5px;align-items:center">
      <span class="t-muted">ID</span>
      <input class="input" v-model="draft.id" :readonly="editingKey !== 'new'" placeholder="e.g. my-ollama" />
      <span class="t-muted">Name</span>
      <input class="input" v-model="draft.name" placeholder="Display name" />
      <span class="t-muted">Kind</span>
      <select class="input" v-model="draft.kind">
        <option value="llm">LLM only</option>
        <option value="tts">TTS only</option>
        <option value="both">LLM + TTS</option>
      </select>
      <span class="t-muted">Base URL</span>
      <input class="input" v-model="draft.baseUrl" placeholder="http://localhost:11434/v1" />
      <span class="t-muted">API key</span>
      <input class="input" v-model="draft.apiKey" type="password" placeholder="Optional — leave blank for local providers" />

      <template v-if="draft.kind === 'llm' || draft.kind === 'both'">
        <span class="t-muted" title="Which LLM runner is behind the Base URL. Ollama uses its native /api/chat (where think:false actually works); everything else uses /v1/chat/completions.">Runner</span>
        <select class="input" :value="runnerValue" @change="draft.runner = $event.target.value">
          <option value="openai-compat">OpenAI-compatible (LM Studio, llama.cpp, vLLM, cloud APIs)</option>
          <option value="ollama">Ollama (native /api/chat — honors think:false)</option>
        </select>
      </template>

      <template v-if="draft.kind === 'llm' || draft.kind === 'both'">
        <span class="t-muted">Chat model</span>
        <div style="display:flex;gap:6px;align-items:stretch;flex-wrap:wrap">
          <Combobox style="flex:1;min-width:160px"
            v-model="draft.chatModel"
            :items="fetchedModels"
            item-value="id"
            item-label="label"
            free-text
            :placeholder="fetchedModels.length ? `Type to filter or click ▾ to pick from ${fetchedModels.length} models` : 'llama3.1:8b, gpt-4o-mini, …'"
            :chev-title="fetchedModels.length ? 'Show fetched models' : 'Fetch models first'" />
          <button type="button" class="btn-ghost"
            :disabled="modelsLoading || !draft.baseUrl"
            @click="fetchModels"
            :title="draft.baseUrl ? 'Query GET /v1/models on the Base URL above' : 'Fill the Base URL first'">
            {{ modelsLoading ? "Loading…" : (fetchedModels.length ? "Refresh" : "Fetch models") }}
          </button>
          <div v-if="modelsError" class="t-muted" style="flex-basis:100%;font-size:11px;color:var(--danger,#c33)">
            {{ modelsError }}
          </div>
        </div>

        <template v-if="draft.chatModel">
          <span class="t-muted" title="Attribution pipeline capability bucket for this model. Auto-picked by name pattern; you can pin a different choice if you know better. Guided = scaffolded examples for sub-12B models. Direct = strict rules for 12B-class non-reasoning. Reasoned = strict rules + implicit reasoning for hybrid models (Qwen3:14B+).">Tier</span>
          <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;font-size:11.5px">
            <div class="mode-seg">
              <button v-for="t in TIER_IDS" :key="t" type="button" class="mode-seg-btn"
                :class="{ active: currentTier?.id === t }"
                @click="pinTier(t)">{{ TIERS[t].label }}</button>
            </div>
            <span class="t-muted" style="font-size:11px">{{ tierSource === 'pinned' ? 'pinned' : 'auto' }}</span>
            <button v-if="tierSource === 'pinned'" type="button" class="btn-ghost"
              style="padding:2px 8px;font-size:11px"
              @click="clearTierPin"
              title="Revert to the auto-detected tier">Clear pin</button>
          </div>
        </template>

        <span class="t-muted" title="Optional embedding model — fills the RAG (manuscript chat) index. Leave blank if this provider isn't your embedding provider. OpenAI: text-embedding-3-small. Ollama: nomic-embed-text.">Embedding model</span>
        <input class="input"
          v-model="draft.embeddingModel"
          placeholder="text-embedding-3-small / nomic-embed-text / …" />
      </template>

      <template v-if="draft.kind === 'tts' || draft.kind === 'both'">
        <span class="t-muted">TTS model</span>
        <div style="display:flex;gap:6px;align-items:stretch;flex-wrap:wrap">
          <Combobox style="flex:1;min-width:160px"
            v-model="draft.ttsModel"
            :items="fetchedModels"
            item-value="id"
            item-label="label"
            free-text
            :placeholder="fetchedModels.length ? `Type to filter or click ▾ to pick from ${fetchedModels.length} models` : 'tts-1, gpt-4o-mini-tts, …'"
            :chev-title="fetchedModels.length ? 'Show fetched models' : 'Fetch models first (use the button on the Chat model row, or set Kind to LLM+TTS)'" />
          <button v-if="draft.kind === 'tts'" type="button" class="btn-ghost"
            :disabled="modelsLoading || !draft.baseUrl"
            @click="fetchModels"
            :title="draft.baseUrl ? 'Query GET /v1/models on the Base URL above' : 'Fill the Base URL first'">
            {{ modelsLoading ? "Loading…" : (fetchedModels.length ? "Refresh" : "Fetch models") }}
          </button>
          <div v-if="draft.kind === 'tts' && modelsError" class="t-muted" style="flex-basis:100%;font-size:11px;color:var(--danger,#c33)">
            {{ modelsError }}
          </div>
        </div>
        <span class="t-muted">Voices</span>
        <div style="display:flex;gap:6px;align-items:stretch;flex-wrap:wrap">
          <div class="model-combo" :class="{ open: voices.state.open }" :ref="voices.setBoxRef" style="flex:1;min-width:160px;position:relative">
            <input class="input model-combo-input"
              :value="draft.ttsVoices?.join(', ') || ''"
              @input="draft.ttsVoices = $event.target.value.split(',').map(v => v.trim()).filter(Boolean)"
              @focus="voices.openIt"
              @click="voices.openIt"
              @keydown="voices.onKey"
              :placeholder="voices.items.length ? `Type or click ▾ to pick from ${voices.items.length} fetched voices` : 'comma-separated · e.g. alloy, echo, nova'" />
            <button type="button" class="model-combo-chev"
              :disabled="!voices.items.length"
              :title="voices.items.length ? 'Pick from fetched voices' : 'Fetch voices first'"
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
          <button type="button" class="btn-ghost"
            :disabled="voicesLoading || !draft.baseUrl"
            @click="fetchVoices"
            :title="draft.baseUrl ? 'Query GET /v1/audio/voices on the Base URL above' : 'Fill the Base URL first'">
            {{ voicesLoading ? "Loading…" : (fetchedVoices.length ? "Refresh" : "Fetch voices") }}
          </button>
          <div v-if="voicesError" class="t-muted" style="flex-basis:100%;font-size:11px;color:var(--danger,#c33)">
            {{ voicesError }}
          </div>
        </div>

        <template v-if="paramSchema.length">
          <div style="grid-column:1/-1;display:flex;align-items:baseline;gap:8px;margin-top:8px;padding-top:10px;border-top:1px dashed var(--border)">
            <span class="t-eyebrow" style="font-size:10.5px">Engine parameters</span>
            <span class="t-muted" style="font-size:11px">Blank = let the server use its default.</span>
          </div>
          <template v-for="f in paramSchema" :key="f.key">
            <span class="t-muted" :title="f.help || ''"
              :style="f.help ? 'cursor:help;text-decoration:underline dotted var(--border-strong);text-underline-offset:3px' : ''">
              {{ f.label }}
            </span>
            <div style="display:flex;gap:6px;align-items:center">
              <input v-if="f.type === 'number'" class="input" type="number"
                :min="f.min" :max="f.max" :step="f.step"
                :placeholder="f.placeholder || (f.default !== undefined ? `default ${f.default}` : '')"
                :value="getParam(f.key) ?? ''"
                @input="setParam(f.key, $event.target.value === '' ? undefined : Number($event.target.value))" />
              <select v-else-if="f.type === 'select'" class="input"
                :value="getParam(f.key) ?? f.default ?? ''"
                @change="setParam(f.key, $event.target.value)">
                <option v-for="opt in f.options" :key="opt" :value="opt">
                  {{ f.optionLabels?.[opt] ?? (opt === '' ? '— default —' : opt) }}
                </option>
              </select>
              <label v-else-if="f.type === 'boolean'" style="display:flex;align-items:center;gap:6px;font-size:12.5px">
                <input type="checkbox"
                  :checked="getParam(f.key) ?? f.default ?? false"
                  @change="setParam(f.key, $event.target.checked)" />
                <span class="t-muted">{{ (getParam(f.key) ?? f.default) ? 'on' : 'off' }}</span>
              </label>
              <textarea v-else-if="f.type === 'textarea'" class="input"
                rows="2" :placeholder="f.placeholder || ''"
                :value="getParam(f.key) ?? ''"
                @input="setParam(f.key, $event.target.value || undefined)" />
              <input v-else class="input"
                :placeholder="f.placeholder || ''"
                :value="getParam(f.key) ?? ''"
                @input="setParam(f.key, $event.target.value || undefined)" />
              <button v-if="getParam(f.key) !== undefined" type="button"
                class="btn sm ghost" :title="`Reset ${f.label}`"
                style="padding:4px 8px" @click="resetParam(f.key)">↺</button>
            </div>
          </template>
        </template>
      </template>
    </div>
    <div style="display:flex;gap:8px;margin-top:14px;justify-content:flex-end">
      <button class="btn ghost" @click="emit('cancel')">Cancel</button>
      <button class="btn primary" @click="emit('save')">Save</button>
    </div>
  </div>
</template>

<style scoped>
.mode-seg {
  display: inline-flex;
  border: 1px solid var(--border);
  border-radius: 6px;
  overflow: hidden;
  background: var(--surface-2);
}
.mode-seg-btn {
  padding: 4px 10px;
  font-size: 11px;
  border: 0;
  border-right: 1px solid var(--border);
  background: transparent;
  color: var(--muted);
  cursor: pointer;
}
.mode-seg-btn:last-child { border-right: 0; }
.mode-seg-btn:hover { color: var(--ink); }
.mode-seg-btn.active { background: var(--accent); color: var(--on-accent); }

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
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
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
