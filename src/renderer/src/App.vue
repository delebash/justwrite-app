<script setup>
import { computed, onMounted, onBeforeUnmount, watch, watchEffect, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useUiStore } from "./stores/ui.js";
import { useProjectStore } from "./stores/project.js";
import { applyAppearance } from "./services/appearance.js";
import { applyEditorSettings } from "./services/editorSettings.js";
import { warmModelId } from "./services/warmStartup.js";
import TitleBar from "./components/TitleBar.vue";
import Sidebar from "./components/Sidebar.vue";
import OnboardingShell from "./components/OnboardingShell.vue";
import { Toast } from "@delebash/llm-ui";
import { AppDialog } from "@delebash/llm-ui";
import { DownloadBar, useRunnerModels } from "@delebash/llm-ui";
import CommandPalette from "./components/CommandPalette.vue";
import ProjectReplaceModal from "./components/ProjectReplaceModal.vue";
import AiSetupDialog from "./components/AiSetupDialog.vue";
import ChatPanel from "./components/ChatPanel.vue";
import { HelpDrawer } from "@delebash/llm-ui";
import ShortcutCheatsheet from "./components/ShortcutCheatsheet.vue";
import WhatsNewModal from "./components/WhatsNewModal.vue";

const palette = ref(null);

const route = useRoute();
const router = useRouter();
const ui = useUiStore();
const project = useProjectStore();

// Boot warm overlay (2026-07-21): when the "load model on startup" toggle warmed the default
// local model, show the SAME DownloadBar the engine panel uses (the runner-models singleton's
// per-model task) below the splash spinner, until the model is resident. Reuse only — no new
// load path, no new bar. `warmModelId` is set by warmStartup.startWarmOnBoot before mount.
const rm = useRunnerModels();
const warmTask = computed(() => (warmModelId.value ? rm.taskFor(warmModelId.value) : null));
const warmRowStatus = computed(() =>
  warmModelId.value ? (rm.models.value.find((m) => m.id === warmModelId.value)?.status || "") : "");
// Auto-dismiss shortly after the model goes resident — a 700ms beat (taskFor emits only
// running/error/empty, never a "done" state, so the bar just stops; there is no "Ready ✓").
// Cancel/error leave the overlay showing the bar's Retry; the always-present Continue is the
// universal escape, so a slow or failed load never traps the user on the boot screen.
watch(warmRowStatus, (s) => {
  if (warmModelId.value && (s === "loaded" || s === "sleeping")) {
    setTimeout(() => { warmModelId.value = ""; }, 700);
  }
});
function dismissWarm() { warmModelId.value = ""; }

const screenLabel = computed(() => String(route.name || ""));

// TitleBar title = the OPEN project's title, live (one source: the project
// store — the same field the sidebar switcher shows). The old ui.projectTitle
// was a dead constant pinned to the demo book's name. With zero projects
// (fresh install / post-reset — /welcome is home) show the app name instead.
const barTitle = computed(() =>
  project.projectsList.length ? (project.project.title || "Untitled") : "JustWrite",
);

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
  // ⌘F / Ctrl+F → jump to Search and focus its input. Not while typing in the rich
  // editor — TipTap owns ⌘F there (its own find-in-editor bar); mirror the ⌘Z bail
  // below. This handler is capture-phase, so it must yield or it steals the key.
  if (key === "f") {
    if (focusedInRichEditor()) return;
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
  // ⌘Z / ⌘⇧Z (or ⌘Y on Windows) — PAGE-RELATED undo/redo (#235): each route
  // declares the data domains it owns in meta.undoDomains, and undo here can
  // only pop those domains' stacks — never an off-screen page's change.
  // Stays out of the rich editor's way (TipTap owns its own ⌘Z), and a page
  // with NO domains (Search, Trash, /ai with its kit-local stack, …) gets no
  // preventDefault either, so native text-field undo keeps working there.
  if (key === "z" && !e.shiftKey) {
    if (focusedInRichEditor()) return;
    const domains = route.meta.undoDomains || [];
    if (!domains.length) return;
    e.preventDefault();
    project.undoFor(domains);
    return;
  }
  if ((key === "z" && e.shiftKey) || key === "y") {
    if (focusedInRichEditor()) return;
    const domains = route.meta.undoDomains || [];
    if (!domains.length) return;
    e.preventDefault();
    project.redoFor(domains);
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
    <!-- Boot warm overlay (2026-07-21, user "put it below the loading circle on front page"):
         continues the index.html splash (spinner + name) and shows the SAME DownloadBar the
         engine panel uses, below the circle, while the default local model loads into VRAM.
         Never traps — "Continue" enters the app and the load keeps running in the background. -->
    <div v-if="warmModelId" class="jw-bootwarm">
      <div class="jw-bootwarm__spin" />
      <div class="jw-bootwarm__name">JustWrite</div>
      <DownloadBar v-if="warmTask" class="jw-bootwarm__bar" :task="warmTask" title="Loading your writing model" />
      <button type="button" class="jw-bootwarm__skip" @click="dismissWarm">Continue without waiting</button>
    </div>
    <TitleBar :title="barTitle" />
    <!-- The project shell (Sidebar + data nav) mounts ONLY with a project loaded;
         otherwise the projectless onboarding shell renders the same routed view
         (welcome / ai / help) with a slim header — no phantom "Untitled". -->
    <div v-if="project.hasActiveProject" class="app" :class="{ collapsed: ui.sidebarCollapsed }"
      :style="ui.sidebarCollapsed ? null : `grid-template-columns: ${ui.sidebarWidth}px 1fr`">
      <Sidebar />
      <main class="main" :data-screen-label="screenLabel">
        <router-view v-slot="{ Component }">
          <component :is="Component" />
        </router-view>
      </main>
    </div>
    <OnboardingShell v-else>
      <router-view v-slot="{ Component }">
        <component :is="Component" />
      </router-view>
    </OnboardingShell>
    <Toast />
    <AppDialog />
    <CommandPalette ref="palette" />
    <ProjectReplaceModal v-if="ui.replaceModal.open"
      :initial-term="ui.replaceModal.initialTerm"
      @close="ui.closeProjectReplace()" />
    <AiSetupDialog v-if="ui.aiSetupPromptOpen" @close="ui.closeAiSetupPrompt()" />
    <ChatPanel v-model="ui.chatPanelOpen" />
    <HelpDrawer />
    <ShortcutCheatsheet />
    <WhatsNewModal />
  </div>
</template>

<style scoped>
/* Boot warm overlay — continues the static index.html #app-boot splash (same cream/dark
   surface, same green spinner) so the hand-off is seamless, then adds the shared DownloadBar
   below the circle. Theme-agnostic like the splash (prefers-color-scheme only); the app's
   full appearance takes over the instant the overlay dismisses.
   KEEP IN SYNC with index.html #app-boot: a pre-JS splash can't import bundle tokens, so the
   surface/spinner literals below are duplicated by necessity — retune both together. */
.jw-bootwarm {
  position: fixed; inset: 0; z-index: 3000;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px;
  background: #fbfaf7; color: #9a938a;
  font: 500 14px/1.4 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  letter-spacing: 0.02em;
}
.jw-bootwarm__spin {
  width: 30px; height: 30px; border-radius: 50%;
  border: 3px solid rgba(0, 0, 0, 0.10); border-top-color: #2f8f63;
  animation: jw-bootwarm-spin 0.8s linear infinite;
}
@keyframes jw-bootwarm-spin { to { transform: rotate(360deg); } }
.jw-bootwarm__name { font-size: 14px; }
/* The bar keeps its own themed look (kit tokens); constrain its width so it reads as a card
   under the spinner, not a full-bleed strip. */
.jw-bootwarm__bar { width: min(440px, 86vw); }
.jw-bootwarm__skip {
  margin-top: 2px; background: none; border: 0; cursor: pointer;
  font-size: 12px; color: inherit; opacity: 0.8; text-decoration: underline;
}
.jw-bootwarm__skip:hover { opacity: 1; }
@media (prefers-color-scheme: dark) {
  .jw-bootwarm { background: #1b1917; color: #8c857c; }
  .jw-bootwarm__spin { border-color: rgba(255, 255, 255, 0.12); border-top-color: #3fa978; }
}
</style>
