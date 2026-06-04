<script setup>
import { computed, ref, watch } from "vue";
import JwInput from "@renderer/components/ui/JwInput.vue";
import JwButton from "@renderer/components/ui/JwButton.vue";
import { useProjectStore } from "../stores/project.js";
import { useUiStore } from "../stores/ui.js";
import { useRouter } from "vue-router";
import Icon from "../components/Icon.vue";
import RichEditor from "../components/RichEditor.vue";
import Breadcrumb from "../components/Breadcrumb.vue";
import { promptDialog, confirmDialog } from "../services/dialog.js";
import { NEW_ENTITY_META } from "../services/entityMeta.js";

const props = defineProps({ id: { type: String, default: "" } });
const project = useProjectStore();
const ui = useUiStore();
const router = useRouter();
const n = computed(() => project.noteById(props.id || ui.selections.notes) || project.notes[0]);

function update(k, v) { project.updateNote(n.value.id, { [k]: v }); }

// Tag typeahead — note.tag is a single string slot. Surface every
// distinct tag in use across the project so writers reuse vocabulary
// instead of splintering it. Free text still wins on blur/Enter.
const tagSuggestOpen = ref(false);
const tagSuggestIndex = ref(0);
const tagSuggestions = computed(() => {
  if (!n.value) return [];
  const q = String(n.value.tag || "").trim().toLowerCase();
  const all = project.notes.map((x) => x.tag).filter(Boolean);
  const uniq = Array.from(new Set(all));
  return uniq
    .filter((t) => t !== n.value.tag)
    .filter((t) => !q || t.toLowerCase().includes(q))
    .slice(0, 8);
});
function onTagFocus() { tagSuggestOpen.value = true; tagSuggestIndex.value = 0; }
function onTagBlur() { setTimeout(() => { tagSuggestOpen.value = false; }, 120); }

// The view stays mounted across note navigation — reset suggest state
// so the dropdown doesn't linger from a previous note.
watch(() => n.value?.id, () => {
  tagSuggestOpen.value = false;
  tagSuggestIndex.value = 0;
});
function pickTag(t) { update("tag", t); tagSuggestOpen.value = false; }
function onTagKeydown(e) {
  const list = tagSuggestions.value;
  if (e.key === "ArrowDown" && list.length) {
    e.preventDefault();
    tagSuggestOpen.value = true;
    tagSuggestIndex.value = (tagSuggestIndex.value + 1) % list.length;
  } else if (e.key === "ArrowUp" && list.length) {
    e.preventDefault();
    tagSuggestOpen.value = true;
    tagSuggestIndex.value = (tagSuggestIndex.value - 1 + list.length) % list.length;
  } else if (e.key === "Enter" && tagSuggestOpen.value && list.length) {
    e.preventDefault();
    pickTag(list[tagSuggestIndex.value]);
  } else if (e.key === "Escape" && tagSuggestOpen.value) {
    e.preventDefault();
    tagSuggestOpen.value = false;
  }
}
async function addNote() {
  const title = await promptDialog(NEW_ENTITY_META.notes);
  if (!title) return;
  const id = project.addNote({ title }); ui.select("notes", id); router.push(`/notes/${id}`);
}
async function deleteNote() {
  if (!n.value) return;
  const yes = await confirmDialog({
    title: `Delete "${n.value.title}"?`,
    confirmLabel: "Delete",
    danger: true,
  });
  if (!yes) return;
  project.removeNote(n.value.id);
  const next = project.notes[0];
  if (next) { ui.select("notes", next.id); router.push(`/notes/${next.id}`); } else router.push("/");
}
</script>

<template>
  <header class="pane-header note-pane-header">
    <div class="pane-title">
      <Breadcrumb :segments="[{ label: 'Note', to: '/notes' }]" />
      <input v-if="n" class="note-title"
        :value="n.title"
        placeholder="Note title"
        @input="update('title', $event.target.value)" />
      <h1 v-else class="pane-h1">No notes</h1>
    </div>
    <div class="pane-actions">
      <div v-if="n" class="note-tag-wrap">
        <JwInput fluid placeholder="tag"
          :model-value="n.tag"
          @update:model-value="update('tag', $event)"
          @focus="onTagFocus"
          @blur="onTagBlur"
          @keydown="onTagKeydown" />
        <ul v-if="tagSuggestOpen && tagSuggestions.length" class="note-tag-suggest" role="listbox">
          <li v-for="(t, i) in tagSuggestions" :key="t"
            class="note-tag-suggest-item"
            :class="{ active: i === tagSuggestIndex }"
            role="option"
            :aria-selected="i === tagSuggestIndex"
            @mouseenter="tagSuggestIndex = i"
            @mousedown.prevent="pickTag(t)">
            {{ t }}
          </li>
        </ul>
      </div>
      <span v-if="n" class="t-muted" style="font-size:12px;padding:0 8px">Updated {{ n.updated }}</span>
      <JwButton v-if="n" intent="ghost" size="small" @click="deleteNote">Delete</JwButton>
      <JwButton intent="primary" size="small" @click="addNote"><Icon name="Plus" :size="14" /> New note</JwButton>
    </div>
  </header>

  <div v-if="n" class="pane-card">
    <RichEditor
      :model-value="n.body"
      placeholder="Start writing the note…"
      @change="(html) => update('body', html)"
    />
  </div>

  <div v-else class="pane-card" style="display:grid;place-items:center;padding:60px">
    <div class="t-muted" style="text-align:center">
      No notes yet.<br />
      <JwButton intent="primary" style="margin-top:14px" @click="addNote"><Icon name="Plus" :size="14" /> Create your first note</JwButton>
    </div>
  </div>
</template>

<style scoped>
.note-pane-header .pane-title { gap: 2px; }
.note-title {
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
.note-title:hover { border-color: var(--border-soft); }
.note-title:focus { border-color: var(--accent); background: var(--surface); box-shadow: 0 0 0 3px var(--accent-soft); }

.note-tag-wrap { position: relative; max-width: 120px; }
.note-tag-suggest {
  position: absolute; top: calc(100% + 4px); right: 0;
  margin: 0; padding: 4px; list-style: none;
  background: var(--surface); border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, .14);
  min-width: 140px; max-width: 240px;
  z-index: 40;
  max-height: 240px; overflow-y: auto;
}
.note-tag-suggest-item {
  padding: 5px 10px; border-radius: 5px;
  font-size: 13px; color: var(--ink);
  cursor: pointer;
}
.note-tag-suggest-item.active { background: var(--accent-soft); color: var(--accent-ink); }
</style>
