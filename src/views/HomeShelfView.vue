<script setup>
// Home — "Paper Shelf" variant (Direction C, promoted from mockups/c-paper-shelf.html).
//
// Additive route at /home-v2. Doesn't touch HomeView.vue. Read-only against
// the existing project / ui / sessions stores; the only mutations are the
// same `ui.select` + `project.updateProjectMeta` calls HomeView already
// makes. No new tokens, no new persistence keys.
//
// Revert = remove the route registration in router/index.js + delete this
// file.

import { computed, nextTick, onMounted, ref } from "vue";
import { useWritingNav } from "../composables/useWritingNav.js";
import { useProjectStore } from "../stores/project.js";
import { useUiStore } from "../stores/ui.js";
import { useSessionsStore, reorderForMonday } from "../stores/sessions.js";
import { scanProjectMarkers } from "../services/markers.js";
import { UiButton } from "@delebash/llm-ui";
import { Icon } from "@delebash/llm-ui";

const project = useProjectStore();
const ui = useUiStore();
const sessions = useSessionsStore();
const nav = useWritingNav();
const P = project.project;

const railEl = ref(null);

const allCh = computed(() => project.allChapters);
const totalWords = computed(() => allCh.value.reduce((s, c) => s + (c.words || 0), 0));
const pct = computed(() => Math.round((totalWords.value / (P.wordsGoal || 1)) * 100));

const resumeId = computed(() => {
  const g = ui.lastScene;
  if (g?.chapterId && project.chapterById(g.chapterId)) return g.chapterId;
  return sessions.todayChapterId || ui.selections.chapters || allCh.value[0]?.id || null;
});
const resumeCh = computed(() => (resumeId.value ? project.chapterById(resumeId.value) : null));

function firstParagraph(html, max = 200) {
  if (!html) return "";
  const div = document.createElement("div");
  div.innerHTML = html;
  for (const p of div.querySelectorAll("p")) {
    if (p.classList.contains("scene-mark")) continue;
    const t = p.textContent.trim();
    if (t) return t.length > max ? `${t.slice(0, max).trim()}…` : t;
  }
  const t = (div.textContent || "").trim();
  return t.length > max ? `${t.slice(0, max).trim()}…` : t;
}

// Precompute openers once per render so the template doesn't re-walk each
// chapter body on every reactive tick.
const openersByChapter = computed(() => {
  const map = new Map();
  for (const ch of allCh.value) {
    const max = ch.id === resumeId.value ? 320 : 160;
    map.set(ch.id, firstParagraph(project.chapterBody[ch.id], max));
  }
  return map;
});

function todayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function daysBetween(yyyyMmDd, refDate = new Date()) {
  if (!yyyyMmDd) return null;
  const [y, m, d] = yyyyMmDd.split("-").map(Number);
  const past = new Date(y, m - 1, d).getTime();
  const today = new Date(refDate.getFullYear(), refDate.getMonth(), refDate.getDate()).getTime();
  return Math.max(0, Math.round((today - past) / 86400000));
}

const lastSessionGap = computed(() => {
  const day = sessions.lastWrite?.day;
  if (!day) return null;
  const n = daysBetween(day);
  if (n === 0) return "today";
  if (n === 1) return "yesterday";
  return `${n} days ago`;
});

const chRange = computed(() => {
  if (!allCh.value.length) return "no chapters yet";
  const first = allCh.value[0]?.num ?? 1;
  const last = allCh.value[allCh.value.length - 1]?.num ?? allCh.value.length;
  return first === last ? `Chapter ${first}` : `Chapters ${first}–${last}`;
});

const centredLabel = computed(() => {
  if (!resumeCh.value) return null;
  const gap = lastSessionGap.value;
  let sub;
  if (gap === "today") sub = "today's chapter";
  else if (gap === "yesterday") sub = "yesterday's session";
  else if (gap) sub = `your last session — ${gap}`;
  else sub = "your last open chapter";
  return `centred on ch. ${resumeCh.value.num} — ${sub}`;
});

function kindFor(status) {
  if (status === "done" || status === "draft" || status === "revise") return status;
  return "todo";
}

function statusLabelFor(ch) {
  const s = project.statusById(ch.status);
  return s?.label || "To do";
}

function pad(n) { return String(n).padStart(2, "0"); }

function openChapter(ch) {
  if (ch) nav.openChapter(ch.id);
}

function resume() {
  nav.resume();
}

// ── Colophon (right rail)
const totals14 = computed(() => sessions.totalsBy(14));
const totals28 = computed(() => sessions.totalsBy(28));
const history7 = computed(() => sessions.historyFor(7));
const daysWrittenThisWeek = computed(() => history7.value.filter((d) => d.words > 0));
const weeklyDayList = computed(() => {
  if (!daysWrittenThisWeek.value.length) return "—";
  return daysWrittenThisWeek.value
    .map((d) => {
      const [y, m, day] = d.date.split("-").map(Number);
      return new Date(y, m - 1, day).toLocaleDateString(undefined, { weekday: "short" });
    })
    .join(" · ");
});

const dowAvg = computed(() => reorderForMonday(sessions.averageByDow()));
const FULL_DOW = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const bestDowIdx = computed(() => {
  const m = Math.max(...dowAvg.value);
  return m > 0 ? dowAvg.value.indexOf(m) : -1;
});
const bestDow = computed(() => (bestDowIdx.value >= 0 ? FULL_DOW[bestDowIdx.value] : "—"));
const bestDowAvg = computed(() => (bestDowIdx.value >= 0 ? Math.round(dowAvg.value[bestDowIdx.value]) : 0));

const cadenceDelta = computed(() => {
  const recent = totals14.value.total;
  const all28 = totals28.value.total;
  const prior = Math.max(0, all28 - recent);
  if (!prior) return null;
  return Math.round(((recent - prior) / prior) * 100);
});

const pendingCount = computed(() => {
  try { return scanProjectMarkers(project).length; }
  catch { return 0; }
});

// ── Axis ticks under the rail
const axisTicks = computed(() => {
  const rid = resumeId.value;
  return allCh.value.map((ch) => ({
    id: ch.id,
    state: ch.id === rid ? "active" : ch.status === "done" ? "done" : "open",
  }));
});

const summaryStrip = computed(() => {
  const totalCh = allCh.value.length;
  const doneCh = allCh.value.filter((c) => c.status === "done").length;
  const cur = resumeCh.value?.num;
  return `${totalCh} chapter${totalCh === 1 ? "" : "s"} · ${doneCh} done${cur ? ` · centred on ${cur}` : ""}`;
});

// Centre the active card on mount (and again on the next frame after layout settles).
onMounted(async () => {
  await nextTick();
  const rail = railEl.value;
  if (!rail) return;
  const active = rail.querySelector('[data-active="true"]');
  if (!active) return;
  const target = active.offsetLeft - rail.clientWidth / 2 + active.clientWidth / 2;
  rail.scrollTo({ left: Math.max(0, target), behavior: "auto" });
});

const todayLabel = computed(() =>
  new Date().toLocaleDateString(undefined, {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  }),
);

const gapTail = computed(() => {
  const gap = lastSessionGap.value;
  if (!gap) return "Your first session awaits.";
  if (gap === "today") return "You've already written today.";
  const c = gap.charAt(0).toUpperCase() + gap.slice(1);
  return `${c} since your last session.`;
});

const formLine = computed(() => {
  const parts = [];
  if (P.genre) parts.push(P.genre);
  if (P.subtitle) parts.push(P.subtitle);
  return parts.join(" · ") || "manuscript in progress";
});
</script>

<template>
  <header class="pane-header shelf-pane-header">
    <div class="pane-title">
      <span class="pane-eyebrow">{{ $t("homeShelf.eyebrow") }}</span>
      <input
        class="shelf-title-input"
        :value="P.title"
        :placeholder="$t('homeShelf.titlePlaceholder')"
        @input="project.updateProjectMeta({ title: $event.target.value })"
      />
    </div>
    <div class="pane-actions">
      <router-link to="/import" custom v-slot="{ navigate }">
        <UiButton intent="ghost" @click="navigate"><Icon name="Plus" :size="14" /> {{ $t("homeShelf.import") }}</UiButton>
      </router-link>
      <UiButton intent="primary" @click="nav.quickWrite()"><Icon name="Plus" :size="14" /> {{ $t("homeShelf.quickWrite") }}</UiButton>
    </div>
  </header>

  <div class="pane-card shelf-card">
    <div class="shelf-wrap">
      <section class="shelf">
        <header class="shelf-head">
          <p class="vol">
            <span class="vol-num">{{ $t("homeShelf.volNum") }}</span><span>{{ $t("homeShelf.volLabel") }}</span>
            <span class="vol-sep">·</span><span>{{ chRange }}</span>
            <template v-if="centredLabel">
              <span class="vol-sep">·</span><span class="vol-centred">{{ centredLabel }}</span>
            </template>
          </p>
          <h1 class="shelf-h1">{{ $t("homeShelf.heading") }}</h1>
          <p class="shelf-sub">
            {{ $t("homeShelf.sub") }}
          </p>
        </header>

        <div class="rail-outer">
          <div class="rail" ref="railEl">
            <article
              v-for="ch in allCh"
              :key="ch.id"
              class="paper"
              :class="['kind-' + kindFor(ch.status), { active: ch.id === resumeId }]"
              :data-active="ch.id === resumeId ? 'true' : 'false'"
              @click="openChapter(ch)"
            >
              <div class="paper-top">
                <span class="ch-num">
                  <em v-if="ch.id === resumeId">{{ pad(ch.num) }}</em>
                  <template v-else>{{ pad(ch.num) }}</template>
                </span>
                <span class="ch-meta">
                  <span class="dot" :class="'dot-' + kindFor(ch.status)" />
                  {{ statusLabelFor(ch) }}
                </span>
              </div>
              <h2 class="ch-title">
                <em v-if="ch.id === resumeId">{{ ch.title || "Untitled" }}</em>
                <template v-else>{{ ch.title || "Untitled" }}</template>
              </h2>
              <p v-if="openersByChapter.get(ch.id)" class="ch-opener">{{ openersByChapter.get(ch.id) }}</p>
              <p v-else class="ch-opener ch-opener-empty">{{ $t("homeShelf.blankPage") }}</p>
              <div class="ch-foot">
                <span>
                  {{ $t("homeShelf.wordsShort", { n: (ch.words || 0).toLocaleString() }) }}<span v-if="ch.id === resumeId && lastSessionGap"> · {{ lastSessionGap }}</span>
                </span>
                <span v-if="ch.id === resumeId" class="resume-tap" @click.stop="resume">{{ $t("homeShelf.resume") }}</span>
                <span v-else-if="ch.partTitle" class="part-hint">{{ ch.partTitle }}</span>
                <span v-else class="part-hint">—</span>
              </div>
            </article>

            <article v-if="!allCh.length" class="paper kind-todo empty-shelf">
              <div class="paper-top">
                <span class="ch-num">—</span>
                <span class="ch-meta"><span class="dot dot-todo" />{{ $t("homeShelf.emptyShelf") }}</span>
              </div>
              <h2 class="ch-title">{{ $t("homeShelf.noChapters") }}</h2>
              <p class="ch-opener">{{ $t("homeShelf.noChaptersHint") }}</p>
              <div class="ch-foot"><span>{{ $t("homeShelf.wordsShort", { n: 0 }) }}</span><span class="part-hint">—</span></div>
            </article>
          </div>
        </div>

        <div v-if="axisTicks.length" class="axis" aria-hidden="true">
          <span v-for="(t, i) in axisTicks" :key="i" class="tick" :class="t.state" />
          <span class="axis-label">{{ summaryStrip }}</span>
        </div>
      </section>

      <aside class="colophon">
        <div class="col-mast">
          <p class="col-label">{{ $t("homeShelf.thisVolume") }}</p>
          <p class="col-name">{{ P.title || $t("homeShelf.titlePlaceholder") }}</p>
          <p class="col-form">{{ formLine }}</p>
        </div>

        <dl class="col-row">
          <dt>{{ $t("homeShelf.progress") }}</dt>
          <dd>
            {{ totalWords.toLocaleString() }} <span class="of">{{ $t("homeShelf.progressOf", { goal: (P.wordsGoal || 0).toLocaleString() }) }}</span>
            <small>{{ $t("homeShelf.pctOfTarget", { pct }) }}</small>
          </dd>
        </dl>
        <hr class="col-rule" />

        <dl class="col-row">
          <dt>{{ $t("homeShelf.thisWeek") }}</dt>
          <dd>
            {{ daysWrittenThisWeek.length }} <span class="of">{{ $t("homeShelf.ofDays", { n: 7 }) }}</span>
            <small>{{ weeklyDayList }}</small>
          </dd>
        </dl>
        <hr class="col-rule" />

        <dl class="col-row">
          <dt>{{ $t("homeShelf.cadence") }}</dt>
          <dd>
            {{ totals14.avg.toLocaleString() }} <span class="of">{{ $t("homeShelf.wordsPerDay", { n: 14 }) }}</span>
            <small v-if="cadenceDelta !== null">
              {{ $t("homeShelf.cadenceDelta", { arrow: cadenceDelta >= 0 ? "↑" : "↓", pct: Math.abs(cadenceDelta) }) }}
            </small>
            <small v-else>—</small>
          </dd>
        </dl>
        <hr class="col-rule" />

        <dl class="col-row">
          <dt>{{ $t("homeShelf.strongest") }}</dt>
          <dd>
            {{ bestDow }}
            <small v-if="bestDowAvg">{{ $t("homeShelf.averageWords", { n: bestDowAvg.toLocaleString() }) }}</small>
            <small v-else>{{ $t("homeShelf.noPatterns") }}</small>
          </dd>
        </dl>
        <hr class="col-rule" />

        <dl class="col-row">
          <dt>{{ $t("homeShelf.pending") }}</dt>
          <dd>
            <router-link to="/markers" class="col-pending-link">
              {{ pendingCount }} <span class="of">{{ $t("count.flagNoun", pendingCount) }}</span>
            </router-link>
            <small>{{ $t("homeShelf.openMarkerPins") }}</small>
          </dd>
        </dl>

        <p class="col-tail">
          {{ $t("homeShelf.colophon") }}
          <span class="when">{{ todayLabel }} · {{ gapTail }}</span>
        </p>
      </aside>
    </div>
  </div>
</template>

<style scoped>
/* Header — mirrors HomeView's editable serif title so the chrome reads
   identically across Home variants. */
.shelf-pane-header .pane-title { gap: 2px; }
.shelf-title-input {
  appearance: none;
  font-family: var(--font-serif);
  font-size: 20px; font-weight: 600;
  letter-spacing: -0.015em;
  color: var(--ink);
  border: 1px solid transparent;
  background: transparent;
  border-radius: 6px;
  padding: 2px 6px;
  margin-left: -6px;
  outline: none;
  min-width: 0;
}
.shelf-title-input:hover { border-color: var(--border-soft); }
.shelf-title-input:focus { border-color: var(--accent); background: var(--surface); box-shadow: 0 0 0 3px var(--accent-soft); }

/* Shelf card — let the inner shelf-wrap drive its own layout. */
.shelf-card { padding: 0; overflow: hidden; }

.shelf-wrap {
  flex: 1;
  display: grid;
  grid-template-columns: 1fr 280px;
  min-height: 0;
}
@media (max-width: 1100px) {
  .shelf-wrap { grid-template-columns: 1fr; }
  .colophon { border-left: 0 !important; border-top: 1px solid var(--border); }
}

.shelf {
  display: grid;
  grid-template-rows: auto 1fr auto;
  min-width: 0; min-height: 0;
  padding: clamp(2rem, 4vw, 3.2rem) 0 1rem clamp(2rem, 4vw, 3rem);
}
.shelf-head { max-width: 52rem; margin: 0 1.5rem 1.6rem 0; }

.vol {
  font-family: var(--font-mono); font-size: 11px;
  letter-spacing: 0.24em; text-transform: uppercase;
  color: var(--muted); margin: 0 0 1rem;
  display: flex; align-items: baseline; gap: 0.7rem; flex-wrap: wrap;
}
.vol-num {
  font-family: var(--font-serif); font-style: italic;
  font-size: 14px; letter-spacing: 0.04em; text-transform: none;
  color: var(--accent); font-variation-settings: "SOFT" 70, "WONK" 1;
}
.vol-sep { color: var(--subtle); }
.vol-centred {
  font-family: var(--font-serif); font-style: italic;
  font-size: 13px; letter-spacing: 0.02em; text-transform: none;
  color: var(--ink-2);
}

.shelf-h1 {
  font-family: var(--font-serif); font-weight: 400;
  font-size: clamp(1.6rem, 2.8vw, 2.2rem); line-height: 1.05;
  letter-spacing: -0.022em; color: var(--ink); margin: 0;
}
.shelf-sub {
  font-family: var(--font-serif); font-style: italic; font-size: 0.95rem;
  color: var(--muted); margin: 0.55rem 0 0;
}

/* Horizontal rail with snap centring. */
.rail-outer { position: relative; min-height: 0; display: flex; align-items: center; }
.rail {
  display: flex; gap: 1.1rem; align-items: flex-end;
  overflow-x: auto; overflow-y: hidden;
  scroll-snap-type: x mandatory;
  padding: 1rem 3rem 1.4rem 0;
  scrollbar-width: none;
}
.rail::-webkit-scrollbar { display: none; }
.rail-outer::after {
  content: ""; position: absolute; top: 0; right: 0; bottom: 0;
  width: 4rem; pointer-events: none;
  background: linear-gradient(to right, transparent, var(--surface));
}

.paper {
  flex: 0 0 auto;
  width: 240px;
  min-height: 280px;
  background: var(--paper);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 1.1rem 1.15rem;
  display: grid; grid-template-rows: auto auto 1fr auto;
  gap: 0.55rem;
  scroll-snap-align: center;
  cursor: pointer;
  transition: transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;
  position: relative;
}
.paper:hover { border-color: var(--border-strong); transform: translateY(-2px); }
.paper.kind-todo   { min-height: 220px; }
.paper.kind-draft  { min-height: 320px; }
.paper.kind-revise { min-height: 300px; }
.paper.kind-done   { min-height: 240px; background: var(--surface-3); }
.paper.empty-shelf { width: 320px; }

.paper.active {
  border-radius: 14px;
  border-color: var(--gold);
  box-shadow: inset 0 0 0 1px var(--gold-soft);
  transform: translateY(-6px);
}
.paper.active:hover { transform: translateY(-8px); }

.paper-top {
  display: flex; justify-content: space-between; align-items: baseline;
  gap: 0.6rem;
}
.ch-num {
  font-family: var(--font-serif); font-style: italic;
  font-size: 1.55rem; line-height: 1; color: var(--accent);
  font-variant-numeric: tabular-nums;
  font-variation-settings: "SOFT" 70, "WONK" 1;
}
.paper.kind-todo .ch-num,
.paper.kind-done .ch-num { color: var(--ink-2); }

.ch-meta {
  font-family: var(--font-mono); font-size: 10px;
  letter-spacing: 0.18em; text-transform: uppercase;
  color: var(--muted);
  display: inline-flex; align-items: center; gap: 0.4rem;
  white-space: nowrap;
}
.ch-meta .dot {
  width: 7px; height: 7px; border-radius: 2px;
  background: var(--status-todo);
}
.ch-meta .dot-draft  { background: var(--status-draft); }
.ch-meta .dot-revise { background: var(--status-revise); }
.ch-meta .dot-done   { background: var(--status-done); }

.ch-title {
  font-family: var(--font-serif); font-weight: 500;
  font-size: 1.05rem; line-height: 1.2; color: var(--ink);
  margin: 0;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
  overflow: hidden;
}
.ch-title em { font-style: italic; color: var(--accent); font-variation-settings: "SOFT" 70, "WONK" 1; }

.ch-opener {
  font-family: var(--font-serif); font-style: italic;
  font-size: 0.92rem; line-height: 1.5;
  color: var(--ink-2);
  margin: 0;
  overflow: hidden;
  display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical;
}
.paper.kind-todo .ch-opener:not(.ch-opener-empty) {
  color: var(--subtle);
  font-style: normal;
  font-family: var(--font-ui);
  font-size: 0.85rem;
}
.ch-opener-empty { color: var(--muted); }

.ch-foot {
  font-family: var(--font-mono); font-size: 10px;
  letter-spacing: 0.06em; color: var(--muted);
  font-variant-numeric: tabular-nums;
  padding-top: 0.55rem; border-top: 1px solid var(--border-soft);
  display: flex; justify-content: space-between; align-items: center;
  gap: 0.5rem;
}
.paper.active .ch-foot { color: var(--accent-ink); border-top-color: var(--accent-line); }
.resume-tap {
  font-family: var(--font-mono); font-size: 10px;
  letter-spacing: 0.18em; text-transform: uppercase;
  color: var(--gold); cursor: pointer;
}
.resume-tap::after { content: " →"; }
.resume-tap:hover { color: var(--accent); }
.part-hint {
  font-family: var(--font-mono); font-size: 9.5px;
  letter-spacing: 0.06em; color: var(--subtle);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  max-width: 11ch;
}

/* Axis below the rail */
.axis {
  margin-top: 0.4rem;
  padding-right: 3rem;
  display: flex; gap: 0; align-items: center;
  font-family: var(--font-mono); font-size: 10px;
  letter-spacing: 0.18em; text-transform: uppercase;
  color: var(--subtle);
  border-top: 1px solid var(--border);
  padding-top: 0.7rem;
}
.axis .tick {
  width: 8px; height: 8px;
  border-radius: 50%;
  background: transparent;
  border: 1px solid var(--border-strong);
  margin-right: 0.45rem;
}
.axis .tick.done { background: var(--ink-2); border-color: var(--ink-2); }
.axis .tick.active { background: var(--gold); border-color: var(--gold); width: 10px; height: 10px; }
.axis .axis-label { margin-left: auto; color: var(--muted); }

/* Colophon — newspaper masthead column. */
.colophon {
  border-left: 1px solid var(--border);
  background: var(--surface);
  padding: clamp(2rem, 4vw, 3.2rem) clamp(1.5rem, 2.4vw, 2rem);
  display: flex; flex-direction: column; gap: 1.6rem;
  overflow-y: auto;
}
.col-mast {
  padding-bottom: 1.2rem;
  border-bottom: 2px solid var(--ink);
}
.col-label {
  font-family: var(--font-mono); font-size: 10px;
  letter-spacing: 0.28em; text-transform: uppercase;
  color: var(--muted); margin: 0 0 0.6rem;
}
.col-name {
  font-family: var(--font-serif); font-weight: 400;
  font-size: 1.35rem; line-height: 1.1; letter-spacing: -0.01em;
  color: var(--ink); margin: 0;
}
.col-form {
  font-family: var(--font-serif); font-style: italic;
  font-size: 13px; color: var(--muted); margin: 0.4rem 0 0;
}
.col-row { display: grid; grid-template-columns: 1fr; gap: 0.3rem; }
.col-row dt {
  font-family: var(--font-mono); font-size: 10px;
  letter-spacing: 0.22em; text-transform: uppercase;
  color: var(--muted);
}
.col-row dd {
  font-family: var(--font-serif);
  font-size: 1.15rem; line-height: 1.25;
  color: var(--ink); margin: 0;
  font-variant-numeric: tabular-nums;
}
.col-row dd small {
  font-family: var(--font-mono); font-size: 10px;
  letter-spacing: 0.06em; color: var(--muted);
  display: block; margin-top: 0.15rem;
}
.col-row dd .of {
  font-family: var(--font-serif); font-style: italic;
  color: var(--muted); font-size: 0.95rem;
}
.col-pending-link { color: inherit; text-decoration: none; }
.col-pending-link:hover { color: var(--accent); }

.col-rule { border: 0; border-top: 1px solid var(--border-soft); margin: 0; }

.col-tail {
  margin-top: auto;
  font-family: var(--font-mono); font-size: 10px;
  letter-spacing: 0.2em; text-transform: uppercase;
  color: var(--subtle);
  padding-top: 1rem; border-top: 1px solid var(--border-soft);
}
.col-tail .when {
  font-family: var(--font-serif); font-style: italic;
  letter-spacing: 0.01em; text-transform: none;
  color: var(--muted); display: block; margin-top: 0.3rem;
  font-size: 12px;
}
</style>
