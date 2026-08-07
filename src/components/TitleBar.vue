<script setup>
// SPDX-License-Identifier: MIT
// JustWrite's title bar = the KIT's TitleBar FRAME (back/forward + title) with this
// app's right side in the slot — the same shape docgen has used since 2026-08-04.
//
// The frame was lifted FROM this component on 2026-08-04 and JustWrite kept its own
// copy, so the donor became the only app not using the shared version. Adopting it is
// a net GAIN here, not a downgrade: the kit carries docgen's post-nav `setTimeout(0)`
// settle, which this file lacked — without it `syncNav` read `window.history.state`
// before the router finished stamping it, so back/forward could light wrongly for one
// tick after a navigation. The two things this component did better went UP into the
// kit in the same change: tooltips that say WHY a button is disabled ("no history"),
// and `-webkit-app-region: no-drag` on the frame's buttons, without which `.titlebar`'s
// window-drag region below would have turned them into drag handles.
import { ref, computed, onMounted, onBeforeUnmount } from "vue";
import { useRouter } from "vue-router";
import { useUiStore } from "../stores/ui.js";
import { useProjectStore } from "../stores/project.js";
import { THEME_PRESETS } from "../services/appearance.js";
import { Icon, AiStatusButton, TitleBar } from "@delebash/llm-ui";

defineProps({ title: { type: String, default: "JustWrite" } });

const ui = useUiStore();
const project = useProjectStore();
const router = useRouter();

// The current page's undo domains (#235) — the Undo/Redo buttons are scoped
// exactly like ⌘Z (App.vue): they can only pop this page's data domains.
const undoDomains = computed(() => router.currentRoute.value.meta.undoDomains || []);

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

// Back/forward now belong to the kit's frame — it owns the history-state read AND the
// afterEach settle. Nothing here duplicates them.
onMounted(() => document.addEventListener("mousedown", onTbDocClick));
onBeforeUnmount(() => document.removeEventListener("mousedown", onTbDocClick));

function toggleChat() {
  ui.openChatPanelFor({ mode: "book", sourceKey: "titlebar" });
}
</script>

<template>
  <TitleBar :title="title">
    <div class="titlebar-right">
      <div class="theme-switcher" ref="themeWrap">
        <button @click="toggleTheme" v-tooltip.bottom="`Theme · ${activePresetLabel}`">
          <Icon name="Palette" :size="13" />
        </button>
        <div v-if="themeOpen" class="theme-menu">
          <div class="theme-menu-head">{{ $t("titleBar.theme") }}</div>
          <button v-for="p in THEME_PRESETS" :key="p.id" @click="pickPreset(p)"
            :class="{ active: ui.appearance?.preset === p.id }">
            <span class="theme-dot" :style="`background: oklch(0.55 0.13 ${p.patch.accentHue})`" />
            <span class="theme-name">{{ p.name }}</span>
            <Icon v-if="ui.appearance?.preset === p.id" name="Check" :size="11" class="theme-check" />
          </button>
          <template v-if="ui.customPresets && ui.customPresets.length">
            <div class="theme-menu-sep" />
            <div class="theme-menu-head">{{ $t("titleBar.savedThemes") }}</div>
            <button v-for="p in ui.customPresets" :key="p.id" @click="pickPreset(p)"
              :class="{ active: ui.appearance?.preset === p.id }">
              <span class="theme-dot" :style="`background: oklch(0.55 0.13 ${p.patch.accentHue ?? 14})`" />
              <span class="theme-name">{{ p.name }}</span>
              <Icon v-if="ui.appearance?.preset === p.id" name="Check" :size="11" class="theme-check" />
            </button>
          </template>
          <div v-if="ui.appearance?.preset === 'custom'" class="theme-menu-custom">
            <span class="theme-dot" :style="`background: oklch(0.55 0.13 ${ui.appearance?.accentHue ?? 14})`" />
            <span class="theme-name">{{ $t("titleBar.customTheme") }} <em>{{ $t("titleBar.customThemeHint") }}</em></span>
          </div>
        </div>
      </div>
      <div class="theme-switcher" ref="modeWrap">
        <button @click="toggleMode" v-tooltip.bottom="$t('titleBar.modeTooltip', { mode: modeLabel })">
          <Icon :name="modeIcon" :size="13" />
        </button>
        <div v-if="modeOpen" class="theme-menu has-icons">
          <div class="theme-menu-head">{{ $t("titleBar.mode") }}</div>
          <button v-for="m in MODE_OPTIONS" :key="m.id" @click="pickMode(m.id)"
            :class="{ active: ui.appearance?.mode === m.id }">
            <Icon :name="m.icon" :size="13" />
            <span class="theme-name">{{ m.label }}</span>
            <Icon v-if="ui.appearance?.mode === m.id" name="Check" :size="11" class="theme-check" />
          </button>
        </div>
      </div>
      <span class="titlebar-divider" />
      <button data-undo @click="project.undoFor(undoDomains)" :disabled="!project.canUndoFor(undoDomains)"
        v-tooltip.bottom="project.canUndoFor(undoDomains) ? 'Undo · ⌘Z' : 'Nothing to undo on this page'">
        <Icon name="Refresh" :size="13" style="transform:scaleX(-1)" />
      </button>
      <button data-redo @click="project.redoFor(undoDomains)" :disabled="!project.canRedoFor(undoDomains)"
        v-tooltip.bottom="project.canRedoFor(undoDomains) ? 'Redo · ⌘⇧Z' : 'Nothing to redo on this page'">
        <Icon name="Refresh" :size="13" />
      </button>
      <span class="titlebar-divider" />
      <AiStatusButton />
      <span class="titlebar-divider" />
      <button data-panel-toggle @click="toggleChat" :class="{ active: ui.chatPanelOpen }" v-tooltip.bottom="'Ask the book · ⌘J'">
        <Icon name="Chat" :size="13" />
      </button>
      <button @click="ui.toggleSidebar" v-tooltip.bottom="ui.sidebarCollapsed ? 'Expand sidebar · ⌘\\' : 'Collapse sidebar · ⌘\\'">
        <Icon name="SidebarToggle" :size="14" />
      </button>
      <router-link to="/search" custom v-slot="{ navigate }">
        <button @click="navigate" v-tooltip.bottom="'Search · ⌘F'"><Icon name="Search" :size="13" /></button>
      </router-link>
    </div>
  </TitleBar>
</template>

<style scoped>
.titlebar-divider {
  width: 1px;
  height: 14px;
  background: var(--border);
  margin: 0 2px;
}
/* Only this component's own (slot) buttons — the frame's back/forward are the kit's
   inner elements, which scoped CSS cannot reach, so their disabled look lives in
   styles.css against .lu-titlebar-btn. */
.titlebar-right button:disabled {
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
