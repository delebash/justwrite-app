<script setup>
// Project-wide find & replace across chapter PROSE (scene bodies). Shows
// a live, book-ordered preview of every scene that contains the term;
// replace a single scene from its row, or all at once from the footer.
// Replacing all is a single undo (project.replaceInScenes).

import { ref, computed } from "vue";
import { useProjectStore } from "../stores/project.js";
import { useUiStore } from "../stores/ui.js";
import { useRouter } from "vue-router";
import { scanScenes } from "../services/projectReplace.js";
import { Icon } from "@delebash/llm-ui";
import { AppModal } from "@delebash/llm-ui";
import { UiButton } from "@delebash/llm-ui";
import { UiCheckbox } from "@delebash/llm-ui";
import { UiInput } from "@delebash/llm-ui";

const props = defineProps({ initialTerm: { type: String, default: "" } });
const emit = defineEmits(["close"]);

const project = useProjectStore();
const ui = useUiStore();
const router = useRouter();

const term = ref(props.initialTerm || "");
const replaceWith = ref("");
const caseSensitive = ref(false);

const preview = computed(() => scanScenes(project, term.value.trim(), caseSensitive.value));
const canReplace = computed(() => term.value.trim().length > 0 && preview.value.total > 0);

// The replace result reports on the modal's own summary line (durable, right
// where the user is looking) — not a toast (QC-37, the user's #41 verdict).
const lastResult = ref("");
function replaceAll() {
  if (!canReplace.value) return;
  const n = project.replaceInScenes(term.value.trim(), replaceWith.value, { caseSensitive: caseSensitive.value });
  lastResult.value = `Replaced ${n} ${n === 1 ? "match" : "matches"} across the manuscript.`;
}
function replaceRow(row) {
  const n = project.replaceInScene(row.chapterId, row.sceneId, term.value.trim(), replaceWith.value, { caseSensitive: caseSensitive.value });
  if (n) lastResult.value = `Replaced ${n} in ${row.chapterNum}.${row.sceneIdx}.`;
}
function openScene(row) {
  ui.select("chapters", row.chapterId);
  router.push(`/chapters/${row.chapterId}/${row.sceneId}`);
  emit("close");
}
</script>

<template>
  <AppModal :eyebrow="$t('panes.search.eyebrow')" :title="$t('projectReplace.title')" @close="emit('close')">
    <div class="pr-fields">
      <UiInput v-model="term" :placeholder="$t('projectReplace.findPlaceholder')" autofocus />
      <UiInput v-model="replaceWith" :placeholder="$t('projectReplace.replacePlaceholder')" />
      <UiCheckbox v-model="caseSensitive" class="pr-case" :title="$t('projectReplace.matchCaseTitle')">{{ $t("projectReplace.matchCaseGlyph") }}</UiCheckbox>
    </div>

    <div class="pr-summary">
      <span v-if="term.trim() && preview.total">
        <i18n-t keypath="projectReplace.matchCount" tag="span" :plural="preview.total" scope="global">
          <template #n><b>{{ preview.total }}</b></template>
        </i18n-t>
        <i18n-t keypath="projectReplace.sceneCount" tag="span" :plural="preview.rows.length" scope="global">
          <template #n><b>{{ preview.rows.length }}</b></template>
        </i18n-t>
      </span>
      <span v-else-if="term.trim()" class="t-muted">{{ $t("editor.mentions.noMatches") }}</span>
      <span v-else class="t-muted">{{ $t("projectReplace.hint") }}</span>
      <span v-if="lastResult" class="pr-done">{{ lastResult }}</span>
    </div>

    <div v-if="preview.rows.length" class="pr-list">
      <div v-for="row in preview.rows" :key="`${row.chapterId}:${row.sceneId}`" class="pr-row">
        <button class="pr-row-main" @click="openScene(row)"
          :title="$t('projectReplace.openRowTitle', { num: row.chapterNum, title: row.chapterTitle, scene: row.sceneTitle })">
          <span class="pr-row-head">
            <span class="status-dot" :class="row.sceneStatus" />
            <span class="pr-num">{{ row.chapterNum }}.{{ row.sceneIdx }}</span>
            <span class="pr-title">{{ row.sceneTitle }}</span>
            <span class="pr-count">×{{ row.count }}</span>
          </span>
          <span class="pr-snippet">{{ row.snippet }}</span>
        </button>
        <UiButton intent="ghost" size="small" :disabled="!term.trim()" @click="replaceRow(row)">{{ $t("projectReplace.replaceRow") }}</UiButton>
      </div>
    </div>

    <template #footer>
      <span class="t-muted" style="font-size:11.5px">{{ $t("projectReplace.undoHint") }}</span>
      <UiButton intent="primary" :disabled="!canReplace" @click="replaceAll">
        <Icon name="Replace" :size="14" />
        {{ preview.total ? $t("projectReplace.replaceAllCount", { n: preview.total }) : $t("projectReplace.replaceAll") }}
      </UiButton>
    </template>
  </AppModal>
</template>

<style scoped>
.pr-fields { display: flex; gap: 8px; align-items: center; }
.pr-fields .input { flex: 1; min-width: 0; }
.pr-case { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; color: var(--muted); cursor: pointer; flex: none; }
.pr-summary { margin: 12px 0 8px; font-size: 12.5px; color: var(--ink-2); }
.pr-done { margin-left: 10px; color: var(--status-done); font-weight: 600; }
.pr-list { display: flex; flex-direction: column; gap: 6px; overflow: auto; }
.pr-row { display: flex; align-items: stretch; gap: 8px; }
.pr-row-main {
  flex: 1; min-width: 0; text-align: left; appearance: none; font: inherit; cursor: pointer;
  border: 1px solid var(--border); border-radius: 8px; background: var(--surface);
  padding: 8px 10px; display: flex; flex-direction: column; gap: 3px;
}
.pr-row-main:hover { background: var(--surface-2); border-color: var(--border-strong); }
.pr-row-head { display: flex; align-items: center; gap: 7px; font-size: 12.5px; color: var(--ink-2); }
.pr-num { color: var(--muted); font-variant-numeric: tabular-nums; flex: none; }
.pr-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; min-width: 0; }
.pr-count { font-size: 10.5px; color: var(--muted); background: var(--surface-3); border-radius: 999px; padding: 1px 6px; flex: none; }
.pr-snippet {
  font-family: var(--font-serif); font-size: 12px; font-style: italic; color: var(--muted);
  overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
}
</style>
