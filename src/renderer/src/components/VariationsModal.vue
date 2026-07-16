<script setup>
// Three-alternative streaming for any writer action.
//
// The modal is intentionally generic: the caller passes a `runner`
// function that takes (temperature, signal, onDelta) and returns
// Promise<{ html, raw }>. The modal fires the runner three times
// concurrently — once per VARIATION_TEMPERATURES entry — and streams
// each result into its own column. Click "Use this" on any column to
// emit the chosen result back to the caller and close.
//
// All three columns are independently cancellable. Closing the modal
// aborts every in-flight stream. A column whose call errors keeps the
// other two viable — pick from whichever succeeded.

import { ref, onMounted, onBeforeUnmount, computed } from "vue";
import { VARIATION_TEMPERATURES } from "../services/writerAI.js";
import { useAiTasksStore, Icon, AiTaskStrip, AppModal, UiButton } from "@delebash/llm-ui";
import AiFeatureChip from "./AiFeatureChip.vue";

const props = defineProps({
  // Runner contract:
  // (temperature: number, signal: AbortSignal, onDelta: (delta, content) => void, taskMeta: object)
  //   => Promise<{ html, raw, usage }>
  // The runner MUST forward `taskMeta` into its runAiStream `task.meta`
  // so each column's call gets a unique identifier — that's how this
  // modal locates each column's task in the global aiTasks store.
  runner: { type: Function, required: true },
  label:  { type: String, default: "Three variations" },
  eyebrow: { type: String, default: "Compare variations" },
  // Optional override of the temperature spread.
  temperatures: { type: Array, default: () => VARIATION_TEMPERATURES },
});
const emit = defineEmits(["close", "useVariation"]);

const aiTasks = useAiTasksStore();

// One result slot per column. The `runId` is stamped into the column's
// runAiStream task meta so we can find each column's task in the global
// store; cleared after the run ends. `preview` mirrors task.preview so
// the column body can render streamed text while the call is in flight
// AND after it ends (live task gets archived out of runningTasks at
// finish time).
const cols = props.temperatures.map((t, i) => ({
  index: i,
  temperature: t,
  runId: ref(null),
  result: ref(null),    // { html, raw } when done
  error: ref(""),
  preview: ref(""),
}));

function colTask(col) {
  return col.runId.value
    ? aiTasks.runningTasks.find((t) => t.meta?.variationRunId === col.runId.value)
    : null;
}
function colRunning(col) { return !!colTask(col); }

const anyRunning = computed(() => cols.some((c) => colRunning(c)));

function isAbort(e) { return e?.name === "AbortError" || /abort/i.test(e?.message || ""); }

async function runColumn(col) {
  col.error.value = "";
  col.result.value = null;
  col.preview.value = "";
  const runId = `var_${col.index}_${Math.random().toString(36).slice(2, 8)}`;
  col.runId.value = runId;
  try {
    const out = await props.runner(
      col.temperature,
      // Cannot pass a signal up-front (the column's task doesn't exist
      // yet — runAiStream creates it). Passing null lets the wrapper
      // own the AbortController; we cancel by id via aiTasks.cancel().
      null,
      (delta, content) => {
        col.preview.value = content || (col.preview.value + (delta || ""));
      },
      { variationRunId: runId, variationIndex: col.index },
    );
    col.result.value = out || null;
  } catch (e) {
    if (!isAbort(e)) col.error.value = e?.message || String(e);
  } finally {
    col.runId.value = null;
  }
}

function useColumn(col) {
  if (!col.result.value) return;
  // Abort any siblings still running so we don't burn tokens on
  // results we're discarding.
  for (const c of cols) {
    if (c !== col) {
      const t = colTask(c);
      if (t) aiTasks.cancel(t.id);
    }
  }
  emit("useVariation", col.result.value);
}

function regenerateColumn(col) {
  if (colRunning(col)) return;
  runColumn(col);
}

function cancelAll() {
  for (const c of cols) {
    const t = colTask(c);
    if (t) aiTasks.cancel(t.id);
  }
}

function close() {
  cancelAll();
  emit("close");
}

function elapsedSeconds(col) {
  const t = colTask(col);
  if (!t) return "0.0";
  return Math.max(0, (aiTasks.now - t.startedAt) / 1000).toFixed(1);
}

onMounted(() => {
  // Fire all three concurrently.
  for (const c of cols) runColumn(c);
});
onBeforeUnmount(cancelAll);
</script>

<template>
  <AppModal
    :eyebrow="eyebrow"
    :title="label"
    wide
    :closable="!anyRunning"
    @close="close"
  >
    <template #header>
      <div class="va-titleblock">
        <div class="t-eyebrow">{{ eyebrow }}</div>
        <h2 class="modal-title">{{ label }}</h2>
      </div>
      <div class="va-header-actions">
        <AiFeatureChip feature="writerAI" label="Variations" editable />
      </div>
    </template>

    <p class="va-blurb">
      Three streams running in parallel with slightly different temperatures (more conservative ↔
      more inventive). Click <strong>Use this</strong> on whichever column reads best — the chosen
      result lands as the usual accept/reject diff in your manuscript. The other two are discarded.
    </p>

    <!-- QC-30b: the shared strip is THE progress surface — one per running
         column (the CritiqueModal one-strip-per-task precedent); the columns
         share a label, so a chip names each strip's variation. -->
    <AiTaskStrip v-for="col in cols" :key="`strip-${col.index}`" :task="colTask(col)">
      <template #extra-stats>
        <span class="sts-stat">variation {{ col.index + 1 }}</span>
      </template>
    </AiTaskStrip>

    <div class="va-grid">
      <article v-for="col in cols" :key="col.index" class="va-col" :data-temp="col.temperature">
        <header class="va-col-h">
          <span class="va-col-label">Variation {{ col.index + 1 }}</span>
          <span class="va-col-temp">temperature {{ col.temperature.toFixed(2) }}</span>
        </header>

        <div class="va-col-body">
          <div v-if="colRunning(col) && !col.preview.value" class="va-loading">
            <span class="va-spinner" />
            <span>Streaming…</span>
          </div>

          <p v-else-if="col.error.value" class="va-error">
            <Icon name="Alert" :size="12" /> {{ col.error.value }}
          </p>

          <pre v-else class="va-preview">{{ col.preview.value || (col.result.value?.raw ?? "") }}</pre>
        </div>

        <footer class="va-col-foot">
          <span v-if="colRunning(col)" class="va-progress-text">
            {{ elapsedSeconds(col) }}s
          </span>
          <span v-else-if="col.error.value" class="va-progress-text">
            <UiButton intent="ghost" size="small" @click="regenerateColumn(col)">
              <Icon name="Refresh" :size="11" /> Retry
            </UiButton>
          </span>
          <span v-else-if="col.result.value" class="va-progress-text">
            <UiButton intent="ghost" size="small" @click="regenerateColumn(col)"
                      v-tooltip.bottom="'Discard this and re-stream just this column'">
              <Icon name="Refresh" :size="11" /> Re-stream
            </UiButton>
          </span>
          <span class="va-spacer" />
          <UiButton intent="primary" size="small"
                    :disabled="!col.result.value"
                    @click="useColumn(col)">
            <Icon name="Check" :size="12" /> Use this
          </UiButton>
        </footer>
      </article>
    </div>

    <template #footer>
      <span v-if="anyRunning" class="t-muted" style="font-size:12px;font-style:italic">
        {{ cols.filter(c => colRunning(c)).length }} of 3 still streaming
      </span>
      <span class="va-foot-spacer" />
      <UiButton intent="ghost" @click="close">
        Cancel all
      </UiButton>
    </template>
  </AppModal>
</template>

<style scoped>
.va-blurb {
  margin: 0 0 16px; max-width: 78ch;
  font-size: 12.5px; line-height: 1.55; color: var(--muted);
}
.va-blurb strong { color: var(--ink-2); font-weight: 600; }

.va-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}
@media (max-width: 900px) {
  .va-grid { grid-template-columns: 1fr; }
}

.va-col {
  display: flex; flex-direction: column;
  min-height: 320px;
  background: var(--surface-2); border-radius: 8px;
  border: 1px solid var(--border-soft);
  overflow: hidden;
}
.va-col-h {
  display: flex; align-items: baseline; gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-soft);
  background: var(--surface);
}
.va-col-label {
  font-family: var(--font-mono); font-size: 10px;
  letter-spacing: 0.12em; text-transform: uppercase;
  color: var(--accent-ink);
}
.va-col-temp {
  font-family: var(--font-mono); font-size: 10px; color: var(--muted);
  margin-left: auto;
}

.va-col-body {
  flex: 1; min-height: 0;
  padding: 12px 14px;
  overflow-y: auto;
  max-height: 50vh;
}
.va-loading {
  display: flex; align-items: center; gap: 10px;
  font-size: 12px; color: var(--muted); font-style: italic;
}
.va-spinner {
  display: inline-block; width: 12px; height: 12px;
  border: 2px solid var(--surface-3); border-top-color: var(--accent);
  border-radius: 50%; animation: va-spin 0.9s linear infinite;
}
@keyframes va-spin { to { transform: rotate(360deg); } }
.va-error {
  display: flex; align-items: center; gap: 6px;
  margin: 0;
  font-size: 12px; color: var(--danger);
}
.va-preview {
  margin: 0;
  font-family: var(--font-serif); font-size: 13.5px; line-height: 1.65;
  color: var(--ink-2);
  white-space: pre-wrap; word-break: break-word;
}

.va-col-foot {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 12px;
  border-top: 1px solid var(--border-soft);
  background: var(--surface);
}
.va-progress-text {
  font-family: var(--font-mono); font-size: 10.5px; color: var(--muted);
}
.va-spacer { flex: 1; }

.va-foot-spacer { flex: 1; }

.va-titleblock { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
.va-titleblock h2 { font-family: var(--font-serif); font-size: 22px; font-weight: 600; margin: 4px 0 0; }
.va-header-actions { display: flex; gap: 8px; flex-shrink: 0; align-items: center; }
</style>
