<script setup>
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { useProjectStore } from "../stores/project.js";
import { useStudioStore } from "../stores/studio.js";
import { useSessionsStore } from "../stores/sessions.js";
import PaneHeader from "../components/PaneHeader.vue";
import Icon from "../components/Icon.vue";
import StatPill from "../components/StatPill.vue";
import {
  statusCounts, strandDistribution, characterPresence,
  scenesPerChapter, projectKpis, paceSeries, dialogueMix,
} from "../services/analysis.js";
import { bookMetrics, POV_LABELS } from "../services/analysis/styleMetrics.js";
import JwTable from "@renderer/components/ui/JwTable.vue";

const project = useProjectStore();
const studio = useStudioStore();
const sessions = useSessionsStore();
const router = useRouter();

const allCh = computed(() => project.allChapters);
const kpis = computed(() => projectKpis(project, allCh.value));
const status = computed(() => statusCounts(allCh.value));
const strands = computed(() => strandDistribution(project.strands, allCh.value));
const presence = computed(() => characterPresence(project.characters, project.characterExtras, allCh.value, project.chapterBody, studio.speakersByChapter));
const scenes = computed(() => scenesPerChapter(allCh.value));
const dialogue = computed(() => dialogueMix(studio.scripts, allCh.value));

// Mix segments — fixed order + colors, shared by the overall bar, the
// legend, and the per-chapter rows.
const MIX_KINDS = [
  { k: "dialogue",  label: "Dialogue",  color: "oklch(0.64 0.14 255)" },
  { k: "narration", label: "Narration", color: "oklch(0.70 0.10 155)" },
  { k: "interior",  label: "Interior",  color: "oklch(0.74 0.12 70)" },
];
const pct = (n, total) => (total ? (n / total) * 100 : 0);

// Pace — driven by the session log. Empty until the user writes
// anything, but the chart still renders (all zeros).
const windowDays = ref(30);
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
  <PaneHeader eyebrow="Project" title="Analysis" />

  <div class="pane-card">
  <div class="scrollarea" style="padding:22px 26px 60px">

    <!-- KPI row -->
    <div class="kpi-row" style="display:grid;gap:14px;margin-bottom:18px">
      <div class="card kpi">
        <div class="t-eyebrow">Manuscript</div>
        <div class="kpi-val">{{ kpis.totalWords.toLocaleString() }}</div>
        <div class="kpi-sub">words · {{ kpis.goalPct }}% of goal</div>
      </div>
      <div class="card kpi">
        <div class="t-eyebrow">Chapters</div>
        <div class="kpi-val">{{ kpis.chaptersDone }} <span class="kpi-of">/ {{ kpis.chaptersTotal }}</span></div>
        <div class="kpi-sub">marked done</div>
      </div>
      <div class="card kpi">
        <div class="t-eyebrow">Avg chapter</div>
        <div class="kpi-val">{{ kpis.avgChapterLength.toLocaleString() }}</div>
        <div class="kpi-sub">words</div>
      </div>
      <div class="card kpi">
        <div class="t-eyebrow">Pace ({{ windowDays }}d)</div>
        <div class="kpi-val">{{ pace.avg.toLocaleString() }}</div>
        <div class="kpi-sub">avg words / day</div>
      </div>
    </div>

    <!-- Pace -->
    <div class="card" style="margin-bottom:18px">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px">
        <div class="card-title" style="margin:0">Pace</div>
        <span class="t-muted" style="font-size:11.5px">Daily words written</span>
        <div style="margin-left:auto;display:flex;gap:4px">
          <button v-for="d in [14, 30, 90]" :key="d"
            class="seg-btn" :class="{ active: windowDays === d }"
            @click="windowDays = d">{{ d }}d</button>
        </div>
      </div>
      <svg :viewBox="`0 0 ${paceShape.w} ${paceShape.h}`" preserveAspectRatio="none"
        style="width:100%;height:140px;display:block">
        <polygon :points="paceShape.area" fill="var(--accent-soft)" />
        <polyline :points="paceShape.line" fill="none" stroke="var(--accent)" stroke-width="1.6" vector-effect="non-scaling-stroke" />
      </svg>
      <div style="display:flex;gap:18px;margin-top:8px;font-size:11.5px;color:var(--muted)">
        <span><b class="t-num" style="color:var(--ink)">{{ pace.total.toLocaleString() }}</b> total</span>
        <span><b class="t-num" style="color:var(--ink)">{{ pace.avg.toLocaleString() }}</b> avg/day</span>
        <span><b class="t-num" style="color:var(--ink)">{{ pace.max.toLocaleString() }}</b> peak day</span>
      </div>
    </div>

    <!-- Writing heatmap (365-day) + milestones -->
    <div class="heatmap-milestones-row" style="display:grid;gap:18px;margin-bottom:18px">
      <div class="card">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
          <div class="card-title" style="margin:0">Writing year</div>
          <span class="t-muted" style="font-size:11.5px">Last 53 weeks · {{ heatmap.total.toLocaleString() }} words</span>
          <span style="margin-left:auto;display:flex;gap:6px;align-items:center;font-size:10.5px;color:var(--muted)">
            <span>less</span>
            <span v-for="t in [0,1,2,3,4]" :key="t" class="hm-cell" :class="`hm-t${t}`" style="width:11px;height:11px" />
            <span>more</span>
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
        <div class="card-title" style="margin-bottom:10px">Milestones</div>
        <div class="ms-next" v-if="milestoneState.next">
          <div class="ms-next-h">Next milestone</div>
          <div class="ms-next-target">{{ milestoneState.next.toLocaleString() }} words</div>
          <div class="ms-bar">
            <div class="ms-fill" :style="`width:${milestoneState.pct}%`" />
          </div>
          <div class="ms-next-sub">
            <b>{{ kpis.totalWords.toLocaleString() }}</b> / {{ milestoneState.next.toLocaleString() }}
            <span class="t-muted">· {{ milestoneState.pct }}%</span>
          </div>
        </div>
        <div v-else class="ms-next-h" style="color:var(--accent-ink)">Every milestone hit.</div>

        <div class="ms-grid">
          <div v-for="m in MILESTONES" :key="m"
            class="ms-pip" :class="{ on: milestoneState.reached.includes(m), next: milestoneState.next === m }">
            <Icon :name="milestoneState.reached.includes(m) ? 'Check' : 'Star'" :size="11" />
            <span>{{ (m / 1000) }}k</span>
          </div>
        </div>

        <div class="ms-streaks">
          <div><span class="t-muted">Current streak</span><span><b>{{ sessions.streak }}</b> day{{ sessions.streak === 1 ? "" : "s" }}</span></div>
          <div><span class="t-muted">Lifetime</span><span><b>{{ sessions.allTimeTotals.totalWords.toLocaleString() }}</b></span></div>
          <div><span class="t-muted">Writing days</span><span><b>{{ sessions.allTimeTotals.writingDays }}</b></span></div>
        </div>
      </div>
    </div>

    <!-- Status donut + Strand distribution -->
    <div class="status-row" style="display:grid;gap:18px;margin-bottom:18px">
      <div class="card">
        <div class="card-title">Status</div>
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
        <div class="card-title">Narrative strands by word count</div>
        <div style="display:flex;flex-direction:column;gap:10px;margin-top:6px">
          <div v-for="s in strands" :key="s.strandId || 'none'">
            <div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:4px">
              <span style="display:inline-flex;align-items:center;gap:7px">
                <span :style="`width:10px;height:10px;border-radius:2px;background:${s.color}`" />
                {{ s.name }}
              </span>
              <span class="t-muted t-num">{{ s.words.toLocaleString() }} · {{ s.chapters }} ch</span>
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
      <div class="card-title">Words per chapter</div>
      <div style="margin-top:8px">
        <div v-for="c in allCh" :key="c.id"
          class="bar-row" style="cursor:default" @click="jumpChapter(c.id)">
          <span class="name">{{ c.num }}. {{ c.title }}</span>
          <div class="track">
            <div class="fill" :style="`width:${(c.words / Math.max(1, ...allCh.map(x => x.words))) * 100}%;background:${project.strandById((c.strands || [])[0])?.color || 'var(--accent)'}`" />
          </div>
          <span class="val">{{ c.words.toLocaleString() }}</span>
        </div>
      </div>
    </div>

    <!-- Style + pacing (deterministic) -->
    <div class="card" style="margin-bottom:18px" v-if="style.summary.words > 0">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
        <div class="card-title" style="margin:0">Style &amp; pacing</div>
        <span class="t-muted" style="font-size:11.5px">Per-chapter prose metrics · {{ POV_LABELS[style.summary.dominantPov] }}</span>
      </div>

      <!-- Book-level rollup pills -->
      <div class="pill-row">
        <StatPill :value="style.summary.avgSentenceLength.toFixed(1)" label="words / sentence" />
        <StatPill :value="style.summary.avgParagraphLength.toFixed(1)" label="words / paragraph" />
        <StatPill :value="`${Math.round(style.summary.dialogueRatio * 100)}%`" label="dialogue" />
        <StatPill :value="style.summary.filterWordsPer1k.toFixed(1)" label="filter words / 1k" />
        <StatPill :value="style.summary.adverbsPer1k.toFixed(1)" label="adverbs / 1k" />
        <StatPill :value="style.summary.passivePer1k.toFixed(1)" label="passive / 1k" />
        <StatPill :value="`${(style.summary.pacingCoV * 100).toFixed(0)}%`" label="chapter-length variance" />
      </div>

      <!-- Per-chapter style table -->
      <JwTable
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
      </JwTable>
    </div>

    <!-- Cast presence heatmap -->
    <div class="card" style="margin-bottom:18px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
        <div class="card-title" style="margin:0">Cast presence</div>
        <span class="t-muted" style="font-size:11.5px">Filled cells = character appears in that chapter</span>
        <div style="margin-left:auto;display:flex;gap:8px;font-size:11px;color:var(--muted)">
          <span style="display:inline-flex;align-items:center;gap:5px">
            <span style="width:10px;height:10px;border-radius:2px;background:var(--surface-3)" /> none
          </span>
          <span style="display:inline-flex;align-items:center;gap:5px">
            <span style="width:10px;height:10px;border-radius:2px;background:color-mix(in oklab, var(--accent) 30%, var(--surface))" /> mention
          </span>
          <span style="display:inline-flex;align-items:center;gap:5px">
            <span style="width:10px;height:10px;border-radius:2px;background:var(--accent)" /> featured
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
          <div v-for="cell in row.cells" :key="cell.chapter.id"
            class="heatmap-cell"
            :style="cellStyle(cell.weight)"
            :title="`${row.character.name} · Ch. ${cell.chapter.num} — ${cell.chapter.title}${cell.mentions ? ` · ${cell.mentions} mentions` : ''}`"
            @click="jumpChapter(cell.chapter.id)" />
        </div>
      </div>
    </div>

    <!-- Dialogue vs narration -->
    <div class="card" style="margin-bottom:18px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
        <div class="card-title" style="margin:0">Dialogue vs narration</div>
        <span class="t-muted" style="font-size:11.5px">By word count, from Studio script analysis</span>
        <span v-if="dialogue.analyzed" style="margin-left:auto;font-size:11.5px;color:var(--muted)">
          {{ dialogue.overallDialoguePct }}% dialogue · {{ dialogue.analyzed }} ch analyzed
        </span>
      </div>

      <template v-if="dialogue.analyzed">
        <div class="mix-bar mix-bar-lg">
          <div v-for="m in MIX_KINDS" :key="m.k" class="mix-seg"
            :style="`width:${pct(dialogue.totals[m.k], dialogue.totals.total)}%;background:${m.color}`"
            :title="`${m.label}: ${dialogue.totals[m.k].toLocaleString()} words`" />
        </div>
        <div style="display:flex;gap:16px;margin-top:8px;font-size:11.5px;color:var(--muted)">
          <span v-for="m in MIX_KINDS" :key="m.k" style="display:inline-flex;align-items:center;gap:6px">
            <span :style="`width:10px;height:10px;border-radius:2px;background:${m.color}`" />
            {{ m.label }} · {{ Math.round(pct(dialogue.totals[m.k], dialogue.totals.total)) }}%
          </span>
        </div>

        <div style="margin-top:14px;display:flex;flex-direction:column;gap:7px">
          <div v-for="row in dialogue.perChapter" :key="row.id" class="mix-row" @click="jumpChapter(row.id)">
            <span class="name">{{ row.num }}. {{ row.title }}</span>
            <div class="mix-bar">
              <div v-for="m in MIX_KINDS" :key="m.k" class="mix-seg"
                :style="`width:${pct(row[m.k], row.total)}%;background:${m.color}`"
                :title="`${m.label}: ${row[m.k].toLocaleString()} words`" />
            </div>
            <span class="val">{{ row.dialoguePct }}%</span>
          </div>
        </div>
      </template>
      <div v-else class="t-muted" style="font-size:12.5px;text-align:center;padding:22px 0;background:var(--surface-2);border-radius:8px">
        No script analysis yet. Run <b>Studio → Script</b> on a chapter to break down dialogue, narration, and interior.
      </div>
    </div>

    <!-- Scenes per chapter -->
    <div class="card">
      <div class="card-title">Scenes per chapter</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(80px, 1fr));gap:6px;margin-top:8px">
        <button v-for="s in scenes" :key="s.num"
          class="scene-cell" :title="`Ch. ${s.num} — ${s.title}`"
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
.kpi { padding: 14px 16px; }
.kpi-val { font-family: var(--font-serif); font-weight: 600; font-size: 26px; letter-spacing: -0.01em; margin-top: 6px; }
.kpi-of { color: var(--muted); font-weight: 400; font-size: 18px; }
.kpi-sub { font-size: 11px; color: var(--muted); margin-top: 2px; }

.seg-btn {
  appearance: none;
  border: 1px solid var(--border);
  background: var(--surface);
  border-radius: 6px;
  padding: 3px 9px;
  font-size: 11px;
  color: var(--ink-2);
  font-variant-numeric: tabular-nums;
}
.seg-btn.active { background: var(--ink); color: var(--surface); border-color: var(--ink); }

.bar-row { display: grid; grid-template-columns: 200px 1fr 70px; gap: 14px; align-items: center; padding: 4px 0; font-size: 12.5px; }
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
.mix-row { display: grid; grid-template-columns: 200px 1fr 44px; gap: 14px; align-items: center; font-size: 12.5px; cursor: pointer; padding: 2px 0; }
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
</style>
