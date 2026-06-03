<script setup>
// Vector-index build / refresh modal.
//
// Runs buildOrUpdateIndex (incremental) or rebuildIndex (full re-embed)
// against the configured embedding provider. Shows per-scene status
// rows similar to EntitySweepModal so the user can see which chunks
// have been processed.

import { ref, computed, onMounted } from "vue";
import { useAiStore } from "../stores/ai.js";
import { useProjectStore } from "../stores/project.js";
import { useAiProgress } from "../composables/useAiProgress.js";
import { buildOrUpdateIndex, rebuildIndex, indexStatus, clearIndex } from "../services/rag/indexer.js";
import AiProgressBar from "./AiProgressBar.vue";
import Icon from "./Icon.vue";
import AppModal from "./AppModal.vue";
import StatusRow from "./StatusRow.vue";
import JwButton from "@renderer/components/ui/JwButton.vue";

const props = defineProps({
  // "build" — incremental (only embed new/changed scenes)
  // "rebuild" — wipe and re-embed everything
  mode: { type: String, default: "build" },
});
const emit = defineEmits(["close", "built"]);

const ai = useAiStore();
const project = useProjectStore();
const progress = useAiProgress();

const rows = ref([]);       // [{ id, label, status: "pending"|"working"|"done"|"removed" }]
const phase = ref("");      // "chunking" | "embedding" | "done" | ""
const error = ref("");
const result = ref(null);   // { added, updated, removed }
const before = computed(() => indexStatus());
// Ref to the AppModal — we close through its exposed close() method so
// PrimeVue's Dialog completes its leave transition (and cleans its modal
// mask) before the parent unmounts us via v-if. Emitting 'close' directly
// from a footer button skips that and orphans an invisible mask over the
// whole app — see AppModal.vue for the full explanation.
const appModal = ref(null);
function requestClose() { appModal.value?.close(); }

// Each "embedding" progress tick names a chunk — mirror that into rows.
function rowForChunk(c) {
  return {
    id: c.id,
    label: `Ch. ${c.chapterNum} — ${c.chapterTitle || "Untitled"}${c.sceneTitle ? " · " + c.sceneTitle : ` · Scene ${c.sceneIdx + 1}`}`,
    status: "pending",
  };
}

async function run() {
  error.value = "";
  result.value = null;
  rows.value = [];
  phase.value = "";
  const provider = ai.embeddingProvider;
  if (!provider) {
    error.value = "No embedding provider configured. Set one in Settings → AI providers.";
    return;
  }
  if (!provider.embeddingModel) {
    error.value = `Provider "${provider.name || provider.id}" has no embedding model set. Fill in Settings → AI providers.`;
    return;
  }
  progress.start();
  try {
    const fn = props.mode === "rebuild" ? rebuildIndex : buildOrUpdateIndex;
    const r = await fn({
      signal: progress.signal,
      onDelta: progress.onDelta,
      onProgress: ({ phase: p, index, total, chunk, action }) => {
        phase.value = p;
        if (p === "embedding" && chunk) {
          // First time we see this chunk: append a row.
          const existing = rows.value.find((r) => r.id === chunk.id);
          if (!existing) {
            rows.value.push({ ...rowForChunk(chunk), status: "working" });
          } else {
            existing.status = "working";
          }
          // Mark earlier "working" rows as done so the spinner moves with focus.
          for (const r of rows.value) {
            if (r.id !== chunk.id && r.status === "working") r.status = "done";
          }
        } else if (action === "removed" && chunk) {
          rows.value.push({ id: chunk.id, label: `(stale) ${chunk.id}`, status: "removed" });
        }
      },
    });
    // Close out the last working row.
    for (const r of rows.value) if (r.status === "working") r.status = "done";
    phase.value = "done";
    result.value = r || { added: 0, updated: 0, removed: 0 };
    progress.finish();
    emit("built", result.value);
  } catch (e) {
    if (!progress.cancelled.value) error.value = e?.message || String(e);
    progress.finish();
  }
}

function cancel() {
  progress.cancel();
  // Stop the spinner on the working row but leave it visible so the
  // user can see where it broke off.
  for (const r of rows.value) if (r.status === "working") r.status = "pending";
}

async function clearAndClose() {
  await clearIndex();
  requestClose();
}

onMounted(run);

const totalDone = computed(() => rows.value.filter((r) => r.status === "done").length);
</script>

<template>
  <AppModal
    ref="appModal"
    eyebrow="Manuscript index"
    :title="mode === 'rebuild' ? 'Rebuilding index' : 'Building index'"
    :closable="!progress.running.value"
    @close="emit('close')"
  >
    <template #header>
      <div class="idx-titleblock">
        <div class="t-eyebrow">Manuscript index</div>
        <div class="modal-title">{{ mode === "rebuild" ? "Rebuilding index" : "Building index" }}</div>
      </div>
      <JwButton v-if="progress.running.value" intent="ghost" size="small" @click="cancel">
        <Icon name="Close" :size="12" /> Cancel
      </JwButton>
    </template>

    <div v-if="before.exists && !progress.running.value && !result" class="idx-stat">
      Current index: <b>{{ before.entryCount }}</b> scene{{ before.entryCount === 1 ? "" : "s" }} ·
      model <code>{{ before.model || "?" }}</code> · {{ before.dims || "?" }}d
    </div>

    <div v-if="error" class="idx-error">
      <Icon name="Alert" :size="13" /> {{ error }}
    </div>

    <AiProgressBar
      :progress="progress"
      :label="phase === 'chunking' ? 'Reading scenes…' : phase === 'embedding' ? 'Embedding…' : 'Working…'"
    />

    <div v-if="rows.length" class="idx-list">
      <StatusRow v-for="row in rows" :key="row.id"
        :status="row.status"
        :main="row.label" />
    </div>

    <div v-if="result" class="idx-summary">
      <Icon name="Check" :size="13" />
      Indexed <b>{{ totalDone }}</b> scene{{ totalDone === 1 ? "" : "s" }}.
      <span v-if="result.removed" class="t-muted"> · {{ result.removed }} stale chunk{{ result.removed === 1 ? "" : "s" }} cleared</span>
    </div>

    <template v-if="!progress.running.value" #footer>
      <JwButton v-if="before.exists && !result" intent="ghost" size="small" @click="clearAndClose">
        Clear index
      </JwButton>
      <span style="flex:1"></span>
      <JwButton intent="primary" @click="requestClose">
        {{ result ? "Done" : "Close" }}
      </JwButton>
    </template>
  </AppModal>
</template>

<style scoped>
.idx-titleblock { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }

.idx-stat {
  font-size: 12px; color: var(--muted);
  padding: 8px 12px; background: var(--surface-2); border-radius: 6px;
  font-variant-numeric: tabular-nums;
}
.idx-stat code {
  font-family: var(--font-mono); font-size: 11px;
  background: var(--surface-3); padding: 1px 5px; border-radius: 3px;
}
.idx-error {
  display: flex; gap: 8px; align-items: center;
  padding: 8px 12px; border-radius: 6px;
  background: color-mix(in oklab, var(--danger-ink, #b91c1c) 12%, transparent);
  color: var(--danger-ink, #b91c1c);
  font-size: 12.5px;
}

.idx-list {
  flex: 1; min-height: 0; overflow-y: auto;
  border: 1px solid var(--border-soft); border-radius: 8px;
  background: var(--surface-2);
  max-height: 320px;
}

.idx-summary {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 12px; border-radius: 6px;
  background: color-mix(in oklab, var(--status-done) 14%, transparent);
  color: var(--status-done);
  font-size: 12.5px;
}
.idx-summary b { font-variant-numeric: tabular-nums; }
</style>
