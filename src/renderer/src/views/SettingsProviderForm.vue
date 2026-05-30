<script setup>
// Shared editor for an AI provider. Used twice in SettingsView:
//   - inline at the top of the provider list when adding (editingKey === "new")
//   - inline in place of a provider's read row when editing it
// The two render sites differ only in vertical position; everything inside
// this component is identical between them.

import { ref, computed } from "vue";
import { getParamSchema } from "../domain/providerParams.js";
import { OpenAICompatClient } from "../services/openai-compat.js";

const props = defineProps({
  draft: { type: Object, required: true },
  editingKey: { type: String, required: true }, // "new" or provider id
});
const emit = defineEmits(["save", "cancel"]);

// ── Model discovery (GET /v1/models on the draft's baseUrl) ───────
const fetchedModels = ref([]);
const modelsLoading = ref(false);
const modelsError = ref(null);

async function fetchModels() {
  if (!props.draft?.baseUrl) return;
  modelsError.value = null;
  modelsLoading.value = true;
  try {
    const list = await new OpenAICompatClient(props.draft).models();
    fetchedModels.value = list;
    if (!list.length) modelsError.value = "Server returned an empty list. Make sure a model is loaded.";
  } catch (e) {
    modelsError.value = e.message || "Failed to fetch.";
  } finally {
    modelsLoading.value = false;
  }
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
        <span class="t-muted">Chat model</span>
        <div style="display:flex;gap:6px;align-items:stretch;flex-wrap:wrap">
          <input class="input" style="flex:1;min-width:160px"
            v-model="draft.chatModel"
            :list="`chat-models-${editingKey}`"
            placeholder="llama3.1:8b, gpt-4o-mini, …" />
          <button type="button" class="btn-ghost"
            :disabled="modelsLoading || !draft.baseUrl"
            @click="fetchModels"
            :title="draft.baseUrl ? 'Query GET /v1/models on the Base URL above' : 'Fill the Base URL first'">
            {{ modelsLoading ? "Loading…" : (fetchedModels.length ? "Refresh" : "Fetch models") }}
          </button>
          <datalist :id="`chat-models-${editingKey}`">
            <option v-for="m in fetchedModels" :key="m" :value="m" />
          </datalist>
          <div v-if="fetchedModels.length" class="t-muted" style="flex-basis:100%;font-size:11px">
            {{ fetchedModels.length }} models found — start typing in the box to pick one.
          </div>
          <div v-else-if="modelsError" class="t-muted" style="flex-basis:100%;font-size:11px;color:var(--danger,#c33)">
            {{ modelsError }}
          </div>
        </div>
      </template>

      <template v-if="draft.kind === 'tts' || draft.kind === 'both'">
        <span class="t-muted">TTS model</span>
        <input class="input" v-model="draft.ttsModel" placeholder="tts-1, gpt-4o-mini-tts, …" />
        <span class="t-muted">Voices</span>
        <input class="input" :value="draft.ttsVoices?.join(', ') || ''"
          @input="draft.ttsVoices = $event.target.value.split(',').map(v => v.trim()).filter(Boolean)"
          placeholder="comma-separated · e.g. alloy, echo, nova" />

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
