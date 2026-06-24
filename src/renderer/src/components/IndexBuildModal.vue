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
import { useAiTasksStore } from "../stores/aiTasks.js";
import { buildOrUpdateIndex, rebuildIndex, indexStatus, clearIndex } from "../services/rag/indexer.js";
import AiTaskStrip from "./AiTaskStrip.vue";
import { Icon } from "@delebash/llm-ui";
import AppModal from "./AppModal.vue";
import StatusRow from "./StatusRow.vue";
import { UiButton } from "@delebash/llm-ui";

const props = defineProps({
  // "build" — incremental (only embed new/changed scenes)
  // "rebuild" — wipe and re-embed everything
  mode: { type: String, default: "build" },
});
const emit = defineEmits(["close", "built"]);

const ai = useAiStore();
const project = useProjectStore();
const aiTasks = useAiTasksStore();

// Embedding doesn't go through runAiStream (it uses client.embed in a
// loop, one call per scene), so we register the task directly with the
// store rather than via the chat-stream wrapper. Looking it up by
// feature is enough — only one index build runs at a time.
const myTask = computed(() => aiTasks.runningTasks.find((t) => t.feature === "ragIndex"));
const running = computed(() => !!myTask.value);
// The aiTasks handle for the in-flight call, captured at start time so
// we can call finish/cancel from outside the run() closure.
let taskHandle = null;

const rows = ref([]);       // [{ id, label, status: "pending"|"working"|"done"|"removed" }]
const phase = ref("");      // "chunking" | "embedding" | "done" | ""
const error = ref("");
const result = ref(null);   // { added, updated, removed }
// indexStatus() is async (server-backed) — load the "current index" summary
// into a ref on mount instead of a computed.
const before = ref({ exists: false, entryCount: 0, model: "", dims: 0 });
async function refreshBefore() { before.value = await indexStatus(); }
// Ref to the AppModal — close through its exposed close() method so
// the leave transition completes before the parent unmounts us via v-if.
// Emitting 'close' directly from a footer button skips the transition —
// see AppModal.vue for the timing detail.
const appModal = ref(null);
function requestClose() { appModal.value?.close(); }

// Each "embedding" progress tick names a chunk — mirror that into rows.
function rowForChunk(c) {
  return {
    id: c.id,
    label: `Ch. ${c.chapterNum} — ${c.chapterTitle || "Untitled"}${c.sceneTitle ? ` · ${c.sceneTitle}` : ` · Scene ${c.sceneIdx + 1}`}`,
    status: "pending",
  };
}

function isAbort(e) { return e?.name === "AbortError" || /abort/i.test(e?.message || ""); }

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
  taskHandle = aiTasks.start({
    feature: "ragIndex",
    label: props.mode === "rebuild" ? "Rebuild manuscript index" : "Build manuscript index",
    meta: { mode: props.mode },
  });
  try {
    const fn = props.mode === "rebuild" ? rebuildIndex : buildOrUpdateIndex;
    const r = await fn({
      signal: taskHandle.signal,
      // Embedding doesn't stream tokens, but each scene completion is a
      // useful "still alive" tick — bump the task's lastDeltaAt via
      // onDelta with an empty string so the panel's freshness indicator
      // stays "live" while we work through the queue.
      onDelta: taskHandle.onDelta,
      onProgress: ({ phase: p, chunk, action }) => {
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
          // Tick the task's freshness signal so the panel doesn't show
          // "stalled" while a long embedding queue is processing.
          taskHandle.onDelta("", null);
        } else if (action === "removed" && chunk) {
          rows.value.push({ id: chunk.id, label: `(stale) ${chunk.id}`, status: "removed" });
        }
      },
    });
    // Close out the last working row.
    for (const r of rows.value) if (r.status === "working") r.status = "done";
    phase.value = "done";
    result.value = r || { added: 0, updated: 0, removed: 0 };
    taskHandle.finish({});
    taskHandle = null;
    emit("built", result.value);
  } catch (e) {
    if (isAbort(e)) {
      // Cancel path is already recorded by the store via cancel().
    } else {
      error.value = e?.message || String(e);
      taskHandle?.fail(e);
    }
    taskHandle = null;
  }
}

function cancel() {
  taskHandle?.cancel();
  taskHandle = null;
  // Stop the spinner on the working row but leave it visible so the
  // user can see where it broke off.
  for (const r of rows.value) if (r.status === "working") r.status = "pending";
}

async function clearAndClose() {
  await clearIndex();
  requestClose();
}

onMounted(() => { refreshBefore(); run(); });

const totalDone = computed(() => rows.value.filter((r) => r.status === "done").length);
</script>

<template>
  <AppModal
    ref="appModal"
    eyebrow="Manuscript index"
    :title="mode === 'rebuild' ? 'Rebuilding index' : 'Building index'"
    :closable="!running"
    @close="emit('close')"
  >
    <template #header>
      <div class="idx-titleblock">
        <div class="t-eyebrow">Manuscript index</div>
        <div class="modal-title">{{ mode === "rebuild" ? "Rebuilding index" : "Building index" }}</div>
      </div>
      <UiButton v-if="running" intent="ghost" size="small" @click="cancel">
        <Icon name="Close" :size="12" /> Cancel
      </UiButton>
    </template>

    <p class="idx-desc">
      Splits your manuscript into <strong>scenes</strong> and sends each one to the configured
      <strong>embedding model</strong> to build a vector index. Once built, the index powers
      semantic search and the <strong>Chat</strong> panel so you can ask questions about your
      book and get answers grounded in specific scenes.
    </p>

    <div v-if="before.exists && !running && !result" class="idx-stat">
      Current index: <b>{{ before.entryCount }}</b> scene{{ before.entryCount === 1 ? "" : "s" }} ·
      model <code>{{ before.model || "?" }}</code> · {{ before.dims || "?" }}d
    </div>

    <div v-if="error" class="idx-error">
      <Icon name="Alert" :size="13" /> {{ error }}
    </div>

    <AiTaskStrip :task="myTask" />

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

    <template v-if="!running" #footer>
      <UiButton v-if="before.exists && !result" intent="ghost" size="small" @click="clearAndClose">
        Clear index
      </UiButton>
      <span style="flex:1"></span>
      <UiButton intent="primary" @click="requestClose">
        {{ result ? "Done" : "Close" }}
      </UiButton>
    </template>
  </AppModal>
</template>

<style scoped>
.idx-titleblock { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }

.idx-desc {
  font-size: 12px; line-height: 1.55; color: var(--muted);
  margin: 0;
}
.idx-desc strong { color: var(--ink-2); font-weight: 600; }

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
