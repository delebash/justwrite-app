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
import { useAiTasksStore, AiTaskStrip, Icon, AppModal, UiButton, UiCheckbox, confirmDialog } from "@delebash/llm-ui";
import { isLikelyNonStoryTitle, scanAllChapters, stripChapterText } from "../services/analysis/entitySweep.js";
import {
  clearSweepDraft, draftCounts, draftFoundTotal, emptyDraft, loadSweepDraft,
  needsScan, pruneDraft, rebuildProposals, recordChapterDone, recordChapterError,
  saveSweepDraft, textHash,
} from "../services/analysis/sweepDraft.js";
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
//
// A (2026-07-18): the sweep persists each chapter's raw result to a server-
// side DRAFT the moment it finishes (services/analysis/sweepDraft.js), so a
// crash/cancel/close never loses an hour-long run. On open the draft decides
// the default ticks too: a chapter already done (and unchanged since) starts
// unticked with its yield shown ("✓ N found"); pending/failed/changed
// chapters start ticked. Review can open straight from the draft; the draft
// clears on accept or Start over.
const draft = ref(emptyDraft());
const projectId = computed(() => project.activeProjectId);
const hasDraft = computed(() => Object.keys(draft.value.chapters).length > 0);
const resume = computed(() => draftCounts(draft.value));
const foundTotal = computed(() => draftFoundTotal(draft.value));

// Draft writes are serialized through one promise chain — per-chapter saves
// from a 4-wide online pool must not interleave PUTs out of order.
let saveChain = Promise.resolve();
function queueDraftSave() {
  const snapshot = JSON.parse(JSON.stringify(draft.value));
  saveChain = saveChain
    .then(() => saveSweepDraft(projectId.value, snapshot))
    .catch(() => {}); // offline draft-save must never break the sweep itself
}

function hashFor(chapterId) {
  return textHash(stripChapterText(project.chapterBody[chapterId] || ""));
}

const picks = ref([]);
function initPicks() {
  const filter = props.chapterIds
    ? (props.chapterIds instanceof Set ? props.chapterIds : new Set(props.chapterIds))
    : null;
  picks.value = project.allChapters
    .filter((c) => !filter || filter.has(c.id))
    .map((c) => {
      const entry = draft.value.chapters[c.id];
      const scanNeeded = needsScan(entry, hashFor(c.id));
      const found = entry?.status === "done"
        ? (entry.counts?.characters || 0) + (entry.counts?.locations || 0) + (entry.counts?.objects || 0)
        : 0;
      return {
        id: c.id, num: c.num, title: c.title,
        checked: !isLikelyNonStoryTitle(c.title) && scanNeeded,
        draftStatus: entry?.status || "",
        changed: entry?.status === "done" && scanNeeded,
        found,
      };
    });
}
onMounted(async () => {
  initPicks(); // render immediately; refreshed below once the draft arrives
  try {
    const d = await loadSweepDraft(projectId.value);
    if (d?.chapters) {
      draft.value = d;
      // Chapters deleted from the book since the draft: drop their entries.
      if (pruneDraft(draft.value, new Set(project.allChapters.map((c) => c.id)))) queueDraftSave();
      initPicks();
    }
  } catch { /* unreachable server: the sweep still works, just without resume */ }
});
const checkedCount = computed(() => picks.value.filter((p) => p.checked).length);
function setAllPicks(v) {
  for (const p of picks.value) p.checked = v;
}

async function startOver() {
  const ok = await confirmDialog({
    title: "Start over?",
    message: `Discard the saved scan results (${resume.value.done} chapter${resume.value.done === 1 ? "" : "s"} of findings)? The next sweep starts from scratch.`,
    confirmLabel: "Discard results",
    danger: true,
  });
  if (!ok) return;
  draft.value = emptyDraft();
  clearSweepDraft(projectId.value).catch(() => {});
  initPicks();
}

// Open the review straight from the draft — no new scanning.
function reviewFound() {
  proposals.value = rebuildProposals(draft.value);
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
      note: "",           // A: per-chapter yield, e.g. "done · 12 found"
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
      onProgress: ({ phase: ph, chapter, completed, reason, fresh }) => {
        const row = rowById.value.get(chapter.id);
        if (row) {
          if (ph === "start") row.status = "scanning";
          else if (ph === "done") {
            row.status = "done";
            const n = (fresh?.characters?.length || 0) + (fresh?.locations?.length || 0) + (fresh?.objects?.length || 0);
            row.note = `done · ${n} found`;
            // A: persist this chapter's raw result the moment it lands — a
            // crash/cancel from here on can't lose it.
            recordChapterDone(draft.value, chapter, fresh, hashFor(chapter.id));
            queueDraftSave();
          }
          else if (ph === "skip")  { row.status = "skipped"; row.reason = reason || ""; }
          else if (ph === "error") {
            row.status = "error"; row.reason = reason || "";
            recordChapterError(draft.value, chapter, reason, hashFor(chapter.id));
            queueDraftSave();
          }
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

    // B: a sweep that finished WITH failures stays on the status view — the
    // failed rows and a "Retry failed" affordance are the point; auto-jumping
    // to review buried them (and fed the "was it really processed?" doubt).
    // A clean or cancelled run goes to review as before.
    if (!result.cancelled && rows.value.some((r) => r.status === "error")) {
      finished.value = true;
      return;
    }
    // A: the review aggregate is rebuilt from the DRAFT, not from this run's
    // return — so it carries this run's chapters AND everything a previous
    // (crashed/cancelled) run already banked. Partial proposals survive a
    // cancel the same way they always did; they're in the draft too.
    proposals.value = rebuildProposals(draft.value);
  } catch (e) {
    error.value = e?.message || String(e);
  }
}

// B: re-queue ONLY the failed chapters (their draft entries are status
// "error", so initPicks would tick them anyway — this skips the picker trip).
const finished = ref(false);
const failedCount = computed(() => rows.value.filter((r) => r.status === "error").length);
function retryFailed() {
  const failedIds = new Set(rows.value.filter((r) => r.status === "error").map((r) => r.id));
  initPicks();
  for (const p of picks.value) p.checked = failedIds.has(p.id);
  finished.value = false;
  runSweep();
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
  // A: accepted → the draft's job is done; clear it so the next sweep starts
  // clean. (Closing the review WITHOUT committing keeps the draft — resume.)
  draft.value = emptyDraft();
  clearSweepDraft(projectId.value).catch(() => {});
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
  <AppModal v-else :eyebrow="$t('common.entitySweep')" :title="$t('entitySweep.title')"
    :closable="!running" @close="emit('close')">
    <template #header>
      <div class="sweep-titleblock">
        <div class="t-eyebrow">{{ $t("common.entitySweep") }}</div>
        <div class="modal-title">{{ $t("entitySweep.title") }}</div>
      </div>
      <!-- No Cancel here: the shared AiTaskStrip below renders THE Cancel (user,
           2026-07-17: "top cancel button redundant" — both were live at once). -->
      <div class="sweep-header-actions">
        <AiFeatureChip feature="entitySweep" :label="$t('common.entitySweep')" editable />
      </div>
    </template>

    <p class="sweep-desc">
      <i18n-t keypath="entitySweep.desc" tag="span" scope="global">
        <template #entities><strong>{{ $t("entitySweep.entitiesTerm") }}</strong></template>
      </i18n-t>
      <template v-if="!rows.length">
        {{ $t("entitySweep.matterHint") }}
      </template>
    </p>

    <div v-if="error" class="sweep-error">
      <Icon name="Alert" :size="13" /> {{ error }}
    </div>

    <AiTaskStrip :task="myTask" />

    <!-- Pre-run: the chapter picker (D) + draft resume (A). -->
    <div v-if="!rows.length" class="sweep-pick">
      <div v-if="hasDraft" class="sweep-resume">
        <Icon name="History" :size="13" />
        <span>
          {{ $t("entitySweep.resumeFound", { done: $t("count.chapter", { n: resume.done }, resume.done), failedPart: resume.failed ? $t("entitySweep.resumeFailedPart", { n: resume.failed }) : "" }) }}
        </span>
        <button type="button" class="tb-btn wide" @click="startOver">{{ $t("entitySweep.startOver") }}</button>
      </div>
      <div class="sweep-pick-h">
        <span class="t-muted">{{ $t("common.selectedOf", { selected: checkedCount, total: picks.length }) }}</span>
        <div class="sweep-pick-h-actions">
          <button type="button" class="tb-btn wide" @click="setAllPicks(true)">{{ $t("common.all") }}</button>
          <button type="button" class="tb-btn wide" @click="setAllPicks(false)">{{ $t("common.none") }}</button>
        </div>
      </div>
      <div class="sweep-list sweep-pick-list">
        <label v-for="p in picks" :key="p.id" class="sweep-pick-row" :class="{ off: !p.checked }">
          <UiCheckbox v-model="p.checked" />
          <span class="sweep-pick-num">{{ p.num }}</span>
          <span class="sweep-pick-title">{{ p.title || $t("entitySweep.untitled") }}</span>
          <span v-if="p.draftStatus === 'done'" class="sweep-pick-note">
            {{ $t("entitySweep.pickFound", { n: p.found }) }}{{ p.changed ? $t("entitySweep.pickTextChanged") : "" }}
          </span>
          <span v-else-if="p.draftStatus === 'error'" class="sweep-pick-note err">{{ $t("entitySweep.pickFailed") }}</span>
        </label>
      </div>
    </div>

    <div v-else class="sweep-list">
      <StatusRow v-for="row in rows" :key="row.id"
        :status="row.status"
        :left="row.num"
        :main="row.title || 'Untitled'"
        :right="row.note || (row.reason ? `${row.status} · ${row.reason}` : row.status)" />
    </div>

    <template v-if="!rows.length || finished" #footer>
      <!-- Pre-run picker footer -->
      <template v-if="!rows.length">
        <span class="t-muted sweep-foot-count">{{ $t("common.selectedOf", { selected: checkedCount, total: picks.length }) }}</span>
        <span style="flex:1"></span>
        <UiButton intent="ghost" @click="emit('close')">{{ $t("common.cancel") }}</UiButton>
        <UiButton v-if="foundTotal" intent="secondary" @click="reviewFound">
          {{ $t("entitySweep.reviewFound", { n: foundTotal }) }}
        </UiButton>
        <UiButton intent="primary" :disabled="!checkedCount" @click="runSweep">
          <Icon name="Sparkle" :size="13" /> {{ $t("entitySweep.scanAction", { chapters: $t("count.chapter", { n: checkedCount }, checkedCount) }) }}
        </UiButton>
      </template>
      <!-- B: finished-with-failures footer — the failed rows stay visible. -->
      <template v-else>
        <span class="t-muted sweep-foot-count">{{ $t("entitySweep.chaptersFailed", { chapters: $t("count.chapter", { n: failedCount }, failedCount) }) }}</span>
        <span style="flex:1"></span>
        <UiButton intent="ghost" @click="emit('close')">{{ $t("common.close") }}</UiButton>
        <UiButton intent="secondary" @click="retryFailed">{{ $t("entitySweep.retryFailed", { n: failedCount }) }}</UiButton>
        <UiButton v-if="foundTotal" intent="primary" @click="reviewFound">
          {{ $t("entitySweep.reviewFound", { n: foundTotal }) }}
        </UiButton>
      </template>
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
/* A — the draft resume line. */
.sweep-resume {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 12px; border-radius: 6px;
  background: var(--accent-soft); color: var(--accent-ink);
  font-size: 12.5px; line-height: 1.45;
}
.sweep-resume > span { flex: 1; min-width: 0; }
.sweep-pick-note {
  margin-left: auto; flex-shrink: 0;
  font-size: 11px; color: var(--muted);
  font-family: var(--font-mono);
}
.sweep-pick-note.err { color: var(--danger-ink, #b91c1c); }
.sweep-foot-count { white-space: nowrap; }
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
  flex: 1; min-width: 0;
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
