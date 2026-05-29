<script setup>
import { computed } from "vue";
import { useProjectStore } from "../stores/project.js";
import { useUiStore } from "../stores/ui.js";
import { useRouter } from "vue-router";
import Icon from "../components/Icon.vue";
import RichEditor from "../components/RichEditor.vue";
import { promptDialog, confirmDialog } from "../services/dialog.js";
import { NEW_ENTITY_META } from "../services/entityMeta.js";

const props = defineProps({ id: { type: String, default: "" } });
const project = useProjectStore();
const ui = useUiStore();
const router = useRouter();
const n = computed(() => project.noteById(props.id || ui.selections.notes) || project.notes[0]);

function update(k, v) { project.updateNote(n.value.id, { [k]: v }); }
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
      <span class="pane-eyebrow">Note</span>
      <input v-if="n" class="note-title"
        :value="n.title"
        placeholder="Note title"
        @input="update('title', $event.target.value)" />
      <h1 v-else class="pane-h1">No notes</h1>
    </div>
    <div class="pane-actions">
      <input v-if="n" class="input" placeholder="tag" style="max-width:120px"
        :value="n.tag" @input="update('tag', $event.target.value)" />
      <span v-if="n" class="t-muted" style="font-size:12px;padding:0 8px">Updated {{ n.updated }}</span>
      <button v-if="n" class="btn ghost" @click="deleteNote">Delete</button>
      <button class="btn primary" @click="addNote"><Icon name="Plus" :size="14" /> New note</button>
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
      <button class="btn primary" style="margin-top:14px" @click="addNote"><Icon name="Plus" :size="14" /> Create your first note</button>
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
</style>
