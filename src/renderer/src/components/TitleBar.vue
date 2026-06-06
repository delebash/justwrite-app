<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from "vue";
import { useRouter } from "vue-router";
import { useUiStore } from "../stores/ui.js";
import { useProjectStore } from "../stores/project.js";
import { THEME_PRESETS } from "../services/appearance.js";
import Icon from "./Icon.vue";
import AiStatusButton from "./AiStatusButton.vue";

defineProps({ title: { type: String, default: "JustWrite" } });

const ui = useUiStore();
const project = useProjectStore();
const router = useRouter();
const jw = window.justwrite;

// ── Theme preset switcher dropdown ──────────────────────────────────
// Shows built-in presets + the user's saved custom presets.
const themeOpen = ref(false);
const themeWrap = ref(null);
const activePreset = computed(() => {
  const pid = ui.appearance?.preset;
  return THEME_PRESETS.find((p) => p.id === pid)
    || (ui.customPresets || []).find((p) => p.id === pid)
    || null;
});
const activePresetLabel = computed(() => activePreset.value?.name || "Custom");
function toggleTheme() {
  themeOpen.value = !themeOpen.value;
  if (themeOpen.value) modeOpen.value = false;
}
function pickPreset(p) {
  ui.setAppearance({ preset: p.id, ...p.patch });
  themeOpen.value = false;
}

// ── Mode (light/dark/system) dropdown ───────────────────────────────
const MODE_OPTIONS = [
  { id: "light",  label: "Light",  icon: "Sun" },
  { id: "dark",   label: "Dark",   icon: "Moon" },
  { id: "system", label: "System", icon: "Monitor" },
];
const modeOpen = ref(false);
const modeWrap = ref(null);
const modeIcon = computed(() => {
  const m = ui.appearance?.mode;
  return m === "light" ? "Sun" : m === "dark" ? "Moon" : "Monitor";
});
const modeLabel = computed(() => ({ light: "Light", dark: "Dark", system: "System" })[ui.appearance?.mode] || "System");
function toggleMode() {
  modeOpen.value = !modeOpen.value;
  if (modeOpen.value) themeOpen.value = false;
}
function pickMode(id) {
  ui.setAppearance({ mode: id });
  modeOpen.value = false;
}

function onTbDocClick(e) {
  if (themeOpen.value && themeWrap.value && !themeWrap.value.contains(e.target)) themeOpen.value = false;
  if (modeOpen.value && modeWrap.value && !modeWrap.value.contains(e.target)) modeOpen.value = false;
}

// Browser-style nav history. Vue Router stamps `back`/`forward` onto the
// history state for the current entry, so we can light up the buttons
// only when there's somewhere to go.
const canBack = ref(false);
const canForward = ref(false);
function syncNav() {
  const st = window.history.state || {};
  canBack.value = st.back != null;
  canForward.value = st.forward != null;
}
function goBack() { if (canBack.value) router.back(); }
function goForward() { if (canForward.value) router.forward(); }

let stopAfterEach;
onMounted(() => {
  syncNav();
  stopAfterEach = router.afterEach(() => syncNav());
  document.addEventListener("mousedown", onTbDocClick);
});
onBeforeUnmount(() => {
  if (stopAfterEach) stopAfterEach();
  document.removeEventListener("mousedown", onTbDocClick);
});

function toggleChat() {
  if (ui.chatPanelOpen) ui.closeChatPanel();
  else ui.openChatPanelFor({ mode: "book" });
}

async function saveProject() {
  if (!jw?.project?.save) {
    alert("Save is only available in the Electron desktop build.");
    return;
  }
  const result = await jw.project.save(project.exportSnapshot(), project.project.title);
  if (result && !result.ok) {
    console.error("saveProject failed:", result.error);
    ui.showToast({ message: `Couldn't save project — ${result.error || "unknown error"}` });
  }
}

async function openProject() {
  if (!jw?.project?.open) {
    alert("Open is only available in the Electron desktop build.");
    return;
  }
  const res = await jw.project.open();
  if (res?.ok && res.snapshot) {
    project.loadSnapshot(res.snapshot);
  } else if (res && !res.cancelled) {
    console.error("openProject failed:", res?.error);
    ui.showToast({ message: `Couldn't open project — ${res?.error || "unknown error"}` });
  }
}
</script>

<template>
  <div class="titlebar">
    <div class="titlebar-left">
      <button @click="goBack" :disabled="!canBack" v-tooltip.bottom="`Back${canBack ? '' : ' (no history)'}`">
        <Icon name="ChevLeft" :size="15" />
      </button>
      <button @click="goForward" :disabled="!canForward" v-tooltip.bottom="`Forward${canForward ? '' : ' (no history)'}`">
        <Icon name="ChevRight" :size="15" />
      </button>
    </div>
    <div class="titlebar-title">{{ title }}</div>
    <div class="titlebar-right">
      <div class="theme-switcher" ref="themeWrap">
        <button @click="toggleTheme" v-tooltip.bottom="`Theme · ${activePresetLabel}`">
          <Icon name="Palette" :size="13" />
        </button>
        <div v-if="themeOpen" class="theme-menu">
          <div class="theme-menu-head">Theme</div>
          <button v-for="p in THEME_PRESETS" :key="p.id" @click="pickPreset(p)"
            :class="{ active: ui.appearance?.preset === p.id }">
            <span class="theme-dot" :style="`background: oklch(0.55 0.13 ${p.patch.accentHue})`" />
            <span class="theme-name">{{ p.name }}</span>
            <Icon v-if="ui.appearance?.preset === p.id" name="Check" :size="11" class="theme-check" />
          </button>
          <template v-if="ui.customPresets && ui.customPresets.length">
            <div class="theme-menu-sep" />
            <div class="theme-menu-head">Saved</div>
            <button v-for="p in ui.customPresets" :key="p.id" @click="pickPreset(p)"
              :class="{ active: ui.appearance?.preset === p.id }">
              <span class="theme-dot" :style="`background: oklch(0.55 0.13 ${p.patch.accentHue ?? 14})`" />
              <span class="theme-name">{{ p.name }}</span>
              <Icon v-if="ui.appearance?.preset === p.id" name="Check" :size="11" class="theme-check" />
            </button>
          </template>
          <div v-if="ui.appearance?.preset === 'custom'" class="theme-menu-custom">
            <span class="theme-dot" :style="`background: oklch(0.55 0.13 ${ui.appearance?.accentHue ?? 14})`" />
            <span class="theme-name">Custom <em>· your own mix</em></span>
          </div>
        </div>
      </div>
      <div class="theme-switcher" ref="modeWrap">
        <button @click="toggleMode" v-tooltip.bottom="`Mode · ${modeLabel}`">
          <Icon :name="modeIcon" :size="13" />
        </button>
        <div v-if="modeOpen" class="theme-menu has-icons">
          <div class="theme-menu-head">Mode</div>
          <button v-for="m in MODE_OPTIONS" :key="m.id" @click="pickMode(m.id)"
            :class="{ active: ui.appearance?.mode === m.id }">
            <Icon :name="m.icon" :size="13" />
            <span class="theme-name">{{ m.label }}</span>
            <Icon v-if="ui.appearance?.mode === m.id" name="Check" :size="11" class="theme-check" />
          </button>
        </div>
      </div>
      <span class="titlebar-divider" />
      <button @click="openProject" v-tooltip.bottom="'Open project…'"><Icon name="Folder" :size="13" /></button>
      <button @click="saveProject" v-tooltip.bottom="'Save project as…'"><Icon name="Download" :size="13" /></button>
      <span class="titlebar-divider" />
      <button @click="project.undo" :disabled="!project.canUndo" v-tooltip.bottom="`Undo${project.canUndo ? '' : ' (nothing to undo)'} · ⌘Z`">
        <Icon name="Refresh" :size="13" style="transform:scaleX(-1)" />
      </button>
      <button @click="project.redo" :disabled="!project.canRedo" v-tooltip.bottom="`Redo${project.canRedo ? '' : ' (nothing to redo)'} · ⌘⇧Z`">
        <Icon name="Refresh" :size="13" />
      </button>
      <span class="titlebar-divider" />
      <AiStatusButton />
      <span class="titlebar-divider" />
      <button data-chat-toggle @click="toggleChat" :class="{ active: ui.chatPanelOpen }" v-tooltip.bottom="'Ask the book · ⌘J'">
        <Icon name="Chat" :size="13" />
      </button>
      <button @click="ui.toggleSidebar" v-tooltip.bottom="ui.sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'">
        <Icon name="SidebarToggle" :size="14" />
      </button>
      <router-link to="/search" custom v-slot="{ navigate }">
        <button @click="navigate" v-tooltip.bottom="'Search · ⌘F'"><Icon name="Search" :size="13" /></button>
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
.titlebar-right button:disabled,
.titlebar-left button:disabled {
  opacity: 0.32;
  cursor: default;
}
.titlebar-right button.active {
  background: var(--accent-soft);
  color: var(--accent-ink);
  box-shadow: inset 0 0 0 1px var(--accent-line);
}

/* Theme switcher dropdown */
.theme-switcher { position: relative; display: inline-flex; }
.theme-menu {
  position: absolute; top: calc(100% + 4px); right: 0;
  z-index: 60;
  min-width: 140px;
  padding: 4px;
  background: var(--surface);
  border: 1px solid var(--border-strong);
  border-radius: var(--r-md);
  box-shadow: 0 10px 28px rgba(0, 0, 0, .18);
  display: flex; flex-direction: column;
}
.theme-menu button {
  display: grid; grid-template-columns: 12px 1fr auto;
  align-items: center; gap: 9px;
  padding: 6px 8px; border-radius: 6px;
  background: transparent; border: 0;
  font-size: 12.5px; color: var(--ink-2);
  text-align: left; width: 100%;
}
.theme-menu button:hover { background: var(--surface-2); color: var(--ink); }
.theme-menu button.active { color: var(--accent-ink); font-weight: 500; }
.theme-menu button.active .theme-check { color: var(--accent); }
.theme-menu.has-icons button { grid-template-columns: 18px 1fr auto; }
.theme-menu-head {
  padding: 6px 8px 2px;
  font-family: var(--font-mono);
  font-size: 9.5px; letter-spacing: 0.14em;
  text-transform: uppercase; color: var(--muted);
}
.theme-menu-sep { height: 1px; background: var(--border); margin: 4px 4px; }
.theme-dot {
  width: 11px; height: 11px; border-radius: 50%;
  box-shadow: inset 0 0 0 1px var(--shadow-soft);
}
.theme-menu-custom {
  display: grid; grid-template-columns: 12px 1fr;
  align-items: center; gap: 9px;
  padding: 6px 8px; margin-top: 4px;
  border-top: 1px solid var(--border);
  font-size: 12px; color: var(--accent-ink);
}
.theme-menu-custom em { color: var(--muted); font-style: normal; }
</style>
