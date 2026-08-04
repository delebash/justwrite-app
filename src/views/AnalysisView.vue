<script setup>
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { useProjectStore } from "../stores/project.js";
import { useSessionsStore } from "../stores/sessions.js";
import { PaneHeader } from "@delebash/llm-ui";
import { Icon, AiTaskStrip, useAiTasksStore, UiTable, UiSegmented, UiButton } from "@delebash/llm-ui";
import StatPill from "../components/StatPill.vue";
import {
  statusCounts, strandDistribution, characterPresence,
  scenesPerChapter, projectKpis, paceSeries,
} from "../services/analysis.js";
import { bookMetrics, POV_LABELS } from "../services/analysis/styleMetrics.js";
import { computeVoiceDrift, deriveVoiceDriftContext, explainVoiceDrift } from "../services/analysis/voiceDrift.js";
import { sweepStoryTension } from "../services/analysis/tensionSweep.js";
import { PACING_LABELS, ENDING_LABELS } from "../services/analysis/critique.js";
import ReverseOutlineModal from "../components/ReverseOutlineModal.vue";
import BeatSheetModal from "../components/BeatSheetModal.vue";
import PlotHoleScanModal from "../components/PlotHoleScanModal.vue";
import MarketingPackModal from "../components/MarketingPackModal.vue";
import EntitySweepModal from "../components/EntitySweepModal.vue";
import LinkBackfillModal from "../components/LinkBackfillModal.vue";
import AiFeatureChip from "../components/AiFeatureChip.vue";
import { useAiStore } from "../stores/ai.js";

const project = useProjectStore();
const sessions = useSessionsStore();
const router = useRouter();

const allCh = computed(() => project.allChapters);
const kpis = computed(() => projectKpis(project, allCh.value));
const status = computed(() => statusCounts(allCh.value));
const strands = computed(() => strandDistribution(project.strands, allCh.value));
// Character presence derives from the prose (chapterBody name-matching) now
// that Audio Studio speaker analysis is gone.
const presence = computed(() => characterPresence(project.characters, project.characterExtras, allCh.value, project.chapterBody));
const scenes = computed(() => scenesPerChapter(allCh.value));
const pct = (n, total) => (total ? (n / total) * 100 : 0);

// Pace — driven by the session log. Empty until the user writes
// anything, but the chart still renders (all zeros).
const windowDays = ref(30);
const WINDOW_OPTIONS = [
  { value: 14, label: "14d" },
  { value: 30, label: "30d" },
  { value: 90, label: "90d" },
];
const pace = computed(() => {
  const series = sessions.historyFor(windowDays.value);
  return paceSeries(series.map((d) => d.words));
});

// Donut geometry — single-pass through STATUS_KEYS so the legend
// and arc share the same color/order.
const STATUS_KEYS = [
  { k: "done",   label: "Done",    color: "var(--status-done)" },
  { k: "revise", label: "Revise",  color: "var(--status-revise)" },
  { k: "draft",  label: "Draft",   color: "var(--status-draft)" },
  { k: "todo",   label: "To do",   color: "var(--status-todo)" },
];

const donut = computed(() => {
  const r = 46, w = 14;
  const cx = 60, cy = 60;
  const total = status.value.total || 1;
  let start = -Math.PI / 2;
  const segs = STATUS_KEYS.map((s) => {
    const value = status.value[s.k] || 0;
    const angle = (value / total) * Math.PI * 2;
    const end = start + angle;
    const large = angle > Math.PI ? 1 : 0;
    const x1 = cx + r * Math.cos(start), y1 = cy + r * Math.sin(start);
    const x2 = cx + r * Math.cos(end), y2 = cy + r * Math.sin(end);
    // Use stroke arc to avoid path-fill artefacts for 100% segments.
    const path = `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
    start = end;
    return { ...s, value, path };
  });
  return { r, w, cx, cy, segs };
});

// Pace polyline — fits the chosen window into a 100×64 viewBox.
const paceShape = computed(() => {
  const pts = pace.value.points;
  const w = 1000, h = 140;
  if (pts.length === 0) return { line: "", area: "" };
  const step = w / Math.max(1, pts.length - 1);
  const max = Math.max(...pts.map((p) => p.words), 1);
  const line = pts.map((p, i) => `${i * step},${h - (p.words / max) * (h - 8) - 4}`).join(" ");
  return { line, area: `0,${h} ${line} ${w},${h}`, w, h };
});

// Strand totals — for relative-width bars.
const strandTotal = computed(() => strands.value.reduce((s, r) => s + r.words, 0) || 1);

// Heatmap cell coloring.
function cellStyle(weight) {
  if (weight === 0) return { background: "var(--surface-3)", color: "transparent" };
  if (weight === 1) return { background: "color-mix(in oklab, var(--accent) 30%, var(--surface))", color: "var(--accent-ink)" };
  return { background: "var(--accent)", color: "white" };
}

const maxScenes = computed(() => Math.max(1, ...scenes.value.map((s) => s.scenes)));

function jumpChapter(chId) { router.push(`/chapters/${chId}`); }

// ─── Style + pacing metrics (deterministic) ─────────────────────────
const style = computed(() => bookMetrics(allCh.value, project.chapterBody));

// Pre-compute relative scales so the per-chapter bars share a single
// max — easier to compare chapters at a glance.
function maxOf(rows, field) {
  return rows.reduce((m, r) => Math.max(m, r[field] || 0), 0) || 1;
}
const styleMaxes = computed(() => {
  const r = style.value.rows;
  return {
    sentence: maxOf(r, "avgSentenceLength"),
    paragraph: maxOf(r, "avgParagraphLength"),
    dialogue: 1, // ratio, already 0..1
    filter: maxOf(r, "filterWordsPer1k"),
    adverb: maxOf(r, "adverbsPer1k"),
    passive: maxOf(r, "passivePer1k"),
  };
});

// ─── Voice drift ───────────────────────────────────────────────────
// Pure deterministic analytics derived from styleMetrics' per-chapter
// rows. Detects per-metric outliers (|z| > 1) and chapters that go
// outlier on 2+ metrics ("hot chapters" — likely voice drift).

const ai = useAiStore();
const aiTasks = useAiTasksStore();
const drift = computed(() => computeVoiceDrift(style.value.rows));

function isAbort(e) { return e?.name === "AbortError" || /abort/i.test(e?.message || ""); }

// Render-only helpers — keep the SVG sparkline scales tight per metric.
function sparklineGeom(metric, w = 240, h = 28) {
  const vals = metric.displayValues;
  if (!vals.length) return null;
  const lo = Math.min(...vals, metric.display ? metric.mean * 100 : metric.mean);
  const hi = Math.max(...vals, metric.display ? metric.mean * 100 : metric.mean);
  const pad = (hi - lo) * 0.15 || 1;
  const yMin = lo - pad;
  const yMax = hi + pad;
  const span = yMax - yMin || 1;
  const step = vals.length > 1 ? w / (vals.length - 1) : 0;
  const y = (v) => h - ((v - yMin) / span) * (h - 4) - 2;
  // Mean line + ±1 stdev band coordinates.
  const meanDisp = metric.display ? metric.mean * 100 : metric.mean;
  const sdDisp   = metric.display ? metric.stdev * 100 : metric.stdev;
  const meanY = y(meanDisp);
  const bandTop = y(meanDisp + sdDisp);
  const bandBot = y(meanDisp - sdDisp);
  const points = vals.map((v, i) => ({ x: i * step, y: y(v), i }));
  const polyline = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  return { polyline, points, meanY, bandTop, bandBot, w, h };
}

// Inline explanation state — per outlier chapter id. Shape:
//   { running, text, error }
const driftExplanations = ref({});
const driftExplainingId = ref(null);

async function explainHot(chapterId) {
  const d = drift.value;
  if (!d.eligible) return;
  if (driftExplanations.value[chapterId]?.text) {
    // Toggle off — collapse the inline expansion.
    const next = { ...driftExplanations.value };
    delete next[chapterId];
    driftExplanations.value = next;
    return;
  }
  if (!ai.providerForFeature("voiceDrift")) {
    driftExplanations.value = {
      ...driftExplanations.value,
      [chapterId]: { error: "Configure an AI provider in Settings → AI to explain voice drift." },
    };
    return;
  }
  driftExplainingId.value = chapterId;
  driftExplanations.value = {
    ...driftExplanations.value,
    [chapterId]: { running: true, text: "", error: "" },
  };
  // Baseline (3 lowest-driftScore chapters) + divergent metrics — the shared
  // derivation in voiceDrift.js (the Lab's composer rides the same one).
  const { baselineChapterIds, divergentMetrics } = deriveVoiceDriftContext(d, chapterId);
  try {
    const result = await explainVoiceDrift({
      project,
      outlierChapterId: chapterId,
      baselineChapterIds,
      divergentMetrics,
      task: { label: "Voice drift explanation", meta: { chapterId } },
      onDelta: (_delta, content) => {
        driftExplanations.value = {
          ...driftExplanations.value,
          [chapterId]: { running: true, text: content || "", error: "" },
        };
      },
    });
    driftExplanations.value = {
      ...driftExplanations.value,
      [chapterId]: { running: false, text: result.text, error: "" },
    };
  } catch (e) {
    if (!isAbort(e)) {
      const msg = String(e?.message || e || "");
      driftExplanations.value = {
        ...driftExplanations.value,
        [chapterId]: {
          running: false, text: "",
          error: /provider|api key|configure/i.test(msg)
            ? "Configure an AI provider in Settings → AI to explain voice drift."
            : msg || "Couldn't generate explanation.",
        },
      };
    } else {
      // Aborted — clear the running indicator.
      const next = { ...driftExplanations.value };
      delete next[chapterId];
      driftExplanations.value = next;
    }
  } finally {
    driftExplainingId.value = null;
  }
}

const TREND_LABELS = { rising: "Rising", falling: "Falling", flat: "Flat" };
const TREND_COLOURS = {
  rising: "var(--status-revise)",
  falling: "var(--accent)",
  flat: "var(--muted)",
};

// ─── Story tension timeline ──────────────────────────────────────────
// Visualises the per-chapter tension + hookQuality values that
// runStructuralAnalysis already records on chapter.critique.structure.
// One bulk-run button covers chapters that haven't been analysed yet.

const tensionTask = computed(() => aiTasks.runningTasks.find((t) => t.feature === "critique"));
const tensionRunning = computed(() => !!tensionTask.value);
// QC-30b: the voice-drift Explain leg gets the shared strip too (same
// pattern as tensionTask above; explainHot registers feature "voiceDrift").
const driftTask = computed(() => aiTasks.runningTasks.find((t) => t.feature === "voiceDrift"));
const tensionRunningChapterId = ref(null);
const tensionError = ref("");

const tensionRows = computed(() => allCh.value.map((c) => ({
  chapter: c,
  s: c.critique?.structure || null,
})));
const analysedTensionRows = computed(() => tensionRows.value.filter((r) => r.s));
const unanalysedCount = computed(() => tensionRows.value.filter((r) => !r.s).length);
const tensionEligible = computed(() => analysedTensionRows.value.length >= 2);

const tensionStats = computed(() => {
  const rows = analysedTensionRows.value;
  if (!rows.length) return null;
  const tensions = rows.map((r) => r.s.tension || 0);
  const hooks = rows.map((r) => r.s.hookQuality || 0);
  const avgT = tensions.reduce((s, v) => s + v, 0) / tensions.length;
  const avgH = hooks.reduce((s, v) => s + v, 0) / hooks.length;
  let peakIdx = 0, lowIdx = 0;
  for (let i = 0; i < rows.length; i++) {
    if ((rows[i].s.tension || 0) > (rows[peakIdx].s.tension || 0)) peakIdx = i;
    if ((rows[i].s.tension || 0) < (rows[lowIdx].s.tension || 0)) lowIdx = i;
  }
  return {
    avgTension: avgT,
    avgHook: avgH,
    peakChapter: rows[peakIdx].chapter,
    peakValue: rows[peakIdx].s.tension,
    lowChapter: rows[lowIdx].chapter,
    lowValue: rows[lowIdx].s.tension,
  };
});

// Build SVG geometry — one line for tension, one for hook quality.
// Both are scored 1..10 so they share the y-axis.
const tensionGeom = computed(() => {
  const rows = tensionRows.value;
  if (rows.length < 2) return null;
  const W = 100, H = 50;
  const xs = rows.map((_, i) => rows.length > 1 ? (i / (rows.length - 1)) * W : 0);
  const y = (v) => H - ((v - 1) / 9) * (H - 4) - 2;
  const tensionPts = rows.map((r, i) => r.s ? `${xs[i].toFixed(1)},${y(r.s.tension || 0).toFixed(1)}` : null).filter(Boolean).join(" ");
  const hookPts = rows.map((r, i) => r.s ? `${xs[i].toFixed(1)},${y(r.s.hookQuality || 0).toFixed(1)}` : null).filter(Boolean).join(" ");
  return { W, H, tensionPts, hookPts };
});

const PACING_BG = {
  slow:    "color-mix(in oklab, var(--status-todo) 28%, transparent)",
  balanced:"color-mix(in oklab, var(--status-done) 24%, transparent)",
  fast:    "color-mix(in oklab, var(--gold) 30%, transparent)",
};
const ENDING_BG = {
  cliffhanger: "color-mix(in oklab, var(--danger) 26%, transparent)",
  soft:        "color-mix(in oklab, var(--accent) 22%, transparent)",
  closed:      "color-mix(in oklab, var(--status-done) 22%, transparent)",
  "dead-end":  "color-mix(in oklab, var(--muted) 30%, transparent)",
};

async function runTensionSweep(force = false) {
  tensionError.value = "";
  if (!ai.providerForFeature("critique")) {
    tensionError.value = "Configure an AI provider in Settings → AI to run the tension sweep.";
    return;
  }
  try {
    await sweepStoryTension({
      project,
      force,
      onProgress: ({ phase, chapter }) => {
        if (phase === "start") tensionRunningChapterId.value = chapter.id;
        else tensionRunningChapterId.value = null;
      },
    });
    tensionRunningChapterId.value = null;
  } catch (e) {
    tensionRunningChapterId.value = null;
    if (!isAbort(e)) {
      const msg = String(e?.message || e || "");
      tensionError.value = /provider|api key|configure/i.test(msg)
        ? "Configure an AI provider in Settings → AI to run the tension sweep."
        : msg || "Tension sweep failed.";
    }
  }
}
function cancelTensionSweep() {
  if (tensionTask.value) aiTasks.cancel(tensionTask.value.id);
  tensionRunningChapterId.value = null;
}

// Reverse outline modal — opens from the Story tension section.
const reverseOutlineOpen = ref(false);
function openReverseOutline() { reverseOutlineOpen.value = true; }
function closeReverseOutline() { reverseOutlineOpen.value = false; }
const hasReverseOutline = computed(() => !!project.reverseOutline);

// Beat-sheet overlay modal — sibling to reverse outline.
const beatSheetOpen = ref(false);
function openBeatSheet() { beatSheetOpen.value = true; }
function closeBeatSheet() { beatSheetOpen.value = false; }
const hasAnyBeatSheet = computed(() => Object.keys(project.beatSheets || {}).length > 0);

// Plot-hole / continuity audit modal.
const plotHolesOpen = ref(false);
function openPlotHoles() { plotHolesOpen.value = true; }
function closePlotHoles() { plotHolesOpen.value = false; }
const hasPlotHoles = computed(() => !!project.plotHoles);
const plotHolesActiveCount = computed(() => {
  if (!project.plotHoles?.findings) return 0;
  return project.plotHoles.findings.filter((f) => !f.dismissed).length;
});

// Marketing pack modal — logline / blurbs / synopsis / pitch.
const marketingPackOpen = ref(false);
function openMarketingPack() { marketingPackOpen.value = true; }
function closeMarketingPack() { marketingPackOpen.value = false; }
const hasMarketingPack = computed(() => !!project.marketingPack);

// Entity sweep modal — discoverable whole-book scan for new characters /
// locations / objects (also reachable from the Characters/Locations/Objects views).
const entitySweepOpen = ref(false);
function openEntitySweep() { entitySweepOpen.value = true; }
function closeEntitySweep() { entitySweepOpen.value = false; }

// Link backfill modal (E2, RAG build) — the no-LLM review pass that links
// existing bible entities to the scenes that mention them. Lives beside the
// entity sweep: sweep finds NEW entities, backfill links the ones you have.
const linkBackfillOpen = ref(false);
function openLinkBackfill() { linkBackfillOpen.value = true; }
function closeLinkBackfill() { linkBackfillOpen.value = false; }

// ─── Writing heatmap (365 days) ─────────────────────────────────────
// Build a 53-week × 7-day grid for the year ending today. Each cell is
// one day; tier 0..4 by quartile of non-zero writing volume so a quiet
// week still shows shape rather than disappearing.
const heatmap = computed(() => {
  const history = sessions.historyFor(371); // 53 * 7
  // history is oldest-first; align so the rightmost column ends today.
  const padded = history.slice(-371);
  // Compute quartile thresholds from non-zero days only.
  const nonZero = padded.map((d) => d.words).filter((w) => w > 0).sort((a, b) => a - b);
  const q = (frac) => nonZero[Math.floor(nonZero.length * frac)] || 0;
  const t1 = q(0.25), t2 = q(0.50), t3 = q(0.75);
  function tier(w) {
    if (w <= 0) return 0;
    if (w <= t1) return 1;
    if (w <= t2) return 2;
    if (w <= t3) return 3;
    return 4;
  }
  // Walk into a 7-row × N-col grid. Row 0 = Sunday (matches dow value).
  const weeks = [];
  let week = new Array(7).fill(null);
  for (const day of padded) {
    week[day.dow] = { date: day.date, words: day.words, tier: tier(day.words) };
    if (day.dow === 6) {
      weeks.push(week);
      week = new Array(7).fill(null);
    }
  }
  if (week.some(Boolean)) weeks.push(week);

  // Month-label anchors: the first week whose Sunday lands inside each
  // calendar month, in order.
  const monthLabels = [];
  let lastMonth = -1;
  weeks.forEach((w, i) => {
    const firstDay = w.find(Boolean);
    if (!firstDay) return;
    const m = parseInt(firstDay.date.slice(5, 7), 10) - 1;
    if (m !== lastMonth) {
      monthLabels.push({ idx: i, label: new Date(2000, m, 1).toLocaleString(undefined, { month: "short" }) });
      lastMonth = m;
    }
  });

  return { weeks, monthLabels, total: padded.reduce((s, d) => s + d.words, 0) };
});

const DOW_LABELS_HEATMAP = ["S", "M", "T", "W", "T", "F", "S"];

const styleColumns = [
  { accessorKey: "title",              header: "Chapter", sortable: true, headerStyle: "min-width:200px", cellStyle: "min-width:200px" },
  { accessorKey: "words",              header: "W",       sortable: true, headerStyle: "text-align:right;width:80px",  cellStyle: "text-align:right;width:80px" },
  { accessorKey: "avgSentenceLength",  header: "Sent",    sortable: true, headerStyle: "text-align:right;width:90px",  cellStyle: "text-align:right;width:90px" },
  { accessorKey: "avgParagraphLength", header: "Para",    sortable: true, headerStyle: "text-align:right;width:90px",  cellStyle: "text-align:right;width:90px" },
  { accessorKey: "dialogueRatio",      header: "Dial",    sortable: true, headerStyle: "text-align:right;width:85px",  cellStyle: "text-align:right;width:85px" },
  { accessorKey: "filterWordsPer1k",   header: "Filter",  sortable: true, headerStyle: "text-align:right;width:85px",  cellStyle: "text-align:right;width:85px" },
  { accessorKey: "adverbsPer1k",       header: "Adv",     sortable: true, headerStyle: "text-align:right;width:80px",  cellStyle: "text-align:right;width:80px" },
  { accessorKey: "passivePer1k",       header: "Pass",    sortable: true, headerStyle: "text-align:right;width:80px",  cellStyle: "text-align:right;width:80px" },
  { accessorKey: "povHint",            header: "POV",     sortable: true, headerStyle: "width:80px",                   cellStyle: "width:80px" },
];

// Milestone celebration — show the next milestone the user is heading
// toward. Plain whole-thousand thresholds match how writers think about
// progress; once one is hit the next slot is highlighted.
const MILESTONES = [10000, 25000, 50000, 75000, 100000, 125000, 150000];
const milestoneState = computed(() => {
  const total = kpis.value.totalWords;
  const reached = MILESTONES.filter((m) => total >= m);
  const next = MILESTONES.find((m) => total < m) || null;
  return {
    reached,
    next,
    progressToNext: next ? Math.min(1, total / next) : 1,
    pct: next ? Math.round((total / next) * 100) : 100,
  };
});
</script>

<template>
  <PaneHeader :eyebrow="$t('settings.eyebrow')" :title="$t('nav.analysis')" help-key="analysis" />

  <div class="pane-card">
  <div class="scrollarea" style="padding:22px 26px 60px">

    <i18n-t keypath="analysis.intro" tag="p" class="an-desc" scope="global">
      <template #analysis><strong>{{ $t("nav.analysis") }}</strong></template>
      <template #tension><strong>{{ $t("analysis.tension.title") }}</strong></template>
      <template #explain><strong>{{ $t("analysis.voice.explain") }}</strong></template>
    </i18n-t>

    <!-- KPI row -->
    <div class="kpi-row" style="display:grid;gap:14px;margin-bottom:18px">
      <div class="card kpi">
        <div class="t-eyebrow">{{ $t("analysis.kpi.manuscript") }}</div>
        <div class="kpi-val">{{ kpis.totalWords.toLocaleString() }}</div>
        <div class="kpi-sub">{{ $t("analysis.kpi.wordsOfGoal", { pct: kpis.goalPct }) }}</div>
      </div>
      <div class="card kpi">
        <div class="t-eyebrow">{{ $t("analysis.kpi.chapters") }}</div>
        <div class="kpi-val">{{ kpis.chaptersDone }} <span class="kpi-of">/ {{ kpis.chaptersTotal }}</span></div>
        <div class="kpi-sub">{{ $t("analysis.kpi.markedDone") }}</div>
      </div>
      <div class="card kpi">
        <div class="t-eyebrow">{{ $t("analysis.kpi.avgChapter") }}</div>
        <div class="kpi-val">{{ kpis.avgChapterLength.toLocaleString() }}</div>
        <div class="kpi-sub">{{ $t("analysis.kpi.words") }}</div>
      </div>
      <div class="card kpi">
        <div class="t-eyebrow">{{ $t("analysis.kpi.paceWindow", { days: windowDays }) }}</div>
        <div class="kpi-val">{{ pace.avg.toLocaleString() }}</div>
        <div class="kpi-sub">{{ $t("analysis.kpi.avgWordsPerDay") }}</div>
      </div>
    </div>

    <!-- Pace -->
    <div class="card" style="margin-bottom:18px">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px">
        <div class="card-title" style="margin:0">{{ $t("analysis.pace.title") }}</div>
        <span class="t-muted" style="font-size:11.5px">{{ $t("analysis.pace.subtitle") }}</span>
        <UiSegmented
          style="margin-left:auto"
          :model-value="windowDays"
          :options="WINDOW_OPTIONS"
          size="small"
          :aria-label="$t('analysis.pace.windowLabel')"
          @update:model-value="windowDays = $event" />
      </div>
      <svg :viewBox="`0 0 ${paceShape.w} ${paceShape.h}`" preserveAspectRatio="none"
        style="width:100%;height:140px;display:block">
        <polygon :points="paceShape.area" fill="var(--accent-soft)" />
        <polyline :points="paceShape.line" fill="none" stroke="var(--accent)" stroke-width="1.6" vector-effect="non-scaling-stroke" />
      </svg>
      <div style="display:flex;gap:18px;margin-top:8px;font-size:11.5px;color:var(--muted)">
        <span><b class="t-num" style="color:var(--ink)">{{ pace.total.toLocaleString() }}</b> {{ $t("analysis.pace.total") }}</span>
        <span><b class="t-num" style="color:var(--ink)">{{ pace.avg.toLocaleString() }}</b> {{ $t("analysis.pace.avgPerDay") }}</span>
        <span><b class="t-num" style="color:var(--ink)">{{ pace.max.toLocaleString() }}</b> {{ $t("analysis.pace.peakDay") }}</span>
      </div>
    </div>

    <!-- Writing heatmap (365-day) + milestones -->
    <div class="heatmap-milestones-row" style="display:grid;gap:18px;margin-bottom:18px">
      <div class="card">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
          <div class="card-title" style="margin:0">{{ $t("analysis.year.title") }}</div>
          <span class="t-muted" style="font-size:11.5px">{{ $t("analysis.year.subtitle", { words: heatmap.total.toLocaleString() }) }}</span>
          <span style="margin-left:auto;display:flex;gap:6px;align-items:center;font-size:10.5px;color:var(--muted)">
            <!-- $t, not t: the v-for below binds `t` and would shadow the composable's t. -->
            <span>{{ $t("analysis.year.less") }}</span>
            <span v-for="t in [0,1,2,3,4]" :key="t" class="hm-cell" :class="`hm-t${t}`" style="width:11px;height:11px" />
            <span>{{ $t("analysis.year.more") }}</span>
          </span>
        </div>
        <div class="hm-grid">
          <div class="hm-dow">
            <span v-for="(d, i) in DOW_LABELS_HEATMAP" :key="i" class="hm-dow-lbl" :style="{ visibility: i % 2 ? 'visible' : 'hidden' }">{{ d }}</span>
          </div>
          <div class="hm-weeks">
            <div class="hm-month-row">
              <span v-for="m in heatmap.monthLabels" :key="m.idx + m.label"
                class="hm-month-lbl" :style="`grid-column-start: ${m.idx + 1}`">
                {{ m.label }}
              </span>
            </div>
            <div class="hm-cells">
              <div v-for="(week, wi) in heatmap.weeks" :key="wi" class="hm-col">
                <div v-for="(cell, ci) in week" :key="ci"
                  class="hm-cell" :class="cell ? `hm-t${cell.tier}` : 'hm-t0'"
                  :title="cell ? `${cell.date} · ${cell.words.toLocaleString()} words` : ''" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-title" style="margin-bottom:10px">{{ $t("analysisView.milestones") }}</div>
        <div class="ms-next" v-if="milestoneState.next">
          <div class="ms-next-h">{{ $t("analysisView.nextMilestone") }}</div>
          <div class="ms-next-target">{{ $t("analysisView.targetWords", { n: milestoneState.next.toLocaleString() }) }}</div>
          <div class="ms-bar">
            <div class="ms-fill" :style="`width:${milestoneState.pct}%`" />
          </div>
          <div class="ms-next-sub">
            <b>{{ kpis.totalWords.toLocaleString() }}</b> / {{ milestoneState.next.toLocaleString() }}
            <span class="t-muted">· {{ milestoneState.pct }}%</span>
          </div>
        </div>
        <div v-else class="ms-next-h" style="color:var(--accent-ink)">{{ $t("analysisView.everyMilestoneHit") }}</div>

        <div class="ms-grid">
          <div v-for="m in MILESTONES" :key="m"
            class="ms-pip" :class="{ on: milestoneState.reached.includes(m), next: milestoneState.next === m }">
            <Icon :name="milestoneState.reached.includes(m) ? 'Check' : 'Star'" :size="11" />
            <span>{{ $t("analysisView.thousandsShort", { n: m / 1000 }) }}</span>
          </div>
        </div>

        <div class="ms-streaks">
          <div><span class="t-muted">{{ $t("analysisView.currentStreak") }}</span><span>{{ $t("count.day", { n: sessions.streak }, sessions.streak) }}</span></div>
          <div><span class="t-muted">{{ $t("analysisView.lifetime") }}</span><span><b>{{ sessions.allTimeTotals.totalWords.toLocaleString() }}</b></span></div>
          <div><span class="t-muted">{{ $t("analysisView.writingDays") }}</span><span><b>{{ sessions.allTimeTotals.writingDays }}</b></span></div>
        </div>
      </div>
    </div>

    <!-- Status donut + Strand distribution -->
    <div class="status-row" style="display:grid;gap:18px;margin-bottom:18px">
      <div class="card">
        <div class="card-title">{{ $t("analysisView.status") }}</div>
        <div style="display:flex;gap:18px;align-items:center">
          <svg viewBox="0 0 120 120" width="120" height="120">
            <circle :cx="donut.cx" :cy="donut.cy" :r="donut.r" fill="none"
              stroke="var(--surface-3)" :stroke-width="donut.w" />
            <path v-for="s in donut.segs" :key="s.k"
              :d="s.path" fill="none" :stroke="s.color"
              :stroke-width="donut.w" stroke-linecap="butt" />
            <text :x="donut.cx" :y="donut.cy + 4" text-anchor="middle"
              font-size="20" font-family="var(--font-serif)" font-weight="600">
              {{ status.total }}
            </text>
          </svg>
          <div style="flex:1;display:flex;flex-direction:column;gap:8px">
            <div v-for="s in donut.segs" :key="s.k"
              style="display:grid;grid-template-columns:auto 1fr auto;gap:10px;font-size:12.5px;align-items:center">
              <span :style="`width:10px;height:10px;border-radius:2px;background:${s.color}`" />
              <span>{{ s.label }}</span>
              <span class="t-num" style="color:var(--ink-2)">{{ s.value }}</span>
            </div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-title">{{ $t("analysisView.strandsByWords") }}</div>
        <div style="display:flex;flex-direction:column;gap:10px;margin-top:6px">
          <div v-for="s in strands" :key="s.strandId || 'none'">
            <div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:4px">
              <span style="display:inline-flex;align-items:center;gap:7px">
                <span :style="`width:10px;height:10px;border-radius:2px;background:${s.color}`" />
                {{ s.name }}
              </span>
              <span class="t-muted t-num">{{ $t("analysisView.strandMeta", { words: s.words.toLocaleString(), chapters: s.chapters }) }}</span>
            </div>
            <div style="height:6px;background:var(--surface-3);border-radius:999px;overflow:hidden">
              <div :style="`width:${(s.words / strandTotal) * 100}%;height:100%;background:${s.color};border-radius:999px`" />
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Words per chapter -->
    <div class="card" style="margin-bottom:18px">
      <div class="card-title">{{ $t("analysisView.wordsPerChapter") }}</div>
      <div style="margin-top:8px">
        <button v-for="c in allCh" :key="c.id" type="button"
          class="bar-row" @click="jumpChapter(c.id)">
          <span class="name">{{ c.num }}. {{ c.title }}</span>
          <div class="track">
            <div class="fill" :style="`width:${(c.words / Math.max(1, ...allCh.map(x => x.words))) * 100}%;background:${project.strandById((c.strands || [])[0])?.color || 'var(--accent)'}`" />
          </div>
          <span class="val">{{ c.words.toLocaleString() }}</span>
        </button>
      </div>
    </div>

    <!-- Style + pacing (deterministic) -->
    <div class="card" style="margin-bottom:18px" v-if="style.summary.words > 0">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
        <div class="card-title" style="margin:0">{{ $t("analysisView.stylePacing") }}</div>
        <span class="t-muted" style="font-size:11.5px">{{ $t("analysisView.styleSub", { pov: POV_LABELS[style.summary.dominantPov] }) }}</span>
      </div>

      <!-- Book-level rollup pills -->
      <div class="pill-row">
        <StatPill :value="style.summary.avgSentenceLength.toFixed(1)" :label="$t('analysisView.pillWordsSentence')" />
        <StatPill :value="style.summary.avgParagraphLength.toFixed(1)" :label="$t('analysisView.pillWordsParagraph')" />
        <StatPill :value="`${Math.round(style.summary.dialogueRatio * 100)}%`" :label="$t('analysisView.pillDialogue')" />
        <StatPill :value="style.summary.filterWordsPer1k.toFixed(1)" :label="$t('analysisView.pillFilterWords')" />
        <StatPill :value="style.summary.adverbsPer1k.toFixed(1)" :label="$t('analysisView.pillAdverbs')" />
        <StatPill :value="style.summary.passivePer1k.toFixed(1)" :label="$t('analysisView.pillPassive')" />
        <StatPill :value="`${(style.summary.pacingCoV * 100).toFixed(0)}%`" :label="$t('analysisView.pillVariance')" />
      </div>

      <!-- Per-chapter style table -->
      <UiTable
        :data="style.rows"
        data-key="chapterId"
        row-hover
        :columns="styleColumns"
        class="sm-dt"
        @row-click="(e) => jumpChapter(e.data.chapterId)"
      >
        <template #title="{ row }">
          <span style="color:var(--ink)"><b>{{ row.num }}</b>. {{ row.title }}</span>
        </template>
        <template #words="{ value }">{{ value.toLocaleString() }}</template>
        <template #avgSentenceLength="{ row }">
          <span class="sm-bar"><span class="sm-fill" :style="`width:${(row.avgSentenceLength / styleMaxes.sentence) * 100}%`" /></span>{{ row.avgSentenceLength.toFixed(1) }}
        </template>
        <template #avgParagraphLength="{ row }">
          <span class="sm-bar"><span class="sm-fill" :style="`width:${(row.avgParagraphLength / styleMaxes.paragraph) * 100}%`" /></span>{{ row.avgParagraphLength.toFixed(1) }}
        </template>
        <template #dialogueRatio="{ row }">
          <span class="sm-bar"><span class="sm-fill" :style="`width:${row.dialogueRatio * 100}%`" /></span>{{ Math.round(row.dialogueRatio * 100) }}%
        </template>
        <template #filterWordsPer1k="{ row }">
          <span class="sm-bar"><span class="sm-fill" :style="`width:${(row.filterWordsPer1k / Math.max(styleMaxes.filter, 1)) * 100}%`" /></span>{{ row.filterWordsPer1k.toFixed(1) }}
        </template>
        <template #adverbsPer1k="{ row }">
          <span class="sm-bar"><span class="sm-fill" :style="`width:${(row.adverbsPer1k / Math.max(styleMaxes.adverb, 1)) * 100}%`" /></span>{{ row.adverbsPer1k.toFixed(1) }}
        </template>
        <template #passivePer1k="{ row }">
          <span class="sm-bar"><span class="sm-fill" :style="`width:${(row.passivePer1k / Math.max(styleMaxes.passive, 1)) * 100}%`" /></span>{{ row.passivePer1k.toFixed(1) }}
        </template>
        <template #povHint="{ value }">
          <span style="color:var(--muted);font-family:var(--font-mono);font-size:10.5px">{{ POV_LABELS[value] || "—" }}</span>
        </template>
      </UiTable>
    </div>

    <!-- Story tension timeline -->
    <div class="card st-card" style="margin-bottom:18px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;flex-wrap:wrap">
        <div class="card-title" style="margin:0">{{ $t("analysisView.storyTension") }}</div>
        <span class="t-muted" style="font-size:11.5px">{{ $t("analysisView.tensionSub") }}</span>
        <span style="margin-left:auto;display:flex;gap:8px;align-items:center">
          <span v-if="analysedTensionRows.length" class="st-pill">
            {{ $t("analysisView.chaptersAnalysed", { analysed: analysedTensionRows.length, total: tensionRows.length }) }}
          </span>
          <UiButton v-if="!tensionRunning.value" intent="ghost" size="small"
                    :disabled="!unanalysedCount && analysedTensionRows.length"
                    @click="runTensionSweep(false)"
                    v-tooltip.bottom="unanalysedCount ? $t('analysisView.analyseTooltip', { chapters: $t('count.chapter', { n: unanalysedCount }, unanalysedCount) }) : $t('analysisView.allAnalysedTooltip')">
            <Icon name="Sparkle" :size="12" />
            {{ unanalysedCount ? $t('analysisView.analyseAction', { chapters: $t('count.chapter', { n: unanalysedCount }, unanalysedCount) }) : $t('analysisView.allAnalysed') }}
          </UiButton>
          <UiButton v-if="!tensionRunning.value && analysedTensionRows.length" intent="ghost" size="small"
                    @click="runTensionSweep(true)"
                    v-tooltip.bottom="$t('analysisView.reanalyseAllTooltip')">
            <Icon name="Refresh" :size="12" /> {{ $t("analysisView.reanalyseAll") }}
          </UiButton>
          <UiButton v-if="!tensionRunning.value" intent="ghost" size="small"
                    @click="openReverseOutline"
                    v-tooltip.bottom="$t('analysisView.reverseOutlineTooltip')">
            <Icon name="Book" :size="12" />
            {{ hasReverseOutline ? $t('analysisView.viewReverseOutline') : $t('analysisView.reverseOutline') }}
          </UiButton>
          <UiButton v-if="!tensionRunning.value" intent="ghost" size="small"
                    @click="openBeatSheet"
                    v-tooltip.bottom="$t('analysisView.beatSheetTooltip')">
            <Icon name="Target" :size="12" />
            {{ hasAnyBeatSheet ? $t('analysisView.viewBeatSheet') : $t('analysisView.mapToBeatSheet') }}
          </UiButton>
          <UiButton v-if="!tensionRunning.value" intent="ghost" size="small"
                    @click="openPlotHoles"
                    v-tooltip.bottom="$t('analysisView.plotHolesTooltip')">
            <Icon name="Alert" :size="12" />
            {{ hasPlotHoles ? $t('analysisView.plotHolesCount', { n: plotHolesActiveCount }) : $t('analysisView.plotHoleAudit') }}
          </UiButton>
          <UiButton v-if="!tensionRunning.value" intent="ghost" size="small"
                    @click="openMarketingPack"
                    v-tooltip.bottom="$t('analysisView.marketingTooltip')">
            <Icon name="Export" :size="12" />
            {{ hasMarketingPack ? $t('analysisView.viewMarketingPack') : $t('analysisView.marketingPack') }}
          </UiButton>
          <UiButton v-if="!tensionRunning.value" intent="ghost" size="small"
                    @click="openEntitySweep"
                    v-tooltip.bottom="$t('analysisView.entitySweepTooltip')">
            <Icon name="Sparkle" :size="12" />
            {{ $t("common.entitySweep") }}
          </UiButton>
          <UiButton v-if="!tensionRunning.value" intent="ghost" size="small"
                    @click="openLinkBackfill"
                    v-tooltip.bottom="$t('analysisView.linkScenesTooltip')">
            <Icon name="Pin" :size="12" />
            {{ $t("analysisView.linkScenes") }}
          </UiButton>
          <UiButton v-else-if="tensionRunning.value" intent="danger" size="small" @click="cancelTensionSweep">
            <Icon name="Close" :size="12" /> {{ $t("common.cancel") }}
          </UiButton>
        </span>
      </div>

      <div v-if="tensionError" class="st-error">
        <Icon name="Alert" :size="13" /> {{ tensionError }}
      </div>

      <AiTaskStrip :task="tensionTask" />

      <p v-if="!analysedTensionRows.length && !tensionRunning.value" class="st-empty">
        {{ $t("analysisView.tensionEmpty") }}
      </p>

      <template v-if="tensionGeom && analysedTensionRows.length">
        <!-- Stats row -->
        <div v-if="tensionStats" class="st-stats">
          <div class="st-stat">
            <div class="st-stat-v">{{ tensionStats.avgTension.toFixed(1) }}<small> / 10</small></div>
            <div class="st-stat-k">{{ $t("analysisView.avgTension") }}</div>
          </div>
          <div class="st-stat">
            <div class="st-stat-v">{{ tensionStats.avgHook.toFixed(1) }}<small> / 10</small></div>
            <div class="st-stat-k">{{ $t("analysisView.avgHookQuality") }}</div>
          </div>
          <div class="st-stat st-stat-wide">
            <button class="st-stat-jump" @click="jumpChapter(tensionStats.peakChapter.id)"
                    v-tooltip.bottom="'Open this chapter'">
              {{ $t("analysisView.chapterScore", { num: tensionStats.peakChapter.num, title: tensionStats.peakChapter.title || $t("analysisView.untitled"), value: tensionStats.peakValue }) }}
            </button>
            <div class="st-stat-k">{{ $t("analysisView.peakTension") }}</div>
          </div>
          <div class="st-stat st-stat-wide">
            <button class="st-stat-jump" @click="jumpChapter(tensionStats.lowChapter.id)"
                    v-tooltip.bottom="'Open this chapter'">
              {{ $t("analysisView.chapterScore", { num: tensionStats.lowChapter.num, title: tensionStats.lowChapter.title || $t("analysisView.untitled"), value: tensionStats.lowValue }) }}
            </button>
            <div class="st-stat-k">{{ $t("analysisView.lowestTension") }}</div>
          </div>
        </div>

        <!-- Two-line chart -->
        <svg class="st-chart" :viewBox="`0 0 ${tensionGeom.W} ${tensionGeom.H}`" preserveAspectRatio="none">
          <!-- gridlines at 3 and 7 -->
          <line :x1="0" :x2="tensionGeom.W"
                :y1="tensionGeom.H - ((3 - 1) / 9) * (tensionGeom.H - 4) - 2"
                :y2="tensionGeom.H - ((3 - 1) / 9) * (tensionGeom.H - 4) - 2"
                stroke="var(--border-soft)" stroke-width="0.4"
                stroke-dasharray="2 2" vector-effect="non-scaling-stroke" />
          <line :x1="0" :x2="tensionGeom.W"
                :y1="tensionGeom.H - ((7 - 1) / 9) * (tensionGeom.H - 4) - 2"
                :y2="tensionGeom.H - ((7 - 1) / 9) * (tensionGeom.H - 4) - 2"
                stroke="var(--border-soft)" stroke-width="0.4"
                stroke-dasharray="2 2" vector-effect="non-scaling-stroke" />
          <polyline :points="tensionGeom.tensionPts"
                    fill="none" stroke="var(--danger)" stroke-width="1.6"
                    vector-effect="non-scaling-stroke" />
          <polyline :points="tensionGeom.hookPts"
                    fill="none" stroke="var(--gold)" stroke-width="1.6"
                    stroke-dasharray="3 2" vector-effect="non-scaling-stroke" />
        </svg>
        <div class="st-legend">
          <span class="st-legend-item"><span class="st-legend-line tension" /> {{ $t("analysisView.legendTension") }}</span>
          <span class="st-legend-item"><span class="st-legend-line hook" /> {{ $t("analysisView.legendHook") }}</span>
        </div>

        <!-- Per-chapter strip — pacing/ending classification at a glance -->
        <div class="st-strip">
          <button v-for="r in tensionRows" :key="r.chapter.id" type="button"
                  class="st-cell"
                  :class="{ unscanned: !r.s, running: tensionRunningChapterId === r.chapter.id }"
                  :style="{ background: r.s ? PACING_BG[r.s.pacing] || 'var(--surface-3)' : 'var(--surface-3)' }"
                  v-tooltip.bottom="r.s ? `Ch.${r.chapter.num}${r.chapter.title ? ' — ' + r.chapter.title : ''}\nTension ${r.s.tension}/10 · Hook ${r.s.hookQuality}/10\nPacing: ${PACING_LABELS[r.s.pacing] || r.s.pacing} · Ending: ${ENDING_LABELS[r.s.endingClass] || r.s.endingClass}` : `Ch.${r.chapter.num} — not analysed`"
                  @click="jumpChapter(r.chapter.id)">
            <span class="st-cell-num">{{ r.chapter.num }}</span>
            <span v-if="r.s" class="st-cell-end"
                  :style="{ background: ENDING_BG[r.s.endingClass] || 'transparent' }">
              {{ r.s.endingClass.charAt(0).toUpperCase() }}
            </span>
          </button>
        </div>
        <i18n-t keypath="analysisView.stripHint" tag="p" class="st-strip-hint" scope="global">
          <template #cliffhanger><strong>{{ $t("analysisView.badgeCliffhanger") }}</strong></template>
          <template #soft><strong>{{ $t("analysisView.badgeSoft") }}</strong></template>
          <template #closed><strong>{{ $t("analysisView.badgeClosed") }}</strong></template>
          <template #deadEnd><strong>{{ $t("analysisView.badgeDeadEnd") }}</strong></template>
        </i18n-t>
      </template>
    </div>

    <ReverseOutlineModal v-if="reverseOutlineOpen" @close="closeReverseOutline" />
    <BeatSheetModal v-if="beatSheetOpen" @close="closeBeatSheet" />
    <PlotHoleScanModal v-if="plotHolesOpen" @close="closePlotHoles" />
    <MarketingPackModal v-if="marketingPackOpen" @close="closeMarketingPack" />
    <EntitySweepModal v-if="entitySweepOpen" @close="closeEntitySweep" @committed="closeEntitySweep" />
    <LinkBackfillModal v-if="linkBackfillOpen" @close="closeLinkBackfill" @applied="closeLinkBackfill" />

    <!-- Voice drift -->
    <div v-if="drift.eligible" class="card vd-card" style="margin-bottom:18px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
        <div class="card-title" style="margin:0">{{ $t("analysisView.voiceDrift") }}</div>
        <span class="t-muted" style="font-size:11.5px">{{ $t("analysisView.voiceDriftSub") }}</span>
        <span style="margin-left:auto;display:flex;gap:8px;align-items:center">
          <AiFeatureChip feature="voiceDrift" :label="$t('analysisView.voiceDrift')" editable />
          <span class="vd-pill vd-pill-hot">{{ $t("analysisView.hotChapterPill", { n: drift.hotChapters.length }, drift.hotChapters.length) }}</span>
          <span class="vd-pill vd-pill-muted">{{ $t("analysisView.percentOfBook", { n: Math.round(drift.driftIndex * 100) }) }}</span>
        </span>
      </div>

      <i18n-t keypath="analysisView.driftBlurb" tag="p" class="vd-blurb" scope="global">
        <template #twoOrMore><strong>{{ $t("analysisView.twoOrMoreTerm") }}</strong></template>
        <template #hot><strong>{{ $t("analysisView.hotTerm") }}</strong></template>
      </i18n-t>

      <div class="vd-grid">
        <div v-for="m in drift.metrics" :key="m.key" class="vd-row">
          <div class="vd-row-label">
            <span class="vd-row-title">{{ m.label }}</span>
            <span class="vd-row-mean">{{ $t("analysisView.mean", { value: m.format(m.mean) }) }}</span>
          </div>
          <div class="vd-row-trend"
               :style="{ color: TREND_COLOURS[m.trend.direction] }"
               v-tooltip.bottom="`Early third mean ${m.format(m.display ? m.trend.earlyMean : m.trend.earlyMean)} → late third mean ${m.format(m.display ? m.trend.lateMean : m.trend.lateMean)}`">
            {{ TREND_LABELS[m.trend.direction] }}
          </div>
          <svg v-if="sparklineGeom(m)" class="vd-spark"
               :viewBox="`0 0 ${sparklineGeom(m).w} ${sparklineGeom(m).h}`"
               preserveAspectRatio="none">
            <!-- ±1 stdev band -->
            <rect :x="0" :y="sparklineGeom(m).bandTop"
                  :width="sparklineGeom(m).w"
                  :height="Math.max(0.5, sparklineGeom(m).bandBot - sparklineGeom(m).bandTop)"
                  fill="var(--accent-soft)" />
            <!-- mean line -->
            <line :x1="0" :x2="sparklineGeom(m).w"
                  :y1="sparklineGeom(m).meanY" :y2="sparklineGeom(m).meanY"
                  stroke="var(--accent-ink)" stroke-width="0.5"
                  stroke-dasharray="3 2" vector-effect="non-scaling-stroke" />
            <!-- per-chapter polyline -->
            <polyline :points="sparklineGeom(m).polyline"
                      fill="none" stroke="var(--ink-2)" stroke-width="1.1"
                      vector-effect="non-scaling-stroke" />
            <!-- per-chapter dots -->
            <circle v-for="(p, i) in sparklineGeom(m).points" :key="i"
                    :cx="p.x" :cy="p.y" :r="Math.abs(m.zScores[i]) > 1 ? 2 : 1.2"
                    :fill="Math.abs(m.zScores[i]) > 1 ? 'var(--danger)' : 'var(--accent)'" />
          </svg>
        </div>
      </div>

      <!-- Hot chapters list -->
      <div v-if="drift.hotChapters.length" class="vd-hot">
        <div class="vd-hot-h">{{ $t("analysisView.hotChapters") }}</div>
        <AiTaskStrip :task="driftTask" />
        <ul class="vd-hot-list">
          <li v-for="hc in drift.hotChapters" :key="hc.chapterId" class="vd-hot-row">
            <div class="vd-hot-main">
              <button class="vd-hot-jump" @click="jumpChapter(hc.chapterId)"
                      v-tooltip.bottom="$t('analysisView.openChapterEditor')">
                {{ $t("analysisView.hotChapterTitle", { num: hc.num, title: hc.title || $t("analysisView.untitled") }) }}
              </button>
              <span class="vd-hot-count">{{ $t("analysisView.outlierMetrics", { n: hc.outlierCount }) }}</span>
            </div>
            <UiButton intent="ghost" size="small"
                      :disabled="driftExplainingId && driftExplainingId !== hc.chapterId"
                      @click="explainHot(hc.chapterId)"
                      v-tooltip.bottom="$t('analysisView.explainTooltip')">
              <Icon name="Sparkle" :size="12" />
              {{ driftExplanations[hc.chapterId]?.text ? $t('analysisView.hide') : driftExplanations[hc.chapterId]?.running ? $t('analysisView.diagnosing') : $t('analysisView.explain') }}
            </UiButton>
            <div v-if="driftExplanations[hc.chapterId]" class="vd-hot-explain">
              <p v-if="driftExplanations[hc.chapterId].error" class="vd-hot-err">
                <Icon name="Alert" :size="12" /> {{ driftExplanations[hc.chapterId].error }}
              </p>
              <p v-else-if="driftExplanations[hc.chapterId].text" class="vd-hot-text">
                {{ driftExplanations[hc.chapterId].text }}
              </p>
              <p v-else class="vd-hot-loading">{{ $t("analysisView.readingChapter") }}</p>
            </div>
          </li>
        </ul>
      </div>
      <p v-else class="vd-blurb" style="margin-top:14px;font-style:italic">
        {{ $t("analysisView.noDrift") }}
      </p>
    </div>

    <!-- Cast presence heatmap -->
    <div class="card" style="margin-bottom:18px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
        <div class="card-title" style="margin:0">{{ $t("analysisView.castPresence") }}</div>
        <span class="t-muted" style="font-size:11.5px">{{ $t("analysisView.castSub") }}</span>
        <div style="margin-left:auto;display:flex;gap:8px;font-size:11px;color:var(--muted)">
          <span style="display:inline-flex;align-items:center;gap:5px">
            <span style="width:10px;height:10px;border-radius:2px;background:var(--surface-3)" /> {{ $t("analysisView.legendNone") }}
          </span>
          <span style="display:inline-flex;align-items:center;gap:5px">
            <span style="width:10px;height:10px;border-radius:2px;background:color-mix(in oklab, var(--accent) 30%, var(--surface))" /> {{ $t("analysisView.legendMention") }}
          </span>
          <span style="display:inline-flex;align-items:center;gap:5px">
            <span style="width:10px;height:10px;border-radius:2px;background:var(--accent)" /> {{ $t("analysisView.legendFeatured") }}
          </span>
        </div>
      </div>
      <div class="heatmap" :style="`--cells:${allCh.length}`">
        <!-- header row of chapter numbers -->
        <div class="heatmap-row heatmap-head">
          <div class="heatmap-label" />
          <div v-for="c in allCh" :key="c.id" class="heatmap-num" :title="c.title">{{ c.num }}</div>
        </div>
        <div v-for="row in presence" :key="row.character.id" class="heatmap-row">
          <button class="heatmap-label" @click="router.push(`/characters/${row.character.id}`)">
            {{ row.character.name }}
          </button>
          <button v-for="cell in row.cells" :key="cell.chapter.id" type="button"
            class="heatmap-cell"
            :style="cellStyle(cell.weight)"
            :title="`${row.character.name} · Ch. ${cell.chapter.num} — ${cell.chapter.title}${cell.mentions ? ` · ${cell.mentions} mentions` : ''}`"
            @click="jumpChapter(cell.chapter.id)" />
        </div>
      </div>
    </div>

    <!-- Scenes per chapter -->
    <div class="card">
      <div class="card-title">{{ $t("analysisView.scenesPerChapter") }}</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(80px, 1fr));gap:6px;margin-top:8px">
        <button v-for="s in scenes" :key="s.num"
          class="scene-cell" :title="$t('analysisView.sceneCellTitle', { num: s.num, title: s.title })"
          @click="jumpChapter(allCh.find(c => c.num === s.num)?.id)">
          <div class="scene-bar">
            <div :style="`height:${(s.scenes / maxScenes) * 100}%;background:var(--accent)`" />
          </div>
          <div class="scene-num">{{ s.num }}</div>
          <div class="scene-val t-num">{{ s.scenes }}</div>
        </button>
      </div>
    </div>
  </div>
  </div>
</template>

<style scoped>
.an-desc {
  font-size: 14px; line-height: 1.55; color: var(--muted);
  margin: 0 0 18px;
}
.an-desc strong { color: var(--ink-2); font-weight: 600; }

.kpi { padding: 14px 16px; }
.kpi-val { font-family: var(--font-serif); font-weight: 600; font-size: 26px; letter-spacing: -0.01em; margin-top: 6px; }
.kpi-of { color: var(--muted); font-weight: 400; font-size: 18px; }
.kpi-sub { font-size: 11px; color: var(--muted); margin-top: 2px; }


.bar-row { display: grid; grid-template-columns: 200px 1fr 70px; gap: 14px; align-items: center; padding: 4px 0; font-size: 12.5px; width: 100%; border: 0; background: transparent; cursor: pointer; text-align: left; }
.bar-row .name { color: var(--ink-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.bar-row .track { height: 8px; background: var(--surface-3); border-radius: 999px; overflow: hidden; }
.bar-row .fill { height: 100%; border-radius: 999px; transition: width .2s ease; }
.bar-row .val { text-align: right; color: var(--muted); font-variant-numeric: tabular-nums; }
.bar-row:hover { background: var(--surface-2); }

.heatmap { display: flex; flex-direction: column; gap: 3px; margin-top: 10px; overflow-x: auto; }
.heatmap-row { display: grid; grid-template-columns: 140px repeat(var(--cells, 14), minmax(20px, 1fr)); gap: 3px; align-items: center; min-width: 600px; }
.heatmap-head { padding-bottom: 4px; }
.heatmap-label {
  font-size: 11.5px; color: var(--ink-2);
  text-align: right; padding-right: 8px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  border: 0; background: transparent;
}
.heatmap-label:hover { color: var(--accent-ink); }
.heatmap-num {
  font-size: 10.5px; color: var(--muted);
  text-align: center; font-variant-numeric: tabular-nums;
}
.heatmap-cell {
  height: 20px; border-radius: 3px; border: 0;
  padding: 0; background: transparent; cursor: pointer;
  font-size: 0;
}
.heatmap-cell:hover { outline: 2px solid var(--accent); outline-offset: 1px; }

.scene-cell {
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  padding: 8px 6px;
  border: 1px solid var(--border-soft);
  border-radius: 8px;
  background: var(--surface);
}
.scene-cell:hover { background: var(--surface-2); }
.scene-bar { width: 24px; height: 40px; background: var(--surface-3); border-radius: 4px; overflow: hidden; display: flex; align-items: flex-end; }
.scene-bar > div { width: 100%; }
.scene-num { font-size: 10.5px; color: var(--muted); font-variant-numeric: tabular-nums; }
.scene-val { font-size: 12px; font-weight: 600; font-variant-numeric: tabular-nums; }

.mix-bar { display: flex; height: 8px; border-radius: 999px; overflow: hidden; background: var(--surface-3); }
.mix-bar-lg { height: 14px; }
.mix-seg { height: 100%; transition: width .2s ease; }
.mix-row { display: grid; grid-template-columns: 200px 1fr 44px; gap: 14px; align-items: center; font-size: 12.5px; cursor: pointer; padding: 2px 0; width: 100%; border: 0; background: transparent; text-align: left; }
.mix-row .name { color: var(--ink-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mix-row .val { text-align: right; color: var(--muted); font-variant-numeric: tabular-nums; }
.mix-row:hover { background: var(--surface-2); }

/* ── Writing year heatmap (365-day) ─────────────────────────────── */
.hm-grid { display: grid; grid-template-columns: 22px 1fr; gap: 6px; }
.hm-dow {
  display: grid; grid-template-rows: repeat(7, 1fr);
  gap: 3px; padding-top: 16px;
  font-family: var(--font-mono); font-size: 9.5px; color: var(--muted);
}
.hm-dow-lbl { line-height: 1; text-align: center; height: 12px; }
.hm-weeks { display: flex; flex-direction: column; gap: 2px; min-width: 0; overflow: hidden; }
.hm-month-row { display: grid; grid-auto-flow: column; grid-auto-columns: 13px; height: 12px; font-family: var(--font-mono); font-size: 9.5px; color: var(--muted); }
.hm-month-lbl { grid-row: 1; line-height: 1; }
.hm-cells { display: flex; gap: 2px; }
.hm-col { display: grid; grid-template-rows: repeat(7, 11px); gap: 2px; }
.hm-cell { width: 11px; height: 11px; border-radius: 2px; background: var(--surface-3); }
.hm-cell.hm-t0 { background: var(--surface-3); }
.hm-cell.hm-t1 { background: color-mix(in oklab, var(--accent) 18%, var(--surface)); }
.hm-cell.hm-t2 { background: color-mix(in oklab, var(--accent) 38%, var(--surface)); }
.hm-cell.hm-t3 { background: color-mix(in oklab, var(--accent) 65%, var(--surface)); }
.hm-cell.hm-t4 { background: var(--accent); }

/* ── Milestones card ────────────────────────────────────────────── */
.ms-next-h {
  font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.14em;
  text-transform: uppercase; color: var(--muted);
}
.ms-next-target { font-family: var(--font-serif); font-size: 22px; font-weight: 500; margin-top: 4px; }
.ms-bar { margin-top: 10px; height: 6px; border-radius: 999px; background: var(--surface-3); overflow: hidden; }
.ms-fill { height: 100%; background: linear-gradient(90deg, var(--accent), var(--gold)); transition: width .3s ease; }
.ms-next-sub { font-size: 11.5px; margin-top: 6px; font-variant-numeric: tabular-nums; }
.ms-grid {
  margin-top: 16px;
  display: grid; grid-template-columns: repeat(auto-fill, minmax(60px, 1fr));
  gap: 6px;
}
.ms-pip {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 5px 8px; border-radius: 6px;
  font-family: var(--font-mono); font-size: 11px;
  background: var(--surface-2); color: var(--muted);
  border: 1px solid var(--border-soft);
}
.ms-pip.on { background: color-mix(in oklab, var(--status-done) 18%, var(--surface)); color: var(--status-done); border-color: color-mix(in oklab, var(--status-done) 40%, transparent); }
.ms-pip.next { background: var(--accent-soft); color: var(--accent-ink); border-color: var(--accent-line); }
.ms-streaks {
  margin-top: 14px; display: flex; flex-direction: column; gap: 5px;
  padding-top: 12px; border-top: 1px solid var(--border-soft);
}
.ms-streaks > div { display: flex; justify-content: space-between; font-size: 12px; }
.ms-streaks b { color: var(--ink); font-variant-numeric: tabular-nums; }

/* ── Style & pacing table ───────────────────────────────────────── */
.pill-row { display: flex; flex-wrap: wrap; gap: 10px; margin: 6px 0 16px; }

.sm-dt { font-size: 12px; font-variant-numeric: tabular-nums; cursor: pointer; }
.sm-bar {
  display: inline-block; width: 36px; height: 4px; border-radius: 999px;
  background: var(--surface-3); vertical-align: middle; margin-right: 6px;
  overflow: hidden;
}
.sm-fill { display: block; height: 100%; background: var(--accent); border-radius: 999px; }

.kpi-row { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.heatmap-milestones-row { grid-template-columns: 2fr 1fr; }
.status-row { grid-template-columns: repeat(2, minmax(0, 1fr)); }

@media (max-width: 900px) {
  .kpi-row { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .heatmap-milestones-row { grid-template-columns: 1fr; }
  .status-row { grid-template-columns: 1fr; }
}

/* ── Story tension ────────────────────────────────────────── */
.st-card .st-pill {
  font-family: var(--font-mono); font-size: 10.5px;
  padding: 3px 10px; border-radius: 999px;
  background: var(--surface-3); color: var(--muted);
}
.st-error {
  display: flex; gap: 8px; align-items: center;
  padding: 8px 12px; border-radius: 6px;
  background: color-mix(in oklab, var(--danger-ink, #b91c1c) 12%, transparent);
  color: var(--danger-ink, #b91c1c);
  font-size: 12.5px; margin-bottom: 10px;
}
.st-progress {
  display: flex; align-items: center; gap: 10px;
  font-size: 12.5px; color: var(--muted); font-style: italic;
  padding: 8px 0;
}
.st-spinner {
  display: inline-block; width: 12px; height: 12px;
  border: 2px solid var(--surface-3); border-top-color: var(--accent);
  border-radius: 50%; animation: st-spin 0.9s linear infinite;
}
@keyframes st-spin { to { transform: rotate(360deg); } }
.st-empty {
  margin: 6px 0 0; max-width: 78ch;
  font-size: 12.5px; line-height: 1.55; color: var(--muted); font-style: italic;
}

.st-stats {
  display: flex; flex-wrap: wrap; gap: 22px;
  padding: 4px 0 14px;
  border-bottom: 1px solid var(--border-soft);
  margin-bottom: 14px;
}
.st-stat { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.st-stat-wide { flex: 1 1 280px; min-width: 0; }
.st-stat-v {
  font-family: var(--font-serif); font-size: 22px; font-weight: 500;
  color: var(--ink); line-height: 1.1;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.st-stat-v small {
  font-family: var(--font-mono); font-size: 11px;
  color: var(--muted); letter-spacing: 0.04em;
}
.st-stat-k {
  font-family: var(--font-mono); font-size: 9.5px;
  letter-spacing: 0.15em; text-transform: uppercase; color: var(--muted);
}
.st-stat-jump {
  appearance: none; border: 0; background: transparent; cursor: pointer;
  font: inherit; font-family: var(--font-serif); font-size: 14px; color: var(--ink-2);
  padding: 0; text-align: left;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%;
}
.st-stat-jump:hover { color: var(--accent); text-decoration: underline; }

.st-chart {
  width: 100%; height: 100px;
  background: var(--surface-2); border-radius: 6px;
  padding: 4px; box-sizing: border-box;
}
.st-legend { display: flex; gap: 16px; margin-top: 8px; }
.st-legend-item { display: inline-flex; align-items: center; gap: 6px; font-size: 11.5px; color: var(--ink-2); }
.st-legend-line { width: 16px; border-top: 2px solid; display: inline-block; }
.st-legend-line.tension { color: var(--danger); }
.st-legend-line.hook { color: var(--gold); border-top-style: dashed; }

.st-strip {
  display: flex; flex-wrap: wrap; gap: 4px;
  margin-top: 16px;
}
.st-cell {
  appearance: none; border: 0; cursor: pointer;
  width: 34px; height: 34px;
  position: relative;
  display: flex; align-items: center; justify-content: center;
  border-radius: 5px;
  font-family: var(--font-mono); font-size: 11px; font-weight: 600;
  color: var(--ink-2);
}
.st-cell:hover:not(.unscanned) { transform: translateY(-1px); }
.st-cell.unscanned { cursor: default; color: var(--subtle); }
.st-cell.running {
  outline: 2px solid var(--accent); outline-offset: 1px;
  animation: st-pulse 1.2s ease-in-out infinite;
}
@keyframes st-pulse {
  0%, 100% { opacity: 1; } 50% { opacity: 0.75; }
}
.st-cell-num { line-height: 1; }
.st-cell-end {
  position: absolute; top: 1px; right: 1px;
  width: 12px; height: 12px;
  display: flex; align-items: center; justify-content: center;
  font-size: 9px; border-radius: 3px;
  color: var(--ink);
}
.st-strip-hint {
  margin: 10px 0 0; max-width: 78ch;
  font-size: 11.5px; color: var(--muted); font-style: italic;
}
.st-strip-hint strong { color: var(--ink-2); font-weight: 600; font-style: normal; }

/* ── Voice drift ──────────────────────────────────────────── */
.vd-card .vd-blurb {
  margin: 0 0 14px; max-width: 78ch;
  font-size: 12.5px; line-height: 1.55; color: var(--muted);
}
.vd-card .vd-blurb strong { color: var(--ink-2); font-weight: 600; }
.vd-pill {
  font-family: var(--font-mono); font-size: 10.5px;
  padding: 3px 10px; border-radius: 999px;
}
.vd-pill-hot {
  background: color-mix(in oklab, var(--danger) 16%, transparent);
  color: var(--ink);
}
.vd-pill-muted { background: var(--surface-3); color: var(--muted); }

.vd-grid { display: flex; flex-direction: column; gap: 6px; }
.vd-row {
  display: grid;
  grid-template-columns: 180px 70px 1fr;
  align-items: center; gap: 14px;
  padding: 4px 0;
}
.vd-row-label { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.vd-row-title { font-size: 12.5px; color: var(--ink-2); }
.vd-row-mean { font-family: var(--font-mono); font-size: 10px; color: var(--muted); }
.vd-row-trend {
  font-family: var(--font-mono); font-size: 10px;
  letter-spacing: 0.08em; text-transform: uppercase;
  text-align: right;
}
.vd-spark { width: 100%; height: 28px; display: block; }

.vd-hot { margin-top: 18px; padding-top: 14px; border-top: 1px solid var(--border-soft); }
.vd-hot-h {
  font-family: var(--font-mono); font-size: 10px;
  letter-spacing: 0.16em; text-transform: uppercase; color: var(--muted);
  margin-bottom: 8px;
}
.vd-hot-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 6px; }
.vd-hot-row {
  display: grid;
  grid-template-columns: 1fr auto;
  column-gap: 12px; row-gap: 8px;
  padding: 10px 12px;
  background: var(--surface-2); border-radius: 6px;
}
.vd-hot-main {
  display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap;
  min-width: 0;
}
.vd-hot-jump {
  appearance: none; border: 0; background: transparent; cursor: pointer;
  font: inherit; color: var(--ink-2); padding: 0; font-weight: 500;
  font-family: var(--font-serif); font-size: 13.5px;
}
.vd-hot-jump:hover { color: var(--accent); text-decoration: underline; }
.vd-hot-count {
  font-family: var(--font-mono); font-size: 10.5px; color: var(--danger);
  background: color-mix(in oklab, var(--danger) 14%, transparent);
  padding: 2px 8px; border-radius: 999px;
}
.vd-hot-explain {
  grid-column: 1 / -1;
  padding: 10px 12px;
  margin-top: 4px;
  background: var(--surface); border: 1px solid var(--border-soft); border-radius: 6px;
}
.vd-hot-text {
  margin: 0;
  font-family: var(--font-serif); font-size: 13.5px; line-height: 1.65;
  color: var(--ink-2); font-style: italic;
  white-space: pre-wrap;
}
.vd-hot-loading {
  margin: 0;
  font-size: 12px; color: var(--muted); font-style: italic;
}
.vd-hot-err {
  margin: 0;
  display: flex; align-items: center; gap: 6px;
  font-size: 12px; color: var(--danger);
}

@media (max-width: 720px) {
  .vd-row { grid-template-columns: 1fr auto; grid-template-areas: "label trend" "spark spark"; }
  .vd-row-label { grid-area: label; }
  .vd-row-trend { grid-area: trend; }
  .vd-spark { grid-area: spark; }
}
</style>
