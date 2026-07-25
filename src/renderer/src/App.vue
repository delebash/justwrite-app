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
// THE boot-splash plate (bundled asset; publicDir is false — vite.config.js:24). One
// illustration carries the entire title page: frame, the four corners, the JW crest, the
// wordmark, the tagline, the calligraphy and the privacy line. Sourced from the user's own
// design (2026-07-24, "i like that exact picture"); the mock-up's window title bar was
// cropped off (13px, located by scanning row luminance) and it was re-encoded PNG→JPEG,
// 1.1 MB → 160 KB, since the boot path should not carry a megabyte of decoration.
import splashPlate from "./assets/splash-plate.jpg";

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
// ONE workflow (2026-07-21): a boot warm with no engine installs it FIRST via retryLoad, which
// exposes that install as `engineGateTask` — show ITS bar during the install phase (the same
// shared DownloadBar), then the model bar takes over when the load begins.
const engineTask = computed(() =>
  rm.engineGateTask.value && rm.engineGateTask.value.state === "running" ? rm.engineGateTask.value : null);
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

// (The boot overlay's book/week computeds were REMOVED 2026-07-24 with the hand-built plate.
// They had been dead since the corners were frozen to sample text — each was defined and
// never read, the template printing literals instead. The illustrated plate carries that
// same sample text in the artwork, so nothing rendered was lost.)

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
    <!-- BOOT PLATE (2026-07-24). The user's finished artwork IS the splash — every word is
         part of the illustration, including the four corner panels, the wordmark, the
         calligraphy and the privacy line. Laying that type back as HTML was tried and
         abandoned: no bundled face matches the drawn roundhand, and the sizes had to be
         reverse-engineered from the reference. Nothing was lost by baking it in, because
         nothing there was ever live — the corners were frozen to sample literals by the
         2026-07-22 ruling, and a grep of this file confirms the only bindings on the splash
         are the image and the loader.
         CONSEQUENCE, on purpose: the splash cannot show the real book title or word counts
         without a new plate being cut, and the lettering is raster so it softens slightly
         above 1400px wide.
         The loader is the ONE live element and rides on top. Never traps — Continue enters
         the app and the load keeps running. KEEP IN SYNC with index.html #app-boot. -->
    <div v-if="warmModelId" class="jw-bootwarm">
      <div class="jw-bw-plate">
        <img class="jw-bw-art" :src="splashPlate" alt="JustWrite — a quiet room for the long form" />
        <div v-if="engineTask || (warmTask && warmTask.state)" class="jw-bw-loadgroup">
          <DownloadBar v-if="engineTask" class="jw-bw-bar" :task="engineTask" title="Setting up the AI engine" />
          <DownloadBar v-else class="jw-bw-bar" :task="warmTask" title="Loading your writing model" />
          <button type="button" class="jw-bw-skip" @click="dismissWarm">Continue without waiting</button>
        </div>
      </div>
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
/* BOOT PLATE. The artwork carries the entire design, so this file holds only two things:
   how the plate fills the window, and where the loader sits on it. No type rules — there is
   no HTML type on the splash any more. */
.jw-bootwarm {
  position: fixed; inset: 0; z-index: 3000; overflow: hidden;
  background: #d6b689;   /* sampled from the plate's own edge; seen only mid-resize */
  font: 500 14px/1.45 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
}
/* THE PLATE FILLS THE WINDOW EXACTLY — no letterbox, no crop.
   The two obvious fits both failed against this artwork:
     `contain` — shows the whole plate but leaves bands whenever the window is not the art's
       1.86 aspect (24px a side at 1920x1005). The user rejected that three times.
     `cover`   — leaves no band but CROPS, and the lettering is part of the artwork now, so at
       the 1440x900 default it sliced "THE BOOK" to "E BOOK". Verified by rendering it.
   So the plate is stretched to the window instead (`object-fit: fill`). Nothing is ever cut
   and no band ever shows; the cost is aspect distortion, which is 2.6% at 1920x1005 (not
   perceptible) and ~14% at 1440x900 (the compass reads slightly oval). Given the lettering is
   baked in, distortion is the only one of the three costs that never loses content. */
.jw-bw-plate { position: absolute; inset: 0; container-type: size; }
.jw-bw-art { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: fill; }

/* The loader — the only live element. Parked in the open parchment down the LEFT side, in the
   gap the artwork leaves between "The Book" (ends ~27%) and "The Instrument" (starts ~68%),
   and inside the compass's left edge. Sized in cqw so it tracks the plate, and kept SHORT:
   bar + escape on one tight panel. */
.jw-bw-loadgroup { position: absolute; z-index: 3; left: 5%; top: 36%;
  display: flex; flex-direction: column; align-items: flex-start; gap: .35cqw; width: 17%;
  padding: .7cqw .9cqw; border-radius: .5cqw;
  background: rgba(244, 232, 205, 0.86); box-shadow: 0 .3cqw 1.1cqw rgba(70, 48, 18, 0.14); }
.jw-bw-bar { width: 100%; font-size: .9cqw; }
.jw-bw-skip { background: none; border: 0; padding: 0; cursor: pointer; font-size: .88cqw;
  color: #7d6a4c; text-decoration: underline; text-underline-offset: 2px;
  font-family: "Fraunces", Georgia, serif; }
.jw-bw-skip:hover { color: #7a2532; }
</style>
