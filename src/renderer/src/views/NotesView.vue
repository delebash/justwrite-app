<script setup>
import { computed } from "vue";
import { useProjectStore } from "../stores/project.js";
import { useUiStore } from "../stores/ui.js";
import { useRouter } from "vue-router";
import PaneHeader from "../components/PaneHeader.vue";
import Icon from "../components/Icon.vue";
import RichEditor from "../components/RichEditor.vue";
import { promptDialog, confirmDialog } from "../services/dialog.js";

const props = defineProps({ id: { type: String, default: "" } });
const project = useProjectStore();
const ui = useUiStore();
const router = useRouter();
const n = computed(() => project.noteById(props.id || ui.selections.notes) || project.notes[0]);

function update(k, v) { project.updateNote(n.value.id, { [k]: v }); }
async function addNote() {
  const title = await promptDialog({
    title: "New note",
    label: "Note title",
    placeholder: "e.g. Research — coastline maps",
    confirmLabel: "Create note",
  });
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
  <PaneHeader eyebrow="Note" :title="n?.title || 'No notes'">
    <input v-if="n" class="input" placeholder="tag" style="max-width:120px"
      :value="n.tag" @input="update('tag', $event.target.value)" />
    <span v-if="n" class="t-muted" style="font-size:12px;padding:0 8px">Updated {{ n.updated }}</span>
    <button v-if="n" class="btn ghost" @click="deleteNote">Delete</button>
    <button class="btn primary" @click="addNote"><Icon name="Plus" :size="14" /> New note</button>
  </PaneHeader>

  <div v-if="n" class="pane-body">
    <!-- Title strip — mirrors ChaptersView pattern. -->
    <div style="padding:10px 22px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:12px;flex-wrap:wrap">
      <input class="input" style="max-width:480px;font-family:var(--font-serif);font-weight:600;font-size:15px"
        :value="n.title" @input="update('title', $event.target.value)" />
      <span style="margin-left:auto;font-size:11.5px;color:var(--muted)">Updated {{ n.updated }}</span>
    </div>

    <RichEditor
      :model-value="n.body"
      placeholder="Start writing the note…"
      @change="(html) => update('body', html)"
    />
  </div>

  <div v-else class="scrollarea" style="flex:1;display:grid;place-items:center;padding:60px">
    <div class="t-muted" style="text-align:center">
      No notes yet.<br />
      <button class="btn primary" style="margin-top:14px" @click="addNote"><Icon name="Plus" :size="14" /> Create your first note</button>
    </div>
  </div>
</template>
