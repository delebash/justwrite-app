<script setup>
// E2 (RAG build — docs/plans/2026-07-11-rag-story-bible-build.md §T5): the
// reviewable whole-book link-backfill sweep. Matches every story-bible
// name/alias against every scene's prose (the shared deterministic matcher —
// NO LLM) and proposes the scene presence links that are not set yet,
// grouped per entity. Nothing is applied until the user confirms; unticked
// rows are discarded (the common-name risk is exactly why this is a review
// surface and never an auto-apply).
//
// Label + entry-point placement are flag F7 (my wording, reverts on a word).

import { computed, ref } from "vue";
import { AppModal, EmptyState, Icon, UiButton, UiCheckbox } from "@delebash/llm-ui";
import { useProjectStore } from "../stores/project.js";
import { useUiStore } from "../stores/ui.js";
import { collectEntities, proposeSceneLinks } from "../services/rag/entityMatcher.js";

const emit = defineEmits(["close", "applied"]);

const project = useProjectStore();
const ui = useUiStore();

// One deterministic pass on open — a read-only string scan (sub-second even
// on a long book). proposeSceneLinks already skips links that are set.
const found = proposeSceneLinks(project, collectEntities(project));

const SECTIONS = [
  { key: "characters", label: "Characters", icon: "Users" },
  { key: "locations",  label: "Locations",  icon: "Pin" },
  { key: "objects",    label: "Objects",    icon: "Cube" },
];

// field → [{ key, field, id, entityName, rows: [{...proposal, accept}] }]
// sorted by entity name so a misfiring common-word entity is easy to spot
// and untick as a block.
function buildGroups(list) {
  const byEntity = new Map();
  for (const p of list) {
    const key = `${p.field}:${p.id}`;
    if (!byEntity.has(key)) {
      byEntity.set(key, { key, field: p.field, id: p.id, entityName: p.entityName, rows: [] });
    }
    byEntity.get(key).rows.push({ ...p, accept: true });
  }
  const grouped = { characters: [], locations: [], objects: [] };
  for (const g of byEntity.values()) grouped[g.field]?.push(g);
  for (const k of Object.keys(grouped)) {
    grouped[k].sort((a, b) => a.entityName.localeCompare(b.entityName));
  }
  return grouped;
}
const groups = ref(buildGroups(found));

const totalProposed = found.length;
const totalSelected = computed(() =>
  SECTIONS.reduce((n, s) => n + groups.value[s.key]
    .reduce((m, g) => m + g.rows.filter((r) => r.accept).length, 0), 0));
const sectionCount = (key) =>
  groups.value[key].reduce((n, g) => n + g.rows.length, 0);

function setGroup(group, on) {
  group.rows = group.rows.map((r) => ({ ...r, accept: on }));
}

function sceneLabel(r) {
  const scene = r.sceneTitle ? `“${r.sceneTitle}”` : `Scene ${r.sceneIdx + 1}`;
  return `Ch. ${r.chapterNum}${r.chapterTitle ? ` — ${r.chapterTitle}` : ""} · ${scene}`;
}

function apply() {
  const entries = [];
  for (const sec of SECTIONS) {
    for (const g of groups.value[sec.key]) {
      for (const r of g.rows) {
        if (r.accept) entries.push({ chapterId: r.chapterId, sceneId: r.sceneId, field: r.field, id: r.id });
      }
    }
  }
  const applied = project.applyScenePresenceLinks(entries);
  ui.showToast({ message: `Linked ${applied} scene${applied === 1 ? "" : "s"} to the story bible.` });
  emit("applied", { applied });
  emit("close");
}
</script>

<template>
  <AppModal
    eyebrow="Link scenes"
    title="Link scenes to the story bible"
    @close="emit('close')"
  >
    <p v-if="totalProposed" class="lb-desc">
      Every story-bible name and alias was matched against your prose — no AI involved —
      and these scenes mention an entity they aren't linked to yet. Tick what to keep;
      nothing is saved until you confirm.
    </p>

    <EmptyState v-if="!totalProposed"
      icon="Check"
      title="Nothing to link"
      message="Every scene that names a story-bible character, location, or object already carries that link." />

    <div v-else class="lb-body">
      <section v-for="sec in SECTIONS" :key="sec.key" v-show="groups[sec.key].length" class="lb-section">
        <header class="lb-section-h">
          <Icon :name="sec.icon" :size="13" />
          <h3>{{ sec.label }}</h3>
          <span class="t-muted">{{ sectionCount(sec.key) }} proposed</span>
        </header>
        <div v-for="g in groups[sec.key]" :key="g.key" class="lb-group">
          <div class="lb-group-h">
            <span class="lb-group-name">{{ g.entityName }}</span>
            <span class="t-muted">{{ g.rows.filter((r) => r.accept).length }} of {{ g.rows.length }}</span>
            <div class="lb-group-actions">
              <button type="button" class="tb-btn wide" @click="setGroup(g, true)">{{ $t("common.all") }}</button>
              <button type="button" class="tb-btn wide" @click="setGroup(g, false)">{{ $t("common.none") }}</button>
            </div>
          </div>
          <label v-for="r in g.rows" :key="`${r.sceneId}:${r.field}:${r.id}`"
            class="lb-row" :class="{ dropped: !r.accept }">
            <UiCheckbox v-model="r.accept" />
            <span class="lb-scene">{{ sceneLabel(r) }}</span>
            <span v-if="r.matched !== r.entityName" class="lb-matched">as “{{ r.matched }}”</span>
          </label>
        </div>
      </section>
    </div>

    <template #footer>
      <span class="t-muted">{{ totalSelected }} of {{ totalProposed }} links selected</span>
      <span style="flex:1"></span>
      <UiButton intent="ghost" @click="emit('close')">{{ $t("common.cancel") }}</UiButton>
      <UiButton intent="primary" :disabled="totalSelected === 0" @click="apply">
        <Icon name="Check" :size="13" />
        Link {{ totalSelected }} scene{{ totalSelected === 1 ? "" : "s" }}
      </UiButton>
    </template>
  </AppModal>
</template>

<style scoped>
.lb-desc {
  font-size: 12px; line-height: 1.55; color: var(--muted);
  margin: 0 0 14px;
}

.lb-body { display: flex; flex-direction: column; gap: 20px; }

.lb-section { display: flex; flex-direction: column; gap: 10px; }
.lb-section-h {
  display: flex; align-items: center; gap: 8px;
  padding-bottom: 6px; border-bottom: 1px solid var(--border-soft);
  font-family: var(--font-mono); font-size: 10.5px;
  letter-spacing: 0.12em; text-transform: uppercase; color: var(--muted);
}
.lb-section-h h3 { margin: 0; font-size: 11px; font-weight: 600; color: var(--ink); letter-spacing: inherit; text-transform: inherit; }
.lb-section-h .t-muted { font-weight: 400; margin-left: auto; }

.lb-group {
  display: flex; flex-direction: column; gap: 4px;
  padding: 10px 12px;
  border: 1px solid var(--border-soft); border-radius: 8px;
  background: var(--surface);
}
.lb-group-h { display: flex; align-items: baseline; gap: 8px; margin-bottom: 4px; }
.lb-group-name { font-family: var(--font-serif); font-size: 14px; font-weight: 500; color: var(--ink); }
.lb-group-actions { display: flex; gap: 4px; margin-left: auto; }

.lb-row {
  display: flex; align-items: center; gap: 8px;
  padding: 3px 2px;
  font-size: 12.5px; color: var(--ink-2);
  cursor: pointer;
  transition: opacity .15s;
}
.lb-row.dropped { opacity: 0.5; }
.lb-scene { min-width: 0; }
.lb-matched {
  font-size: 11px; color: var(--muted);
  font-style: italic;
  white-space: nowrap;
}
</style>
