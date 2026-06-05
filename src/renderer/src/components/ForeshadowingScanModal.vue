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

import { ref, computed, onMounted } from "vue";
import { useProjectStore } from "../stores/project.js";
import { useUiStore } from "../stores/ui.js";
import { useAiProgress } from "../composables/useAiProgress.js";
import { scanForDanglingThreads } from "../services/analysis/foreshadowingScan.js";
import { addMarkerToSceneHtml } from "../services/markers.js";
import AiProgressBar from "./AiProgressBar.vue";
import Icon from "./Icon.vue";
import AppModal from "./AppModal.vue";
import StatusRow from "./StatusRow.vue";
import EmptyState from "./EmptyState.vue";
import JwButton from "@renderer/components/ui/JwButton.vue";

const emit = defineEmits(["close"]);

const project = useProjectStore();
const ui = useUiStore();
const progress = useAiProgress();

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

const KIND_LABELS = {
  promise:  "Promise",
  object:   "Object",
  question: "Question",
  ability:  "Ability",
  secret:   "Secret",
  threat:   "Threat",
  debt:     "Debt",
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
  initRows();
  error.value = "";
  result.value = null;
  pinStatus.value = {};
  if (!rows.value.length) {
    error.value = "No chapters to scan.";
    return;
  }
  progress.start();
  try {
    const r = await scanForDanglingThreads({
      project,
      signal: progress.signal,
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
    progress.finish();
    result.value = r;
    // If everything's mentioned-later, default the filter to "all" so
    // the list isn't empty by accident.
    if (!r.proposals.some((p) => p.status === "dangling")) {
      filter.value = "all";
    }
  } catch (e) {
    if (!progress.cancelled.value) {
      const msg = String(e?.message || e || "");
      error.value = /provider|api key|configure/i.test(msg)
        ? "Configure an AI provider in Settings → AI to run the scan."
        : msg || "Couldn't run scan.";
    }
    progress.finish();
  }
}

function cancelScan() {
  progress.cancel();
  for (const row of rows.value) {
    if (row.status === "scanning") { row.status = "skipped"; row.reason = "cancelled"; }
  }
  // No result.value set → user stays in the scanning phase with the
  // partial row state visible, then can close.
}

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

onMounted(runScan);
</script>

<template>
  <!-- ── REVIEW PHASE ─────────────────────────────────────────── -->
  <AppModal
    v-if="phase === 'review'"
    eyebrow="Foreshadowing scan"
    title="Dangling threads"
    wide
    @close="emit('close')"
  >
    <p class="fs-desc">
      Setups your manuscript plants that may not have paid off. <strong>Dangling</strong> means
      the setup's key term never appears in a later chapter; <strong>mentioned later</strong>
      means a later chapter at least references it — payoff or not is your call. Pin any to drop
      a <strong>Loose thread</strong> marker at the exact phrase so it joins your markers list.
    </p>

    <div v-if="!proposals.length" class="fs-empty-wrap">
      <EmptyState
        icon="Check"
        title="Nothing dangling"
        message="No setups without payoff turned up in this scan. Run it again after more drafting." />
    </div>

    <template v-else>
      <div class="fs-stats">
        <span class="fs-stat-chip dangling">{{ danglingCount }} dangling</span>
        <span class="fs-stat-chip mentioned">{{ mentionedCount }} mentioned later</span>
        <span class="fs-stat-chip muted">{{ result.scanned }} of {{ result.totalChapters }} chapters scanned</span>
      </div>

      <div class="fs-filters">
        <button type="button" class="fs-chip"
                :class="{ active: filter === 'dangling' }"
                :disabled="!danglingCount"
                @click="filter = 'dangling'">
          Dangling <span class="fs-chip-n">{{ danglingCount }}</span>
        </button>
        <button type="button" class="fs-chip"
                :class="{ active: filter === 'mentioned-later' }"
                :disabled="!mentionedCount"
                @click="filter = 'mentioned-later'">
          Mentioned later <span class="fs-chip-n">{{ mentionedCount }}</span>
        </button>
        <button type="button" class="fs-chip"
                :class="{ active: filter === 'all' }"
                @click="filter = 'all'">
          All <span class="fs-chip-n">{{ proposals.length }}</span>
        </button>
        <span class="fs-filters-spacer" />
        <JwButton v-if="filter === 'dangling' && danglingCount" intent="ghost" size="small"
                  :disabled="dangling.every(p => pinStatus[p.id])"
                  @click="pinAllDangling"
                  v-tooltip.bottom="'Drop Loose-thread markers on every dangling proposal at once'">
          <Icon name="Pin" :size="12" /> Pin all dangling
        </JwButton>
      </div>

      <div class="fs-groups">
        <section v-for="g in grouped" :key="g.chapterId" class="fs-group">
          <header class="fs-group-h">
            <span class="fs-group-num">Ch. {{ g.chapterNum }}</span>
            <span class="fs-group-title">{{ g.chapterTitle || "Untitled" }}</span>
            <span class="fs-group-count">{{ g.items.length }}</span>
          </header>
          <ul class="fs-list">
            <li v-for="t in g.items" :key="t.id" class="fs-thread" :class="`status-${t.status}`">
              <div class="fs-thread-meta">
                <span class="fs-kind-badge" :data-kind="t.kind">{{ KIND_LABELS[t.kind] || t.kind }}</span>
                <span v-if="t.status === 'dangling'" class="fs-status-badge dangling">Dangling</span>
                <span v-else class="fs-status-badge mentioned"
                      v-tooltip.bottom="t.laterMentions.map(m => `Ch. ${m.chapterNum}${m.chapterTitle ? ' — ' + m.chapterTitle : ''}`).join('\n')">
                  Mentioned in
                  <template v-for="(m, i) in t.laterMentions.slice(0, 3)" :key="m.chapterId">
                    Ch. {{ m.chapterNum }}<span v-if="i < Math.min(t.laterMentions.length, 3) - 1">, </span>
                  </template>
                  <span v-if="t.laterMentions.length > 3">…</span>
                </span>
              </div>
              <p class="fs-thread-snippet">"{{ t.snippet }}"</p>
              <p v-if="t.label" class="fs-thread-label">{{ t.label }}</p>
              <div class="fs-thread-actions">
                <JwButton v-if="!pinStatus[t.id]" intent="ghost" size="small"
                          :disabled="!t.locatable"
                          @click="pinThread(t)"
                          v-tooltip.bottom="t.locatable ? 'Drop a Loose-thread marker on this phrase' : 'Snippet not found in current prose'">
                  <Icon name="Pin" :size="12" /> Pin
                </JwButton>
                <span v-else-if="pinStatus[t.id] === 'added'" class="fs-pinned">
                  <Icon name="Check" :size="12" /> Pinned
                </span>
                <span v-else class="fs-unavail">Not found</span>
              </div>
            </li>
          </ul>
        </section>
      </div>
    </template>

    <template #footer>
      <span v-if="pinnedCount" class="t-muted">{{ pinnedCount }} pinned</span>
      <span class="fs-foot-spacer" />
      <JwButton intent="ghost" @click="runScan">
        <Icon name="Refresh" :size="12" /> Re-scan
      </JwButton>
      <JwButton intent="primary" @click="emit('close')">Done</JwButton>
    </template>
  </AppModal>

  <!-- ── SCANNING PHASE ───────────────────────────────────────── -->
  <AppModal
    v-else
    eyebrow="Foreshadowing scan"
    title="Reading every chapter for unresolved setups"
    :closable="!progress.running.value"
    @close="emit('close')"
  >
    <template #header>
      <div class="fs-titleblock">
        <div class="t-eyebrow">Foreshadowing scan</div>
        <div class="modal-title">Reading every chapter for unresolved setups</div>
      </div>
      <JwButton v-if="progress.running.value" intent="ghost" size="small" @click="cancelScan">
        <Icon name="Close" :size="12" /> Cancel
      </JwButton>
    </template>

    <p class="fs-desc">
      Reads every chapter and asks the model for narrative <strong>setups</strong> — promises,
      objects, questions, abilities, secrets, threats, debts — that look like they need a later
      payoff. After the scan, JustWrite checks whether each setup's key term reappears in any
      later chapter; the ones that don't are flagged as <strong>dangling</strong>. You review
      and pin what you want as Loose-thread markers.
    </p>

    <div v-if="error" class="fs-error">
      <Icon name="Alert" :size="13" /> {{ error }}
    </div>

    <AiProgressBar
      :progress="progress"
      :label="totalCount > 0
        ? `${completedCount} of ${totalCount} chapters · ${scanningCount} scanning`
        : 'Starting…'"
    />

    <div class="fs-rowlist">
      <StatusRow v-for="row in rows" :key="row.id"
        :status="row.status"
        :left="row.num"
        :main="row.title || 'Untitled'"
        :right="row.reason ? `${row.status} · ${row.reason}` : row.status" />
    </div>
  </AppModal>
</template>

<style scoped>
.fs-titleblock { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
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
