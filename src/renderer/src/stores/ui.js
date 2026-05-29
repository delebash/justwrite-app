// UI store — sidebar collapse, expanded sections, current selections,
// transient toast notifications. Most state persists across reloads
// (toasts don't). Backed by the IndexedDB-backed storage adapter; reads
// are synchronous against the cache that's hydrated at app boot.

import { defineStore } from "pinia";
import { getItem, setItem } from "../services/storage.js";
import { DEFAULT_EDITOR_SETTINGS } from "../services/editorSettings.js";

const LS_KEY = "justwrite:ui";

function load() {
  try { return JSON.parse(getItem(LS_KEY) || "{}"); } catch { return {}; }
}

function save(state) {
  try { setItem(LS_KEY, JSON.stringify(state)); } catch {}
}

let toastSeq = 0;
let toastTimer = null;

export const useUiStore = defineStore("ui", {
  state: () => ({
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
    // Appearance preferences.
    theme: "system",          // "light" | "dark" | "system"
    accentHue: 200,            // 0–360 for the calm-teal default; user-tunable
    // Writing/editor display settings (font, spacing, etc.).
    editorSettings: { ...DEFAULT_EDITOR_SETTINGS },
    // Transient. Shape: { id, message, action?: { label, fn } }.
    toast: null,
    ...load(),
  }),

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

    // Toasts — show one at a time. Pass `action: { label, fn }` for an
    // inline button (used by soft-delete to surface "Undo").
    showToast({ message, action } = {}, ms = 6000) {
      const id = ++toastSeq;
      this.toast = { id, message, action };
      if (toastTimer) clearTimeout(toastTimer);
      toastTimer = setTimeout(() => {
        if (this.toast?.id === id) this.toast = null;
      }, ms);
    },
    dismissToast() {
      if (toastTimer) { clearTimeout(toastTimer); toastTimer = null; }
      this.toast = null;
    },

    setTheme(value) {
      this.theme = value === "dark" || value === "light" ? value : "system";
      this._persist();
    },
    setAccentHue(hue) {
      const n = Number(hue);
      this.accentHue = Number.isFinite(n) ? Math.max(0, Math.min(360, n)) : 200;
      this._persist();
    },
    setEditorSettings(patch) {
      this.editorSettings = { ...this.editorSettings, ...patch };
      this._persist();
    },

    _persist() {
      save({
        sidebarCollapsed: this.sidebarCollapsed,
        sidebarWidth: this.sidebarWidth,
        expanded: this.expanded,
        selections: this.selections,
        theme: this.theme,
        accentHue: this.accentHue,
        editorSettings: this.editorSettings,
      });
    },
  },
});
