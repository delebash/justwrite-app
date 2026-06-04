// UI store — sidebar collapse, expanded sections, current selections,
// transient toast notifications. Most state persists across reloads
// (toasts don't). Backed by the IndexedDB-backed storage adapter; reads
// are synchronous against the cache that's hydrated at app boot.

import { defineStore } from "pinia";
import { getItem, setItem } from "../services/storage.js";
import { DEFAULT_EDITOR_SETTINGS } from "../services/editorSettings.js";
import { DEFAULT_APPEARANCE, migrateAppearance } from "../services/appearance.js";
import { pushToast, clearToasts } from "../services/toastBridge.js";

const LS_KEY = "justwrite:ui";

// Appearance fields that define a "look" — changing any of them (without
// naming a preset) drops the active preset to "custom".
const PRESET_KEYS = ["mode", "fontPairing", "uiFont", "displayFont", "editorBodyFont", "accentHue", "goldHue", "dangerHue", "successHue", "infoHue", "appBg", "sidebarBg", "editorPaper", "editorLayout", "inlinePaper", "inkPalette", "uiScale", "sidebarHeadingStyle", "sidebarHeadingSize", "navItemStyle", "navItemSize", "editorFontSize", "editorLineSpacing", "editorParaSpacing", "editorParaIndent", "btnRadius", "btnDensity", "btnLabelCase"];

// Capture the "look" fields of an appearance config into a preset patch
// (everything a preset defines — mode is excluded since it's independent).
function presetPatchFrom(a) {
  const patch = {};
  for (const k of PRESET_KEYS) patch[k] = a[k];
  return patch;
}

function load() {
  try { return JSON.parse(getItem(LS_KEY) || "{}"); } catch { return {}; }
}

function save(state) {
  try { setItem(LS_KEY, JSON.stringify(state)); } catch {}
}

export const useUiStore = defineStore("ui", {
  state: () => {
    const saved = load();
    return {
      projectTitle: "The Cartographer's Daughter",
      sidebarCollapsed: false,
      sidebarWidth: 280,         // user-resizable; persisted
      expanded: { chapters: true },
      filters: {},  // per-section filter strings
      selections: {
        chapters: "ch7",
        characters: "c1",
        locations: "l2",
        objects: "o1",
        groups: "g1",
        notes: "n1",
        worldbuilding: null,
      },
      // Appearance / theming (see services/appearance.js).
      appearance: { ...DEFAULT_APPEARANCE },
      // User-saved appearance presets: { id, name, patch }.
      customPresets: [],
      // Writing/editor display settings (font, spacing, etc.).
      editorSettings: { ...DEFAULT_EDITOR_SETTINGS },
      // UI language. null = browser-default at boot; setLocale() pins it.
      // Date / number formatting (Intl.*) tracks the same value.
      locale: null,
      // Chapter editor mode. true = "continuous" (all scenes stitched
      // into one editable surface); false = "single scene" (default).
      // Persists across chapters AND reloads — once a writer turns it
      // on, it stays on for every chapter until they toggle it back.
      continuousChapter: false,
      // Scroll-driven scene highlight for Read mode's whole-book scope.
      // Not persisted — flooding IDB on every scroll tick is wasteful, and
      // on reload there's nothing meaningful to restore to anyway.
      scrolledSceneId: null,
      // Project find & replace modal — `open` summons the shared modal
      // mounted at App level; `initialTerm` pre-fills the search input.
      replaceModal: { open: false, initialTerm: "" },
      // Manuscript chat panel (RAG). Single boolean; the panel itself
      // owns its question/answer state.
      chatPanelOpen: false,
      ...saved,
      // Resolve appearance last: wins over the raw spread and folds in any
      // legacy { theme, accentHue } keys from older saves.
      appearance: migrateAppearance(saved),
    };
  },

  actions: {
    toggleSidebar() {
      this.sidebarCollapsed = !this.sidebarCollapsed;
      this._persist();
    },
    setSidebarWidth(px) {
      const n = Number(px);
      if (!Number.isFinite(n)) return;
      this.sidebarWidth = Math.max(180, Math.min(520, Math.round(n)));
      this._persist();
    },
    toggleSection(id) {
      this.expanded = { ...this.expanded, [id]: !this.expanded[id] };
      this._persist();
    },
    setFilter(id, value) {
      this.filters = { ...this.filters, [id]: value };
    },
    select(section, id) {
      this.selections = { ...this.selections, [section]: id };
      this._persist();
    },

    // Scroll-driven update from Read mode's whole-book view. Skips
    // _persist so a fast scroll doesn't write to IDB on every tick.
    // Auto-expands the current chapter so the highlighted scene is
    // visible in the sidebar (collapse remains user-driven).
    setScrolledScene(sceneId, chapterId) {
      this.scrolledSceneId = sceneId || null;
      if (!chapterId) return;
      if (this.selections.chapters !== chapterId) {
        this.selections = { ...this.selections, chapters: chapterId };
      }
      const key = `chapter:${chapterId}`;
      if (!this.expanded[key]) {
        this.expanded = { ...this.expanded, [key]: true };
      }
    },

    // Toasts — delegate to sonner via toastBridge. Pass
    // `action: { label, fn }` for an inline button (soft-delete's "Undo").
    showToast({ message, action } = {}, ms = 6000) {
      pushToast({ message, action }, ms);
    },
    dismissToast() {
      clearToasts();
    },

    // Global project-wide find & replace modal — hoisted to ui so any
    // view can summon it (the Search view button, the App-level ⌘⇧F
    // shortcut, the command palette). Initial term seeds the search
    // input so a Search-view replace lands with the current query.
    openProjectReplace(initialTerm = "") {
      this.replaceModal = { open: true, initialTerm: String(initialTerm || "") };
    },
    closeProjectReplace() {
      this.replaceModal = { open: false, initialTerm: "" };
    },

    openChatPanel()  { this.chatPanelOpen = true; },
    closeChatPanel() { this.chatPanelOpen = false; },
    toggleChatPanel() { this.chatPanelOpen = !this.chatPanelOpen; },

    setAppearance(patch) {
      const next = { ...this.appearance, ...patch };
      if (!("preset" in patch) && PRESET_KEYS.some((k) => k in patch)) next.preset = "custom";
      if (("uiFont" in patch || "displayFont" in patch || "editorBodyFont" in patch) && !("fontPairing" in patch)) next.fontPairing = "custom";
      this.appearance = next;
      this._persist();
    },
    // Save the current look as a named custom preset and make it active.
    saveCustomPreset(name) {
      const id = "cp_" + Date.now().toString(36);
      const preset = { id, name: String(name || "").trim() || "Custom", patch: presetPatchFrom(this.appearance) };
      this.customPresets = [...this.customPresets, preset];
      this.appearance = { ...this.appearance, preset: id };
      this._persist();
      return id;
    },
    renameCustomPreset(id, name) {
      const nm = String(name || "").trim();
      if (!nm) return;
      this.customPresets = this.customPresets.map((p) => (p.id === id ? { ...p, name: nm } : p));
      this._persist();
    },
    deleteCustomPreset(id) {
      this.customPresets = this.customPresets.filter((p) => p.id !== id);
      if (this.appearance.preset === id) this.appearance = { ...this.appearance, preset: "custom" };
      this._persist();
    },
    // Reset every appearance setting to DEFAULT_APPEARANCE (including
    // mode, which is now a preset-defining field). Saved custom presets
    // are left intact.
    resetAppearance() {
      this.appearance = { ...DEFAULT_APPEARANCE };
      this._persist();
    },
    // Back-compat shims onto the appearance model.
    setTheme(value) {
      this.setAppearance({ mode: value === "dark" || value === "light" ? value : "system" });
    },
    setAccentHue(hue) {
      const n = Number(hue);
      this.setAppearance({ accentHue: Number.isFinite(n) ? Math.max(0, Math.min(360, n)) : 14 });
    },
    setEditorSettings(patch) {
      this.editorSettings = { ...this.editorSettings, ...patch };
      this._persist();
    },
    setLocale(code) {
      this.locale = code || null;
      this._persist();
    },
    setContinuousChapter(on) {
      this.continuousChapter = !!on;
      this._persist();
    },

    _persist() {
      save({
        sidebarCollapsed: this.sidebarCollapsed,
        sidebarWidth: this.sidebarWidth,
        expanded: this.expanded,
        selections: this.selections,
        appearance: this.appearance,
        customPresets: this.customPresets,
        editorSettings: this.editorSettings,
        locale: this.locale,
        continuousChapter: this.continuousChapter,
      });
    },
  },
});
