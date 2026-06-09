<script setup>
// Reader-knowledge tracker — the dramatic-irony map.
//
// Walks the manuscript chapter-by-chapter (sequential) asking an LLM
// to thread two knowledge models through: what the reader knows vs.
// what the POV character knows. Each chapter gets classified as:
//
//   aligned          — reader and POV move in lockstep
//   dramatic-irony   — reader knows things the POV does not
//   reader-confused  — POV knows things the reader doesn't / chapter
//                      introduces unresolved ambiguity
//   neutral          — transitional / setup; neither pattern applies
//
// The view shows a coloured chapter strip, a knowledge-growth chart
// (cumulative reader facts vs. POV facts), a per-status stats row, and
// a detail panel for the selected chapter (rationale + new facts).

import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { useProjectStore } from "../stores/project.js";
import { useUiStore } from "../stores/ui.js";
import { useAiStore } from "../stores/ai.js";
import { useAiTasksStore } from "../stores/aiTasks.js";
import {
  scanReaderKnowledge,
  STATUS_LABELS,
  STATUS_COLOURS,
} from "../services/analysis/readerKnowledge.js";
import Icon from "../components/Icon.vue";
import AiTaskStrip from "../components/AiTaskStrip.vue";
import HelpTrigger from "../components/HelpTrigger.vue";
import AiFeatureChip from "../components/AiFeatureChip.vue";
import EmptyState from "../components/EmptyState.vue";
import JwButton from "@renderer/components/ui/JwButton.vue";

const project = useProjectStore();
const ui = useUiStore();
const ai = useAiStore();
const router = useRouter();
const aiTasks = useAiTasksStore();

const myTask = computed(() => aiTasks.runningTasks.find((t) => t.feature === "readerKnowledge"));
const running = computed(() => !!myTask.value);

function isAbort(e) { return e?.name === "AbortError" || /abort/i.test(e?.message || ""); }

const allChapters = computed(() => project.allChapters);

// Each chapter's persisted reader-knowledge entry (or null).
const entries = computed(() =>
  allChapters.value.map((c) => ({
    chapter: c,
    rk: c.readerKnowledge || null,
  }))
);

// Whichever chapter the user has selected for the detail panel.
const selectedId = ref(null);
const selected = computed(() => {
  if (!selectedId.value) return null;
  return entries.value.find((e) => e.chapter.id === selectedId.value) || null;
});
function selectChapter(id) {
  selectedId.value = id === selectedId.value ? null : id;
}

// Per-status counts across analysed chapters.
const counts = computed(() => {
  const out = { aligned: 0, "dramatic-irony": 0, "reader-confused": 0, neutral: 0, analysed: 0 };
  for (const e of entries.value) {
    if (!e.rk) continue;
    out.analysed += 1;
    if (out[e.rk.status] != null) out[e.rk.status] += 1;
  }
  return out;
});

const analysedCount = computed(() => counts.value.analysed);
const totalCount = computed(() => allChapters.value.length);

// The chapter currently being analysed mid-sweep.
const runningChapterId = ref(null);

// Knowledge-growth chart points — one (reader, pov) pair per analysed
// chapter, in manuscript order. We compute the SVG polyline points
// inline so the chart is a pure derived value.
const chartGeom = computed(() => {
  const pts = entries.value
    .filter((e) => e.rk)
    .map((e) => ({
      num: e.chapter.num,
      reader: e.rk.totalReaderKnown || 0,
      pov: e.rk.totalPovKnown || 0,
      irony: e.rk.activeIronyCount || 0,
    }));
  if (!pts.length) return null;
  const W = 100, H = 50;
  const max = Math.max(
    ...pts.map((p) => Math.max(p.reader, p.pov)),
    1,
  );
  const step = pts.length > 1 ? W / (pts.length - 1) : 0;
  const reader = pts.map((p, i) => `${i * step},${H - (p.reader / max) * (H - 4) - 2}`).join(" ");
  const pov = pts.map((p, i) => `${i * step},${H - (p.pov / max) * (H - 4) - 2}`).join(" ");
  return { pts, reader, pov, max, w: W, h: H };
});

const hasAny = computed(() => entries.value.some((e) => !!e.rk));
const lastRunAt = computed(() => {
  const stamps = entries.value
    .map((e) => e.rk?.generatedAt)
    .filter(Boolean)
    .sort((a, b) => b - a);
  return stamps[0] || null;
});
function ago(ts) {
  if (!ts) return "";
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const error = ref("");

async function runScan() {
  error.value = "";
  if (!ai.providerForFeature("readerKnowledge")) {
    error.value = "Configure an AI provider in Settings → AI to run this analysis.";
    return;
  }
  // Clear prior partial state so the strip shows the new sweep cleanly.
  project.clearAllReaderKnowledge();
  selectedId.value = null;
  try {
    await scanReaderKnowledge({
      project,
      onProgress: ({ phase, chapter, result }) => {
        if (phase === "start") {
          runningChapterId.value = chapter.id;
        } else if (phase === "done" && result) {
          // Persist immediately so a mid-sweep cancel keeps partial results.
          project.setChapterReaderKnowledge(chapter.id, {
            povCharacter: result.povCharacter,
            newReaderFacts: result.newReaderFacts,
            newPovFacts: result.newPovFacts,
            status: result.status,
            rationale: result.rationale,
            totalReaderKnown: result.totalReaderKnown,
            totalPovKnown: result.totalPovKnown,
            activeIronyCount: result.activeIronyCount,
            generatedAt: result.generatedAt,
            model: result.model,
          });
        }
        if (phase !== "start") runningChapterId.value = null;
      },
    });
    runningChapterId.value = null;
  } catch (e) {
    runningChapterId.value = null;
    if (!isAbort(e)) {
      const msg = String(e?.message || e || "");
      error.value = /provider|api key|configure/i.test(msg)
        ? "Configure an AI provider in Settings → AI to run this analysis."
        : msg || "Couldn't complete the analysis.";
    }
  }
}

function cancelScan() {
  if (myTask.value) aiTasks.cancel(myTask.value.id);
  runningChapterId.value = null;
}

function clearAll() {
  project.clearAllReaderKnowledge();
  selectedId.value = null;
  ui.showToast({ message: "Reader-knowledge analysis cleared." });
}

function jumpToChapter(chapterId) {
  router.push(`/chapters/${chapterId}`);
}
</script>

<template>
  <div class="rk-pane scrollarea">
    <header class="pane-header">
      <HelpTrigger slug="reader-knowledge" label="Reader knowledge" class="pane-help-abs" />
      <div class="pane-title">
        <h1 class="pane-h1">Reader knowledge</h1>
        <p class="pane-sub">
          Where the reader is ahead of, behind, or aligned with the POV character — chapter by chapter.
          Best for mystery, thriller, suspense, and unreliable-narrator fiction.
        </p>
      </div>
      <div class="pane-actions">
        <AiFeatureChip feature="readerKnowledge" label="Reader knowledge" />
        <span v-if="lastRunAt && !running" class="rk-stamp">Last run {{ ago(lastRunAt) }}</span>
        <JwButton v-if="hasAny && !running" intent="ghost" @click="clearAll"
                  v-tooltip.bottom="'Discard the saved analysis'">
          Clear
        </JwButton>
        <JwButton v-if="!running" intent="primary" @click="runScan"
          v-tooltip.bottom="'Classify each chapter by dramatic irony — one LLM call per chapter'">
          <Icon name="Sparkle" :size="13" />
          {{ hasAny ? "Re-analyse" : "Analyse manuscript" }}
        </JwButton>
        <JwButton v-else intent="danger" @click="cancelScan">
          <Icon name="Close" :size="13" /> Cancel
        </JwButton>
      </div>
    </header>

    <p class="rk-desc">
      <strong>Reader knowledge</strong> is a chapter-by-chapter map of what your reader knows
      vs. what your POV character knows — the dramatic-irony view. Each chapter is classified as
      <strong>aligned</strong>, <strong>dramatic irony</strong>, <strong>reader confused</strong>,
      or <strong>neutral</strong>, and you can see the gap grow or close across the manuscript.
      Most useful for mystery, thriller, and suspense writers tracking a deliberate reveal.
    </p>

    <div v-if="error" class="rk-error">
      <Icon name="Alert" :size="13" /> {{ error }}
    </div>

    <AiTaskStrip :task="myTask" />

    <!-- Empty state when nothing's been run. -->
    <div v-if="!hasAny && !running" class="rk-empty">
      <EmptyState
        icon="Eye"
        title="No analysis yet"
        message="Click Analyse manuscript to map the gap between reader and POV knowledge, chapter by chapter. The coloured chapter strip and growth chart let you see where dramatic irony builds and resolves across the whole manuscript." />
    </div>

    <template v-else>
      <!-- Stats row. -->
      <div class="rk-stats">
        <span class="rk-stat-chip dramatic-irony">
          <span class="rk-stat-dot" :style="{ background: STATUS_COLOURS['dramatic-irony'] }" />
          {{ counts['dramatic-irony'] }} {{ STATUS_LABELS['dramatic-irony'] }}
        </span>
        <span class="rk-stat-chip aligned">
          <span class="rk-stat-dot" :style="{ background: STATUS_COLOURS.aligned }" />
          {{ counts.aligned }} {{ STATUS_LABELS.aligned }}
        </span>
        <span class="rk-stat-chip reader-confused">
          <span class="rk-stat-dot" :style="{ background: STATUS_COLOURS['reader-confused'] }" />
          {{ counts['reader-confused'] }} {{ STATUS_LABELS['reader-confused'] }}
        </span>
        <span class="rk-stat-chip neutral">
          <span class="rk-stat-dot" :style="{ background: STATUS_COLOURS.neutral }" />
          {{ counts.neutral }} {{ STATUS_LABELS.neutral }}
        </span>
        <span class="rk-stat-chip muted">{{ analysedCount }} of {{ totalCount }} chapters analysed</span>
      </div>

      <!-- Chapter strip — one cell per chapter, coloured by status. -->
      <section class="rk-card">
        <div class="rk-card-h">Chapter map</div>
        <div class="rk-strip">
          <button v-for="e in entries" :key="e.chapter.id"
                  type="button"
                  class="rk-cell"
                  :class="{
                    selected: selectedId === e.chapter.id,
                    running: runningChapterId === e.chapter.id,
                    unscanned: !e.rk,
                  }"
                  :style="{ background: e.rk ? STATUS_COLOURS[e.rk.status] : 'var(--surface-3)' }"
                  v-tooltip.bottom="`Ch. ${e.chapter.num}${e.chapter.title ? ' — ' + e.chapter.title : ''}${e.rk ? '\n' + STATUS_LABELS[e.rk.status] : ''}`"
                  @click="e.rk && selectChapter(e.chapter.id)">
            <span class="rk-cell-num">{{ e.chapter.num }}</span>
          </button>
        </div>
        <p class="rk-strip-hint">Click any analysed cell to see the chapter's reading.</p>
      </section>

      <!-- Knowledge growth chart -->
      <section v-if="chartGeom" class="rk-card">
        <div class="rk-card-h">
          Knowledge growth
          <span class="rk-card-h-spacer" />
          <span class="rk-legend">
            <span class="rk-legend-item"><span class="rk-legend-line reader" /> Reader</span>
            <span class="rk-legend-item"><span class="rk-legend-line pov" /> POV</span>
          </span>
        </div>
        <svg class="rk-chart" :viewBox="`0 0 ${chartGeom.w} ${chartGeom.h}`" preserveAspectRatio="none">
          <polyline :points="chartGeom.reader" fill="none"
                    stroke="var(--accent)" stroke-width="1.6" vector-effect="non-scaling-stroke" />
          <polyline :points="chartGeom.pov" fill="none"
                    stroke="var(--gold)" stroke-width="1.6" stroke-dasharray="2 2" vector-effect="non-scaling-stroke" />
        </svg>
        <p class="rk-chart-hint">
          The gap between the reader line and the POV line is the size of the dramatic-irony reservoir.
          A widening gap creates suspense; a narrowing one resolves it.
        </p>
      </section>

      <!-- Detail panel — selected chapter. -->
      <section v-if="selected?.rk" class="rk-card rk-detail">
        <div class="rk-card-h">
          <button class="rk-detail-jump" @click="jumpToChapter(selected.chapter.id)"
                  v-tooltip.bottom="'Open chapter in editor'">
            Ch. {{ selected.chapter.num }} — {{ selected.chapter.title || "Untitled" }}
          </button>
          <span class="rk-card-h-spacer" />
          <span class="rk-status-chip" :style="{ background: STATUS_COLOURS[selected.rk.status] }">
            {{ STATUS_LABELS[selected.rk.status] }}
          </span>
        </div>
        <p v-if="selected.rk.rationale" class="rk-rationale">{{ selected.rk.rationale }}</p>
        <div class="rk-meta">
          <span v-if="selected.rk.povCharacter"><span class="k">POV</span> {{ selected.rk.povCharacter }}</span>
          <span><span class="k">Reader knows</span> {{ selected.rk.totalReaderKnown }} facts</span>
          <span><span class="k">POV knows</span> {{ selected.rk.totalPovKnown }} facts</span>
          <span><span class="k">Active irony</span> {{ selected.rk.activeIronyCount }} facts</span>
        </div>

        <div class="rk-facts-grid">
          <div class="rk-facts">
            <h4>New for the reader</h4>
            <ul v-if="selected.rk.newReaderFacts?.length">
              <li v-for="f in selected.rk.newReaderFacts" :key="f">{{ f }}</li>
            </ul>
            <p v-else class="rk-facts-empty">No new facts this chapter.</p>
          </div>
          <div class="rk-facts">
            <h4>New for the POV character</h4>
            <ul v-if="selected.rk.newPovFacts?.length">
              <li v-for="f in selected.rk.newPovFacts" :key="f">{{ f }}</li>
            </ul>
            <p v-else class="rk-facts-empty">No new facts this chapter.</p>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.rk-desc {
  font-size: 14px; line-height: 1.55; color: var(--muted);
  margin: 0;
}
.rk-desc strong { color: var(--ink-2); font-weight: 600; }

.rk-pane {
  padding: 28px 32px 80px;
  overflow-y: auto;
  display: flex; flex-direction: column;
  gap: 22px;
}
.pane-header { display: flex; flex-direction: column; gap: 6px; position: relative; }
.pane-help-abs { position: absolute; top: 0; right: 0; }
.pane-title { display: flex; flex-direction: column; gap: 4px; }
.pane-h1 {
  font-family: var(--font-serif); font-size: 28px; font-weight: 500;
  margin: 0; letter-spacing: -0.015em;
}
.pane-sub { margin: 0; max-width: 70ch; color: var(--muted); font-size: 13px; line-height: 1.55; }
.pane-actions { display: flex; align-items: center; gap: 10px; margin-top: 8px; }
.rk-stamp { font-family: var(--font-mono); font-size: 10.5px; color: var(--muted); }

.rk-error {
  display: flex; gap: 8px; align-items: center;
  padding: 10px 14px; border-radius: 6px;
  background: color-mix(in oklab, var(--danger-ink, #b91c1c) 12%, transparent);
  color: var(--danger-ink, #b91c1c);
  font-size: 12.5px;
}

.rk-empty { padding: 22px 0; }

.rk-stats { display: flex; flex-wrap: wrap; gap: 8px; }
.rk-stat-chip {
  display: inline-flex; align-items: center; gap: 6px;
  font-family: var(--font-mono); font-size: 11px;
  padding: 4px 12px; border-radius: 999px;
  background: var(--surface-2);
}
.rk-stat-chip.muted { color: var(--muted); }
.rk-stat-dot { width: 8px; height: 8px; border-radius: 50%; box-shadow: 0 0 0 2px color-mix(in oklab, currentColor 16%, transparent); }

.rk-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  padding: 18px;
}
.rk-card-h {
  display: flex; align-items: center; gap: 10px;
  font-family: var(--font-mono); font-size: 10px;
  letter-spacing: 0.16em; text-transform: uppercase; color: var(--muted);
  margin: 0 0 14px;
}
.rk-card-h-spacer { flex: 1; height: 1px; background: var(--border-soft); margin: 0 4px; }
.rk-legend { display: flex; gap: 12px; text-transform: none; letter-spacing: 0; font-family: var(--font-ui); }
.rk-legend-item { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; color: var(--ink-2); }
.rk-legend-line { width: 16px; height: 0; border-top: 2px solid; display: inline-block; }
.rk-legend-line.reader { color: var(--accent); }
.rk-legend-line.pov { color: var(--gold); border-top-style: dashed; }

.rk-strip {
  display: flex; flex-wrap: wrap; gap: 4px;
}
.rk-cell {
  appearance: none; border: 0; cursor: pointer;
  width: 34px; height: 34px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 6px;
  font-family: var(--font-mono); font-size: 11px; font-weight: 600;
  color: white;
  text-shadow: 0 1px 0 rgba(0, 0, 0, 0.35);
  transition: transform 100ms ease;
}
.rk-cell:hover:not(.unscanned) { transform: translateY(-1px); }
.rk-cell.selected { outline: 2px solid var(--accent); outline-offset: 2px; }
.rk-cell.running {
  animation: rk-pulse 1.2s ease-in-out infinite;
}
.rk-cell.unscanned {
  cursor: default;
  color: var(--muted);
  text-shadow: none;
}
@keyframes rk-pulse {
  0%, 100% { transform: translateY(0); opacity: 1; }
  50%      { transform: translateY(-2px); opacity: 0.85; }
}
.rk-cell-num { line-height: 1; }
.rk-strip-hint, .rk-chart-hint {
  margin: 10px 0 0; font-size: 11.5px; color: var(--muted); font-style: italic;
}

.rk-chart {
  width: 100%; height: 90px;
  background: var(--surface-2); border-radius: 6px;
  padding: 4px;
  box-sizing: border-box;
}

/* Detail panel */
.rk-detail {
  border-left: 4px solid var(--accent);
}
.rk-detail-jump {
  appearance: none; border: 0; background: transparent; cursor: pointer;
  font-family: var(--font-serif); font-size: 14.5px; font-weight: 600;
  color: var(--ink); letter-spacing: -0.005em;
  text-transform: none;
}
.rk-detail-jump:hover { color: var(--accent); text-decoration: underline; }
.rk-status-chip {
  font-family: var(--font-mono); font-size: 10px;
  letter-spacing: 0.04em;
  padding: 3px 10px; border-radius: 999px;
  color: white;
  text-shadow: 0 1px 0 rgba(0, 0, 0, 0.25);
}
.rk-rationale {
  margin: 0 0 14px; max-width: 70ch;
  font-family: var(--font-serif); font-size: 14px; line-height: 1.65;
  color: var(--ink-2); font-style: italic;
}
.rk-meta {
  display: flex; flex-wrap: wrap; gap: 16px;
  padding: 10px 0; margin-bottom: 14px;
  border-top: 1px solid var(--border-soft);
  border-bottom: 1px solid var(--border-soft);
  font-size: 12px;
}
.rk-meta .k {
  display: inline-block;
  font-family: var(--font-mono); font-size: 9.5px;
  letter-spacing: 0.14em; text-transform: uppercase; color: var(--muted);
  margin-right: 6px;
}
.rk-facts-grid {
  display: grid; grid-template-columns: 1fr 1fr; gap: 18px;
}
@media (max-width: 720px) {
  .rk-facts-grid { grid-template-columns: 1fr; }
}
.rk-facts h4 {
  margin: 0 0 8px;
  font-family: var(--font-mono); font-size: 10px;
  letter-spacing: 0.14em; text-transform: uppercase; color: var(--muted);
}
.rk-facts ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.rk-facts li {
  font-size: 13px; line-height: 1.5; color: var(--ink-2);
  padding-left: 14px; position: relative;
}
.rk-facts li::before {
  content: "·"; position: absolute; left: 4px;
  color: var(--accent); font-weight: 700;
}
.rk-facts-empty { margin: 0; font-size: 12px; color: var(--muted); font-style: italic; }
</style>
