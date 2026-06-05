<script setup>
// Whole-book entity sweep modal.
//
// Kicks off scanAllChapters() with progress reporting. Chapters run in a
// bounded-concurrency pool, so multiple rows may sit in "scanning" at the
// same time. Each row transitions pending → scanning → done / skipped /
// error. When the sweep finishes (or the user cancels early), the running
// aggregate is handed to the existing EntityReviewModal for per-proposal
// accept/reject.

import { ref, computed, onMounted } from "vue";
import { useProjectStore } from "../stores/project.js";
import { useAiProgress } from "../composables/useAiProgress.js";
import { scanAllChapters } from "../services/analysis/entitySweep.js";
import EntityReviewModal from "./EntityReviewModal.vue";
import AiProgressBar from "./AiProgressBar.vue";
import Icon from "./Icon.vue";
import AppModal from "./AppModal.vue";
import StatusRow from "./StatusRow.vue";
import JwButton from "@renderer/components/ui/JwButton.vue";

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
const rowById = ref(new Map()); // id -> row (reactive lookup for O(1) updates)
const completedCount = ref(0);
const totalCount = ref(0);
const proposals = ref(null);     // populated when sweep finishes
const error = ref("");

// Once we have proposals, swap from "scanning" mode to "review" mode.
const phase = computed(() => {
  if (proposals.value) return "review";
  return "scanning";
});

const scanningCount = computed(() => rows.value.filter((r) => r.status === "scanning").length);

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
  rowById.value = new Map(rows.value.map((r) => [r.id, r]));
  totalCount.value = rows.value.length;
  completedCount.value = 0;
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
      chapterFilter: filter ? { ids: filter } : undefined,
      onProgress: ({ phase: ph, chapter, completed, reason }) => {
        const row = rowById.value.get(chapter.id);
        if (row) {
          if (ph === "start") row.status = "scanning";
          else if (ph === "done")  row.status = "done";
          else if (ph === "skip")  { row.status = "skipped"; row.reason = reason || ""; }
          else if (ph === "error") { row.status = "error";   row.reason = reason || ""; }
        }
        completedCount.value = completed;
      },
    });
    // Backstop in case any row missed a "done" callback (shouldn't happen
    // but defensive — the result.skipped list is authoritative for skips
    // anyway).
    for (const s of result.skipped || []) {
      const row = rowById.value.get(s.id);
      if (row && row.status === "scanning") { row.status = "skipped"; row.reason = s.reason || ""; }
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
  // Mark any in-flight row as cancelled so the user can see what didn't
  // finish — leave already-done rows alone.
  for (const row of rows.value) {
    if (row.status === "scanning") { row.status = "skipped"; row.reason = "cancelled"; }
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
  <AppModal v-else eyebrow="Whole-book scan" title="Scanning for new entities"
    :closable="!progress.running.value" @close="emit('close')">
    <template #header>
      <div class="sweep-titleblock">
        <div class="t-eyebrow">Whole-book scan</div>
        <div class="modal-title">Scanning for new entities</div>
      </div>
      <JwButton v-if="progress.running.value" intent="ghost" size="small" @click="cancelSweep">
        <Icon name="Close" :size="12" /> Cancel
      </JwButton>
    </template>

    <p class="sweep-desc">
      Reads every chapter and asks the model for any <strong>characters, locations, and objects</strong>
      not already in your story bible. Same-name proposals from multiple chapters are merged into one,
      with the originating chapters listed. Nothing is added yet — you review and tick what to keep on the next screen.
    </p>

    <div v-if="error" class="sweep-error">
      <Icon name="Alert" :size="13" /> {{ error }}
    </div>

    <AiProgressBar
      :progress="progress"
      :label="totalCount > 0
        ? `${completedCount} of ${totalCount} chapters · ${scanningCount} scanning`
        : 'Starting…'"
    />

    <div class="sweep-list">
      <StatusRow v-for="row in rows" :key="row.id"
        :status="row.status"
        :left="row.num"
        :main="row.title || 'Untitled'"
        :right="row.reason ? `${row.status} · ${row.reason}` : row.status" />
    </div>
  </AppModal>
</template>

<style scoped>
.sweep-titleblock { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }

.sweep-desc {
  font-size: 12px; line-height: 1.55; color: var(--muted);
  margin: 0;
}
.sweep-desc strong { color: var(--ink-2); font-weight: 600; }

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
</style>
