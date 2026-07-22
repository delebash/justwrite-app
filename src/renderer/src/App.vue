<script setup>
import { computed, onMounted, onBeforeUnmount, watch, watchEffect, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useUiStore } from "./stores/ui.js";
import { useProjectStore } from "./stores/project.js";
import { useSessionsStore } from "./stores/sessions.js";
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
// Boot-splash centrepiece art (bundled asset; publicDir is false — vite.config.js:24).
import splashBook from "./assets/splash-book.jpg";

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

// Ornate boot-overlay corner data (2026-07-22): the active book + this week's writing, read
// from the stores that main.js hydrates BEFORE mount (hydrateProjects + sessions.boot), so
// they're populated by the time the warm overlay renders. All guarded for the projectless
// fresh-boot case (hasBook gates the two data corners).
const sessions = useSessionsStore();
const hasBook = computed(() => project.projectsList.length > 0);
const bookTitle = computed(() => project.project?.title || "Untitled");
const bookAuthor = computed(() => project.project?.author || "");
const chapterCount = computed(() => (project.allChapters || []).length);
const bookWords = computed(() => (project.allChapters || []).reduce((s, c) => s + (c.words || 0), 0));
function _dayKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
// Last 7 days of word counts (oldest→newest) for the sparkline + the week total.
const week7 = computed(() => {
  const days = sessions.days || {};
  const out = [];
  const d = new Date();
  for (let i = 0; i < 7; i++) { out.unshift(days[_dayKey(d)] || 0); d.setDate(d.getDate() - 1); }
  return out;
});
const weekWords = computed(() => week7.value.reduce((s, n) => s + n, 0));
const weekMax = computed(() => Math.max(1, ...week7.value));
const streak = computed(() => sessions.streak);
const fmtNum = (n) => (n || 0).toLocaleString();

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
    <!-- Ornate "title page" boot overlay (2026-07-22, the user's book-plate pick): warm
         parchment + a double-rule border + filigree corners carrying LIVE book info + features,
         our JW mark + the shared DownloadBar in the middle. Never traps — "Continue" enters the
         app and the load keeps running. KEEP IN SYNC with index.html #app-boot, which has the
         same parchment + frame + centre, minus the data corners (pre-JS can't read the stores). -->
    <div v-if="warmModelId" class="jw-bootwarm">
      <svg width="0" height="0" aria-hidden="true" style="position:absolute">
        <defs>
          <symbol id="jw-flo" viewBox="0 0 150 150" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round">
            <path d="M12 92 C12 44 44 12 92 12" /><path d="M22 92 C22 52 52 22 92 22" opacity=".6" />
            <path d="M92 12 c-18 0 -28 10 -25 25 c1.5 9 11 11 15.5 6.5 c3.8 -3.8 1 -11 -4.5 -10" />
            <path d="M12 92 c0 18 10 28 25 25 c9 -1.5 11 -11 6.5 -15.5 c-3.8 -3.8 -11 -1 -10 4.5" />
            <path d="M42 42 C54 32 60 20 58 8" /><path d="M42 42 C32 54 20 60 8 58" />
            <path d="M58 8 c6 3 8 9 6.5 15" opacity=".85" /><path d="M8 58 c3 6 9 8 15 6.5" opacity=".85" />
            <circle cx="42" cy="42" r="2.4" /><path d="M42 34v-6M42 50v6M34 42h-6M50 42h6" opacity=".6" />
            <circle cx="12" cy="92" r="1.8" fill="currentColor" stroke="none" /><circle cx="92" cy="12" r="1.8" fill="currentColor" stroke="none" />
          </symbol>
        </defs>
      </svg>
      <div class="jw-bw-rule" /><div class="jw-bw-rule jw-bw-rule--in" />
      <svg class="jw-bw-flo tl" viewBox="0 0 150 150"><use href="#jw-flo" /></svg>
      <svg class="jw-bw-flo tr" viewBox="0 0 150 150"><use href="#jw-flo" /></svg>
      <svg class="jw-bw-flo bl" viewBox="0 0 150 150"><use href="#jw-flo" /></svg>
      <svg class="jw-bw-flo br" viewBox="0 0 150 150"><use href="#jw-flo" /></svg>

      <!-- Corners are pure DECORATION (user, 2026-07-22): they LOOK populated but load NO project
           data — the values are frozen sample text, not live bindings, so the boot splash never
           depends on or reflects the real project. Kept as positioned elements (not a baked image)
           so they stay pinned to the window corners on resize and stay crisp at any DPI. -->
      <div class="jw-bw-corner tl">
        <div class="jw-bw-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M8 3h8a2 2 0 012 2v12a2 2 0 002 2H8a2 2 0 01-2-2V5a2 2 0 012-2z" /><path d="M6 7H4M6 12H4M6 17H4M11 8h5M11 12h5" /></svg></div>
        <div class="jw-bw-eb">The Book</div>
        <div class="jw-bw-bt">The Ninth Facet</div>
        <div class="jw-bw-ba">by Tamsin Vale</div>
        <div class="jw-bw-st"><b>10,200</b> words · <b>4</b> chapters</div>
      </div>
      <div class="jw-bw-corner tr">
        <div class="jw-bw-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3"><circle cx="12" cy="10" r="7" /><path d="M12 6l1.3 3 3 .2-2.3 2 .8 3-2.8-1.7L9.2 14l.8-3-2.3-2 3-.2z" /><path d="M9 17l-1.5 5 4.5-2.5L16.5 22 15 17" /></svg></div>
        <div class="jw-bw-eb">This Week</div>
        <div class="jw-bw-spark"><span style="height:9px" /><span style="height:15px" /><span style="height:11px" /><span style="height:20px" /><span style="height:14px" /><span style="height:23px" /><span class="on" style="height:30px" /></div>
        <div class="jw-bw-st"><b>1,240</b> words · <b>3-day</b> streak</div>
      </div>
      <div class="jw-bw-corner bl">
        <div class="jw-bw-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M12 6C10 4.5 7 4 4 4v14c3 0 6 .5 8 2M12 6c2-1.5 5-2 8-2v14c-3 0-6 .5-8 2M12 6v12" /></svg></div>
        <div class="jw-bw-eb">The Instrument</div>
        <div class="jw-bw-feat">
          <span><b>Manuscript</b> — a serif page</span>
          <span><b>AI desk</b> — knows your book</span>
          <span><b>World</b> — people &amp; places</span>
          <span><b>Export</b> — PDF · DOCX · EPUB</span>
          <span class="jw-bw-comp">Audiobooks in JustVoice</span>
        </div>
      </div>
      <div class="jw-bw-corner br">
        <div class="jw-bw-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3"><circle cx="8" cy="8" r="4.5" /><path d="M11 11l9 9M17 17l2-2M15 15l2-2" /></svg></div>
        <div class="jw-bw-eb">While You Wait</div>
        <div class="jw-bw-tip">Ask the book about itself — critiques cite the chapter they came from.</div>
      </div>

      <div class="jw-bw-center">
        <div class="jw-bw-mark">
          <div class="jw-bw-ring" />
          <svg class="jw-bw-glyph" viewBox="0 0 52 52" aria-hidden="true">
            <defs><linearGradient id="jwbootmark" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7a2532" /><stop offset="1" stop-color="#3d2350" /></linearGradient></defs>
            <rect width="52" height="52" rx="13" fill="url(#jwbootmark)" />
            <text x="50%" y="55%" text-anchor="middle" dominant-baseline="middle" font-family="Georgia, 'Iowan Old Style', serif" font-style="italic" font-weight="700" font-size="22" fill="#fff">JW</text>
          </svg>
        </div>
        <div class="jw-bw-name">JustWrite</div>
        <div class="jw-bw-ribbon">
          <svg viewBox="0 0 340 44" preserveAspectRatio="none" aria-hidden="true">
            <path class="jw-bw-rb-tail" d="M2 30 L26 20 L20 22 L20 30 Z" />
            <path class="jw-bw-rb-tail" d="M338 30 L314 20 L320 22 L320 30 Z" />
            <path class="jw-bw-rb-band" d="M18 8 H322 L308 22 L322 36 H18 L32 22 Z" />
          </svg>
          <span>A quiet room for the long form</span>
        </div>
        <!-- Engine-gate first (a no-engine box installs it before the load — ONE workflow),
             then the model-load bar; both the SAME shared DownloadBar. -->
        <DownloadBar v-if="engineTask" class="jw-bw-bar" :task="engineTask" title="Setting up the AI engine" />
        <DownloadBar v-else-if="warmTask && warmTask.state" class="jw-bw-bar" :task="warmTask" title="Loading your writing model" />
        <!-- Centrepiece art BELOW the loader (user, 2026-07-22): the "Write your story" pencil
             plate (bundled asset, imported above). Replaces the earlier line-art open book. -->
        <img class="jw-bw-book" :src="splashBook" alt="Write your story" />
        <div class="jw-bw-info">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2 4 6v6c0 5 3.5 7.5 8 10 4.5-2.5 8-5 8-10V6z" /></svg>
          Runs entirely on your computer — your words never leave it.
        </div>
        <button type="button" class="jw-bw-skip" @click="dismissWarm">Continue without waiting</button>
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
/* Ornate "title page" boot overlay (2026-07-22, the user's book-plate pick) — warm parchment,
   a double-rule border, filigree corners (one <symbol>, mirrored into four) carrying LIVE book
   info + features, our JW mark + the shared DownloadBar in the middle. Theme-agnostic
   (prefers-color-scheme only); the app's real appearance takes over the instant it dismisses.
   KEEP IN SYNC with index.html #app-boot, which carries the same parchment + frame + centre
   literals (a pre-JS splash can't read the bundle tokens) — retune both together. */
.jw-bootwarm {
  position: fixed; inset: 0; z-index: 3000; overflow: hidden;
  /* App background (light) — matches --bg (styles/tokens) so the splash reads as the app, not a
     separate parchment sheet. Literal oklch (not the token — a pre-JS twin can't read tokens). */
  background: oklch(0.985 0.004 85); color: #6a5c43;
  font: 500 14px/1.45 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  --orn: #96774a; --orn2: #7d6238; --gold: #9c7735;
  --pk-ink: #382f22; --pk-ink2: #6a5c43; --pk-muted: #948468; --pk-faint: #b3a582; --pk-surf: #f6efdc;
}
.jw-bootwarm::before { content: ""; position: absolute; inset: 0; pointer-events: none;
  background: radial-gradient(130% 100% at 50% 40%, transparent 60%, rgba(70, 52, 22, 0.05)); }
.jw-bootwarm::after { content: ""; position: absolute; inset: 0; pointer-events: none; opacity: .045; mix-blend-mode: multiply;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.75' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E"); }

.jw-bw-rule { position: absolute; z-index: 1; pointer-events: none; border: 1.5px solid var(--orn); opacity: .7; border-radius: 3px; inset: 18px; }
.jw-bw-rule--in { inset: 24px; border-width: .75px; opacity: .45; }

.jw-bw-flo { position: absolute; z-index: 2; width: 192px; height: 192px; color: var(--orn); pointer-events: none; }
.jw-bw-flo.tl { top: 18px; left: 18px; }
.jw-bw-flo.tr { top: 18px; right: 18px; transform: scaleX(-1); }
.jw-bw-flo.bl { bottom: 18px; left: 18px; transform: scaleY(-1); }
.jw-bw-flo.br { bottom: 18px; right: 18px; transform: scale(-1, -1); }

/* Corner cards are inset past the bigger (192px) flourishes so text never rides the ornament. */
.jw-bw-corner { position: absolute; z-index: 3; max-width: 320px; font-family: "Fraunces", Georgia, serif; }
.jw-bw-corner.tl { top: 104px; left: 98px; }
.jw-bw-corner.tr { top: 104px; right: 98px; text-align: right; }
.jw-bw-corner.bl { bottom: 104px; left: 98px; }
.jw-bw-corner.br { bottom: 104px; right: 98px; text-align: right; }
.jw-bw-ico { color: var(--orn2); margin-bottom: 11px; }
.jw-bw-ico svg { width: 30px; height: 30px; }
.jw-bw-corner.tr .jw-bw-ico, .jw-bw-corner.br .jw-bw-ico { display: flex; justify-content: flex-end; }
.jw-bw-eb { font-size: 14px; letter-spacing: .26em; text-transform: uppercase; color: var(--gold); font-weight: 600; margin-bottom: 10px; }
.jw-bw-bt { font-size: 24px; font-weight: 600; color: var(--pk-ink); line-height: 1.12; }
.jw-bw-ba { font-style: italic; color: var(--pk-ink2); font-size: 16px; margin-top: 2px; }
.jw-bw-st { margin-top: 9px; font-size: 14px; color: var(--pk-muted); }
.jw-bw-st b { color: var(--pk-ink2); font-weight: 600; font-variant-numeric: tabular-nums; }
.jw-bw-spark { display: flex; gap: 4px; align-items: flex-end; height: 34px; margin-bottom: 8px; }
.jw-bw-corner.tr .jw-bw-spark { justify-content: flex-end; }
.jw-bw-spark span { width: 7px; border-radius: 1px; background: rgba(47, 143, 99, 0.22); }
.jw-bw-spark span.on { background: #2f8f63; }
.jw-bw-feat { display: flex; flex-direction: column; gap: 8px; font-size: 17px; color: var(--pk-muted); }
.jw-bw-feat b { color: var(--pk-ink); font-weight: 600; }
.jw-bw-comp { color: var(--pk-faint); font-size: 14px; margin-top: 5px; font-style: italic; }
.jw-bw-tip { font-style: italic; font-size: 17px; line-height: 1.5; color: var(--pk-ink2); }

.jw-bw-center { position: absolute; inset: 0; z-index: 4; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; text-align: center; }
.jw-bw-mark { position: relative; width: 132px; height: 132px; display: grid; place-items: center; }
.jw-bw-ring { position: absolute; inset: 0; border-radius: 50%; border: 3px solid rgba(47, 143, 99, 0.16); border-top-color: #2f8f63; animation: jw-bootwarm-spin .9s linear infinite; }
.jw-bw-glyph { width: 94px; height: 94px; filter: drop-shadow(0 5px 14px rgba(61, 35, 80, 0.3)); }
.jw-bw-name { font-family: "Fraunces", Georgia, "Times New Roman", serif; font-size: 56px; font-weight: 600; color: var(--pk-ink); letter-spacing: .005em; line-height: 1; }
.jw-bw-ribbon { position: relative; width: 360px; max-width: 64vw; height: 44px; display: grid; place-items: center; }
.jw-bw-ribbon svg { position: absolute; inset: 0; width: 100%; height: 100%; }
.jw-bw-rb-band { fill: var(--pk-surf); stroke: var(--orn); stroke-width: 1; }
.jw-bw-rb-tail { fill: var(--orn2); }
.jw-bw-ribbon span { position: relative; z-index: 1; font-family: "Fraunces", Georgia, serif; font-style: italic; font-size: 17px; font-weight: 600; color: var(--pk-ink2); letter-spacing: .02em; }
.jw-bw-bar { width: min(430px, 74vw); }
/* Open-book centrepiece BELOW the loader — LARGE, filled draped pages in the ornate gold,
   filling the lower space (user, 2026-07-22). */
/* The centrepiece art plate — capped by width AND height so it never overflows a short window;
   soft radius + shadow so the parchment art reads as a plate on the near-white ground. */
.jw-bw-book { max-width: min(340px, 58vw); max-height: 46vh; width: auto; height: auto; margin-top: 12px; border-radius: 10px; box-shadow: 0 10px 34px rgba(60, 40, 15, 0.20); }
.jw-bw-info { display: flex; align-items: center; gap: 7px; font-size: 14px; color: var(--pk-faint); }
.jw-bw-info svg { width: 15px; height: 15px; flex: none; }
.jw-bw-skip { margin-top: 2px; background: none; border: 0; cursor: pointer; font-size: 13px; color: var(--pk-muted); text-decoration: underline; text-underline-offset: 2px; }
.jw-bw-skip:hover { color: #2f8f63; }
@keyframes jw-bootwarm-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .jw-bw-ring { animation-duration: 2.4s; } }
@media (prefers-color-scheme: dark) {
  .jw-bootwarm { background: #1b1810; color: #c6b892;
    --orn: #b8975c; --orn2: #caa968; --gold: #cba55e;
    --pk-ink: #ece2c9; --pk-ink2: #c6b892; --pk-muted: #94876a; --pk-faint: #6f6349; --pk-surf: #25200f; }
  .jw-bootwarm::before { background: radial-gradient(130% 100% at 50% 40%, transparent 52%, rgba(0, 0, 0, 0.28)); }
  .jw-bw-ring { border-color: rgba(63, 169, 120, 0.2); border-top-color: #3fa978; }
  .jw-bw-spark span { background: rgba(63, 169, 120, 0.22); }
  .jw-bw-spark span.on { background: #3fa978; }
  .jw-bw-skip:hover { color: #3fa978; }
}
</style>
