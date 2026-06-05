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
import { useAiProgress } from "../composables/useAiProgress.js";
import Icon from "./Icon.vue";
import AppModal from "./AppModal.vue";
import JwButton from "@renderer/components/ui/JwButton.vue";

const props = defineProps({
  // (temperature: number, signal: AbortSignal, onDelta: (delta, content) => void)
  //   => Promise<{ html, raw, usage }>
  runner: { type: Function, required: true },
  label:  { type: String, default: "Three variations" },
  eyebrow: { type: String, default: "Compare variations" },
  // Optional override of the temperature spread.
  temperatures: { type: Array, default: () => VARIATION_TEMPERATURES },
});
const emit = defineEmits(["close", "useVariation"]);

// One progress + result slot per column.
const cols = props.temperatures.map((t, i) => ({
  index: i,
  temperature: t,
  progress: useAiProgress(),
  result: ref(null),    // { html, raw } when done
  error: ref(""),
  preview: ref(""),
}));

const anyRunning = computed(() => cols.some((c) => c.progress.running.value));

async function runColumn(col) {
  col.error.value = "";
  col.result.value = null;
  col.preview.value = "";
  col.progress.start();
  try {
    const out = await props.runner(
      col.temperature,
      col.progress.signal,
      (delta, content) => {
        col.progress.onDelta(delta, content);
        col.preview.value = content || (col.preview.value + (delta || ""));
      },
    );
    col.result.value = out || null;
    col.progress.finish();
  } catch (e) {
    if (!col.progress.cancelled.value) {
      col.error.value = e?.message || String(e);
    }
    col.progress.finish();
  }
}

function useColumn(col) {
  if (!col.result.value) return;
  // Abort any siblings still running so we don't burn tokens on
  // results we're discarding.
  for (const c of cols) if (c !== col && c.progress.running.value) c.progress.cancel();
  emit("useVariation", col.result.value);
}

function regenerateColumn(col) {
  if (col.progress.running.value) return;
  runColumn(col);
}

function cancelAll() {
  for (const c of cols) if (c.progress.running.value) c.progress.cancel();
}

function close() {
  cancelAll();
  emit("close");
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
    <p class="va-blurb">
      Three streams running in parallel with slightly different temperatures (more conservative ↔
      more inventive). Click <strong>Use this</strong> on whichever column reads best — the chosen
      result lands as the usual accept/reject diff in your manuscript. The other two are discarded.
    </p>

    <div class="va-grid">
      <article v-for="col in cols" :key="col.index" class="va-col" :data-temp="col.temperature">
        <header class="va-col-h">
          <span class="va-col-label">Variation {{ col.index + 1 }}</span>
          <span class="va-col-temp">temperature {{ col.temperature.toFixed(2) }}</span>
        </header>

        <div class="va-col-body">
          <div v-if="col.progress.running.value && !col.preview.value" class="va-loading">
            <span class="va-spinner" />
            <span>Streaming…</span>
          </div>

          <p v-else-if="col.error.value" class="va-error">
            <Icon name="Alert" :size="12" /> {{ col.error.value }}
          </p>

          <pre v-else class="va-preview">{{ col.preview.value || (col.result.value?.raw ?? "") }}</pre>
        </div>

        <footer class="va-col-foot">
          <span v-if="col.progress.running.value" class="va-progress-text">
            {{ col.progress.elapsedSeconds }}s
          </span>
          <span v-else-if="col.error.value" class="va-progress-text">
            <JwButton intent="ghost" size="small" @click="regenerateColumn(col)">
              <Icon name="Refresh" :size="11" /> Retry
            </JwButton>
          </span>
          <span v-else-if="col.result.value" class="va-progress-text">
            <JwButton intent="ghost" size="small" @click="regenerateColumn(col)"
                      v-tooltip.bottom="'Discard this and re-stream just this column'">
              <Icon name="Refresh" :size="11" /> Re-stream
            </JwButton>
          </span>
          <span class="va-spacer" />
          <JwButton intent="primary" size="small"
                    :disabled="!col.result.value"
                    @click="useColumn(col)">
            <Icon name="Check" :size="12" /> Use this
          </JwButton>
        </footer>
      </article>
    </div>

    <template #footer>
      <span v-if="anyRunning" class="t-muted" style="font-size:12px;font-style:italic">
        {{ cols.filter(c => c.progress.running.value).length }} of 3 still streaming
      </span>
      <span class="va-foot-spacer" />
      <JwButton intent="ghost" @click="close">
        Cancel all
      </JwButton>
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
</style>
