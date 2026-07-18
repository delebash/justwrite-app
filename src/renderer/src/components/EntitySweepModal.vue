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
import { useAiTasksStore, AiTaskStrip, Icon, AppModal, UiButton, UiCheckbox } from "@delebash/llm-ui";
import { isLikelyNonStoryTitle, scanAllChapters } from "../services/analysis/entitySweep.js";
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

// D (2026-07-18, user request off the real 114-chapter import): a pre-run
// chapter PICKER — checkbox per chapter, everything ticked by default except
// titles that look like front/back matter (glossary, acknowledgments, praise
// pages, the next book's preview chapters — all of which that run scanned,
// polluting the proposals with "The Broken Eye (Book)" from the praise page).
// Auto-unticked rows stay visible; one click re-ticks. The RULE #1 precedent
// for the shape is EntityReviewModal: UiCheckbox rows, All/None as .tb-btn,
// footer = count · spacer · Cancel · primary action.
const picks = ref([]);
function initPicks() {
  const filter = props.chapterIds
    ? (props.chapterIds instanceof Set ? props.chapterIds : new Set(props.chapterIds))
    : null;
  picks.value = project.allChapters
    .filter((c) => !filter || filter.has(c.id))
    .map((c) => ({
      id: c.id, num: c.num, title: c.title,
      checked: !isLikelyNonStoryTitle(c.title),
    }));
}
onMounted(initPicks);
const checkedCount = computed(() => picks.value.filter((p) => p.checked).length);
function setAllPicks(v) {
  for (const p of picks.value) p.checked = v;
}

function initRows() {
  const ids = new Set(picks.value.filter((p) => p.checked).map((p) => p.id));
  rows.value = project.allChapters
    .filter((c) => ids.has(c.id))
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
    error.value = "No chapters selected.";
    return;
  }
  try {
    // The picker's selection IS the universe now — always pass it.
    const filter = new Set(rows.value.map((r) => r.id));
    sweepAbort = new AbortController();
    const result = await scanAllChapters({
      project,
      signal: sweepAbort.signal,
      chapterFilter: { ids: filter },
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

// Deliberately no auto-run on mount (only the picker list is built): the
// user should see the AI routing chip in the header, untick chapters, and
// have the option to change provider or model before spending tokens on
// every chapter. The footer CTA kicks off the run when they're ready.
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
      Reads the ticked chapters and asks the model for any <strong>characters, locations, and objects</strong>
      not already in your story bible. Same-name proposals from multiple chapters are merged into one,
      with the originating chapters listed. Nothing is added yet — you review and tick what to keep on the next screen.
      <template v-if="!rows.length">
        Front &amp; back matter (glossary, acknowledgments, previews…) is unticked for you — tick anything you do want scanned.
      </template>
    </p>

    <div v-if="error" class="sweep-error">
      <Icon name="Alert" :size="13" /> {{ error }}
    </div>

    <AiTaskStrip :task="myTask" />

    <!-- Pre-run: the chapter picker (D). -->
    <div v-if="!rows.length" class="sweep-pick">
      <div class="sweep-pick-h">
        <span class="t-muted">{{ checkedCount }} of {{ picks.length }} selected</span>
        <div class="sweep-pick-h-actions">
          <button type="button" class="tb-btn wide" @click="setAllPicks(true)">All</button>
          <button type="button" class="tb-btn wide" @click="setAllPicks(false)">None</button>
        </div>
      </div>
      <div class="sweep-list sweep-pick-list">
        <label v-for="p in picks" :key="p.id" class="sweep-pick-row" :class="{ off: !p.checked }">
          <UiCheckbox v-model="p.checked" />
          <span class="sweep-pick-num">{{ p.num }}</span>
          <span class="sweep-pick-title">{{ p.title || 'Untitled' }}</span>
        </label>
      </div>
    </div>

    <div v-else class="sweep-list">
      <StatusRow v-for="row in rows" :key="row.id"
        :status="row.status"
        :left="row.num"
        :main="row.title || 'Untitled'"
        :right="row.reason ? `${row.status} · ${row.reason}` : row.status" />
    </div>

    <template v-if="!rows.length" #footer>
      <span class="t-muted">{{ checkedCount }} of {{ picks.length }} chapters selected</span>
      <span style="flex:1"></span>
      <UiButton intent="ghost" @click="emit('close')">Cancel</UiButton>
      <UiButton intent="primary" :disabled="!checkedCount" @click="runSweep">
        <Icon name="Sparkle" :size="13" /> Scan {{ checkedCount }} chapter{{ checkedCount === 1 ? "" : "s" }}
      </UiButton>
    </template>
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

/* D — the pre-run chapter picker. */
.sweep-pick { display: flex; flex-direction: column; gap: 8px; flex: 1; min-height: 0; }
.sweep-pick-h {
  display: flex; align-items: center; gap: 8px;
  font-size: 12px;
}
.sweep-pick-h-actions { display: flex; gap: 4px; margin-left: auto; }
.sweep-pick-list { flex: 1; }
.sweep-pick-row {
  display: flex; align-items: center; gap: 10px;
  padding: 6px 12px;
  border-bottom: 1px solid var(--border-soft);
  cursor: pointer;
  transition: opacity .15s;
}
.sweep-pick-row:last-child { border-bottom: none; }
.sweep-pick-row:hover { background: var(--surface-3); }
.sweep-pick-row.off { opacity: 0.5; }
.sweep-pick-num {
  font-family: var(--font-mono); font-size: 11px; color: var(--muted);
  min-width: 2.5ch; text-align: right;
}
.sweep-pick-title {
  font-size: 13px; color: var(--ink-2);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

.sweep-list {
  flex: 1; min-height: 0; overflow-y: auto;
  display: flex; flex-direction: column;
  border: 1px solid var(--border-soft); border-radius: 8px;
  background: var(--surface-2);
}
</style>
