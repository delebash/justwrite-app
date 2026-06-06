<script setup>
// Render presets card — Phase 2 of audiobook tuning.
//
// Project-level named bundles of engine params (speed_factor,
// exaggeration, cfg_weight, …) that the writer assigns to chapters
// from Studio's Render tab. At synth time presets layer on top of
// per-voice overrides on top of provider defaults (see
// services/tts.js → mergeParams).
//
// Engine params are inherently provider-specific (exaggeration is
// Chatterbox-only, lang_code is Kokoro-only). A preset is FREE-FORM:
// we don't constrain which keys go in. The writer picks a "Base provider"
// when editing to drive the field schema, then any params they set are
// stored as-is. At render time, unrecognised keys are passed to the
// engine anyway — engines that don't understand a key ignore it (per
// the OpenAI spec), so a Chatterbox-tuned preset rendered through
// OpenAI silently ignores exaggeration without erroring.

import { ref, computed } from "vue";
import { getParamSchema } from "../domain/providerParams.js";
import { useStudioStore } from "../stores/studio.js";
import { useAiStore } from "../stores/ai.js";
import JwInput from "@renderer/components/ui/JwInput.vue";
import JwTextarea from "@renderer/components/ui/JwTextarea.vue";
import JwCheckbox from "@renderer/components/ui/JwCheckbox.vue";
import JwNumber from "@renderer/components/ui/JwNumber.vue";
import JwSelect from "@renderer/components/ui/JwSelect.vue";
import JwButton from "@renderer/components/ui/JwButton.vue";
import Icon from "./Icon.vue";

const studio = useStudioStore();
const ai = useAiStore();

// Editing state. `null` = not editing. "new" = creating a fresh preset.
// Any other string = editing the preset with that id.
const editingId = ref(null);
const draftName = ref("");
const draftParams = ref({});
const draftSchemaProviderId = ref("");

const ttsProviders = computed(() =>
  ai.providers.filter((p) => p.kind === "tts" || p.kind === "both"),
);
const schemaProvider = computed(() =>
  ttsProviders.value.find((p) => p.id === draftSchemaProviderId.value) || ttsProviders.value[0] || null,
);
const schema = computed(() => schemaProvider.value ? getParamSchema(schemaProvider.value) : []);

function startNew() {
  editingId.value = "new";
  draftName.value = "";
  draftParams.value = {};
  draftSchemaProviderId.value = ttsProviders.value[0]?.id || "";
}

function startEdit(preset) {
  editingId.value = preset.id;
  draftName.value = preset.name;
  draftParams.value = { ...(preset.params || {}) };
  // Default to the first provider whose schema mentions a key the
  // preset uses, so the editor surfaces those fields by default.
  const matched = ttsProviders.value.find((p) =>
    getParamSchema(p).some((f) => preset.params?.[f.key] !== undefined),
  );
  draftSchemaProviderId.value = (matched || ttsProviders.value[0])?.id || "";
}

function cancelEdit() { editingId.value = null; }

function getParam(key) { return draftParams.value[key]; }
function setParam(key, value) {
  const next = { ...draftParams.value };
  if (value === undefined || value === "" || Number.isNaN(value)) delete next[key];
  else next[key] = value;
  draftParams.value = next;
}
function resetParam(key) { setParam(key, undefined); }

function save() {
  const clean = {};
  for (const [k, v] of Object.entries(draftParams.value)) {
    if (v === undefined || v === null || v === "") continue;
    clean[k] = v;
  }
  if (editingId.value === "new") {
    if (!draftName.value.trim()) return;
    studio.addRenderPreset({ name: draftName.value, params: clean });
  } else {
    studio.updateRenderPreset(editingId.value, { name: draftName.value.trim(), params: clean });
  }
  editingId.value = null;
}

function remove(preset) {
  if (!confirm(`Delete the "${preset.name}" preset? Any chapter assigned to it will fall back to provider+voice defaults.`)) return;
  studio.removeRenderPreset(preset.id);
}

function overrideCountFor(p) { return Object.keys(p?.params || {}).length; }
function summary(p) {
  const entries = Object.entries(p?.params || {});
  if (!entries.length) return "no overrides";
  return entries.map(([k, v]) => `${k}: ${v}`).join(" · ");
}
</script>

<template>
  <div class="card">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
      <div class="card-title" style="margin:0">Render presets</div>
      <span class="t-muted" style="font-size:12px">{{ studio.renderPresets.length }}</span>
      <JwButton v-if="editingId === null" label="Add preset" intent="primary" size="small" style="margin-left:auto" @click="startNew">
        <template #icon><Icon name="Plus" :size="12" /></template>
      </JwButton>
    </div>

    <p class="t-muted" style="font-size:12.5px;line-height:1.5;margin:0 0 12px">
      Bundle engine knobs (speed, exaggeration, …) under a name and assign to chapters from <b>Studio → Render</b>.
      A preset layers on top of per-voice overrides and the provider default — empty keys fall through. Examples:
      <i>Tense Scene</i> (faster + higher exaggeration), <i>Quiet Reflection</i> (slower + lower exaggeration).
    </p>

    <!-- Empty state -->
    <div v-if="!studio.renderPresets.length && editingId === null"
      class="t-muted" style="font-size:12px;text-align:center;padding:18px;background:var(--surface-2);border-radius:8px;font-style:italic">
      No presets yet. Click <b>Add preset</b> to create one.
    </div>

    <!-- New / edit form -->
    <div v-if="editingId !== null"
      style="padding:14px;border:1.5px solid var(--accent);border-radius:10px;background:var(--accent-soft);margin-bottom:10px">
      <div style="display:grid;grid-template-columns:120px minmax(0,1fr);gap:8px 12px;font-size:12.5px;align-items:center">
        <span class="t-muted">Name</span>
        <JwInput v-model="draftName" placeholder="e.g. Tense Scene" />

        <span class="t-muted" v-tooltip.bottom="'Drives which engine knobs the form shows. Keys you set are stored verbatim and passed to whichever engine renders.'">Base provider</span>
        <JwSelect v-model="draftSchemaProviderId"
          :options="ttsProviders.map(p => ({ label: p.name, value: p.id }))"
          optionLabel="label" optionValue="value" />
      </div>

      <div v-if="!schema.length"
        class="t-muted" style="margin-top:12px;font-size:12px;padding:10px;background:var(--surface);border-radius:6px">
        The selected provider doesn't expose tunable params — pick a different Base provider (Chatterbox, Kokoro, OpenAI) to set engine knobs.
      </div>

      <div v-else style="margin-top:12px;display:grid;grid-template-columns:160px minmax(0,1fr);gap:8px 12px;font-size:12.5px;align-items:center">
        <template v-for="f in schema" :key="f.key">
          <span class="t-muted" :title="f.help || ''"
            :style="(f.help ? 'cursor:help;text-decoration:underline dotted var(--border-strong);text-underline-offset:3px;' : '') + (getParam(f.key) !== undefined ? 'color:var(--accent-ink, var(--accent));font-weight:600;' : '')">
            {{ f.label }}
          </span>
          <div style="display:flex;gap:6px;align-items:center">
            <JwNumber v-if="f.type === 'number'"
              :min="f.min" :max="f.max" :step="f.step"
              :placeholder="f.default !== undefined ? `default ${f.default}` : ''"
              :model-value="getParam(f.key) ?? null"
              @update:model-value="(v) => setParam(f.key, v === null ? undefined : v)" />
            <JwSelect v-else-if="f.type === 'select'"
              :model-value="getParam(f.key) ?? ''"
              @update:model-value="(v) => setParam(f.key, v === '' ? undefined : v)"
              :options="[{ label: 'Fall through', value: '' }, ...f.options.map(opt => ({ label: f.optionLabels?.[opt] ?? opt, value: opt }))]"
              optionLabel="label" optionValue="value" />
            <label v-else-if="f.type === 'boolean'" style="display:flex;align-items:center;gap:6px">
              <JwCheckbox
                :model-value="getParam(f.key) ?? false"
                @update:model-value="(v) => setParam(f.key, v)" />
              <span class="t-muted">{{ getParam(f.key) ? 'On' : 'Off / fall through' }}</span>
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
      </div>

      <div style="display:flex;gap:8px;margin-top:14px;justify-content:flex-end">
        <JwButton label="Cancel" intent="ghost" @click="cancelEdit" />
        <JwButton label="Save preset" intent="primary" :disabled="!draftName.trim()" @click="save" />
      </div>
    </div>

    <!-- Preset list -->
    <div v-if="editingId === null && studio.renderPresets.length"
      style="display:flex;flex-direction:column;gap:6px">
      <div v-for="p in studio.renderPresets" :key="p.id"
        style="display:grid;grid-template-columns:1fr auto auto;gap:10px;align-items:center;padding:10px 12px;border:1px solid var(--border);border-radius:8px;background:var(--surface)">
        <div style="min-width:0">
          <b style="font-size:13px">{{ p.name }}</b>
          <div class="t-muted" style="font-size:11px;margin-top:2px;font-family:var(--font-mono, monospace);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ summary(p) }}</div>
        </div>
        <JwButton intent="ghost" size="small" @click="startEdit(p)">
          <template #icon><Icon name="Pencil" :size="11" /></template>
          Edit
        </JwButton>
        <JwButton intent="ghost" size="small" @click="remove(p)" v-tooltip.bottom="'Delete this preset'">
          <template #icon><Icon name="Trash" :size="11" /></template>
        </JwButton>
      </div>
    </div>
  </div>
</template>
