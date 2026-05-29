<script setup>
// Per-chapter version history. Save a named snapshot of the chapter's
// scenes, then restore or delete it later. Snapshots live in the
// versions store (separate from undo), scoped to the active project.

import { ref, computed } from "vue";
import { useVersionsStore } from "../stores/versions.js";
import { useUiStore } from "../stores/ui.js";
import { confirmDialog } from "../services/dialog.js";
import Icon from "./Icon.vue";

const props = defineProps({
  chapterId: { type: String, required: true },
  chapterTitle: { type: String, default: "" },
});
const emit = defineEmits(["close"]);

const versions = useVersionsStore();
const ui = useUiStore();

const label = ref("");
const list = computed(() => versions.versionsFor(props.chapterId));

function save() {
  versions.saveVersion(props.chapterId, label.value);
  label.value = "";
  ui.showToast({ message: "Version saved." });
}
async function restore(v) {
  const yes = await confirmDialog({
    title: "Restore this version?",
    message: "The chapter's current scenes will be replaced. You can undo (⌘Z) right after if needed.",
    confirmLabel: "Restore",
  });
  if (!yes) return;
  versions.restoreVersion(props.chapterId, v.id);
  ui.showToast({ message: "Version restored." });
  emit("close");
}
async function remove(v) {
  const yes = await confirmDialog({ title: "Delete this version?", confirmLabel: "Delete", danger: true });
  if (!yes) return;
  versions.deleteVersion(props.chapterId, v.id);
}
function when(iso) { try { return new Date(iso).toLocaleString(); } catch { return iso; } }
</script>

<template>
  <div class="modal-overlay" @click.self="emit('close')">
    <div class="modal vh-modal">
      <div class="modal-head">
        <div>
          <div class="t-eyebrow">Version history</div>
          <div class="modal-title">{{ chapterTitle || "Chapter" }}</div>
        </div>
        <button class="btn ghost sm" @click="emit('close')">Close</button>
      </div>
      <div class="modal-body">
        <div class="vh-save">
          <input class="input" v-model="label" placeholder="Label this version (optional)…" @keydown.enter="save" />
          <button class="btn primary" @click="save"><Icon name="History" :size="14" /> Save version</button>
        </div>
        <p class="t-muted" style="font-size:11.5px;margin:10px 0 6px">
          Snapshots of this chapter's scenes, kept on this device. Newest first.
        </p>
        <div v-if="list.length" class="vh-list">
          <div v-for="v in list" :key="v.id" class="vh-row">
            <div class="vh-main">
              <div class="vh-label">{{ v.label || "Untitled version" }}</div>
              <div class="vh-meta">{{ when(v.savedAt) }} · {{ v.words.toLocaleString() }} words · {{ v.scenes.length }} scene{{ v.scenes.length === 1 ? "" : "s" }}</div>
            </div>
            <button class="btn ghost sm" @click="restore(v)">Restore</button>
            <button class="vh-del" title="Delete version" @click="remove(v)"><Icon name="Trash" :size="13" /></button>
          </div>
        </div>
        <div v-else class="t-muted" style="font-size:12.5px;text-align:center;padding:22px 0;background:var(--surface-2);border-radius:8px">
          No versions saved yet. Save one before a big revision so you can roll back.
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.vh-modal { width: min(560px, 94vw); display: flex; flex-direction: column; max-height: 82vh; }
.vh-save { display: flex; gap: 8px; align-items: center; }
.vh-save .input { flex: 1; }
.vh-list { display: flex; flex-direction: column; gap: 6px; overflow: auto; }
.vh-row { display: flex; align-items: center; gap: 8px; border: 1px solid var(--border); border-radius: 8px; background: var(--surface); padding: 8px 10px; }
.vh-main { flex: 1; min-width: 0; }
.vh-label { font-size: 13px; font-weight: 500; color: var(--ink); }
.vh-meta { font-size: 11px; color: var(--muted); font-variant-numeric: tabular-nums; margin-top: 2px; }
.vh-del { width: 32px; height: 30px; display: grid; place-items: center; border: 1px solid var(--border); border-radius: 7px; background: var(--surface); color: var(--muted); }
.vh-del:hover { color: var(--danger-ink, #c0392b); border-color: var(--border-strong); }
</style>
