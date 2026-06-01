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
  emit("close");
}

onMounted(run);

const STATUS_ICON = {
  pending: "Calendar",
  working: "Refresh",
  done:    "Check",
  removed: "Close",
};

const totalDone = computed(() => rows.value.filter((r) => r.status === "done").length);
</script>

<template>
  <div class="modal-overlay" @click.self="emit('close')">
    <div class="modal idx-modal">
      <header class="idx-header">
        <div>
          <div class="t-eyebrow">Manuscript index</div>
          <h2>{{ mode === "rebuild" ? "Rebuilding index" : "Building index" }}</h2>
        </div>
        <button v-if="progress.running.value" class="btn ghost sm" @click="cancel">
          <Icon name="Close" :size="12" /> Cancel
        </button>
        <button v-else class="btn ghost sm" @click="emit('close')">
          <Icon name="Close" :size="12" /> Close
        </button>
      </header>

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
        <div v-for="row in rows" :key="row.id" class="idx-row" :class="`idx-row--${row.status}`">
          <Icon :name="STATUS_ICON[row.status]" :size="11"
            :class="{ 'idx-spin': row.status === 'working' }" />
          <span class="idx-row-label">{{ row.label }}</span>
        </div>
      </div>

      <div v-if="result" class="idx-summary">
        <Icon name="Check" :size="13" />
        Indexed <b>{{ totalDone }}</b> scene{{ totalDone === 1 ? "" : "s" }}.
        <span v-if="result.removed" class="t-muted"> · {{ result.removed }} stale chunk{{ result.removed === 1 ? "" : "s" }} cleared</span>
      </div>

      <footer v-if="!progress.running.value" class="idx-footer">
        <button v-if="before.exists && !result" class="btn ghost sm" @click="clearAndClose">
          Clear index
        </button>
        <span style="flex:1"></span>
        <button class="btn primary" @click="emit('close')">
          {{ result ? "Done" : "Close" }}
        </button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed; inset: 0; z-index: 100;
  background: color-mix(in oklab, black 40%, transparent);
  display: grid; place-items: center;
  padding: 24px;
}
.idx-modal {
  background: var(--surface); color: var(--ink);
  border-radius: 12px; box-shadow: 0 20px 60px rgba(0,0,0,.3);
  width: min(620px, 100%); max-height: 86vh;
  display: flex; flex-direction: column;
  padding: 22px 26px 18px;
  gap: 12px;
}
.idx-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
.idx-header h2 { font-family: var(--font-serif); font-size: 20px; font-weight: 600; margin: 4px 0 0; }

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
.idx-row {
  display: grid; grid-template-columns: 16px 1fr;
  align-items: center; gap: 8px;
  padding: 5px 12px; font-size: 12px;
  border-bottom: 1px solid var(--border-soft);
  color: var(--muted);
}
.idx-row:last-child { border-bottom: 0; }
.idx-row--working { background: var(--accent-soft); color: var(--accent-ink); }
.idx-row--done .idx-row-label { color: var(--ink); }
.idx-row--done > svg { color: var(--status-done); }
.idx-row--removed { opacity: 0.55; }
.idx-row-label {
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.idx-spin { animation: idx-spin 1.2s linear infinite; }
@keyframes idx-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

.idx-summary {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 12px; border-radius: 6px;
  background: color-mix(in oklab, var(--status-done) 14%, transparent);
  color: var(--status-done);
  font-size: 12.5px;
}
.idx-summary b { font-variant-numeric: tabular-nums; }

.idx-footer { display: flex; gap: 10px; align-items: center; padding-top: 6px; }
</style>
