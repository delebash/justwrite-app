<script setup>
// Whole-book entity sweep modal.
//
// Kicks off scanAllChapters() with progress reporting. Chapters run in a
// bounded-concurrency pool — provider-aware (C2): online providers run 4
// wide so several rows may sit in "scanning" at once; the single-slot
// built-in server runs one at a time, so exactly one row scans and
// "scanning" always means the model is actually on it. Each row
// transitions pending → scanning → done / skipped / error. When the sweep finishes (or the user cancels early), the running
// aggregate is handed to the existing EntityReviewModal for per-proposal
// accept/reject.

import { ref, computed, onMounted, watch } from "vue";
import { useProjectStore } from "../stores/project.js";
import { useAiTasksStore, AiTaskStrip, Icon, AppModal, UiButton } from "@delebash/llm-ui";
import { scanAllChapters } from "../services/analysis/entitySweep.js";
import EntityReviewModal from "./EntityReviewModal.vue";
import AiFeatureChip from "./AiFeatureChip.vue";
import StatusRow from "./StatusRow.vue";

const props = defineProps({
  // Optional: limit the sweep to specific chapter ids (Set or array).
  // When omitted, every chapter in the project is scanned.
  chapterIds: { type: [Array, Object, Set, null], default: null },
});
const emit = defineEmits(["close", "committed"]);

const project = useProjectStore();
const aiTasks = useAiTasksStore();

// QC-31: the sweep is ONE user action → ONE task entry (started by scanAllChapters,
// which owns the controller every chapter rides). `find` is exact now — before
// 2026-07-17 each chapter registered its own rival "entitySweep" task and this
// found only the first, which is why Cancel stopped one chapter and the pool
// marched on.
const myTask = computed(() => aiTasks.runningTasks.find(
  (t) => t.feature === "entitySweep"
));
const running = computed(() => !!myTask.value);

// Our own controller: the ONE thing that stops the pool. The task strip's Cancel
// aborts it too (watch below), so both routes lead here.
let sweepAbort = null;

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
  if (running.value) return;
  initRows();
  if (!rows.value.length) {
    error.value = "No chapters to scan.";
    return;
  }
  try {
    const filter = props.chapterIds ? new Set(rows.value.map((r) => r.id)) : null;
    sweepAbort = new AbortController();
    const result = await scanAllChapters({
      project,
      signal: sweepAbort.signal,
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

    // CANCEL LEAVES NO ROW BEHIND (user, 2026-07-17: "cancel should cancel
    // everything"). A cancelled sweep RETURNS (it does not throw — the workers exit by
    // returning, so Promise.all resolves), which is exactly why the old catch-on-abort
    // cleanup never ran and rows sat on "scanning"/"pending" forever. Every row that
    // never finished is marked here, in one pass, from the one authority.
    if (result.cancelled) {
      for (const row of rows.value) {
        if (row.status === "scanning" || row.status === "pending") {
          row.status = "skipped";
          row.reason = "cancelled";
        }
      }
    }

    // Partial proposals survive a cancel — whatever came back is still worth reviewing.
    proposals.value = {
      characters: result.characters || [],
      locations:  result.locations  || [],
      objects:    result.objects    || [],
    };
  } catch (e) {
    error.value = e?.message || String(e);
  }
}

// THE stop. The shared AiTaskStrip renders the only Cancel (the modal's duplicate was
// removed 2026-07-17 — user: "top cancel button redundant"); it cancels the TASK entry
// in the store, which the running pool cannot see by itself. Mirroring it onto our
// controller is what makes one click stop EVERYTHING: the workers see the signal and
// stop pulling chapters, and the pool returns `cancelled: true` so every unfinished
// row is marked.
//
// Watch the task's DISAPPEARANCE, not a "cancelled" status: aiTasks.cancel() archives
// and DELETES the entry (`_archiveAndRemove` → `delete this.tasks[id]`), so
// `myTask.value` goes straight to undefined and a status watch would never see
// "cancelled". `running` flipping true→false while our own run is still awaiting means
// the entry went away under us — cancel it here too.
watch(running, (isRunning) => {
  if (!isRunning) sweepAbort?.abort();
});

function onReviewClose() {
  emit("close");
}
function onReviewCommitted(payload) {
  emit("committed", payload);
}

// Deliberately no auto-run on mount: the user should see the AI
// routing chip in the header and have the option to change provider
// or model before spending tokens on every chapter. The empty-state
// CTA below kicks off the run when they're ready.
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
  <AppModal v-else eyebrow="Entity sweep" title="Scanning for new entities"
    :closable="!running" @close="emit('close')">
    <template #header>
      <div class="sweep-titleblock">
        <div class="t-eyebrow">Entity sweep</div>
        <div class="modal-title">Scanning for new entities</div>
      </div>
      <!-- No Cancel here: the shared AiTaskStrip below renders THE Cancel (user,
           2026-07-17: "top cancel button redundant" — both were live at once). -->
      <div class="sweep-header-actions">
        <AiFeatureChip feature="entitySweep" label="Entity sweep" editable />
      </div>
    </template>

    <p class="sweep-desc">
      Reads every chapter and asks the model for any <strong>characters, locations, and objects</strong>
      not already in your story bible. Same-name proposals from multiple chapters are merged into one,
      with the originating chapters listed. Nothing is added yet — you review and tick what to keep on the next screen.
    </p>

    <div v-if="error" class="sweep-error">
      <Icon name="Alert" :size="13" /> {{ error }}
    </div>

    <AiTaskStrip :task="myTask" />

    <div v-if="!running && !rows.length" class="sweep-empty">
      <Icon name="Sparkle" :size="20" />
      <p class="sweep-empty-text">
        Scan every chapter for new characters, locations, and objects. Change the provider
        in the chip above first if you want.
      </p>
      <UiButton intent="primary" @click="runSweep">
        <Icon name="Sparkle" :size="13" /> Scan the manuscript
      </UiButton>
    </div>

    <div v-else class="sweep-list">
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
.sweep-header-actions { display: flex; gap: 8px; align-items: center; flex-shrink: 0; }

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

.sweep-empty {
  display: flex; flex-direction: column; align-items: center;
  gap: 14px; padding: 32px 18px;
  background: var(--surface-2);
  border-radius: 10px;
  text-align: center;
}
/* Direct child only — without `>`, this also matched the first child of
   the UiButton's label span (which IS the slot content), recoloring the
   button text to the same accent as the button background → invisible
   text. The intent is to color just the big Sparkle icon at the top. */
.sweep-empty > :first-child { color: var(--accent); }
.sweep-empty-text {
  margin: 0; max-width: 56ch;
  font-size: 13px; line-height: 1.55; color: var(--ink-2);
}

.sweep-list {
  flex: 1; min-height: 0; overflow-y: auto;
  display: flex; flex-direction: column;
  border: 1px solid var(--border-soft); border-radius: 8px;
  background: var(--surface-2);
}
</style>
