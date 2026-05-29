<script setup>
import { computed } from "vue";
import { useRouter } from "vue-router";
import { useProjectStore } from "../stores/project.js";
import { useUiStore } from "../stores/ui.js";
import { useSessionsStore, DOW_LABELS_MONDAY_FIRST, reorderForMonday } from "../stores/sessions.js";
import Icon from "../components/Icon.vue";

const router = useRouter();
const project = useProjectStore();
const ui = useUiStore();
const sessions = useSessionsStore();
const P = project.project;

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
      <button class="btn ghost" @click="goToday"><Icon name="Calendar" :size="14" /> Today</button>
      <router-link to="/chapters" custom v-slot="{ navigate }">
        <button class="btn primary" @click="navigate"><Icon name="Plus" :size="14" /> Quick write</button>
      </router-link>
    </div>
  </header>

  <div class="pane-card">
  <div class="scrollarea">
    <div class="card-grid" style="grid-template-columns:1.5fr 1fr 1fr;gap:16px">

      <!-- Hero -->
      <div class="card" style="grid-column:1/-1;padding:22px">
        <div style="display:flex;align-items:flex-start;gap:24px;flex-wrap:wrap">
          <div style="flex:1;min-width:280px">
            <div class="t-eyebrow">Overview</div>
            <div class="t-muted" style="font-size:13px;margin-top:6px">{{ P.subtitle }} · {{ P.genre }}</div>
            <p style="font-size:13.5px;color:var(--ink-2);margin-top:12px;max-width:560px;line-height:1.6">{{ P.premise }}</p>
          </div>
          <div style="text-align:center;min-width:140px">
            <div style="font-family:var(--font-serif);font-size:28px;font-weight:600;line-height:1">{{ pct }}%</div>
            <div style="font-size:11px;color:var(--muted);margin-top:4px">{{ totalWords.toLocaleString() }} / {{ P.wordsGoal.toLocaleString() }}</div>
            <div style="font-size:10px;color:var(--muted)">words</div>
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
              title="Change deadline in Project settings">Deadline {{ P.deadline }}</router-link>
          </div>
        </div>
      </div>

      <!-- Today -->
      <div class="card">
        <div class="card-title">Today<span class="pill">live</span></div>
        <div style="display:grid;grid-template-columns:auto 1fr;gap:8px 14px;font-size:13px">
          <span class="t-muted">Words</span><b class="t-num">{{ sessions.todayWords.toLocaleString() }}</b>
          <span class="t-muted">Streak</span><span class="t-num">{{ sessions.streak }} day{{ sessions.streak === 1 ? "" : "s" }}</span>
          <span class="t-muted">14-day total</span><span class="t-num">{{ totals14.total.toLocaleString() }}</span>
        </div>
        <div style="height:1px;background:var(--border-soft);margin:14px 0" />
        <div class="t-eyebrow" style="margin-bottom:6px">Activity · last 14 days</div>
        <div style="display:flex;gap:3px">
          <div v-for="(active, i) in streakSquares" :key="i"
            :style="`flex:1;height:22px;border-radius:3px;background:${active ? 'var(--accent)' : 'var(--surface-3)'};opacity:${active ? 0.55 + (i / 30) : 1}`"
            :title="history14[i].date" />
        </div>
        <div style="font-size:11px;color:var(--muted);margin-top:6px">
          {{ streakSquares.filter(Boolean).length }} of 14 days written
        </div>
      </div>

      <!-- Sparkline -->
      <div class="card">
        <div class="card-title">Last 14 days</div>
        <svg viewBox="0 0 100 64" preserveAspectRatio="none" style="width:100%;height:64px;display:block">
          <polygon :points="sparkPts.area" fill="var(--accent-soft)" />
          <polyline :points="sparkPts.pts" fill="none" stroke="var(--accent)" stroke-width="1.4" vector-effect="non-scaling-stroke" />
        </svg>
        <div style="display:grid;grid-template-columns:auto 1fr;gap:4px 14px;font-size:12px;margin-top:14px">
          <span class="t-muted">Total</span><b class="t-num">{{ totals14.total.toLocaleString() }} words</b>
          <span class="t-muted">Avg / day</span><span class="t-num">{{ totals14.avg.toLocaleString() }} words</span>
          <span class="t-muted">Peak day</span><span class="t-num">{{ totals14.peak.toLocaleString() }} words</span>
        </div>
      </div>

      <!-- Day of week -->
      <div class="card">
        <div class="card-title">By day of week</div>
        <div style="display:flex;align-items:flex-end;gap:6px;height:80px">
          <div v-for="(v, i) in dowAvg" :key="i"
            style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px">
            <div :style="`height:${(v / dowMax) * 100}%;width:100%;background:${v === Math.max(...dowAvg) && v > 0 ? 'var(--accent)' : 'var(--surface-3)'};border-radius:4px;min-height:2px`" />
          </div>
        </div>
        <div style="display:flex;gap:6px;margin-top:4px">
          <div v-for="(d, i) in DOW_LABELS_MONDAY_FIRST" :key="i"
            style="flex:1;text-align:center;font-size:10.5px;color:var(--muted)">{{ d }}</div>
        </div>
        <div v-if="totals14.total === 0" class="t-muted" style="font-size:11px;margin-top:8px;font-style:italic">
          Start writing to see your patterns.
        </div>
      </div>

      <!-- Strands at a glance -->
      <div class="card">
        <div class="card-title">Narrative strands</div>
        <div style="display:flex;flex-direction:column;gap:10px">
          <div v-for="s in project.strands" :key="s.id">
            <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px">
              <span>
                <i :style="`display:inline-block;width:8px;height:8px;border-radius:2px;background:${s.color};margin-right:7px;vertical-align:1px`" />
                {{ s.name }}
              </span>
              <span class="t-muted t-num">{{ allCh.filter(c => (c.strands || []).includes(s.id)).length }} ch</span>
            </div>
            <div style="height:4px;background:var(--surface-3);border-radius:999px">
              <div :style="`width:${(allCh.filter(c => (c.strands || []).includes(s.id)).length / Math.max(1, allCh.length)) * 100}%;height:100%;background:${s.color};border-radius:999px`" />
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
  </div>
</template>

<style scoped>
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
</style>
