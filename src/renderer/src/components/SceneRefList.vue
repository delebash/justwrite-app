<script setup>
// Lists every scene whose Links page references this entity, with a
// clickable chip per scene that navigates to /chapters/<chId>/<scId>.
// Used by Strands, Characters, Locations, Objects detail views.

import { computed } from "vue";
import { useRouter } from "vue-router";
import { useProjectStore } from "../stores/project.js";
import { useUiStore } from "../stores/ui.js";

const props = defineProps({
  // The scene array field that holds the entity's id when linked.
  // One of: "characters" | "locations" | "objects" | "strands".
  field: { type: String, required: true },
  entityId: { type: String, required: true },
  emptyText: {
    type: String,
    default: "No scenes linked yet. Open a scene → Links to add one.",
  },
});

const project = useProjectStore();
const ui = useUiStore();
const router = useRouter();

const rows = computed(() => {
  if (!props.entityId) return [];
  const out = [];
  for (const ch of project.allChapters) {
    const scenes = project.scenesFor(ch.id);
    scenes.forEach((scn, idx) => {
      if ((scn[props.field] || []).includes(props.entityId)) {
        out.push({
          sceneId: scn.id,
          sceneTitle: scn.title || `Scene ${idx + 1}`,
          sceneIdx: idx + 1,
          chapterId: ch.id,
          chapterTitle: ch.title,
          chapterNum: ch.num,
          sceneStatus: scn.status,
        });
      }
    });
  }
  return out;
});

function goScene(chapterId, sceneId) {
  ui.select("chapters", chapterId);
  router.push(`/chapters/${chapterId}/${sceneId}`);
}
</script>

<template>
  <div v-if="rows.length" class="scene-ref-list">
    <button v-for="row in rows" :key="`${row.chapterId}:${row.sceneId}`"
      class="scene-ref-chip"
      :title="`Ch. ${row.chapterNum} · ${row.chapterTitle} — ${row.sceneTitle}`"
      @click="goScene(row.chapterId, row.sceneId)">
      <span class="status-dot" :class="row.sceneStatus" />
      <span class="scene-ref-num">{{ row.chapterNum }}.{{ row.sceneIdx }}</span>
      <span class="scene-ref-title">{{ row.sceneTitle }}</span>
    </button>
  </div>
  <div v-else class="scene-ref-empty">{{ emptyText }}</div>
</template>

<style scoped>
.scene-ref-list {
  display: flex; flex-wrap: wrap; gap: 5px; align-items: center;
  padding-top: 6px;
  border-top: 1px dashed var(--border-soft);
}
.scene-ref-chip {
  appearance: none; border: 1px solid var(--border);
  background: var(--surface-2);
  border-radius: 6px;
  padding: 3px 8px;
  display: inline-flex; align-items: center; gap: 5px;
  font: inherit;
  font-size: 11.5px;
  color: var(--ink-2);
  max-width: 260px;
  cursor: pointer;
}
.scene-ref-chip:hover { background: var(--surface-3); color: var(--ink); border-color: var(--border-strong); }
.scene-ref-num {
  font-variant-numeric: tabular-nums;
  color: var(--muted);
}
.scene-ref-title {
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.scene-ref-empty {
  font-size: 11.5px;
  color: var(--muted);
  font-style: italic;
  padding-top: 6px;
  border-top: 1px dashed var(--border-soft);
}
</style>
