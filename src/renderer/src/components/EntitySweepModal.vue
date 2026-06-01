<script setup>
// Whole-book entity sweep modal.
//
// Kicks off scanAllChapters() with progress reporting. Each chapter
// shows as a row that transitions from pending → scanning → done /
// skipped. When the sweep finishes (or the user cancels early), the
// running aggregate is handed to the existing EntityReviewModal for
// per-proposal accept/reject.

import { ref, computed, onMounted } from "vue";
import { useProjectStore } from "../stores/project.js";
import { useAiProgress } from "../composables/useAiProgress.js";
import { scanAllChapters } from "../services/analysis/entitySweep.js";
import EntityReviewModal from "./EntityReviewModal.vue";
import AiProgressBar from "./AiProgressBar.vue";
import Icon from "./Icon.vue";

const props = defineProps({
  // Optional: limit the sweep to specific chapter ids (Set or array).
  // When omitted, every chapter in the project is scanned.
  chapterIds: { type: [Array, Object, Set, null], default: null },
});
const emit = defineEmits(["close", "committed"]);

const project = useProjectStore();
const progress = useAiProgress();

// One row per chapter, status updated as the sweep progresses.
const rows = ref([]);
const currentIdx = ref(-1);     // index into rows of the chapter being scanned
const proposals = ref(null);     // populated when sweep finishes
const error = ref("");

// Once we have proposals, swap from "scanning" mode to "review" mode.
const phase = computed(() => {
  if (proposals.value) return "review";
  return "scanning";
});

const totalProposed = computed(() => {
  if (!proposals.value) return 0;
  return (proposals.value.characters?.length || 0)
       + (proposals.value.locations?.length  || 0)
       + (proposals.value.objects?.length    || 0);
});

function initRows() {
  const filter = props.chapterIds
    ? (props.chapterIds instanceof Set ? props.chapterIds : new Set(props.chapterIds))
    : null;
  rows.value = project.allChapters
    .filter((c) => !filter || filter.has(c.id))
    .map((c) => ({
      id: c.id,
      num: c.num,
      title: c.title,
      status: "pending",  // "pending" | "scanning" | "done" | "skipped" | "error"
      reason: "",
    }));
}

async function runSweep() {
  initRows();
  if (!rows.value.length) {
    error.value = "No chapters to scan.";
    return;
  }
  progress.start();
  try {
    const filter = props.chapterIds ? new Set(rows.value.map((r) => r.id)) : null;
    const result = await scanAllChapters({
      project,
      signal: progress.signal,
      onDelta: progress.onDelta,
      chapterFilter: filter ? { ids: filter } : undefined,
      onProgress: ({ index, chapter }) => {
        // Mark prior row as done (it must have completed if we've moved on).
        if (currentIdx.value >= 0 && rows.value[currentIdx.value]?.status === "scanning") {
          rows.value[currentIdx.value].status = "done";
        }
        currentIdx.value = index;
        const row = rows.value[index];
        if (row) row.status = "scanning";
        // Reset the per-chapter token counter so the bar shows progress for
        // just this chapter rather than the cumulative stream.
        progress.preview.value = "";
        progress.chars.value = 0;
        progress.firstDeltaAt && (progress.firstDeltaAt.value = 0);
      },
    });
    // Final row gets closed out — the sweep loop doesn't bump onProgress
    // past the last chapter, so the last row finishes here.
    if (currentIdx.value >= 0 && rows.value[currentIdx.value]?.status === "scanning") {
      rows.value[currentIdx.value].status = "done";
    }
    // Apply the service's `skipped` list onto rows so the visual reflects it.
    for (const s of result.skipped || []) {
      const row = rows.value.find((r) => r.id === s.id);
      if (row) { row.status = "skipped"; row.reason = s.reason || ""; }
    }
    progress.finish();

    proposals.value = {
      characters: result.characters || [],
      locations:  result.locations  || [],
      objects:    result.objects    || [],
    };
  } catch (e) {
    if (!progress.cancelled.value) error.value = e?.message || String(e);
    progress.finish();
  }
}

function cancelSweep() {
  progress.cancel();
  // Mark any in-flight row as skipped so the user can see it didn't
  // finish — leave already-done rows alone.
  if (currentIdx.value >= 0 && rows.value[currentIdx.value]?.status === "scanning") {
    rows.value[currentIdx.value].status = "skipped";
    rows.value[currentIdx.value].reason = "cancelled";
  }
  // Surface partial results so the user can still review what came back.
  if (!proposals.value) {
    proposals.value = { characters: [], locations: [], objects: [] };
  }
}

function onReviewClose() {
  emit("close");
}
function onReviewCommitted(payload) {
  emit("committed", payload);
}

onMounted(runSweep);

const STATUS_ICON = { pending: "Calendar", scanning: "Refresh", done: "Check", skipped: "Close", error: "Alert" };
</script>

<template>
  <!-- ── REVIEW PHASE — delegate to the existing review modal ────────── -->
  <EntityReviewModal
    v-if="phase === 'review'"
    :proposals="proposals"
    chapter-title="Whole-book scan"
    @close="onReviewClose"
    @committed="onReviewCommitted"
  />

  <!-- ── SCANNING PHASE ─────────────────────────────────────────────── -->
  <div v-else class="modal-overlay" @click.self="emit('close')">
    <div class="modal sweep-modal">
      <header class="sweep-header">
        <div>
          <div class="t-eyebrow">Whole-book scan</div>
          <h2>Scanning for new entities</h2>
        </div>
        <button v-if="progress.running.value" class="btn ghost sm" @click="cancelSweep">
          <Icon name="Close" :size="12" /> Cancel
        </button>
        <button v-else class="btn ghost sm" @click="emit('close')">
          <Icon name="Close" :size="12" /> Close
        </button>
      </header>

      <div v-if="error" class="sweep-error">
        <Icon name="Alert" :size="13" /> {{ error }}
      </div>

      <AiProgressBar
        :progress="progress"
        :label="currentIdx >= 0 ? `Ch. ${rows[currentIdx]?.num} — ${rows[currentIdx]?.title}` : 'Starting…'"
      />

      <div class="sweep-list">
        <div v-for="(row, i) in rows" :key="row.id"
          class="sweep-row" :class="`sweep-row--${row.status}`">
          <span class="sweep-num">{{ row.num }}</span>
          <span class="sweep-title">{{ row.title || "Untitled" }}</span>
          <span class="sweep-status">
            <Icon :name="STATUS_ICON[row.status]" :size="11"
              :class="{ 'sweep-spin': row.status === 'scanning' }" />
            {{ row.status }}<template v-if="row.reason"> · {{ row.reason }}</template>
          </span>
        </div>
      </div>
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
.sweep-modal {
  background: var(--surface); color: var(--ink);
  border-radius: 12px; box-shadow: 0 20px 60px rgba(0,0,0,.3);
  width: min(620px, 100%); max-height: 86vh;
  display: flex; flex-direction: column;
  padding: 22px 26px 22px;
  gap: 12px;
}

.sweep-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
.sweep-header h2 { font-family: var(--font-serif); font-size: 20px; font-weight: 600; margin: 4px 0 0; }

.sweep-error {
  display: flex; gap: 8px; align-items: center;
  padding: 8px 12px; border-radius: 6px;
  background: color-mix(in oklab, var(--danger-ink, #b91c1c) 12%, transparent);
  color: var(--danger-ink, #b91c1c);
  font-size: 12.5px;
}

.sweep-list {
  flex: 1; min-height: 0; overflow-y: auto;
  display: flex; flex-direction: column;
  border: 1px solid var(--border-soft); border-radius: 8px;
  background: var(--surface-2);
}
.sweep-row {
  display: grid; grid-template-columns: 36px 1fr auto;
  align-items: center; gap: 10px;
  padding: 7px 12px;
  font-size: 12.5px;
  border-bottom: 1px solid var(--border-soft);
}
.sweep-row:last-child { border-bottom: 0; }
.sweep-num {
  font-family: var(--font-mono); font-size: 11px;
  color: var(--muted); text-align: right;
}
.sweep-title {
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  color: var(--ink);
}
.sweep-status {
  display: inline-flex; align-items: center; gap: 5px;
  font-family: var(--font-mono); font-size: 10.5px;
  letter-spacing: 0.05em; text-transform: uppercase;
  color: var(--muted);
}
.sweep-row--pending  .sweep-title { color: var(--muted); }
.sweep-row--scanning { background: var(--accent-soft); }
.sweep-row--scanning .sweep-status { color: var(--accent-ink); }
.sweep-row--done     .sweep-status { color: var(--status-done); }
.sweep-row--skipped  { opacity: 0.55; }
.sweep-row--error    .sweep-status { color: var(--danger-ink, #b91c1c); }

.sweep-spin { animation: sweep-spin 1.2s linear infinite; }
@keyframes sweep-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
</style>
