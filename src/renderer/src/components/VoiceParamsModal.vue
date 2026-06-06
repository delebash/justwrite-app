<script setup>
// Per-voice parameter override editor — Phase 1 of the audiobook-tuning
// system. Opened from Studio's voice library (⚙ on each row). The writer
// can override the provider's engine knobs (speed, exaggeration, etc.)
// for THIS voice only; the override merges over provider.params at
// synth time (services/tts.js → mergeParams). Empty / null values
// fall through to the provider default rather than overriding with zero.

import { ref, computed, watch, onBeforeUnmount } from "vue";
import { getParamSchema } from "../domain/providerParams.js";
import { useStudioStore } from "../stores/studio.js";
import { preview as previewVoice } from "../services/tts.js";
import AppModal from "./AppModal.vue";
import Icon from "./Icon.vue";
import JwInput from "@renderer/components/ui/JwInput.vue";
import JwTextarea from "@renderer/components/ui/JwTextarea.vue";
import JwCheckbox from "@renderer/components/ui/JwCheckbox.vue";
import JwNumber from "@renderer/components/ui/JwNumber.vue";
import JwSelect from "@renderer/components/ui/JwSelect.vue";
import JwButton from "@renderer/components/ui/JwButton.vue";

const props = defineProps({
  voice:    { type: Object, required: true },
  provider: { type: Object, required: true },
});
const emit = defineEmits(["close"]);

const studio = useStudioStore();

// Working draft. `undefined` means "fall through to provider default";
// any concrete value means "override".
const draft = ref({ ...(props.voice.params || {}) });

// Schemas: hide the OpenAI `instructions` field — long text doesn't make
// sense as a per-voice override (the writer would put the instruction on
// the *voice's purpose*, not duplicate it per voice). For everything
// else show the same shape as the provider editor's Engine params.
const schema = computed(() => getParamSchema(props.provider));

function providerDefault(key) {
  return props.provider?.params?.[key];
}

function get(key) {
  return draft.value[key];
}

function set(key, value) {
  const next = { ...draft.value };
  if (value === undefined || value === "" || Number.isNaN(value)) {
    delete next[key];
  } else {
    next[key] = value;
  }
  draft.value = next;
}

function resetField(key) { set(key, undefined); }
function resetAll()      { draft.value = {}; }

function placeholderFor(f) {
  const provided = providerDefault(f.key);
  if (provided !== undefined && provided !== "") return `provider: ${provided}`;
  if (f.default !== undefined) return `default ${f.default}`;
  return f.placeholder || "";
}

function isOverridden(key) {
  return draft.value[key] !== undefined && draft.value[key] !== "";
}

const overrideCount = computed(() => Object.keys(draft.value).length);

function save() {
  // Persist a sparse object — only keys the writer actually set.
  const clean = {};
  for (const [k, v] of Object.entries(draft.value)) {
    if (v === undefined || v === null || v === "") continue;
    clean[k] = v;
  }
  studio.updateVoice(props.voice.id, { params: clean });
  emit("close");
}

// Close-on-escape via AppModal; revert silently if the writer dismisses
// without hitting Save (Cancel and outside-click both treat the modal
// as a non-destination).
function cancel() { stopPreview(); emit("close"); }

// ── Preview with pending overrides ───────────────────────────────
// Synthesises the voice with the WORKING draft (not the saved value),
// so the writer can hear each tweak before committing. Same sample
// line the Cast tab uses, so what you hear here matches the audition.
// One preview at a time — re-clicking while it's playing stops it.
const PREVIEW_TEXT = "I'm going to go and see if it's there. And if it isn't, I'll have to decide whether to put it back.";
const previewing = ref(false);
const previewError = ref(null);
let audioEl = null;

async function playPreview() {
  if (previewing.value) { stopPreview(); return; }
  previewError.value = null;
  previewing.value = true;
  try {
    // useCache: false — the draft can change every click, and the
    // cache key already hashes the merged params, so we'd hit a stale
    // entry exactly when the writer wants to hear the tweak.
    const { url } = await previewVoice({
      provider: props.provider,
      voice: props.voice.id,
      voiceParams: draft.value,
      input: PREVIEW_TEXT,
      useCache: false,
    });
    audioEl = new Audio(url);
    audioEl.onended = () => { previewing.value = false; audioEl = null; };
    audioEl.onerror = () => { previewing.value = false; previewError.value = "Playback failed."; audioEl = null; };
    await audioEl.play().catch((e) => { throw e; });
  } catch (e) {
    previewing.value = false;
    previewError.value = e?.message || "Preview failed — is the TTS server reachable?";
    audioEl = null;
  }
}

function stopPreview() {
  if (audioEl) {
    try { audioEl.pause(); } catch {}
    audioEl = null;
  }
  previewing.value = false;
}

onBeforeUnmount(stopPreview);
</script>

<template>
  <AppModal eyebrow="Voice tuning" :title="`Tune ${voice.name}`" @close="cancel">
    <p class="t-muted" style="font-size:12px;line-height:1.5;margin:0 0 14px;max-width:520px">
      Override engine parameters for <b>{{ voice.name }}</b>. Empty fields fall back to the provider default
      ({{ provider?.name || "—" }}). Overrides apply to preview and chapter renders that use this voice.
    </p>

    <div v-if="!schema.length" class="t-muted" style="font-size:12.5px;padding:12px;background:var(--surface-2);border-radius:8px">
      This provider doesn't expose tunable engine parameters yet — its synth options are baked in at the server.
    </div>

    <div v-else style="display:grid;grid-template-columns:160px minmax(0,1fr);gap:10px 14px;font-size:12.5px;align-items:center">
      <template v-for="f in schema" :key="f.key">
        <span class="t-muted" :title="f.help || ''"
          :style="(f.help ? 'cursor:help;text-decoration:underline dotted var(--border-strong);text-underline-offset:3px;' : '') + (isOverridden(f.key) ? 'color:var(--accent-ink, var(--accent));font-weight:600;' : '')">
          {{ f.label }}
        </span>
        <div style="display:flex;gap:6px;align-items:center">
          <JwNumber v-if="f.type === 'number'"
            :min="f.min" :max="f.max" :step="f.step"
            :placeholder="placeholderFor(f)"
            :model-value="get(f.key) ?? null"
            @update:model-value="(v) => set(f.key, v === null ? undefined : v)" />
          <JwSelect v-else-if="f.type === 'select'"
            :model-value="get(f.key) ?? ''"
            @update:model-value="(v) => set(f.key, v === '' ? undefined : v)"
            :options="[{ label: placeholderFor(f) || 'Use provider default', value: '' }, ...f.options.map(opt => ({ label: f.optionLabels?.[opt] ?? opt, value: opt }))]"
            optionLabel="label" optionValue="value" />
          <label v-else-if="f.type === 'boolean'" style="display:flex;align-items:center;gap:6px">
            <JwCheckbox
              :model-value="get(f.key) ?? false"
              @update:model-value="(v) => set(f.key, v)" />
            <span class="t-muted">{{ get(f.key) ? 'On' : 'Off (or provider default)' }}</span>
          </label>
          <JwTextarea v-else-if="f.type === 'textarea'" auto-resize
            rows="2" :placeholder="placeholderFor(f)"
            :model-value="get(f.key) ?? ''"
            @update:model-value="(v) => set(f.key, v || undefined)" />
          <JwInput v-else
            :placeholder="placeholderFor(f)"
            :model-value="get(f.key) ?? ''"
            @update:model-value="(v) => set(f.key, v || undefined)" />
          <JwButton v-if="isOverridden(f.key)" type="button"
            label="↺" intent="ghost" size="small" v-tooltip.bottom="`Reset to provider default`"
            style="padding:4px 8px" @click="resetField(f.key)" />
        </div>
      </template>
    </div>

    <div v-if="previewError" class="t-muted"
      style="margin-top:10px;font-size:11.5px;color:var(--danger,#c33);padding:8px 10px;background:var(--surface-2);border-radius:6px">
      {{ previewError }}
    </div>

    <template #footer>
      <span class="t-muted" style="font-size:11.5px;margin-right:auto">
        {{ overrideCount }} override{{ overrideCount === 1 ? '' : 's' }} set
      </span>
      <JwButton intent="secondary" :label="previewing ? 'Stop' : 'Preview'"
        v-tooltip.bottom="'Synthesise the voice with your pending overrides — no need to save first.'"
        @click="playPreview">
        <template #icon><Icon :name="previewing ? 'Pause' : 'Play'" :size="11" /></template>
      </JwButton>
      <JwButton v-if="overrideCount > 0" intent="ghost" label="Reset all" @click="resetAll" />
      <JwButton intent="ghost" label="Cancel" @click="cancel" />
      <JwButton intent="primary" label="Save" @click="save" />
    </template>
  </AppModal>
</template>
