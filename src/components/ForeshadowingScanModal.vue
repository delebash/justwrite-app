<script setup>
// Whole-book foreshadowing / dangling-thread scan modal.
//
// Two phases like EntitySweepModal:
//   - "scanning": progress bar + per-chapter status rows
//   - "review":   the proposal list with per-thread Pin buttons
//
// Pin drops a Loose-thread marker into the chapter at the verbatim
// snippet (via addMarkerToSceneHtml — works without an editor
// instance). Status badges show whether each setup looks dangling
// (keyTerm never reappears in later chapters) or mentioned-later (a
// later chapter at least references the keyTerm). The classification
// is a heuristic — the writer has the final say.

import { ref, computed, onMounted, watch } from "vue";
import { useProjectStore } from "../stores/project.js";
import { useUiStore } from "../stores/ui.js";
import { useAiTasksStore, AiTaskStrip, Icon, AppModal, EmptyState, UiButton } from "@delebash/llm-ui";
import { scanForDanglingThreads } from "../services/analysis/foreshadowingScan.js";
import { addMarkerToSceneHtml } from "../services/markers.js";
import AiFeatureChip from "./AiFeatureChip.vue";
import StatusRow from "./StatusRow.vue";

const emit = defineEmits(["close"]);

const project = useProjectStore();
const ui = useUiStore();
const aiTasks = useAiTasksStore();

// QC-31: the scan is ONE user action → ONE task entry (started by
// scanForDanglingThreads, which owns the controller every chapter rides).
const myTask = computed(() => aiTasks.runningTasks.find(
  (t) => t.feature === "foreshadowing"
));
const running = computed(() => !!myTask.value);

// Our controller: the ONE thing that stops the pool (see the watch below).
let scanAbort = null;


const rows = ref([]);
const rowById = ref(new Map());
const completedCount = ref(0);
const totalCount = ref(0);
const result = ref(null);   // { proposals, skipped, scanned, totalChapters }
const error = ref("");
const pinStatus = ref({});  // proposalId -> 'added' | 'unavailable'

// status filter for the review list.
const filter = ref("dangling");  // "all" | "dangling" | "mentioned-later"

const phase = computed(() => (result.value ? "review" : "scanning"));
const scanningCount = computed(() => rows.value.filter((r) => r.status === "scanning").length);

const proposals = computed(() => result.value?.proposals || []);
const dangling = computed(() => proposals.value.filter((p) => p.status === "dangling"));
const mentioned = computed(() => proposals.value.filter((p) => p.status === "mentioned-later"));

const filtered = computed(() => {
  if (filter.value === "dangling") return dangling.value;
  if (filter.value === "mentioned-later") return mentioned.value;
  return proposals.value;
});

const grouped = computed(() => {
  const map = new Map();
  for (const p of filtered.value) {
    const key = p.chapterId;
    if (!map.has(key)) {
      map.set(key, {
        chapterId: p.chapterId,
        chapterNum: p.chapterNum,
        chapterTitle: p.chapterTitle,
        items: [],
      });
    }
    map.get(key).items.push(p);
  }
  return Array.from(map.values()).sort((a, b) => (a.chapterNum || 0) - (b.chapterNum || 0));
});

// Badge labels. Held raw English, which no-raw-text cannot see because this is script.
const KIND_I18N = {
  promise:  "foreshadowing.kinds.promise",
  object:   "foreshadowing.kinds.object",
  question: "foreshadowing.kinds.question",
  ability:  "foreshadowing.kinds.ability",
  secret:   "foreshadowing.kinds.secret",
  threat:   "foreshadowing.kinds.threat",
  debt:     "foreshadowing.kinds.debt",
};

function initRows() {
  rows.value = project.allChapters.map((c) => ({
    id: c.id,
    num: c.num,
    title: c.title,
    status: "pending",
    reason: "",
  }));
  rowById.value = new Map(rows.value.map((r) => [r.id, r]));
  totalCount.value = rows.value.length;
  completedCount.value = 0;
}

async function runScan() {
  if (running.value) return;
  initRows();
  error.value = "";
  result.value = null;
  pinStatus.value = {};
  if (!rows.value.length) {
    error.value = "No chapters to scan.";
    return;
  }
  try {
    scanAbort = new AbortController();
    const r = await scanForDanglingThreads({
      project,
      signal: scanAbort.signal,
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
    // CANCEL LEAVES NO ROW BEHIND (user, 2026-07-17: "cancel should cancel everything").
    // A cancelled scan RETURNS (the workers exit by returning, so Promise.all resolves)
    // — it does not throw, which is why the old catch-on-abort cleanup never ran and
    // rows froze on "scanning"/"pending". No result screen: a half-scanned book cannot
    // answer "which threads dangle?" — absence IS the finding here, so partial evidence
    // would read as a verdict.
    if (r.cancelled) {
      for (const row of rows.value) {
        if (row.status === "scanning" || row.status === "pending") {
          row.status = "skipped";
          row.reason = "cancelled";
        }
      }
      return;
    }
    result.value = r;
    // If everything's mentioned-later, default the filter to "all" so
    // the list isn't empty by accident.
    if (!r.proposals.some((p) => p.status === "dangling")) {
      filter.value = "all";
    }
  } catch (e) {
    const msg = String(e?.message || e || "");
    error.value = /provider|api key|configure/i.test(msg)
      ? "Configure an AI provider in Settings → AI to run the scan."
      : msg || "Couldn't run scan.";
  }
}

// THE stop — the shared AiTaskStrip's Cancel is the only one now (the modal's duplicate
// was removed 2026-07-17). It cancels the task entry, which the pool can't see; mirror
// it onto our controller so ONE click stops every worker. Watch the DISAPPEARANCE, not
// a "cancelled" status: aiTasks.cancel() deletes the entry (`_archiveAndRemove`), so
// myTask goes straight to undefined and a status watch would never fire.
watch(running, (isRunning) => {
  if (!isRunning) scanAbort?.abort();
});

function pinThread(thread) {
  if (!thread || pinStatus.value[thread.id]) return;
  const scene = (project.scenesFor(thread.chapterId) || [])
    .find((s) => s.id === thread.sceneId);
  if (!scene) {
    pinStatus.value = { ...pinStatus.value, [thread.id]: "unavailable" };
    return;
  }
  const nextHtml = addMarkerToSceneHtml(scene.body || "", thread.snippet, {
    category: "thread",
    label: thread.label || "",
  });
  if (!nextHtml) {
    pinStatus.value = { ...pinStatus.value, [thread.id]: "unavailable" };
    return;
  }
  project.setSceneBody(thread.chapterId, thread.sceneId, nextHtml);
  pinStatus.value = { ...pinStatus.value, [thread.id]: "added" };
}

function pinAllDangling() {
  for (const p of dangling.value) {
    if (pinStatus.value[p.id]) continue;
    pinThread(p);
  }
  const added = Object.values(pinStatus.value).filter((v) => v === "added").length;
  if (added) ui.showToast({ message: `Pinned ${added} loose thread${added === 1 ? "" : "s"}.` });
}

const danglingCount = computed(() => dangling.value.length);
const mentionedCount = computed(() => mentioned.value.length);
const pinnedCount = computed(() => Object.values(pinStatus.value).filter((v) => v === "added").length);

// Deliberately no auto-run on mount: the user should see the AI
// routing chip in the header and have the option to change provider
// or model before spending tokens on every chapter. The empty-state
// CTA below kicks off the run when they're ready.
</script>

<template>
  <!-- ── REVIEW PHASE ─────────────────────────────────────────── -->
  <AppModal
    v-if="phase === 'review'"
    :eyebrow="$t('foreshadowing.eyebrow')"
    :title="$t('foreshadowing.reviewTitle')"
    wide
    @close="emit('close')"
  >
    <template #header>
      <div class="fs-titleblock">
        <div class="t-eyebrow">{{ $t("foreshadowing.eyebrow") }}</div>
        <div class="modal-title">{{ $t("foreshadowing.reviewTitle") }}</div>
      </div>
      <div class="fs-header-actions">
        <AiFeatureChip feature="foreshadowing" :label="$t('foreshadowing.chipLabel')" editable />
      </div>
    </template>

    <i18n-t keypath="foreshadowing.reviewDesc" tag="p" class="fs-desc" scope="global">
      <template #dangling><strong>{{ $t("foreshadowing.danglingTerm") }}</strong></template>
      <template #mentionedLater><strong>{{ $t("foreshadowing.mentionedLaterTerm") }}</strong></template>
      <template #looseThread><strong>{{ $t("foreshadowing.looseThreadTerm") }}</strong></template>
    </i18n-t>

    <div v-if="!proposals.length" class="fs-empty-wrap">
      <EmptyState
        icon="Check"
        :title="$t('foreshadowing.emptyTitle')"
        :message="$t('foreshadowing.emptyMessage')" />
    </div>

    <template v-else>
      <div class="fs-stats">
        <span class="fs-stat-chip dangling">{{ $t("foreshadowing.danglingCount", { n: danglingCount }) }}</span>
        <span class="fs-stat-chip mentioned">{{ $t("foreshadowing.mentionedCount", { n: mentionedCount }) }}</span>
        <span class="fs-stat-chip muted">{{ $t("foreshadowing.chaptersScanned", { scanned: result.scanned, total: result.totalChapters }) }}</span>
      </div>

      <div class="fs-filters">
        <button type="button" class="fs-chip"
                :class="{ active: filter === 'dangling' }"
                :disabled="!danglingCount"
                @click="filter = 'dangling'">
          {{ $t("foreshadowing.filterDangling") }} <span class="fs-chip-n">{{ danglingCount }}</span>
        </button>
        <button type="button" class="fs-chip"
                :class="{ active: filter === 'mentioned-later' }"
                :disabled="!mentionedCount"
                @click="filter = 'mentioned-later'">
          {{ $t("foreshadowing.filterMentioned") }} <span class="fs-chip-n">{{ mentionedCount }}</span>
        </button>
        <button type="button" class="fs-chip"
                :class="{ active: filter === 'all' }"
                @click="filter = 'all'">
          {{ $t("common.all") }} <span class="fs-chip-n">{{ proposals.length }}</span>
        </button>
        <span class="fs-filters-spacer" />
        <UiButton v-if="filter === 'dangling' && danglingCount" intent="ghost" size="small"
                  :disabled="dangling.every(p => pinStatus[p.id])"
                  @click="pinAllDangling"
                  v-tooltip.bottom="$t('foreshadowing.pinAllTooltip')">
          <Icon name="Pin" :size="12" /> {{ $t("foreshadowing.pinAllDangling") }}
        </UiButton>
      </div>

      <div class="fs-groups">
        <section v-for="g in grouped" :key="g.chapterId" class="fs-group">
          <header class="fs-group-h">
            <span class="fs-group-num">{{ $t("common.chapterShort", { num: g.chapterNum }) }}</span>
            <span class="fs-group-title">{{ g.chapterTitle || $t("foreshadowing.untitled") }}</span>
            <span class="fs-group-count">{{ g.items.length }}</span>
          </header>
          <ul class="fs-list">
            <li v-for="t in g.items" :key="t.id" class="fs-thread" :class="`status-${t.status}`">
              <div class="fs-thread-meta">
                <span class="fs-kind-badge" :data-kind="t.kind">{{ KIND_I18N[t.kind] ? $t(KIND_I18N[t.kind]) : t.kind }}</span>
                <span v-if="t.status === 'dangling'" class="fs-status-badge dangling">{{ $t("foreshadowing.statusDangling") }}</span>
                <span v-else class="fs-status-badge mentioned"
                      v-tooltip.bottom="t.laterMentions.map(m => `Ch. ${m.chapterNum}${m.chapterTitle ? ' — ' + m.chapterTitle : ''}`).join('\n')">
                  {{ $t("foreshadowing.mentionedIn") }}
                  <template v-for="(m, i) in t.laterMentions.slice(0, 3)" :key="m.chapterId">
                    {{ $t("common.chapterShort", { num: m.chapterNum }) }}<span v-if="i < Math.min(t.laterMentions.length, 3) - 1">, </span>
                  </template>
                  <span v-if="t.laterMentions.length > 3">…</span>
                </span>
              </div>
              <p class="fs-thread-snippet">"{{ t.snippet }}"</p>
              <p v-if="t.label" class="fs-thread-label">{{ t.label }}</p>
              <div class="fs-thread-actions">
                <UiButton v-if="!pinStatus[t.id]" intent="ghost" size="small"
                          :disabled="!t.locatable"
                          @click="pinThread(t)"
                          v-tooltip.bottom="t.locatable ? $t('foreshadowing.pinTooltip') : $t('foreshadowing.pinDisabledTooltip')">
                  <Icon name="Pin" :size="12" /> {{ $t("foreshadowing.pin") }}
                </UiButton>
                <span v-else-if="pinStatus[t.id] === 'added'" class="fs-pinned">
                  <Icon name="Check" :size="12" /> {{ $t("foreshadowing.pinned") }}
                </span>
                <span v-else class="fs-unavail">{{ $t("foreshadowing.notFound") }}</span>
              </div>
            </li>
          </ul>
        </section>
      </div>
    </template>

    <template #footer>
      <span v-if="pinnedCount" class="t-muted">{{ $t("foreshadowing.pinnedCount", { n: pinnedCount }) }}</span>
      <span class="fs-foot-spacer" />
      <UiButton intent="ghost" @click="runScan">
        <Icon name="Refresh" :size="12" /> {{ $t("foreshadowing.rescan") }}
      </UiButton>
      <UiButton intent="primary" @click="emit('close')">{{ $t("common.done") }}</UiButton>
    </template>
  </AppModal>

  <!-- ── SCANNING PHASE ───────────────────────────────────────── -->
  <AppModal
    v-else
    :eyebrow="$t('foreshadowing.eyebrow')"
    :title="$t('foreshadowing.runTitle')"
    :closable="!running"
    @close="emit('close')"
  >
    <template #header>
      <div class="fs-titleblock">
        <div class="t-eyebrow">{{ $t("foreshadowing.eyebrow") }}</div>
        <div class="modal-title">{{ $t("foreshadowing.runTitle") }}</div>
      </div>
      <!-- No Cancel here: the shared AiTaskStrip below renders THE Cancel (user,
           2026-07-17: "top cancel button redundant" — both were live at once). -->
      <div class="fs-header-actions">
        <AiFeatureChip feature="foreshadowing" :label="$t('foreshadowing.chipLabel')" editable />
      </div>
    </template>

    <i18n-t keypath="foreshadowing.runDesc" tag="p" class="fs-desc" scope="global">
      <template #setups><strong>{{ $t("foreshadowing.setupsTerm") }}</strong></template>
      <template #dangling><strong>{{ $t("foreshadowing.danglingLower") }}</strong></template>
    </i18n-t>

    <div v-if="error" class="fs-error">
      <Icon name="Alert" :size="13" /> {{ error }}
    </div>

    <div v-if="!running && !rows.length" class="fh-empty">
      <Icon name="Sparkle" :size="20" />
      <p class="fh-empty-text">
        {{ $t("foreshadowing.idleBlurb") }}
      </p>
      <UiButton intent="primary" @click="runScan">
        <Icon name="Sparkle" :size="13" /> {{ $t("foreshadowing.action") }}
      </UiButton>
    </div>

    <template v-else>
    <AiTaskStrip :task="myTask" />

    <div class="fs-rowlist">
      <StatusRow v-for="row in rows" :key="row.id"
        :status="row.status"
        :left="row.num"
        :main="row.title || 'Untitled'"
        :right="row.reason ? `${row.status} · ${row.reason}` : row.status" />
    </div>
    </template>
  </AppModal>
</template>

<style scoped>
.fs-titleblock { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
.fs-header-actions { display: flex; gap: 8px; align-items: center; flex-shrink: 0; }
.fs-desc { font-size: 12.5px; line-height: 1.6; color: var(--muted); margin: 0 0 14px; max-width: 80ch; }
.fs-desc strong { color: var(--ink-2); font-weight: 600; }

.fs-error {
  display: flex; gap: 8px; align-items: center;
  padding: 8px 12px; border-radius: 6px;
  background: color-mix(in oklab, var(--danger-ink, #b91c1c) 12%, transparent);
  color: var(--danger-ink, #b91c1c);
  font-size: 12.5px;
  margin-bottom: 10px;
}

.fh-empty {
  display: flex; flex-direction: column; align-items: center;
  gap: 14px; padding: 32px 18px;
  background: var(--surface-2);
  border-radius: 10px;
  text-align: center;
}
.fh-empty > :first-child { color: var(--accent); }
.fh-empty-text {
  margin: 0; max-width: 56ch;
  font-size: 13px; line-height: 1.55; color: var(--ink-2);
}

.fs-rowlist {
  flex: 1; min-height: 0; overflow-y: auto;
  display: flex; flex-direction: column;
  border: 1px solid var(--border-soft); border-radius: 8px;
  background: var(--surface-2);
}

.fs-empty-wrap { padding: 24px 0; }

.fs-stats {
  display: flex; flex-wrap: wrap; gap: 8px;
  margin-bottom: 14px;
}
.fs-stat-chip {
  font-family: var(--font-mono); font-size: 11px;
  padding: 4px 10px; border-radius: 999px;
}
.fs-stat-chip.dangling { background: color-mix(in oklab, var(--marker-thread, var(--accent)) 18%, transparent); color: var(--ink); }
.fs-stat-chip.mentioned { background: color-mix(in oklab, var(--status-done) 14%, transparent); color: var(--ink); }
.fs-stat-chip.muted { background: var(--surface-3); color: var(--muted); }

.fs-filters {
  display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
  padding: 8px 0; margin-bottom: 14px;
  border-bottom: 1px solid var(--border-soft);
}
.fs-filters-spacer { flex: 1; }
.fs-chip {
  appearance: none; border: 1px solid var(--border); background: transparent;
  font-family: var(--font-mono); font-size: 11px; color: var(--muted);
  padding: 4px 12px; border-radius: 999px; cursor: pointer;
  display: inline-flex; align-items: center; gap: 6px;
}
.fs-chip:hover { color: var(--ink-2); border-color: var(--border-strong, var(--border)); }
.fs-chip.active { background: var(--accent-soft); color: var(--accent); border-color: var(--accent-line); }
.fs-chip:disabled { opacity: 0.4; cursor: not-allowed; }
.fs-chip-n {
  font-family: var(--font-ui); font-size: 10.5px;
  background: var(--surface-3); padding: 0 6px; border-radius: 999px;
}

.fs-groups { display: flex; flex-direction: column; gap: 18px; }
.fs-group { display: flex; flex-direction: column; gap: 8px; }
.fs-group-h {
  display: flex; align-items: baseline; gap: 10px;
  font-family: var(--font-mono); font-size: 10px;
  letter-spacing: 0.16em; text-transform: uppercase; color: var(--muted);
  padding-bottom: 4px; border-bottom: 1px solid var(--border-soft);
}
.fs-group-num { color: var(--accent-ink); font-weight: 600; }
.fs-group-title {
  font-family: var(--font-serif); font-size: 13px;
  letter-spacing: 0; text-transform: none; color: var(--ink-2); font-style: italic;
}
.fs-group-count {
  margin-left: auto;
  font-family: var(--font-mono); font-size: 10.5px; color: var(--subtle);
}

.fs-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
.fs-thread {
  display: grid; grid-template-columns: 1fr auto; column-gap: 14px;
  padding: 10px 14px;
  background: var(--surface-2); border-radius: 8px;
  border-left: 3px solid var(--marker-thread, var(--accent));
}
.fs-thread.status-mentioned-later { border-left-color: var(--status-done); opacity: 0.92; }

.fs-thread-meta {
  grid-column: 1 / -1;
  display: flex; flex-wrap: wrap; gap: 6px; align-items: center;
  margin-bottom: 4px;
}
.fs-kind-badge {
  font-family: var(--font-mono); font-size: 10px;
  letter-spacing: 0.08em; text-transform: uppercase;
  padding: 2px 8px; border-radius: 999px;
  background: var(--surface-3); color: var(--muted);
}
.fs-status-badge {
  font-family: var(--font-mono); font-size: 10px;
  letter-spacing: 0.04em;
  padding: 2px 8px; border-radius: 999px;
}
.fs-status-badge.dangling { background: color-mix(in oklab, var(--marker-thread, var(--accent)) 20%, transparent); color: var(--ink); }
.fs-status-badge.mentioned { background: color-mix(in oklab, var(--status-done) 18%, transparent); color: var(--ink); }

.fs-thread-snippet {
  margin: 0; font-family: var(--font-serif); font-style: italic;
  font-size: 13.5px; line-height: 1.55; color: var(--ink-2);
}
.fs-thread-label {
  margin: 4px 0 0; font-size: 12px; color: var(--muted); line-height: 1.5;
}
.fs-thread-actions {
  grid-column: 2;
  grid-row: 2 / span 2;
  align-self: center;
}
.fs-pinned {
  display: inline-flex; align-items: center; gap: 4px;
  font-family: var(--font-mono); font-size: 10.5px; color: var(--status-done);
}
.fs-unavail {
  font-family: var(--font-mono); font-size: 10.5px;
  color: var(--muted); font-style: italic;
}

.fs-foot-spacer { flex: 1; }
</style>
