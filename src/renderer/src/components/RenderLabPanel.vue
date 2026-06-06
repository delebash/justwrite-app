<script setup>
// Render Lab — Phase 3 of the audiobook-tuning system.
//
// A/B harness: pick a voice + sample text + up to two parameter axes
// (e.g. exaggeration: 0.8, 1.2, 1.5  ×  speed_factor: 0.95, 1.05) and
// the panel renders every cell of the matrix. The writer plays them
// side-by-side, picks the winner, and either saves the combo as a
// project-level Render preset or pushes it onto the voice as a per-
// voice override.
//
// Synth goes through the same services/tts.js → synthesize() the
// production render pipeline uses, so what you hear in the Lab is
// what you get on Render. Concurrency is capped at 2 because local
// TTS servers (Chatterbox, Dia) typically OOM if you fan out more.

import { ref, computed, watch, onBeforeUnmount } from "vue";
import { getParamSchema } from "../domain/providerParams.js";
import { useAiStore } from "../stores/ai.js";
import { useStudioStore } from "../stores/studio.js";
import { synthesize } from "../services/tts.js";
import { pushToast } from "../services/toastBridge.js";
import { promptDialog } from "../services/dialog.js";
import Icon from "./Icon.vue";
import JwInput from "@renderer/components/ui/JwInput.vue";
import JwTextarea from "@renderer/components/ui/JwTextarea.vue";
import JwSelect from "@renderer/components/ui/JwSelect.vue";
import JwButton from "@renderer/components/ui/JwButton.vue";

const ai = useAiStore();
const studio = useStudioStore();

// Concurrency cap for matrix render. Local TTS servers hold the model
// in VRAM and serialise internally anyway; pushing more than ~2 parallel
// requests just queues at the server and OOMs sooner on edge cases.
const MAX_CONCURRENCY = 2;

const SAMPLE_TEXT_DEFAULT = "He stood at the edge of the cliff and looked down. The wind was warm, and the sea was very far away. \"I'm not sure I can do this,\" he said, and his voice surprised him — calmer than he felt.";

// ── Inputs ────────────────────────────────────────────────────────
const sampleText = ref(SAMPLE_TEXT_DEFAULT);
const voiceId = ref(null);

// Default to the first voice on the writer's active TTS provider.
const allVoices = computed(() => studio.voices);
const voice = computed(() => allVoices.value.find((v) => v.id === voiceId.value) || null);
const provider = computed(() => voice.value ? ai.providerById(voice.value.providerId) : null);
const schema = computed(() => provider.value ? getParamSchema(provider.value) : []);

watch(allVoices, (list) => {
  if (!voiceId.value && list.length) voiceId.value = list[0].id;
}, { immediate: true });

// Pre-pick sensible axes when the writer first picks a voice/provider.
watch(schema, (s) => {
  if (axis1.value.key === "" && s.length) {
    // Prefer exaggeration if present (Chatterbox), then temperature,
    // then the first number-typed field, else the first field.
    const pick = s.find((f) => f.key === "exaggeration")
              || s.find((f) => f.key === "temperature")
              || s.find((f) => f.type === "number")
              || s[0];
    if (pick) axis1.value = { key: pick.key, values: defaultValuesFor(pick) };
  }
  if (axis2.value.key === "" && s.length > 1) {
    const pick = s.find((f) => f.key === "speed_factor")
              || s.find((f) => f.key === "speed")
              || s.find((f) => f.type === "number" && f.key !== axis1.value.key);
    if (pick && pick.key !== axis1.value.key) {
      axis2.value = { key: pick.key, values: defaultValuesFor(pick) };
    }
  }
});

function defaultValuesFor(field) {
  if (field.key === "exaggeration")  return "0.8, 1.2, 1.5";
  if (field.key === "speed_factor" || field.key === "speed") return "0.95, 1.0, 1.05";
  if (field.key === "temperature")   return "0.6, 0.8, 1.0";
  if (field.key === "cfg_weight")    return "0.3, 0.5, 0.7";
  if (field.type === "number") {
    const d = field.default ?? 1;
    return `${d * 0.8}, ${d}, ${d * 1.2}`;
  }
  if (field.type === "select" && field.options?.length) return field.options.slice(0, 3).join(", ");
  return "";
}

// ── Axis definitions ─────────────────────────────────────────────
// Each axis: { key: paramKey | "", values: "csv string" }. An empty
// key means "this axis is disabled" — the matrix collapses to 1D.
const axis1 = ref({ key: "", values: "" });
const axis2 = ref({ key: "", values: "" });

function parseValues(csv) {
  return String(csv || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const n = Number(s);
      return Number.isFinite(n) && /^-?\d+(\.\d+)?$/.test(s) ? n : s;
    });
}

const axis1Values = computed(() => axis1.value.key ? parseValues(axis1.value.values) : [null]);
const axis2Values = computed(() => axis2.value.key ? parseValues(axis2.value.values) : [null]);
const cellCount   = computed(() => axis1Values.value.length * axis2Values.value.length);

// ── Render state ─────────────────────────────────────────────────
// cells[i][j] = { status: "idle"|"rendering"|"done"|"error", url?, error?, params }
const cells = ref([]);
const matrixVersion = ref(0);   // bumps on each render so stale audio elements unmount
const rendering = ref(false);
const renderProgress = ref({ done: 0, total: 0 });

function buildMatrix() {
  const v1s = axis1Values.value;
  const v2s = axis2Values.value;
  const matrix = [];
  for (let i = 0; i < v1s.length; i++) {
    const row = [];
    for (let j = 0; j < v2s.length; j++) {
      const params = {};
      if (axis1.value.key) params[axis1.value.key] = v1s[i];
      if (axis2.value.key) params[axis2.value.key] = v2s[j];
      row.push({ status: "idle", url: null, params });
    }
    matrix.push(row);
  }
  return matrix;
}

async function renderMatrix() {
  if (!voice.value || !provider.value || !sampleText.value.trim()) return;
  // Free previous urls before re-render.
  revokeAllUrls();
  cells.value = buildMatrix();
  matrixVersion.value += 1;
  rendering.value = true;
  renderProgress.value = { done: 0, total: cellCount.value };

  const tasks = [];
  for (let i = 0; i < cells.value.length; i++) {
    for (let j = 0; j < cells.value[i].length; j++) {
      tasks.push({ i, j });
    }
  }

  // Concurrency-limited fan-out — runs MAX_CONCURRENCY at a time.
  let next = 0;
  const workers = Array.from({ length: Math.min(MAX_CONCURRENCY, tasks.length) }, async () => {
    while (next < tasks.length) {
      const { i, j } = tasks[next++];
      const cell = cells.value[i][j];
      cell.status = "rendering";
      try {
        const blob = await synthesize({
          provider: provider.value,
          voice: voice.value.id,
          voiceParams: voice.value.params,
          presetParams: cell.params,
          input: sampleText.value.trim(),
        });
        cell.url = URL.createObjectURL(blob);
        cell.status = "done";
      } catch (e) {
        cell.error = e.message || String(e);
        cell.status = "error";
      } finally {
        renderProgress.value = { ...renderProgress.value, done: renderProgress.value.done + 1 };
      }
    }
  });
  await Promise.all(workers);
  rendering.value = false;
}

function revokeAllUrls() {
  for (const row of cells.value) {
    for (const cell of row) {
      if (cell?.url) try { URL.revokeObjectURL(cell.url); } catch {}
    }
  }
}
onBeforeUnmount(revokeAllUrls);

// ── Per-cell actions ─────────────────────────────────────────────
async function saveCellAsPreset(cell) {
  const name = await promptDialog({
    title: "Save as render preset",
    label: "Preset name",
    placeholder: "e.g. Tense Scene, Quiet Reflection",
    confirmLabel: "Save preset",
  });
  if (!name) return;
  studio.addRenderPreset({ name: name.trim(), params: cell.params });
  pushToast({ message: `Saved "${name.trim()}" preset — assign it to chapters from the Render tab.` });
}

function pushCellToVoice(cell) {
  if (!voice.value) return;
  const merged = { ...(voice.value.params || {}), ...cell.params };
  studio.updateVoice(voice.value.id, { params: merged });
  pushToast({ message: `Pushed params to "${voice.value.name}" — applies to every render with this voice.` });
}

function cellLabel(cell) {
  return Object.entries(cell.params).map(([k, v]) => `${k}=${v}`).join(" · ") || "baseline";
}
</script>

<template>
  <div class="scrollarea" style="flex:1;padding:18px 22px;overflow-y:auto">

    <!-- Header / explainer -->
    <p style="font-size:12.5px;line-height:1.55;color:var(--muted);margin:0 0 16px;max-width:780px">
      Side-by-side compare engine knobs. Pick a voice and one or two parameter axes; the Lab synthesises every
      cell of the matrix and lays them out so you can A/B fast. Save a winning cell as a project-level
      <b>Render preset</b> (assign per chapter) or push it onto the voice as a <b>per-voice override</b>.
      Concurrency is capped at {{ MAX_CONCURRENCY }} so local TTS servers don't OOM.
    </p>

    <!-- Voice + sample text -->
    <div style="display:grid;grid-template-columns:220px 1fr;gap:10px 14px;align-items:start;margin-bottom:14px">
      <span class="t-muted" style="font-size:12.5px;padding-top:6px">Voice</span>
      <div>
        <JwSelect
          :model-value="voiceId"
          :options="allVoices.map(v => ({ label: `${v.name} · ${ai.providerById(v.providerId)?.name || v.providerId}`, value: v.id }))"
          optionLabel="label" optionValue="value"
          :disabled="rendering"
          @update:model-value="(v) => voiceId = v" />
        <div v-if="!allVoices.length" class="t-muted" style="font-size:11px;margin-top:4px;font-style:italic">
          No voices in the library yet. Open the Cast tab and Fetch voices on at least one provider.
        </div>
        <div v-else-if="voice && voice.params && Object.keys(voice.params).length"
          class="t-muted" style="font-size:10.5px;margin-top:4px">
          Voice has {{ Object.keys(voice.params).length }} per-voice override{{ Object.keys(voice.params).length === 1 ? '' : 's' }} —
          these apply <b>before</b> the matrix and are baseline for every cell.
        </div>
      </div>

      <span class="t-muted" style="font-size:12.5px;padding-top:6px">Sample text</span>
      <JwTextarea v-model="sampleText" auto-resize rows="3"
        placeholder="Type or paste a sample passage. ~1–3 sentences works best — long enough to hear the prosody, short enough to render fast." />
    </div>

    <!-- Axis pickers -->
    <div style="display:grid;grid-template-columns:220px 1fr;gap:10px 14px;align-items:center;padding:14px;background:var(--surface-2);border-radius:10px;margin-bottom:14px">
      <span class="t-muted" style="font-size:12.5px">Axis 1 — rows</span>
      <div style="display:grid;grid-template-columns:200px 1fr;gap:8px;align-items:center">
        <JwSelect
          :model-value="axis1.key"
          :options="[{ label: '— off —', value: '' }, ...schema.map(f => ({ label: f.label, value: f.key }))]"
          optionLabel="label" optionValue="value"
          :disabled="rendering"
          @update:model-value="(v) => axis1 = { ...axis1, key: v, values: v ? (axis1.values || defaultValuesFor(schema.find(s => s.key === v) || {})) : '' }" />
        <JwInput v-model="axis1.values"
          placeholder="comma-separated values e.g. 0.8, 1.2, 1.5"
          :disabled="rendering || !axis1.key" />
      </div>

      <span class="t-muted" style="font-size:12.5px">Axis 2 — columns</span>
      <div style="display:grid;grid-template-columns:200px 1fr;gap:8px;align-items:center">
        <JwSelect
          :model-value="axis2.key"
          :options="[{ label: '— off —', value: '' }, ...schema.filter(f => f.key !== axis1.key).map(f => ({ label: f.label, value: f.key }))]"
          optionLabel="label" optionValue="value"
          :disabled="rendering"
          @update:model-value="(v) => axis2 = { ...axis2, key: v, values: v ? (axis2.values || defaultValuesFor(schema.find(s => s.key === v) || {})) : '' }" />
        <JwInput v-model="axis2.values"
          placeholder="comma-separated values e.g. 0.95, 1.05"
          :disabled="rendering || !axis2.key" />
      </div>

      <span></span>
      <div style="display:flex;align-items:center;gap:10px;font-size:11.5px">
        <span class="t-muted">{{ cellCount }} cell{{ cellCount === 1 ? '' : 's' }} ({{ axis1Values.length }} × {{ axis2Values.length }})</span>
        <span v-if="rendering" class="t-muted">· rendered {{ renderProgress.done }} / {{ renderProgress.total }}</span>
        <JwButton intent="primary" size="small"
          style="margin-left:auto"
          :disabled="rendering || !voice || !sampleText.trim() || cellCount > 16"
          @click="renderMatrix">
          <template #icon><Icon :name="rendering ? 'Refresh' : 'Mic'" :size="11" /></template>
          {{ rendering ? 'Rendering…' : `Render ${cellCount} cell${cellCount === 1 ? '' : 's'}` }}
        </JwButton>
      </div>
      <span v-if="cellCount > 16" class="t-muted" style="grid-column:1/-1;font-size:11px;color:var(--danger,#c33)">
        Capped at 16 cells per matrix. Trim one axis or split into multiple runs.
      </span>
    </div>

    <!-- Matrix -->
    <div v-if="cells.length"
      :style="`display:grid;gap:10px;grid-template-columns:120px repeat(${cells[0].length}, minmax(180px, 1fr))`">
      <!-- Header row: axis 2 values -->
      <span></span>
      <div v-for="(v2, j) in axis2Values" :key="`h-${j}`"
        class="t-muted" style="font-size:11px;text-align:center;font-family:var(--font-mono, monospace)">
        <span v-if="axis2.key">{{ axis2.key }}={{ v2 }}</span>
      </div>

      <!-- Each axis 1 row -->
      <template v-for="(row, i) in cells" :key="`r-${i}`">
        <div class="t-muted" style="font-size:11px;font-family:var(--font-mono, monospace);align-self:center">
          <span v-if="axis1.key">{{ axis1.key }}=<br>{{ axis1Values[i] }}</span>
        </div>
        <div v-for="(cell, j) in row" :key="`c-${matrixVersion}-${i}-${j}`"
          style="padding:10px;border:1px solid var(--border);border-radius:8px;background:var(--surface);display:flex;flex-direction:column;gap:6px;min-width:0">
          <div class="t-muted" style="font-size:10.5px;font-family:var(--font-mono, monospace);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
            {{ cellLabel(cell) }}
          </div>
          <div v-if="cell.status === 'rendering'" class="t-muted" style="font-size:11px;font-style:italic">Rendering…</div>
          <div v-else-if="cell.status === 'error'" style="font-size:11px;color:var(--danger,#c33)">
            {{ cell.error || 'Render failed.' }}
          </div>
          <template v-else-if="cell.status === 'done'">
            <audio :src="cell.url" controls preload="none" style="width:100%;height:32px"></audio>
            <div style="display:flex;gap:4px">
              <JwButton intent="ghost" size="small" v-tooltip.bottom="'Save as a project render preset'"
                @click="saveCellAsPreset(cell)">
                <template #icon><Icon name="Plus" :size="11" /></template>
                Preset
              </JwButton>
              <JwButton intent="ghost" size="small" v-tooltip.bottom="'Push these params onto the voice (per-voice override)'"
                @click="pushCellToVoice(cell)">
                <template #icon><Icon name="Settings" :size="11" /></template>
                Voice
              </JwButton>
            </div>
          </template>
        </div>
      </template>
    </div>

    <div v-else-if="!rendering" class="t-muted"
      style="font-size:12px;text-align:center;padding:40px;background:var(--surface-2);border-radius:8px;font-style:italic">
      No matrix yet. Pick a voice and axis, then hit <b>Render</b>.
    </div>

  </div>
</template>
