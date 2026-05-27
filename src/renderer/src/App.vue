<script setup>
import { computed, onMounted, onBeforeUnmount, watchEffect } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useUiStore } from "./stores/ui.js";
import { useProjectStore } from "./stores/project.js";
import { useSessionsStore } from "./stores/sessions.js";
import { applyTheme } from "./services/theme.js";
import TitleBar from "./components/TitleBar.vue";
import Sidebar from "./components/Sidebar.vue";
import Toast from "./components/Toast.vue";
import AppDialog from "./components/AppDialog.vue";

const route = useRoute();
const router = useRouter();
const ui = useUiStore();
const project = useProjectStore();
const sessions = useSessionsStore();

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

  // ⌘F / Ctrl+F → jump to Search and focus its input.
  if (key === "f") {
    e.preventDefault();
    if (route.path !== "/search") router.push("/search");
    return;
  }
  // ⌘\ → toggle sidebar.
  if (e.key === "\\") {
    e.preventDefault();
    ui.toggleSidebar();
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

// Keep the resolved theme in sync with the user's preference. The theme
// service was already initialized once at module load (in main.js) using
// the persisted value; this watcher handles in-app changes from Settings.
watchEffect(() => applyTheme(ui.theme, ui.accentHue));

onMounted(() => {
  window.addEventListener("keydown", onKey);
  // One-shot migration: roll any pre-existing daily entries older than
  // the retention cap into the monthly archive. Idempotent.
  sessions._archiveOldDays();
});
onBeforeUnmount(() => window.removeEventListener("keydown", onKey));
</script>

<template>
  <div class="app-stage">
    <TitleBar :title="`JustWrite — ${ui.projectTitle}`" />
    <div class="app" :class="{ collapsed: ui.sidebarCollapsed }">
      <Sidebar />
      <main class="main" :data-screen-label="screenLabel">
        <router-view v-slot="{ Component }">
          <component :is="Component" />
        </router-view>
      </main>
    </div>
    <Toast />
    <AppDialog />
  </div>
</template>
