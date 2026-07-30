<script setup>
// Markers — manuscript-wide birds-eye view of in-text marker pins.
//
// Two surfaces:
//   - Horizontal timeline strip showing every marker as a tick at its
//     proportional position in the project, colored by category.
//   - Grouped list (by category) with snippet + chapter/scene context.
//
// Marker lifecycle:
//   - Created in the editor via the toolbar pin or Alt+M.
//   - Listed here for revision triage.
//   - Resolved (= removed) from here OR by clicking the inline mark in
//     the editor and hitting Resolve.

import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { useProjectStore } from "../stores/project.js";
import { MARKER_CATEGORIES, categoryById, scanProjectMarkers, removeMarkerFromHtml } from "../services/markers.js";
import { Icon } from "@delebash/llm-ui";
import { UiButton } from "@delebash/llm-ui";
import ForeshadowingScanModal from "../components/ForeshadowingScanModal.vue";
import AiTellScanModal from "../components/AiTellScanModal.vue";
import { HelpTrigger } from "@delebash/llm-ui";

const project = useProjectStore();
const router = useRouter();

// Active filter — null = show everything, otherwise category id.
const activeCategory = ref(null);

const allMarkers = computed(() => scanProjectMarkers(project));

const counts = computed(() => {
  const out = Object.fromEntries(MARKER_CATEGORIES.map((c) => [c.id, 0]));
  for (const m of allMarkers.value) out[m.category] = (out[m.category] || 0) + 1;
  return out;
});

const filtered = computed(() => {
  if (!activeCategory.value) return allMarkers.value;
  return allMarkers.value.filter((m) => m.category === activeCategory.value);
});

function jumpTo(marker) {
  router.push(`/chapters/${marker.chapterId}/${marker.sceneId}`);
}

function resolve(marker) {
  const scenes = project.scenesFor(marker.chapterId);
  const scn = scenes.find((s) => s.id === marker.sceneId);
  if (!scn) return;
  const next = removeMarkerFromHtml(scn.body || "", marker.markerId);
  project.updateScene(marker.chapterId, marker.sceneId, { body: next });
}

function locationLabel(m) {
  let s = `Ch. ${m.chapterNum}`;
  if (m.chapterTitle) s += ` · ${m.chapterTitle}`;
  s += ` · Scene ${m.sceneIdx + 1}`;
  if (m.sceneTitle) s += ` — ${m.sceneTitle}`;
  return s;
}

// Foreshadowing scan modal — opens from the header action.
const scanOpen = ref(false);
function openScan() { scanOpen.value = true; }
function closeScan() { scanOpen.value = false; }
// AI-tell scan modal — deterministic regex scan, no LLM call.
const tellScanOpen = ref(false);
function openTellScan() { tellScanOpen.value = true; }
function closeTellScan() { tellScanOpen.value = false; }
</script>

<template>
  <div class="markers-pane scrollarea">
    <header class="pane-header">
      <HelpTrigger slug="markers" :label="$t('markers.title')" class="pane-help-abs" />
      <div class="pane-title">
        <h1 class="pane-h1">{{ $t("markers.title") }}</h1>
        <p class="pane-sub">
          {{ $t("markers.sub") }}
        </p>
      </div>
      <div class="pane-actions">
        <UiButton intent="secondary" @click="openScan"
                  v-tooltip.bottom="$t('markers.findDanglingTooltip')">
          <Icon name="Sparkle" :size="13" /> {{ $t("markers.findDangling") }}
        </UiButton>
        <UiButton intent="secondary" @click="openTellScan"
                  v-tooltip.bottom="$t('markers.findAiTellsTooltip')">
          <Icon name="Eye" :size="13" /> {{ $t("markers.findAiTells") }}
        </UiButton>
      </div>
    </header>

    <!-- Orientation descriptor. -->
    <i18n-t keypath="markers.intro" tag="p" class="mk-desc" scope="global">
      <template #markers><strong>{{ $t("markers.title") }}</strong></template>
      <template #fixLater><strong>{{ $t("markers.fixLater") }}</strong></template>
      <template #verify><strong>{{ $t("markers.verify") }}</strong></template>
      <template #weakProse><strong>{{ $t("markers.weakProse") }}</strong></template>
      <template #looseThread><strong>{{ $t("markers.looseThread") }}</strong></template>
      <template #todo><strong>{{ $t("markers.todo") }}</strong></template>
      <template #idea><strong>{{ $t("markers.idea") }}</strong></template>
      <template #findDangling><strong>{{ $t("markers.findDangling") }}</strong></template>
    </i18n-t>

    <!-- Timeline strip — manuscript-wide birds-eye. -->
    <div class="markers-timeline-wrap">
      <div class="markers-timeline">
        <div class="markers-timeline-rail">
          <button v-for="m in allMarkers" :key="m.markerId"
            type="button"
            class="markers-tick"
            :class="[`cat-${m.category}`, { dimmed: activeCategory && m.category !== activeCategory }]"
            :style="{ left: `calc(${m.projectPos * 100}% - 1px)`, background: categoryById(m.category).color }"
            :title="`${categoryById(m.category).label} — ${locationLabel(m)}${m.label ? ' · ' + m.label : ''}`"
            @click="jumpTo(m)" />
        </div>
        <div class="markers-timeline-ends">
          <span>{{ $t("markers.timelineStart") }}</span>
          <span>{{ $t("markers.timelineEnd") }}</span>
        </div>
      </div>
    </div>

    <!-- Category filter chips. -->
    <div class="markers-filters" role="group" :aria-label="$t('markers.filterGroup')">
      <button type="button"
        class="markers-chip"
        :class="{ active: !activeCategory }"
        @click="activeCategory = null">
        {{ $t("common.all") }} <span class="markers-chip-count">{{ allMarkers.length }}</span>
      </button>
      <button v-for="c in MARKER_CATEGORIES" :key="c.id"
        type="button"
        class="markers-chip"
        :class="{ active: activeCategory === c.id }"
        :style="{ '--marker-c': c.color }"
        @click="activeCategory = activeCategory === c.id ? null : c.id">
        <span class="markers-chip-dot" :style="{ background: c.color }" />
        {{ c.label }}
        <span class="markers-chip-count">{{ counts[c.id] || 0 }}</span>
      </button>
    </div>

    <!-- Marker list — flat, in manuscript order. -->
    <div v-if="filtered.length" class="markers-list">
      <article v-for="m in filtered" :key="m.markerId"
        class="markers-item"
        :style="{ '--marker-c': categoryById(m.category).color }">
        <header class="markers-item-head">
          <span class="markers-item-dot" :style="{ background: categoryById(m.category).color }" />
          <span class="markers-item-cat">{{ categoryById(m.category).label }}</span>
          <span class="markers-item-where">{{ locationLabel(m) }}</span>
          <div class="markers-item-actions">
            <UiButton intent="ghost" size="small" @click="jumpTo(m)">{{ $t("markers.jumpTo") }}</UiButton>
            <UiButton intent="ghost" size="small" @click="resolve(m)">{{ $t("markers.resolve") }}</UiButton>
          </div>
        </header>
        <div v-if="m.label" class="markers-item-label">{{ m.label }}</div>
        <blockquote v-if="m.snippet" class="markers-item-snippet">"{{ m.snippet }}"</blockquote>
      </article>
    </div>

    <div v-else class="markers-empty">
      <Icon name="Sparkle" :size="18" />
      <template v-if="!allMarkers.length">
        <p style="font-size:14px;color:var(--ink);margin:0">{{ $t("markers.emptyTitle") }}</p>
        <i18n-t keypath="markers.emptyBody" tag="p" style="font-size:12.5px;max-width:400px;margin:0" scope="global">
          <template #shortcut><kbd>Alt+M</kbd></template>
        </i18n-t>
      </template>
      <p v-else>{{ $t("markers.emptyCategory") }}</p>
    </div>
  </div>

  <ForeshadowingScanModal v-if="scanOpen" @close="closeScan" />
  <AiTellScanModal v-if="tellScanOpen" @close="closeTellScan" />
</template>

<style scoped>
.markers-pane {
  padding: 28px 32px 80px;
  overflow-y: auto;
  display: flex; flex-direction: column;
  gap: 24px;
}
.pane-header { display: flex; flex-direction: column; gap: 6px; position: relative; }
.pane-help-abs { position: absolute; top: 0; right: 0; }
.pane-h1 {
  font-family: var(--font-serif);
  font-size: 28px; font-weight: 600;
  letter-spacing: -0.01em;
  margin: 0; color: var(--ink);
}
.pane-sub {
  margin: 0; color: var(--muted);
  font-size: 13.5px; line-height: 1.55;
  max-width: 680px;
}

.markers-timeline-wrap {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 16px 18px 12px;
}
.markers-timeline {
  display: flex; flex-direction: column; gap: 6px;
}
.markers-timeline-rail {
  position: relative;
  height: 22px;
  background: var(--surface-2);
  border-radius: 6px;
  border: 1px solid var(--border);
  overflow: hidden;
}
.markers-tick {
  appearance: none;
  position: absolute;
  top: 0; bottom: 0;
  width: 3px;
  border: 0;
  padding: 0;
  cursor: pointer;
  transition: opacity .12s ease, width .12s ease;
}
.markers-tick:hover { width: 6px; left: calc(var(--x, 0%) - 2px); opacity: 1; }
.markers-tick.dimmed { opacity: 0.18; }
.markers-timeline-ends {
  display: flex; justify-content: space-between;
  font-size: 11px; color: var(--muted);
}

.markers-filters {
  display: flex; flex-wrap: wrap; gap: 6px;
}
.markers-chip {
  appearance: none;
  display: inline-flex; align-items: center; gap: 6px;
  padding: 5px 11px; border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--surface);
  font: inherit; font-size: 12.5px;
  color: var(--ink-2);
  cursor: pointer;
}
.markers-chip:hover { background: var(--surface-2); }
.markers-chip.active {
  background: color-mix(in oklab, var(--marker-c, var(--accent)) 18%, transparent);
  border-color: var(--marker-c, var(--accent));
  color: var(--ink); font-weight: 500;
}
.markers-chip-dot {
  width: 8px; height: 8px; border-radius: 50%; flex: none;
}
.markers-chip-count {
  font-size: 11px; color: var(--muted);
  padding: 0 5px; min-width: 16px; text-align: center;
}
.markers-chip.active .markers-chip-count { color: var(--ink-2); }

.markers-list {
  display: flex; flex-direction: column; gap: 10px;
}
.markers-item {
  background: var(--surface);
  border: 1px solid var(--border);
  border-left: 3px solid var(--marker-c, var(--accent));
  border-radius: 8px;
  padding: 12px 14px;
  display: flex; flex-direction: column; gap: 6px;
}
.markers-item-head {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
}
.markers-item-dot {
  width: 9px; height: 9px; border-radius: 50%; flex: none;
}
.markers-item-cat {
  font-size: 12px; font-weight: 600; color: var(--ink);
  text-transform: uppercase; letter-spacing: 0.04em;
}
.markers-item-where {
  font-size: 12.5px; color: var(--muted); flex: 1;
}
.markers-item-actions {
  display: flex; gap: 4px;
}
.markers-item-label {
  font-size: 13.5px; color: var(--ink); font-weight: 500;
}
.markers-item-snippet {
  margin: 2px 0 0;
  padding-left: 10px;
  border-left: 2px solid var(--border);
  font-size: 13px; color: var(--ink-2); font-style: italic;
  line-height: 1.55;
}

.markers-empty {
  display: flex; flex-direction: column; align-items: center; gap: 10px;
  padding: 40px 20px;
  color: var(--muted);
  text-align: center;
}
.markers-empty kbd {
  display: inline-block;
  padding: 1px 6px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--surface-2);
  font-family: var(--font-mono);
  font-size: 11px;
}

.mk-desc {
  font-size: 14px; line-height: 1.55; color: var(--muted);
  margin: 0;
}
.mk-desc strong { color: var(--ink-2); font-weight: 600; }
</style>
