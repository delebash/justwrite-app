<script setup>
import { computed, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { useProjectStore } from "../stores/project.js";
import { useUiStore } from "../stores/ui.js";
import { useSessionsStore, DOW_LABELS_MONDAY_FIRST, reorderForMonday } from "../stores/sessions.js";
import { useAiStore } from "../stores/ai.js";
import { useAiTasksStore } from "../stores/aiTasks.js";
import { generateResumeBriefing, buildBriefingContext } from "../services/resumeBriefing.js";
import { Icon } from "@delebash/llm-ui";
import AiTaskStrip from "../components/AiTaskStrip.vue";
import AiFeatureChip from "../components/AiFeatureChip.vue";
import { UiButton } from "@delebash/llm-ui";
import SessionRecapModal from "../components/SessionRecapModal.vue";
import { HelpTrigger } from "@delebash/llm-ui";

const router = useRouter();
const project = useProjectStore();
const ui = useUiStore();
const sessions = useSessionsStore();
const ai = useAiStore();
const aiTasks = useAiTasksStore();
const P = project.project;

// Local copy of sessions.js's todayKey shape (yyyy-mm-dd, local time).
// Re-implemented here rather than exported because exporting from a
// Pinia store module entry-point would force a hot-reload edge case.
function todayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const allCh = computed(() => project.allChapters);

// Live word total — derived from chapter sums, so it reflects edits.
const totalWords = computed(() => allCh.value.reduce((s, c) => s + (c.words || 0), 0));
const pct = computed(() => Math.round((totalWords.value / (P.wordsGoal || 1)) * 100));

// "Today" — open the chapter written in today; otherwise resume the
// last-open chapter, falling back to the chapter list.
function goToday() {
  const id = sessions.todayChapterId || ui.selections.chapters;
  router.push(id ? `/chapters/${id}` : "/chapters");
}

const done   = computed(() => allCh.value.filter((c) => c.status === "done").length);
const draft  = computed(() => allCh.value.filter((c) => c.status === "draft").length);
const revise = computed(() => allCh.value.filter((c) => c.status === "revise").length);
const todo   = computed(() => allCh.value.filter((c) => c.status === "todo").length);

// 14-day session series + sparkline geometry.
const history14 = computed(() => sessions.historyFor(14));
const totals14  = computed(() => sessions.totalsBy(14));

const sparkPts = computed(() => {
  const vals = history14.value.map((d) => d.words);
  const max = Math.max(...vals, 1);
  const w = 100, h = 64;
  const step = w / Math.max(1, vals.length - 1);
  const pts = vals.map((v, i) => `${i * step},${h - (v / max) * (h - 6) - 3}`).join(" ");
  return { pts, area: `0,${h} ${pts} ${w},${h}` };
});

// Day-of-week averages — sessions returns Sun-first, we re-order to Mon-first.
const dowAvg = computed(() => reorderForMonday(sessions.averageByDow()));
const dowMax = computed(() => Math.max(...dowAvg.value, 1));

// Streak heatmap — last 14 days as booleans.
const streakSquares = computed(() => history14.value.map((d) => d.words > 0));

// ── Goal ring geometry ───────────────────────────────────
const RING_C = 2 * Math.PI * 74;   // circumference of the r=74 progress ring
const ringDashoffset = computed(() => {
  const p = Math.min(100, Math.max(0, pct.value));
  return RING_C * (1 - p / 100);
});

// ── Resume — "pick up where you left off" ────────────────
// Same target the Today button resolves: the chapter written in today,
// else the last-selected chapter, else the first chapter.
const resumeId = computed(() => sessions.todayChapterId || ui.selections.chapters || allCh.value[0]?.id);
const resumeCh = computed(() => (resumeId.value ? project.chapterById(resumeId.value) : null));
const resumeFirstScene = computed(() => (resumeId.value ? project.scenesFor(resumeId.value)[0] : null) || null);
const resumedToday = computed(() => !!sessions.todayChapterId && sessions.todayChapterId === resumeId.value);
const resumeStatus = computed(() => {
  const s = resumeCh.value ? project.statusById(resumeCh.value.status) : null;
  return s ? { label: s.label, color: s.color } : null;
});

// First real paragraph of the chapter, as a teaser (skip scene markers).
function firstParagraph(html) {
  if (!html) return "";
  const div = document.createElement("div");
  div.innerHTML = html;
  for (const p of div.querySelectorAll("p")) {
    if (p.classList.contains("scene-mark")) continue;
    const t = p.textContent.trim();
    if (t) return t.length > 240 ? `${t.slice(0, 240).trim()}…` : t;
  }
  const t = (div.textContent || "").trim();
  return t.length > 240 ? `${t.slice(0, 240).trim()}…` : t;
}
const resumeTeaser = computed(() => firstParagraph(project.chapterBody[resumeId.value]));

function resume() {
  if (!resumeCh.value) { router.push("/chapters"); return; }
  ui.select("chapters", resumeCh.value.id);
  const sid = resumeFirstScene.value?.id;
  router.push(sid ? `/chapters/${resumeCh.value.id}/${sid}` : `/chapters/${resumeCh.value.id}`);
}

// ── "Previously on your novel" briefing ──────────────────
// Auto-generates on Home mount when the writer returns to the app
// after a gap. Cache lives in ui.briefingCache and is keyed by date;
// same-day reloads reuse the cached prose. Dismissal is per-day so the
// card stays hidden until tomorrow.

const briefingTask = computed(() => aiTasks.runningTasks.find((t) => t.feature === "briefing"));
const briefingRunning = computed(() => !!briefingTask.value);
function isAbort(e) { return e?.name === "AbortError" || /abort/i.test(e?.message || ""); }
const briefingError = ref(null);

// Quick eligibility check that mirrors what the service does — without
// running it, so the card can decide whether to show at all.
const briefingContext = computed(() =>
  buildBriefingContext({ project, sessions }),
);
const briefingEligible = computed(() => briefingContext.value.meta?.eligible === true);

const briefingDismissedToday = computed(
  () => ui.briefingDismissedOn === todayKey(),
);

// Cache is valid only if it matches today AND the chapter the writer
// most recently touched. If they wrote in a different chapter since,
// regenerate.
const briefingCacheValid = computed(() => {
  const c = ui.briefingCache;
  if (!c) return false;
  if (c.day !== todayKey()) return false;
  if (c.chapterId && sessions.lastWrite?.chapterId &&
      c.chapterId !== sessions.lastWrite.chapterId) return false;
  return true;
});

const briefingVisible = computed(() => {
  if (briefingDismissedToday.value) return false;
  if (!briefingEligible.value && !briefingCacheValid.value) return false;
  return true;
});

const briefingText = computed(() => {
  if (briefingRunning.value) return briefingTask.value?.preview || "";
  if (briefingCacheValid.value) return ui.briefingCache?.text || "";
  return "";
});

// Meta line under the eyebrow — "3 days ago · Chapter 7 — The rooftop".
const briefingMetaLine = computed(() => {
  const c = ui.briefingCache;
  const live = briefingContext.value.meta;
  const gap = c?.gapLabel || live?.gapLabel || "";
  const num = c?.chapterNum ?? live?.lastChapter?.num;
  const title = c?.chapterTitle ?? live?.lastChapter?.title;
  const chapterPart = num != null ? `Chapter ${num}${title ? ` — ${title}` : ""}` : "";
  return [gap, chapterPart].filter(Boolean).join(" · ");
});

const briefingChapterId = computed(
  () => ui.briefingCache?.chapterId || briefingContext.value.meta?.lastChapter?.id || null,
);

async function runBriefing() {
  if (!briefingEligible.value) return;
  if (briefingRunning.value) return;
  briefingError.value = null;
  try {
    const result = await generateResumeBriefing({
      project, sessions,
      task: { label: "Previously on your novel", meta: {} },
    });
    ui.setBriefing({
      day: todayKey(),
      chapterId: result.chapterId,
      chapterNum: result.chapterNum,
      chapterTitle: result.chapterTitle,
      text: result.text,
      gapLabel: result.gapLabel,
      daysSince: result.daysSince,
      generatedAt: result.generatedAt,
      model: result.model,
      providerId: result.providerId,
    });
  } catch (err) {
    if (!isAbort(err)) {
      const msg = String(err?.message || err || "");
      briefingError.value =
        /provider|api key|configure/i.test(msg)
          ? "Configure an AI provider in Settings → AI to generate this briefing."
          : msg || "Couldn't generate briefing.";
    }
  }
}

function regenerateBriefing() {
  ui.clearBriefing();
  briefingError.value = null;
  runBriefing();
}

function dismissBriefing() {
  if (briefingTask.value) aiTasks.cancel(briefingTask.value.id);
  ui.dismissBriefing(todayKey());
}

function jumpToLastChapter() {
  const id = briefingChapterId.value;
  if (!id) return;
  const sid = project.scenesFor(id)?.[0]?.id;
  ui.select("chapters", id);
  router.push(sid ? `/chapters/${id}/${sid}` : `/chapters/${id}`);
}

// Kick off on mount if there's nothing valid cached. Avoid running when
// no AI provider is configured — surface that as the error state if the
// user manually retries.
onMounted(() => {
  if (!briefingVisible.value) return;
  if (briefingCacheValid.value) return;
  if (!briefingEligible.value) return;
  if (!ai.providerForFeature("briefing")) {
    briefingError.value = "Configure an AI provider in Settings → AI to generate this briefing.";
    return;
  }
  runBriefing();
});



// ── End-of-session recap modal ───────────────────────────
const recapOpen = ref(false);
function openRecap() { recapOpen.value = true; }
function closeRecap() { recapOpen.value = false; }
// Eligible to wrap up when SOMETHING was written today. Without that
// the recap has no material to work with.
const canWrapUp = computed(() => sessions.todayWords > 0 || !!sessions.todayChapterId);
const hasTodayRecap = computed(() => !!project.getDailyRecap(todayKey()));

// ── Cadence (day-of-week) peak + strand chapter counts ───
const FULL_DOW = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const bestDowIdx = computed(() => {
  const m = Math.max(...dowAvg.value);
  return m > 0 ? dowAvg.value.indexOf(m) : -1;
});
const bestDow = computed(() => (bestDowIdx.value >= 0 ? FULL_DOW[bestDowIdx.value] : "—"));
const bestDowAvg = computed(() => (bestDowIdx.value >= 0 ? dowAvg.value[bestDowIdx.value] : 0));
const strandCount = (id) => allCh.value.filter((c) => (c.strands || []).includes(id)).length;
</script>

<template>
  <header class="pane-header home-pane-header">
    <div class="pane-title">
      <span class="pane-eyebrow">Manuscript</span>
      <input class="home-title"
        :value="P.title"
        placeholder="Untitled manuscript"
        @input="project.updateProjectMeta({ title: $event.target.value })" />
    </div>
    <div class="pane-actions">
      <UiButton intent="ghost" @click="goToday"><Icon name="Calendar" :size="14" /> Today</UiButton>
      <router-link to="/import" custom v-slot="{ navigate }">
        <UiButton intent="ghost" @click="navigate"><Icon name="Plus" :size="14" /> Import manuscript</UiButton>
      </router-link>
      <router-link to="/chapters" custom v-slot="{ navigate }">
        <UiButton intent="primary" @click="navigate"><Icon name="Plus" :size="14" /> Quick write</UiButton>
      </router-link>
    </div>
    <HelpTrigger slug="writing#home" label="Home" class="pane-help" />
  </header>

  <div class="pane-card">
  <div class="scrollarea">
    <div class="card-grid home-card-grid" style="gap:16px">

      <p class="home-desc" style="grid-column:1/-1">
        <strong>Home</strong> is your daily landing surface — recent activity, your streak and pace,
        progress toward your goal, and a one-click <strong>Resume writing</strong> card that jumps
        you back into the chapter you last touched. If you have an AI provider configured, the
        <strong>Previously on your novel</strong> card hands you a fresh re-orientation paragraph
        when you return after a break.
      </p>

      <!-- Hero -->
      <div class="card hero-card" style="grid-column:1/-1">
        <div class="hero-main">
          <div class="hero-text">
            <div class="t-eyebrow">{{ P.genre || 'Manuscript' }}</div>
            <div v-if="P.subtitle" class="hero-sub">{{ P.subtitle }}</div>
            <p class="hero-premise">{{ P.premise }}</p>
          </div>
          <div class="goal-ring">
            <div class="ring-disc">
              <svg width="168" height="168" viewBox="0 0 168 168">
                <circle cx="84" cy="84" r="74" fill="none" stroke="var(--surface-3)" stroke-width="11" />
                <circle cx="84" cy="84" r="74" fill="none" stroke="var(--accent)" stroke-width="11"
                  stroke-linecap="round" :stroke-dasharray="RING_C" :stroke-dashoffset="ringDashoffset" />
                <circle cx="84" cy="84" r="74" fill="none" stroke="var(--gold)" stroke-width="3" opacity="0.5" stroke-dasharray="2 8" />
              </svg>
              <div class="ring-label">
                <div class="ring-pct">{{ pct }}%</div>
                <div class="ring-sub">of goal</div>
              </div>
            </div>
            <div class="ring-words"><b>{{ totalWords.toLocaleString() }}</b> / {{ P.wordsGoal.toLocaleString() }} words</div>
          </div>
        </div>

        <div style="margin-top:18px">
          <div style="height:8px;border-radius:999px;background:var(--surface-3);overflow:hidden;display:flex">
            <span :style="`width:${(done / Math.max(1, allCh.length)) * 100}%;background:var(--status-done)`" />
            <span :style="`width:${(revise / Math.max(1, allCh.length)) * 100}%;background:var(--status-revise)`" />
            <span :style="`width:${(draft / Math.max(1, allCh.length)) * 100}%;background:var(--status-draft)`" />
          </div>
          <div style="display:flex;gap:14px;margin-top:8px;font-size:11.5px;color:var(--muted)">
            <span><i style="display:inline-block;width:8px;height:8px;border-radius:2px;background:var(--status-done);margin-right:5px" />Done · {{ done }}</span>
            <span><i style="display:inline-block;width:8px;height:8px;border-radius:2px;background:var(--status-revise);margin-right:5px" />Revise · {{ revise }}</span>
            <span><i style="display:inline-block;width:8px;height:8px;border-radius:2px;background:var(--status-draft);margin-right:5px" />Draft · {{ draft }}</span>
            <span><i style="display:inline-block;width:8px;height:8px;border-radius:2px;background:var(--status-todo);margin-right:5px" />To do · {{ todo }}</span>
            <router-link to="/settings/project" class="deadline-link" style="margin-left:auto"
              v-tooltip.bottom="'Change deadline in Project settings'">Deadline {{ P.deadline }}</router-link>
          </div>
        </div>
      </div>

      <!-- Resume -->
      <div v-if="resumeCh" class="card resume-card" style="grid-column:1/-1">
        <div class="resume-body">
          <div class="resume-lab">Pick up where you left off</div>
          <h3 class="resume-h">
            <span class="resume-part">{{ resumeCh.partTitle }} ·</span>
            <span class="resume-ch">Chapter {{ resumeCh.num }} — {{ resumeCh.title }}</span>
          </h3>
          <p v-if="resumeTeaser" class="resume-quote">{{ resumeTeaser }}</p>
          <p v-else class="resume-quote resume-empty">A blank page, waiting.</p>
          <div class="resume-sub">
            <span><b>{{ (resumeCh.words || 0).toLocaleString() }}</b> words</span>
            <span class="dot-sep">·</span>
            <span><b>{{ resumeCh.scenes }}</b> scene{{ resumeCh.scenes === 1 ? '' : 's' }}</span>
            <template v-if="resumeStatus">
              <span class="dot-sep">·</span>
              <span :style="{ color: resumeStatus.color }">{{ resumeStatus.label }}</span>
            </template>
            <template v-if="resumedToday">
              <span class="dot-sep">·</span>
              <span class="resume-today">Today's chapter</span>
            </template>
          </div>
        </div>
        <div class="resume-cta">
          <UiButton intent="accent2" @click="resume"><Icon name="Play" :size="14" :fill="true" /> Resume writing</UiButton>
        </div>
      </div>

      <!-- Previously on your novel — resume briefing -->
      <div v-if="briefingVisible" class="card briefing-card" style="grid-column:1/-1">
        <div class="briefing-head">
          <div class="briefing-eyebrow">Previously on your novel</div>
          <AiFeatureChip feature="briefing" label="Briefing" />
          <button class="briefing-x" v-tooltip.bottom="'Hide until tomorrow'"
                  @click="dismissBriefing" aria-label="Dismiss briefing">
            <Icon name="Close" :size="14" />
          </button>
        </div>
        <div v-if="briefingMetaLine" class="briefing-meta">
          <button v-if="briefingChapterId" class="briefing-jump" @click="jumpToLastChapter"
                  v-tooltip.bottom="'Open this chapter'">{{ briefingMetaLine }}</button>
          <span v-else>{{ briefingMetaLine }}</span>
        </div>

        <div v-if="briefingError" class="briefing-error">
          <Icon name="Alert" :size="14" />
          <span>{{ briefingError }}</span>
          <UiButton intent="ghost" size="small" @click="runBriefing">
            <Icon name="Refresh" :size="12" /> Retry
          </UiButton>
        </div>

        <p v-else-if="briefingText" class="briefing-body">{{ briefingText }}</p>

        <AiTaskStrip v-else-if="briefingRunning" :task="briefingTask" />

        <div class="briefing-foot">
          <span v-if="ui.briefingCache?.model" class="briefing-model">
            via {{ ui.briefingCache.model }}
          </span>
          <span class="briefing-foot-actions">
            <UiButton intent="ghost" size="small"
                      :disabled="briefingRunning"
                      @click="regenerateBriefing"
                      v-tooltip.bottom="'Generate a fresh briefing'">
              <Icon name="Refresh" :size="12" /> Regenerate
            </UiButton>
          </span>
        </div>
      </div>

      <!-- Today's session -->
      <div class="card">
        <div class="gcard-h">Today's session <span class="tag">live</span></div>
        <div class="gstat">{{ sessions.todayWords.toLocaleString() }}<small>words</small></div>
        <div class="gkv">
          <span class="k">Streak</span><span class="v">{{ sessions.streak }} day{{ sessions.streak === 1 ? '' : 's' }}</span>
          <span class="k">This fortnight</span><span class="v">{{ totals14.total.toLocaleString() }}</span>
          <span class="k">Avg / day</span><span class="v">{{ totals14.avg.toLocaleString() }}</span>
        </div>
        <div class="gticks">
          <i v-for="(active, i) in streakSquares" :key="i" :class="{ on: active }" v-tooltip.bottom="history14[i].date" />
        </div>
        <div class="gticks-cap">{{ streakSquares.filter(Boolean).length }} of 14 days written</div>
        <div class="gtoday-foot">
          <UiButton intent="ghost" size="small"
                    :disabled="!canWrapUp"
                    @click="openRecap"
                    v-tooltip.bottom="canWrapUp ? 'Generate an AI recap of what you wrote today and pin any open threads' : 'Write something today to enable a recap'">
            <Icon name="Sparkle" :size="12" />
            {{ hasTodayRecap ? "View today's recap" : "Wrap up session" }}
          </UiButton>
        </div>
      </div>

      <!-- The fortnight -->
      <div class="card">
        <div class="gcard-h">The fortnight</div>
        <svg class="gspark" viewBox="0 0 100 62" preserveAspectRatio="none">
          <defs>
            <linearGradient id="homeSpark" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stop-color="var(--accent)" stop-opacity="0.28" />
              <stop offset="1" stop-color="var(--accent)" stop-opacity="0" />
            </linearGradient>
          </defs>
          <polygon :points="sparkPts.area" fill="url(#homeSpark)" />
          <polyline :points="sparkPts.pts" fill="none" stroke="var(--accent)" stroke-width="1.6" vector-effect="non-scaling-stroke" />
        </svg>
        <div class="gkv">
          <span class="k">Total</span><span class="v">{{ totals14.total.toLocaleString() }} words</span>
          <span class="k">Avg / day</span><span class="v">{{ totals14.avg.toLocaleString() }}</span>
          <span class="k">Peak day</span><span class="v">{{ totals14.peak.toLocaleString() }}</span>
        </div>
      </div>

      <!-- Cadence -->
      <div class="card">
        <div class="gcard-h">Cadence</div>
        <div class="gdow-bars">
          <div v-for="(v, i) in dowAvg" :key="i"
            class="gdow-bar" :class="{ peak: i === bestDowIdx }"
            :style="`height:${Math.max(3, (v / dowMax) * 100)}%`" />
        </div>
        <div class="gdow-lbls">
          <span v-for="(d, i) in DOW_LABELS_MONDAY_FIRST" :key="i" class="lbl">{{ d }}</span>
        </div>
        <div class="gkv" style="margin-top:16px">
          <span class="k">Best day</span><span class="v">{{ bestDow }}</span>
          <span class="k">Most words</span><span class="v">avg {{ bestDowAvg.toLocaleString() }}</span>
        </div>
        <div v-if="totals14.total === 0" class="t-muted" style="font-size:11px;margin-top:10px;font-style:italic">
          Start writing to see your patterns.
        </div>
      </div>

      <!-- Narrative strands -->
      <div class="card" style="grid-column:1/-1">
        <div class="gcard-h">Narrative strands</div>
        <div class="gthreads">
          <div v-for="s in project.strands" :key="s.id" class="gthread" :style="{ color: s.color }">
            <span class="nm"><span class="dot" :style="{ background: s.color }" /><span class="nm-label">{{ s.name }}</span></span>
            <span class="track"><span class="fill" :style="`width:${(strandCount(s.id) / Math.max(1, allCh.length)) * 100}%;background:${s.color}`" /></span>
            <span class="ct">{{ strandCount(s.id) }} ch</span>
          </div>
          <div v-if="!project.strands.length" class="t-muted" style="font-size:12px;font-style:italic">No strands yet.</div>
        </div>
      </div>
    </div>
  </div>
  </div>

  <SessionRecapModal v-if="recapOpen" @close="closeRecap" />
</template>

<style scoped>
.home-desc {
  font-size: 14px; line-height: 1.55; color: var(--muted);
  margin: 0;
}
.home-desc strong { color: var(--ink-2); font-weight: 600; }

.home-pane-header .pane-title { gap: 2px; }
.home-title {
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
.home-title:hover { border-color: var(--border-soft); }
.home-title:focus { border-color: var(--accent); background: var(--surface); box-shadow: 0 0 0 3px var(--accent-soft); }
.deadline-link { color: inherit; text-decoration: none; border-radius: 4px; }
.deadline-link:hover { color: var(--accent); text-decoration: underline; }

.home-card-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }

/* ── Hero ─────────────────────────────────────────────────── */
.hero-card { padding: 24px; }
.hero-main { display: flex; gap: 28px; align-items: center; flex-wrap: wrap; }
.hero-text { flex: 1; min-width: 280px; }
.hero-sub { font-size: 13px; color: var(--muted); margin-top: 6px; }
.hero-premise {
  font-family: var(--font-serif);
  font-size: 15px; line-height: 1.6;
  color: var(--ink-2); margin: 12px 0 0; max-width: 54ch;
}

/* Goal ring */
.goal-ring { display: flex; flex-direction: column; align-items: center; gap: 10px; flex-shrink: 0; }
.ring-disc { position: relative; display: grid; place-items: center; }
.ring-disc svg { transform: rotate(-90deg); display: block; }
.ring-disc circle { transition: stroke-dashoffset .6s cubic-bezier(.3, .7, .4, 1); }
.ring-label { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; }
.ring-pct { font-family: var(--font-serif); font-size: 38px; font-weight: 500; line-height: 1; letter-spacing: -0.01em; }
.ring-sub { font-size: 9.5px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--muted); margin-top: 5px; }
.ring-words { font-size: 11.5px; color: var(--muted); }
.ring-words b { color: var(--ink); font-variant-numeric: tabular-nums; }

/* ── Resume card ──────────────────────────────────────────── */
.resume-card {
  display: grid; grid-template-columns: 1fr auto; gap: 24px; align-items: center;
  position: relative; overflow: hidden; padding: 22px 24px;
}
.resume-card::before {
  content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 5px;
  background: linear-gradient(180deg, var(--accent), var(--gold));
}
.resume-body { min-width: 0; padding-left: 6px; }
.resume-lab {
  font-size: 10.5px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase;
  color: var(--muted);
}
.resume-h { margin: 7px 0 0; font-family: var(--font-serif); font-size: 20px; font-weight: 600; line-height: 1.25; }
.resume-part { color: var(--muted); font-weight: 400; }
.resume-ch { color: var(--accent-ink); font-style: italic; font-weight: 500; }
.resume-quote {
  margin: 12px 0 0; max-width: 62ch;
  font-family: var(--font-serif); font-style: italic; font-size: 14.5px; line-height: 1.6;
  color: var(--ink-2);
  padding-left: 14px; border-left: 2px solid var(--accent-line);
}
.resume-quote.resume-empty { color: var(--muted); }
.resume-sub { margin-top: 13px; display: flex; flex-wrap: wrap; gap: 8px; align-items: center; font-size: 12px; color: var(--muted); }
.resume-sub b { color: var(--ink-2); font-weight: 600; font-variant-numeric: tabular-nums; }
.resume-sub .dot-sep { color: var(--subtle); }
.resume-today { color: var(--accent-ink); }
.resume-cta { display: flex; align-items: center; }

@media (max-width: 900px) {
  .home-card-grid { grid-template-columns: 1fr !important; }
}
@media (max-width: 720px) {
  .resume-card { grid-template-columns: 1fr; }
}

/* ── Briefing card ────────────────────────────────────────── */
.briefing-card {
  position: relative; overflow: hidden;
  padding: 20px 22px 16px;
}
.briefing-card::before {
  content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 5px;
  background: linear-gradient(180deg, var(--gold), var(--accent));
}
.briefing-head {
  display: flex; align-items: center; justify-content: space-between;
  gap: 12px; padding-left: 6px;
}
.briefing-eyebrow {
  font-family: var(--font-mono);
  font-size: 10px; letter-spacing: 0.16em; text-transform: uppercase;
  color: var(--muted);
}
.briefing-x {
  appearance: none; border: 0; background: transparent; cursor: pointer;
  color: var(--muted); padding: 4px; border-radius: 4px;
  display: inline-flex; align-items: center; justify-content: center;
}
.briefing-x:hover { color: var(--ink-2); background: var(--surface-3); }
.briefing-meta {
  margin: 8px 0 12px; padding-left: 6px;
  font-size: 12px; color: var(--muted);
}
.briefing-jump {
  appearance: none; border: 0; background: transparent; cursor: pointer;
  font: inherit; color: var(--accent-ink); padding: 0;
  border-bottom: 1px dotted var(--accent-line);
}
.briefing-jump:hover { color: var(--accent); border-bottom-style: solid; }
.briefing-body {
  margin: 0; padding-left: 6px; max-width: 68ch;
  font-family: var(--font-serif); font-size: 14.5px; line-height: 1.7;
  color: var(--ink-2);
  white-space: pre-wrap;
}
.briefing-loading {
  display: flex; align-items: center; gap: 10px; padding-left: 6px;
  font-size: 12.5px; color: var(--muted); font-style: italic;
  min-height: 60px;
}
.briefing-spinner {
  display: inline-block; width: 12px; height: 12px;
  border: 2px solid var(--surface-3); border-top-color: var(--accent);
  border-radius: 50%; animation: briefing-spin 0.9s linear infinite;
}
@keyframes briefing-spin { to { transform: rotate(360deg); } }
.briefing-error {
  display: flex; align-items: center; gap: 10px; padding: 10px 12px;
  margin-left: 6px;
  background: var(--surface-3); border-radius: 6px;
  font-size: 12.5px; color: var(--ink-2);
}
.briefing-error :deep(svg) { color: var(--danger); flex-shrink: 0; }
.briefing-foot {
  display: flex; align-items: center; justify-content: space-between;
  gap: 12px; margin-top: 12px; padding-left: 6px;
  font-family: var(--font-mono); font-size: 10.5px; color: var(--subtle);
}
.briefing-model { font-variant-numeric: tabular-nums; }
.briefing-foot-actions { display: flex; gap: 6px; }

/* ── Stat / graph cards (editorial) ───────────────────────── */
.gcard-h {
  margin: 0 0 16px;
  font-family: var(--font-mono);
  font-size: 10px; letter-spacing: 0.16em; text-transform: uppercase;
  color: var(--muted);
  display: flex; align-items: center; gap: 9px;
}
.gcard-h::after { content: ""; flex: 1; height: 1px; background: var(--border); }
.gcard-h .tag {
  font-family: var(--font-ui); letter-spacing: 0; text-transform: none;
  font-size: 10px; color: var(--accent);
  background: var(--accent-soft); border-radius: 999px; padding: 2px 9px;
}

.gstat { font-family: var(--font-serif); font-size: 40px; font-weight: 500; line-height: 1; letter-spacing: -0.01em; }
.gstat small { font-family: var(--font-mono); font-size: 11px; color: var(--muted); letter-spacing: 0.05em; margin-left: 6px; }

.gkv { display: grid; grid-template-columns: auto 1fr; gap: 7px 16px; margin-top: 16px; font-size: 12.5px; }
.gkv .k { color: var(--muted); }
.gkv .v { text-align: right; font-family: var(--font-mono); font-size: 12px; font-variant-numeric: tabular-nums; }

/* activity ticks */
.gticks { display: flex; gap: 4px; align-items: flex-end; height: 40px; margin-top: 16px; }
.gticks i { flex: 1; border-radius: 2px; background: var(--surface-3); height: 40%; }
.gticks i.on { background: linear-gradient(180deg, var(--accent), var(--accent-ink)); height: 100%; }
.gticks-cap { margin-top: 8px; font-family: var(--font-mono); font-size: 10.5px; color: var(--muted); }
.gtoday-foot { margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--border-soft); display: flex; }

/* sparkline */
.gspark { width: 100%; height: 62px; display: block; }

/* cadence (day of week) */
.gdow-bars { display: flex; align-items: flex-end; gap: 7px; height: 74px; }
.gdow-bar { flex: 1; border-radius: 4px 4px 2px 2px; background: var(--surface-3); min-height: 3px; }
.gdow-bar.peak { background: linear-gradient(180deg, var(--gold), color-mix(in oklab, var(--gold), black 28%)); }
.gdow-lbls { display: flex; gap: 7px; margin-top: 6px; }
.gdow-lbls .lbl { flex: 1; text-align: center; font-family: var(--font-mono); font-size: 9.5px; color: var(--muted); }

/* narrative strands — threads */
.gthreads { display: flex; flex-direction: column; }
.gthread { display: grid; grid-template-columns: 160px 1fr 52px; align-items: center; gap: 16px; padding: 9px 0; }
.gthread + .gthread { border-top: 1px solid var(--border-soft); }
.gthread .nm { display: flex; align-items: center; gap: 9px; font-size: 13px; color: var(--ink); min-width: 0; padding-left: 3px; }
.gthread .nm .dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; box-shadow: 0 0 0 3px color-mix(in oklab, currentColor 18%, transparent); }
.gthread .nm-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.gthread .track { height: 6px; border-radius: 999px; background: var(--surface-3); overflow: hidden; }
.gthread .fill { display: block; height: 100%; border-radius: 999px; }
.gthread .ct { text-align: right; font-family: var(--font-mono); font-size: 11px; color: var(--muted); }
</style>
