<script setup>
import { useUiStore } from "../stores/ui.js";
import { useProjectStore } from "../stores/project.js";
import Icon from "./Icon.vue";

defineProps({ title: { type: String, default: "JustWrite" } });

const ui = useUiStore();
const project = useProjectStore();
const jw = window.justwrite;

async function saveProject() {
  if (!jw?.project?.save) {
    alert("Save is only available in the Electron desktop build.");
    return;
  }
  await jw.project.save(project.exportSnapshot(), project.project.title);
}

async function openProject() {
  if (!jw?.project?.open) {
    alert("Open is only available in the Electron desktop build.");
    return;
  }
  const res = await jw.project.open();
  if (res?.ok && res.snapshot) project.loadSnapshot(res.snapshot);
}
</script>

<template>
  <div class="titlebar">
    <div class="titlebar-spacer" />
    <div class="titlebar-title">{{ title }}</div>
    <div class="titlebar-right">
      <button @click="openProject" title="Open project…"><Icon name="Folder" :size="13" /></button>
      <button @click="saveProject" title="Save project as…"><Icon name="Download" :size="13" /></button>
      <span class="titlebar-divider" />
      <button @click="project.undo" :disabled="!project.canUndo" :title="`Undo${project.canUndo ? '' : ' (nothing to undo)'} · ⌘Z`">
        <Icon name="Refresh" :size="13" style="transform:scaleX(-1)" />
      </button>
      <button @click="project.redo" :disabled="!project.canRedo" :title="`Redo${project.canRedo ? '' : ' (nothing to redo)'} · ⌘⇧Z`">
        <Icon name="Refresh" :size="13" />
      </button>
      <span class="titlebar-divider" />
      <button @click="ui.toggleSidebar" :title="ui.sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'">
        <Icon name="SidebarToggle" :size="14" />
      </button>
      <router-link to="/search" custom v-slot="{ navigate }">
        <button @click="navigate" title="Search · ⌘F"><Icon name="Search" :size="13" /></button>
      </router-link>
    </div>
  </div>
</template>

<style scoped>
.titlebar-divider {
  width: 1px;
  height: 14px;
  background: var(--border);
  margin: 0 2px;
}
.titlebar-right button:disabled {
  opacity: 0.32;
  cursor: default;
}
</style>
