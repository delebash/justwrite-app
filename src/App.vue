<script setup>
import { computed, onMounted, onBeforeUnmount, watch, watchEffect, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useUiStore } from "./stores/ui.js";
import { useProjectStore } from "./stores/project.js";
import { applyAppearance } from "./services/appearance.js";
import { applyEditorSettings } from "./services/editorSettings.js";
import { BootModelLoad, warmModelId } from "@delebash/llm-ui";
import TitleBar from "./components/TitleBar.vue";
import Sidebar from "./components/Sidebar.vue";
import OnboardingShell from "./components/OnboardingShell.vue";
import { Toast } from "@delebash/llm-ui";
import { AppDialog } from "@delebash/llm-ui";
import { pushToast } from "@delebash/llm-ui";
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

// Boot warm overlay (2026-07-21; KIT-OWNED since 2026-08-04): `warmModelId` and the whole
// load group — engine bar, model bar (titled with the model NAME now, the shared behavior),
// Continue, the 700ms auto-dismiss — live in the kit's <BootModelLoad /> + startWarmOnBoot.
// This file keeps only the splash PAGE: the plate and where the load group sits on it.

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
  // Re-apply the persisted keep-running flag to the shell every boot (the Rust
  // side resets per launch; the family headless ruling 2026-08-04). Through the
  // bridge, never a direct invoke (this repo's invariant, restored 2026-08-05).
  if (ui.keepServerRunning) {
    window.justwrite?.server?.setKeepRunning?.(true);
  }
  // The tray's renderer half (the full-donor ruling 2026-08-04): settings/about
  // navigate, Copy URL writes the clipboard + says so — the donor's versions
  // were dead emits with no listeners (audit 2026-08-05). Dynamic import so
  // plain `vite dev` in a browser stays a no-op.
  import("@tauri-apps/api/event").then(({ listen }) => {
    listen("tray:open-settings", () => router.push("/settings"));
    listen("tray:about", () => router.push("/settings/about"));
    listen("tray:copy-url", async (e) => {
      try {
        await navigator.clipboard.writeText(String(e.payload));
        pushToast({ kind: "success", title: "Server URL copied", description: String(e.payload) });
      } catch (err) {
        pushToast({ kind: "error", title: "Copy failed", description: String(err?.message || err) });
      }
    });
  }).catch(() => {});
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
        <img class="jw-bw-art" :src="splashPlate" :alt="$t('boot.splashAlt')" />
        <BootModelLoad
          class="jw-bw-loadgroup"
          :engine-title="$t('boot.settingUpEngine')"
          :continue-label="$t('boot.continueWithoutWaiting')"
        />
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
/* The group itself is the kit's <BootModelLoad>; these rules PARK it (absolute, in the
   parchment gap) and skin it to the plate. Two-class selectors so the host's alignment
   deliberately outweighs the control's neutral defaults. */
.jw-bw-plate .jw-bw-loadgroup { position: absolute; z-index: 3; left: 5%; top: 36%;
  align-items: flex-start; gap: .35cqw; width: 17%;
  padding: .7cqw .9cqw; border-radius: .5cqw;
  background: rgba(244, 232, 205, 0.86); box-shadow: 0 .3cqw 1.1cqw rgba(70, 48, 18, 0.14); }
.jw-bw-plate :deep(.lu-bootload__bar) { width: 100%; font-size: .9cqw; }
.jw-bw-plate :deep(.lu-bootload__skip) { font-size: .88cqw; color: #7d6a4c;
  font-family: "Fraunces", Georgia, serif; }
.jw-bw-skip:hover { color: #7a2532; }
</style>
