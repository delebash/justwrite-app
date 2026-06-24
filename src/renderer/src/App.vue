<script setup>
import { computed, onMounted, onBeforeUnmount, watchEffect, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useUiStore } from "./stores/ui.js";
import { useProjectStore } from "./stores/project.js";
import { applyAppearance } from "./services/appearance.js";
import { applyEditorSettings } from "./services/editorSettings.js";
import TitleBar from "./components/TitleBar.vue";
import Sidebar from "./components/Sidebar.vue";
import { Toast } from "@delebash/llm-ui";
import { AppDialog } from "@delebash/llm-ui";
import CommandPalette from "./components/CommandPalette.vue";
import ProjectReplaceModal from "./components/ProjectReplaceModal.vue";
import ChatPanel from "./components/ChatPanel.vue";
import { HelpDrawer } from "@delebash/llm-ui";
import ShortcutCheatsheet from "./components/ShortcutCheatsheet.vue";
import WhatsNewModal from "./components/WhatsNewModal.vue";

const palette = ref(null);

const route = useRoute();
const router = useRouter();
const ui = useUiStore();
const project = useProjectStore();

const screenLabel = computed(() => String(route.name || ""));

// True when the focused element belongs to the rich editor (TipTap puts
// `contenteditable=true` on its root). That editor has its own
// undo/redo via prosemirror history, so we don't want to intercept ⌘Z
// while the user is mid-text-edit.
function focusedInRichEditor() {
  const el = document.activeElement;
  return !!el && (el.matches?.("[contenteditable=true]") || el.closest?.("[contenteditable=true]"));
}

// Global keyboard shortcuts.
function onKey(e) {
  const mod = e.metaKey || e.ctrlKey;
  if (!mod) return;
  const key = e.key.toLowerCase();

  // ⌘⇧F → open project-wide find & replace (any route).
  if (key === "f" && e.shiftKey) {
    e.preventDefault();
    ui.openProjectReplace();
    return;
  }
  // ⌘F / Ctrl+F → jump to Search and focus its input.
  if (key === "f") {
    e.preventDefault();
    if (route.path !== "/search") router.push("/search");
    return;
  }
  // ⌘P / Ctrl+P → open the command palette.
  if (key === "p") {
    e.preventDefault();
    palette.value?.open();
    return;
  }
  // ⌘J / Ctrl+J → toggle the manuscript chat panel.
  if (key === "j") {
    e.preventDefault();
    ui.toggleChatPanel();
    return;
  }
  // ⌘\ → toggle sidebar.
  if (e.key === "\\") {
    e.preventDefault();
    ui.toggleSidebar();
    return;
  }
  // ⌘/ → keyboard shortcut cheatsheet.
  if (e.key === "/") {
    e.preventDefault();
    ui.toggleShortcuts();
    return;
  }
  // ⌘Z / ⌘⇧Z (or ⌘Y on Windows) — undo/redo. Stays out of the rich
  // editor's way so paragraph-level edits still hop through prosemirror.
  if (key === "z" && !e.shiftKey) {
    if (focusedInRichEditor()) return;
    e.preventDefault();
    project.undo();
    return;
  }
  if ((key === "z" && e.shiftKey) || key === "y") {
    if (focusedInRichEditor()) return;
    e.preventDefault();
    project.redo();
    return;
  }
}

// Keep the appearance (mode, accent, fonts, surface tints, editor layout)
// in sync with the user's preference. The service was initialized once at
// module load (in main.js) with the persisted value; this watcher handles
// in-app changes from Settings → Appearance.
watchEffect(() => applyAppearance(ui.appearance));
watchEffect(() => applyEditorSettings(ui.editorSettings));

onMounted(() => {
  // Capture phase so we beat default browser/Tauri accelerators (e.g.
  // Ctrl+P opening the OS print dialog before our palette can intercept).
  window.addEventListener("keydown", onKey, { capture: true });
});
onBeforeUnmount(() => window.removeEventListener("keydown", onKey, { capture: true }));
</script>

<template>
  <div class="app-stage">
    <TitleBar :title="ui.projectTitle" />
    <div class="app" :class="{ collapsed: ui.sidebarCollapsed }"
      :style="ui.sidebarCollapsed ? null : `grid-template-columns: ${ui.sidebarWidth}px 1fr`">
      <Sidebar />
      <main class="main" :data-screen-label="screenLabel">
        <router-view v-slot="{ Component }">
          <component :is="Component" />
        </router-view>
      </main>
    </div>
    <Toast />
    <AppDialog />
    <CommandPalette ref="palette" />
    <ProjectReplaceModal v-if="ui.replaceModal.open"
      :initial-term="ui.replaceModal.initialTerm"
      @close="ui.closeProjectReplace()" />
    <ChatPanel v-model="ui.chatPanelOpen" />
    <HelpDrawer />
    <ShortcutCheatsheet />
    <WhatsNewModal />
  </div>
</template>
