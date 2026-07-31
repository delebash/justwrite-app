<script setup>
// Relationship arc modal — tracks how two characters' relationship
// moves across the book. Two character pickers; on selection (or
// regenerate), one LLM call per pair returns a chapter-by-chapter
// strip with warmth, tension, and power-balance values. Renders:
//
//   - trajectory chip ("Warming" / "Cooling" / "Escalating" / etc.)
//   - 2-3 sentence summary
//   - per-chapter strip:
//       row 1: warmth (cold blue → warm gold)
//       row 2: tension (calm → red)
//       row 3: power (A-dominant / equal / B-dominant)
//   - chapter detail on hover/click (moment + scores)
//
// Persists per-pair in project.relationshipArcs (keyed by canonical
// pair id) so the writer can keep multiple tracked pairs on file.

import { ref, computed, watch } from "vue";
import { useRouter } from "vue-router";
import { useProjectStore } from "../stores/project.js";
import { useAiStore } from "../stores/ai.js";
import { useAiTasksStore, Icon, AiTaskStrip, AppModal, UiButton, UiSelect, UiInput, UiTextarea } from "@delebash/llm-ui";
import { analyseRelationship, pairKey, TRAJECTORY_LABELS } from "../services/analysis/relationshipArc.js";
import AiFeatureChip from "./AiFeatureChip.vue";

const emit = defineEmits(["close"]);

const project = useProjectStore();
const ai = useAiStore();
const router = useRouter();
const aiTasks = useAiTasksStore();
const error = ref("");

const myTask = computed(() => aiTasks.runningTasks.find((t) => t.feature === "relationshipArc"));
const running = computed(() => !!myTask.value);

function isAbort(e) { return e?.name === "AbortError" || /abort/i.test(e?.message || ""); }

const aId = ref(null);
const bId = ref(null);

const characterOptions = computed(() => {
  const all = [...(project.characters || [])];
  const main = all.filter((c) => c.main);
  const rest = all.filter((c) => !c.main);
  return [...main, ...rest].map((c) => ({ value: c.id, label: c.name + (c.role ? ` — ${c.role}` : "") }));
});

const currentKey = computed(() => (aId.value && bId.value && aId.value !== bId.value) ? pairKey(aId.value, bId.value) : "");
const arc = computed(() => (currentKey.value ? project.relationshipArcs?.[currentKey.value] : null) || null);

// WS5: the standing per-character dynamic. Sides are keyed by real character
// id (not "A"/"B"), so the two mini-cards track the current pickers even after
// a swap. Hand-edits persist via setRelationshipArc (merge — never clobber the
// strip); a regenerate overwrites them with a fresh AI draft.
function nameFor(id) { return project.characters.find((c) => c.id === id)?.name || ""; }
const dynamicCards = computed(() => {
  if (!arc.value || !aId.value || !bId.value) return [];
  return [
    { id: aId.value, name: nameFor(aId.value) || "A", other: nameFor(bId.value) || "B" },
    { id: bId.value, name: nameFor(bId.value) || "B", other: nameFor(aId.value) || "A" },
  ];
});
function sideFor(id) { return arc.value?.sides?.[id] || {}; }
function updateSide(id, key, value) {
  if (!currentKey.value || !arc.value) return;
  const sides = { ...(arc.value.sides || {}) };
  sides[id] = { ...(sides[id] || {}), [key]: value };
  project.setRelationshipArc(currentKey.value, { ...arc.value, sides });
}

// Auto-pick a sensible default pair on open.
if (!aId.value && !bId.value) {
  const list = project.characters || [];
  const mains = list.filter((c) => c.main);
  if (mains.length >= 2) { aId.value = mains[0].id; bId.value = mains[1].id; }
  else if (list.length >= 2) { aId.value = list[0].id; bId.value = list[1].id; }
}

async function run() {
  error.value = "";
  if (!ai.providerForFeature("relationshipArc")) {
    error.value = "Configure an AI provider in Settings → AI to track the relationship.";
    return;
  }
  if (!aId.value || !bId.value || aId.value === bId.value) {
    error.value = "Pick two different characters.";
    return;
  }
  try {
    const result = await analyseRelationship({
      project,
      characterAId: aId.value,
      characterBId: bId.value,
      task: { label: "Relationship arc", meta: {} },
    });
    project.setRelationshipArc(currentKey.value, result);
  } catch (e) {
    if (!isAbort(e)) {
      const msg = String(e?.message || e || "");
      error.value = /provider|api key|configure/i.test(msg)
        ? "Configure an AI provider in Settings → AI to track the relationship."
        : msg || "Couldn't analyse the relationship.";
    }
  }
}
function regenerate() {
  if (currentKey.value) project.clearRelationshipArc(currentKey.value);
  run();
}
function clearCurrent() {
  if (currentKey.value) project.clearRelationshipArc(currentKey.value);
}
function jumpToChapter(num) {
  const ch = project.allChapters.find((c) => c.num === num);
  if (ch) router.push(`/chapters/${ch.id}`);
}
function swap() {
  const tmp = aId.value; aId.value = bId.value; bId.value = tmp;
}

// Switching characters silently loads a cached arc if one exists.
watch([aId, bId], () => { error.value = ""; });

// Build SVG geometry for the warmth and tension lines.
const lineGeom = computed(() => {
  if (!arc.value?.chapters?.length) return null;
  const rows = arc.value.chapters;
  const W = 100, H = 60;
  const xs = rows.length > 1 ? rows.map((_, i) => (i / (rows.length - 1)) * W) : rows.map(() => W / 2);
  const y = (v) => H - ((v - 1) / 9) * (H - 4) - 2;
  const warmthPts = rows.map((r, i) => `${xs[i].toFixed(1)},${y(r.warmth).toFixed(1)}`).join(" ");
  const tensionPts = rows.map((r, i) => `${xs[i].toFixed(1)},${y(r.tension).toFixed(1)}`).join(" ");
  return { W, H, warmthPts, tensionPts, rows, xs };
});

// Heatmap colour for warmth (cold blue ↔ warm gold).
function warmthColour(v) {
  const w = Math.max(1, Math.min(10, v));
  const t = (w - 1) / 9;
  // Interpolate between a blue and the gold accent.
  return `color-mix(in oklab, var(--gold) ${Math.round(t * 100)}%, color-mix(in oklab, var(--accent) 50%, var(--surface-3)))`;
}
function tensionColour(v) {
  const t = (Math.max(1, Math.min(10, v)) - 1) / 9;
  return `color-mix(in oklab, var(--danger) ${Math.round(t * 100)}%, var(--surface-3))`;
}
function powerLabel(power, charA, charB) {
  if (power === "A") return charA;
  if (power === "B") return charB;
  return "Equal";
}
function powerColour(power) {
  if (power === "A") return "color-mix(in oklab, var(--accent) 36%, transparent)";
  if (power === "B") return "color-mix(in oklab, var(--status-revise) 36%, transparent)";
  return "var(--surface-3)";
}

const selectedChapter = ref(null);
function selectChapter(row) {
  selectedChapter.value = row?.chapterNum === selectedChapter.value?.chapterNum ? null : row;
}

const ago = (ts) => {
  if (!ts) return "";
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

const TRAJECTORY_COLOURS = {
  warming:    "var(--gold)",
  cooling:    "var(--accent)",
  escalating: "var(--danger)",
  defusing:   "var(--status-done)",
  flipping:   "var(--status-revise)",
  static:     "var(--muted)",
};
</script>

<template>
  <AppModal
    :eyebrow="$t('relationshipArc.eyebrow')"
    :title="$t('relationshipArc.title')"
    wide
    :closable="!running"
    @close="emit('close')"
  >
    <template #header>
      <div class="ra-titleblock">
        <div class="t-eyebrow">{{ $t("relationshipArc.eyebrow") }}</div>
        <h2 class="modal-title">{{ $t("relationshipArc.title") }}</h2>
      </div>
      <div class="ra-header-actions">
        <AiFeatureChip feature="relationshipArc" :label="$t('relationshipArc.chipLabel')" editable />
      </div>
    </template>

    <i18n-t keypath="relationshipArc.blurb" tag="p" class="ra-blurb" scope="global">
      <template #warmth><strong>{{ $t("relationshipArc.warmthTerm") }}</strong></template>
      <template #tension><strong>{{ $t("relationshipArc.tensionTerm") }}</strong></template>
      <template #power><strong>{{ $t("relationshipArc.powerTerm") }}</strong></template>
    </i18n-t>

    <div class="ra-pickers">
      <div class="ra-picker">
        <label>{{ $t("relationshipArc.characterA") }}</label>
        <UiSelect v-model="aId" :options="characterOptions" :placeholder="$t('relationshipArc.pickCharacter')" />
      </div>
      <UiButton intent="ghost" size="small" class="ra-swap" @click="swap"
                v-tooltip.bottom="$t('relationshipArc.swapTooltip')">
        <Icon name="Refresh" :size="12" />
      </UiButton>
      <div class="ra-picker">
        <label>{{ $t("relationshipArc.characterB") }}</label>
        <UiSelect v-model="bId" :options="characterOptions" :placeholder="$t('relationshipArc.pickCharacter')" />
      </div>
    </div>

    <div v-if="error" class="ra-error">
      <Icon name="Alert" :size="13" /> {{ error }}
    </div>

    <AiTaskStrip v-if="running" :task="myTask" />

    <template v-else-if="arc">
      <div class="ra-head">
        <span class="ra-trajectory" :style="{ background: TRAJECTORY_COLOURS[arc.trajectory] }">
          {{ TRAJECTORY_LABELS[arc.trajectory] || arc.trajectory }}
        </span>
        <span class="ra-meta">
          {{ $t("relationshipArc.meta", { chapters: $t("count.sharedChapter", { n: arc.chapters.length }, arc.chapters.length), scenes: $t("count.sharedScene", { n: arc.sharedScenes }, arc.sharedScenes), when: ago(arc.generatedAt) }) }}
        </span>
      </div>

      <p v-if="arc.summary" class="ra-summary">{{ arc.summary }}</p>

      <!-- Standing dynamic, per character (WS5). AI-drafted, hand-editable. -->
      <section v-if="dynamicCards.length" class="ra-section">
        <div class="ra-section-h">
          <span>{{ $t("relationshipArc.dynamics") }}</span>
          <span class="ra-spacer" />
          <span class="ra-strip-key">{{ $t("relationshipArc.dynamicsHint") }}</span>
        </div>
        <div class="ra-dyn-grid">
          <div v-for="card in dynamicCards" :key="card.id" class="ra-dyn-card">
            <div class="ra-dyn-name">{{ card.name }}</div>
            <div class="ra-dyn-field">
              <span class="t-muted">{{ $t("relationshipArc.wantsFrom", { other: card.other }) }}</span>
              <UiTextarea auto-resize :rows="2" :model-value="sideFor(card.id).wants || ''"
                @update:model-value="updateSide(card.id, 'wants', $event)" />
            </div>
            <div class="ra-dyn-field">
              <span class="t-muted">{{ $t("relationshipArc.fearsFrom", { other: card.other }) }}</span>
              <UiTextarea auto-resize :rows="2" :model-value="sideFor(card.id).fears || ''"
                @update:model-value="updateSide(card.id, 'fears', $event)" />
            </div>
            <div class="ra-dyn-field">
              <span class="t-muted">{{ $t("relationshipArc.speaksTo", { other: card.other }) }}</span>
              <UiInput :model-value="sideFor(card.id).speaksLike || ''"
                @update:model-value="updateSide(card.id, 'speaksLike', $event)" />
            </div>
          </div>
        </div>
      </section>

      <!-- Chart -->
      <section v-if="lineGeom" class="ra-section">
        <div class="ra-section-h">
          <span>{{ $t("relationshipArc.chartHeading") }}</span>
          <span class="ra-spacer" />
          <span class="ra-legend">
            <span class="ra-legend-item"><span class="ra-legend-line warmth" /> {{ $t("relationshipArc.legendWarmth") }}</span>
            <span class="ra-legend-item"><span class="ra-legend-line tension" /> {{ $t("relationshipArc.legendTension") }}</span>
          </span>
        </div>
        <svg class="ra-chart" :viewBox="`0 0 ${lineGeom.W} ${lineGeom.H}`" preserveAspectRatio="none">
          <line :x1="0" :x2="lineGeom.W"
                :y1="lineGeom.H - ((5 - 1) / 9) * (lineGeom.H - 4) - 2"
                :y2="lineGeom.H - ((5 - 1) / 9) * (lineGeom.H - 4) - 2"
                stroke="var(--border-soft)" stroke-width="0.4"
                stroke-dasharray="2 2" vector-effect="non-scaling-stroke" />
          <polyline :points="lineGeom.warmthPts"
                    fill="none" stroke="var(--gold)" stroke-width="1.6"
                    vector-effect="non-scaling-stroke" />
          <polyline :points="lineGeom.tensionPts"
                    fill="none" stroke="var(--danger)" stroke-width="1.6"
                    stroke-dasharray="3 2" vector-effect="non-scaling-stroke" />
        </svg>
      </section>

      <!-- Per-chapter strip with three rows: warmth / tension / power -->
      <section class="ra-section">
        <div class="ra-section-h">
          <span>{{ $t("relationshipArc.stripHeading") }}</span>
          <span class="ra-spacer" />
          <span class="ra-strip-key">{{ $t("relationshipArc.stripHint") }}</span>
        </div>
        <div class="ra-strip-rows">
          <div class="ra-strip-row">
            <div class="ra-strip-label">{{ $t("relationshipArc.rowWarmth") }}</div>
            <div class="ra-strip-cells">
              <button v-for="r in arc.chapters" :key="`w-${r.chapterNum}`" type="button"
                      class="ra-cell"
                      :style="{ background: warmthColour(r.warmth) }"
                      :class="{ selected: selectedChapter?.chapterNum === r.chapterNum }"
                      v-tooltip.bottom="`Ch.${r.chapterNum} warmth ${r.warmth}/10`"
                      @click="selectChapter(r)">
                <span class="ra-cell-num">{{ r.chapterNum }}</span>
              </button>
            </div>
          </div>
          <div class="ra-strip-row">
            <div class="ra-strip-label">{{ $t("relationshipArc.rowTension") }}</div>
            <div class="ra-strip-cells">
              <button v-for="r in arc.chapters" :key="`t-${r.chapterNum}`" type="button"
                      class="ra-cell"
                      :style="{ background: tensionColour(r.tension) }"
                      :class="{ selected: selectedChapter?.chapterNum === r.chapterNum }"
                      v-tooltip.bottom="`Ch.${r.chapterNum} tension ${r.tension}/10`"
                      @click="selectChapter(r)">
                <span class="ra-cell-num">{{ r.chapterNum }}</span>
              </button>
            </div>
          </div>
          <div class="ra-strip-row">
            <div class="ra-strip-label">{{ $t("relationshipArc.rowPower") }}</div>
            <div class="ra-strip-cells">
              <button v-for="r in arc.chapters" :key="`p-${r.chapterNum}`" type="button"
                      class="ra-cell"
                      :style="{ background: powerColour(r.power) }"
                      :class="{ selected: selectedChapter?.chapterNum === r.chapterNum }"
                      v-tooltip.bottom="`Ch.${r.chapterNum}: ${powerLabel(r.power, arc.characterAName, arc.characterBName)}`"
                      @click="selectChapter(r)">
                <span class="ra-cell-num">{{ r.chapterNum }}</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      <!-- Detail card for the selected chapter -->
      <section v-if="selectedChapter" class="ra-section ra-detail">
        <div class="ra-detail-h">
          <button class="ra-detail-jump" @click="jumpToChapter(selectedChapter.chapterNum)"
                  v-tooltip.bottom="$t('common.openThisChapter')">
            {{ $t("common.chapterShort", { num: selectedChapter.chapterNum }) }}
          </button>
          <span class="ra-detail-vals">
            {{ $t("relationshipArc.detailVals", { warmth: selectedChapter.warmth, tension: selectedChapter.tension, power: powerLabel(selectedChapter.power, arc.characterAName, arc.characterBName) }) }}
          </span>
        </div>
        <p v-if="selectedChapter.moment" class="ra-detail-moment">{{ selectedChapter.moment }}</p>
      </section>
    </template>

    <template #footer>
      <UiButton v-if="arc && !running" intent="ghost" @click="clearCurrent">
        {{ $t("relationshipArc.clearThisArc") }}
      </UiButton>
      <span class="ra-foot-spacer" />
      <UiButton v-if="arc && !running" intent="ghost" @click="regenerate">
        <Icon name="Refresh" :size="12" /> {{ $t("common.regenerate") }}
      </UiButton>
      <UiButton v-if="!arc && !running" intent="primary" @click="run">
        <Icon name="Sparkle" :size="12" /> {{ $t("relationshipArc.analyse") }}
      </UiButton>
      <UiButton intent="primary" v-if="arc" @click="emit('close')">{{ $t("common.done") }}</UiButton>
    </template>
  </AppModal>
</template>

<style scoped>
.ra-blurb {
  margin: 0 0 16px; max-width: 80ch;
  font-size: 12.5px; line-height: 1.55; color: var(--muted);
}
.ra-blurb strong { color: var(--ink-2); font-weight: 600; }

.ra-pickers {
  display: grid; grid-template-columns: 1fr auto 1fr; gap: 12px; align-items: end;
  margin-bottom: 18px;
}
.ra-picker { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.ra-picker label {
  font-family: var(--font-mono); font-size: 9.5px;
  letter-spacing: 0.14em; text-transform: uppercase; color: var(--muted);
}
.ra-swap { align-self: end; }

.ra-error {
  display: flex; gap: 8px; align-items: center;
  padding: 8px 12px; border-radius: 6px;
  background: color-mix(in oklab, var(--danger-ink, #b91c1c) 12%, transparent);
  color: var(--danger-ink, #b91c1c);
  font-size: 12.5px; margin-bottom: 10px;
}

.ra-loading {
  display: flex; align-items: center; gap: 12px;
  font-size: 13px; color: var(--muted); font-style: italic;
  min-height: 80px;
}
.ra-spinner {
  display: inline-block; width: 14px; height: 14px;
  border: 2px solid var(--surface-3); border-top-color: var(--accent);
  border-radius: 50%; animation: ra-spin 0.9s linear infinite;
}
@keyframes ra-spin { to { transform: rotate(360deg); } }

.ra-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 12px; }
.ra-trajectory {
  font-family: var(--font-mono); font-size: 10.5px;
  letter-spacing: 0.06em;
  padding: 4px 12px; border-radius: 999px;
  color: white; text-shadow: 0 1px 0 rgba(0,0,0,0.25);
}
.ra-meta { font-family: var(--font-mono); font-size: 10.5px; color: var(--muted); }

.ra-summary {
  margin: 0 0 22px; max-width: 78ch;
  font-family: var(--font-serif); font-size: 14px; line-height: 1.65;
  color: var(--ink-2); font-style: italic;
  padding-left: 14px; border-left: 2px solid var(--accent-line);
}

.ra-section + .ra-section { margin-top: 22px; }

/* WS5 — the two per-character dynamic cards. */
.ra-dyn-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.ra-dyn-card {
  border: 1px solid var(--border); border-radius: 10px; padding: 12px 14px;
  background: var(--surface-2, var(--surface));
}
.ra-dyn-name { font-family: var(--font-serif); font-weight: 600; font-size: 14px; margin-bottom: 10px; }
.ra-dyn-field { display: flex; flex-direction: column; gap: 3px; }
.ra-dyn-field + .ra-dyn-field { margin-top: 8px; }
.ra-dyn-field .t-muted { font-size: 11px; }
@media (max-width: 640px) { .ra-dyn-grid { grid-template-columns: 1fr; } }

.ra-section-h {
  display: flex; align-items: center; gap: 10px;
  font-family: var(--font-mono); font-size: 10px;
  letter-spacing: 0.16em; text-transform: uppercase; color: var(--muted);
  margin: 0 0 10px;
}
.ra-spacer { flex: 1; height: 1px; background: var(--border-soft); margin: 0 6px; }
.ra-legend { display: flex; gap: 12px; text-transform: none; letter-spacing: 0; font-family: var(--font-ui); }
.ra-legend-item { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; color: var(--ink-2); }
.ra-legend-line { width: 16px; border-top: 2px solid; display: inline-block; }
.ra-legend-line.warmth { color: var(--gold); }
.ra-legend-line.tension { color: var(--danger); border-top-style: dashed; }

.ra-chart {
  width: 100%; height: 90px;
  background: var(--surface-2); border-radius: 6px;
  padding: 4px; box-sizing: border-box;
}

.ra-strip-rows { display: flex; flex-direction: column; gap: 6px; }
.ra-strip-row { display: grid; grid-template-columns: 80px 1fr; align-items: center; gap: 12px; }
.ra-strip-label {
  font-family: var(--font-mono); font-size: 10.5px; color: var(--muted);
}
.ra-strip-cells { display: flex; flex-wrap: wrap; gap: 3px; }
.ra-strip-key {
  text-transform: none; letter-spacing: 0; font-family: var(--font-ui);
  font-size: 11px; color: var(--muted); font-style: italic;
}
.ra-cell {
  appearance: none; border: 0; cursor: pointer;
  width: 28px; height: 28px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 5px;
  font-family: var(--font-mono); font-size: 10.5px; font-weight: 600;
  color: var(--ink);
}
.ra-cell:hover { transform: translateY(-1px); }
.ra-cell.selected { outline: 2px solid var(--accent); outline-offset: 1px; }

.ra-detail {
  padding: 14px 16px;
  background: var(--surface-2); border-radius: 8px;
  border-left: 3px solid var(--accent);
}
.ra-detail-h { display: flex; align-items: baseline; gap: 14px; margin-bottom: 6px; }
.ra-detail-jump {
  appearance: none; border: 0; background: transparent; cursor: pointer;
  font-family: var(--font-mono); font-size: 11px; color: var(--accent-ink); padding: 0;
}
.ra-detail-jump:hover { color: var(--accent); text-decoration: underline; }
.ra-detail-vals { font-family: var(--font-mono); font-size: 10.5px; color: var(--muted); }
.ra-detail-moment {
  margin: 0;
  font-family: var(--font-serif); font-style: italic;
  font-size: 14px; line-height: 1.6; color: var(--ink-2);
}

.ra-foot-spacer { flex: 1; }

.ra-titleblock { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
.ra-titleblock h2 { font-family: var(--font-serif); font-size: 22px; font-weight: 600; margin: 4px 0 0; }
.ra-header-actions { display: flex; gap: 8px; flex-shrink: 0; align-items: center; }
</style>
