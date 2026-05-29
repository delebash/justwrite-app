<script setup>
// Lists every scene whose prose @-mentions this entity (the inverse of
// the mention chip), with a clickable row per scene that navigates to
// /chapters/<chId>/<scId>. Complements SceneRefList, which lists scenes
// linked via the scene Links page. Used by the Characters / Locations /
// Objects / Groups detail views.

import { computed } from "vue";
import { useRouter } from "vue-router";
import { useProjectStore } from "../stores/project.js";
import { useUiStore } from "../stores/ui.js";
import { findMentionRefs } from "../services/mentionRefs.js";

const props = defineProps({
  entityId: { type: String, required: true },
  emptyText: {
    type: String,
    default: "Not mentioned in any scene yet. Type @ in a scene to mention it.",
  },
});

const project = useProjectStore();
const ui = useUiStore();
const router = useRouter();

const rows = computed(() => findMentionRefs(project, props.entityId));

function goScene(chapterId, sceneId) {
  ui.select("chapters", chapterId);
  router.push(`/chapters/${chapterId}/${sceneId}`);
}
</script>

<template>
  <div v-if="rows.length" class="mref-list">
    <button v-for="row in rows" :key="`${row.chapterId}:${row.sceneId}`"
      class="mref-row"
      :title="`Ch. ${row.chapterNum} · ${row.chapterTitle} — ${row.sceneTitle}`"
      @click="goScene(row.chapterId, row.sceneId)">
      <span class="mref-head">
        <span class="status-dot" :class="row.chapterStatus" />
        <span class="mref-num">{{ row.chapterNum }}.{{ row.sceneIdx }}</span>
        <span class="mref-title">{{ row.sceneTitle }}</span>
        <span v-if="row.count > 1" class="mref-count">×{{ row.count }}</span>
      </span>
      <span v-if="row.snippet" class="mref-snippet">{{ row.snippet }}</span>
    </button>
  </div>
  <div v-else class="mref-empty">{{ emptyText }}</div>
</template>

<style scoped>
.mref-list {
  display: flex; flex-direction: column; gap: 4px;
  padding-top: 6px;
  border-top: 1px dashed var(--border-soft);
}
.mref-row {
  appearance: none; text-align: left; width: 100%;
  border: 1px solid var(--border);
  background: var(--surface-2);
  border-radius: 7px;
  padding: 7px 10px;
  display: flex; flex-direction: column; gap: 3px;
  font: inherit;
  cursor: pointer;
}
.mref-row:hover { background: var(--surface-3); border-color: var(--border-strong); }
.mref-head {
  display: flex; align-items: center; gap: 7px;
  font-size: 12.5px; color: var(--ink-2);
}
.mref-num { font-variant-numeric: tabular-nums; color: var(--muted); flex: none; }
.mref-title {
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  flex: 1; min-width: 0;
}
.mref-count {
  font-size: 10.5px; font-variant-numeric: tabular-nums;
  color: var(--muted); background: var(--surface-3);
  border-radius: 999px; padding: 1px 6px; flex: none;
}
.mref-snippet {
  font-family: var(--font-serif); font-size: 12px; font-style: italic;
  color: var(--muted); line-height: 1.45;
  overflow: hidden; text-overflow: ellipsis;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
}
.mref-empty {
  font-size: 11.5px; color: var(--muted); font-style: italic;
  padding-top: 6px;
  border-top: 1px dashed var(--border-soft);
}
</style>
