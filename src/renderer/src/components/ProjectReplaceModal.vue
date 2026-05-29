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
import Icon from "./Icon.vue";

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

function replaceAll() {
  if (!canReplace.value) return;
  const n = project.replaceInScenes(term.value.trim(), replaceWith.value, { caseSensitive: caseSensitive.value });
  ui.showToast({ message: `Replaced ${n} ${n === 1 ? "match" : "matches"} across the manuscript.` });
}
function replaceRow(row) {
  const n = project.replaceInScene(row.chapterId, row.sceneId, term.value.trim(), replaceWith.value, { caseSensitive: caseSensitive.value });
  if (n) ui.showToast({ message: `Replaced ${n} in ${row.chapterNum}.${row.sceneIdx}.` });
}
function openScene(row) {
  ui.select("chapters", row.chapterId);
  router.push(`/chapters/${row.chapterId}/${row.sceneId}`);
  emit("close");
}
</script>

<template>
  <div class="modal-overlay" @click.self="emit('close')">
    <div class="modal pr-modal">
      <div class="modal-head">
        <div>
          <div class="t-eyebrow">Manuscript</div>
          <div class="modal-title">Find &amp; replace in prose</div>
        </div>
        <button class="btn ghost sm" @click="emit('close')">Close</button>
      </div>

      <div class="modal-body">
        <div class="pr-fields">
          <input class="input" v-model="term" placeholder="Find in all chapters…" autofocus />
          <input class="input" v-model="replaceWith" placeholder="Replace with…" />
          <label class="pr-case" title="Match case">
            <input type="checkbox" v-model="caseSensitive" /> Aa
          </label>
        </div>

        <div class="pr-summary">
          <span v-if="term.trim() && preview.total">
            <b>{{ preview.total }}</b> {{ preview.total === 1 ? "match" : "matches" }} in
            <b>{{ preview.rows.length }}</b> {{ preview.rows.length === 1 ? "scene" : "scenes" }}
          </span>
          <span v-else-if="term.trim()" class="t-muted">No matches</span>
          <span v-else class="t-muted">Type a term to search every chapter's prose. @-mention chips are left untouched.</span>
        </div>

        <div v-if="preview.rows.length" class="pr-list">
          <div v-for="row in preview.rows" :key="`${row.chapterId}:${row.sceneId}`" class="pr-row">
            <button class="pr-row-main" @click="openScene(row)"
              :title="`Open Ch. ${row.chapterNum} · ${row.chapterTitle} — ${row.sceneTitle}`">
              <span class="pr-row-head">
                <span class="status-dot" :class="row.chapterStatus" />
                <span class="pr-num">{{ row.chapterNum }}.{{ row.sceneIdx }}</span>
                <span class="pr-title">{{ row.sceneTitle }}</span>
                <span class="pr-count">×{{ row.count }}</span>
              </span>
              <span class="pr-snippet">{{ row.snippet }}</span>
            </button>
            <button class="btn ghost sm" :disabled="!term.trim()" @click="replaceRow(row)">Replace</button>
          </div>
        </div>
      </div>

      <div class="modal-foot">
        <span class="t-muted" style="font-size:11.5px">Replace all is a single undo (⌘Z).</span>
        <button class="btn primary" :disabled="!canReplace" @click="replaceAll">
          <Icon name="Replace" :size="14" /> Replace all{{ preview.total ? ` (${preview.total})` : "" }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.pr-modal { width: min(640px, 94vw); display: flex; flex-direction: column; max-height: 82vh; }
.pr-fields { display: flex; gap: 8px; align-items: center; }
.pr-fields .input { flex: 1; min-width: 0; }
.pr-case { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; color: var(--muted); cursor: pointer; flex: none; }
.pr-summary { margin: 12px 0 8px; font-size: 12.5px; color: var(--ink-2); }
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
.modal-foot {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 12px 16px; border-top: 1px solid var(--border);
}
</style>
