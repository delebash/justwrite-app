// UI store — sidebar collapse, expanded sections, current selections,
// transient toast notifications. Most state persists across reloads
// (toasts don't). Backed by the server settings document (SQL via
// /v1/settings) under the `ui` section; reads are synchronous against the
// copy hydrated by bootSettings() at app boot.

import { defineStore } from "pinia";
import { readSetting, writeSetting } from "../services/settings.js";
import { DEFAULT_EDITOR_SETTINGS } from "../services/editorSettings.js";
import { DEFAULT_APPEARANCE, migrateAppearance } from "../services/appearance.js";
import { pushToast, clearToasts, useAiTasksStore } from "@delebash/llm-ui";

const SECTION = "ui";

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
  const raw = readSetting(SECTION);
  if (!raw || typeof raw !== "object") return {};
  const saved = { ...raw };
  // Legacy: "cards" used to be a top-level chapter mode; it's now an
  // edit-mode style. Migrate so the user lands in the same view.
  if (saved.chapterMode === "cards") {
    saved.chapterMode = "edit";
    saved.chapterEditStyle = "cards";
  }
  return saved;
}

function save(state) {
  writeSetting(SECTION, state);
}

export const useUiStore = defineStore("ui", {
  state: () => {
    const saved = load();
    return {
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
      // User-saved appearance presets: { id, name, patch }.
      // The `appearance` slice itself is set further down via
      // migrateAppearance(saved) so legacy keys get folded in.
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
      // Which pane the chapter view opens to: "edit" | "outline" |
      // "read". Persists so the user's chosen pane survives navigation
      // and reload.
      chapterMode: "edit",
      // Presentation style within edit mode: "list" (scene-by-scene
      // editor — the default) or "cards" (corkboard grid). Persists
      // independently of mode so the user's preferred edit style is
      // remembered even when they switch to outline / read and back.
      chapterEditStyle: "list",
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
      // When set, the next ChatPanel open should pre-scope to this target
      // before clearing itself. Shape: { mode: 'book' | 'character',
      // characterId?, question?, sourceKey?, ts }
      chatRequestedTarget: null,
      // Identifies the button that last opened the panel. openChatPanelFor
      // toggles closed when called with the same sourceKey, so every
      // contextual entry button acts as a real open/close toggle.
      chatPanelSourceKey: null,
      // "Previously on your novel" briefing — generated on Home when the
      // writer returns. Cache survives reloads so same-day reopens reuse
      // the same briefing instead of re-billing the LLM. Dismissal is
      // per-day so the card stays hidden until tomorrow.
      // Shape: { day: 'yyyy-mm-dd', chapterId, chapterNum, chapterTitle,
      //          text, gapLabel, daysSince, generatedAt, model, providerId }
      briefingCache: null,
      briefingDismissedOn: null,
      // When true, every Rewrite / Expand / Tighten / Continue / Describe
      // / line edit / guided continue runs as THREE parallel streams
      // (varied temperature) so the writer picks the best column.
      // Off by default — triples token cost. Shift-click on any AI
      // dropdown item is a per-call override regardless of this toggle.
      showVariations: false,
      // In-app help drawer state now lives in the shared kit (@delebash/llm-ui
      // services/help.js → helpState / openHelp / closeHelp); the kit HelpDrawer
      // + HelpTrigger read it directly. configureHelp() in main.js wires the
      // content adapter + the full-docs / web handoffs.
      // "What's new" modal — last app version the user has seen.
      // Bumped to package.json's version after the modal is dismissed
      // so the modal only fires on first launch after an upgrade.
      lastSeenVersion: null,
      // Cmd+/ keyboard shortcut cheatsheet overlay.
      shortcutsOpen: false,
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

    setShowVariations(on) {
      this.showVariations = !!on;
      this._persist();
    },

    // In-app Help drawer state + actions moved to the shared kit
    // (@delebash/llm-ui → openHelp / closeHelp / helpState). Call those
    // directly; configureHelp() in main.js wires the content + handoffs.

    // ── Shortcut cheatsheet ──────────────────────────────────────────
    openShortcuts()  { this.shortcutsOpen = true; },
    closeShortcuts() { this.shortcutsOpen = false; },
    toggleShortcuts() { this.shortcutsOpen = !this.shortcutsOpen; },

    // ── What's new modal ─────────────────────────────────────────────
    markVersionSeen(version) {
      this.lastSeenVersion = String(version || "");
      this._persist();
    },

    openChatPanel()  { this.chatPanelOpen = true; },
    closeChatPanel() {
      this.chatPanelOpen = false;
      this.chatPanelSourceKey = null;
    },
    toggleChatPanel() {
      if (this.chatPanelOpen) this.closeChatPanel();
      else this.chatPanelOpen = true;
    },
    // QC-38: the sidebar "AI tasks" nav item opens the shared AI-tasks panel
    // (the same panel the titlebar chip toggles) — thin delegation so the
    // sidebar's existing `ui[item.action]()` dispatch works unchanged.
    toggleAiTasksPanel() {
      useAiTasksStore().togglePanel();
    },
    openChatPanelFor(target) {
      const key = target?.sourceKey || null;
      if (this.chatPanelOpen && key && this.chatPanelSourceKey === key) {
        this.closeChatPanel();
        return;
      }
      this.chatPanelSourceKey = key;
      this.chatRequestedTarget = { ...target, ts: Date.now() };
      this.chatPanelOpen = true;
    },
    consumeChatRequestedTarget() {
      const t = this.chatRequestedTarget;
      this.chatRequestedTarget = null;
      return t;
    },

    // ── Resume-from-here briefing ────────────────────────────────────
    setBriefing(payload) {
      this.briefingCache = payload ? { ...payload } : null;
      this._persist();
    },
    clearBriefing() {
      this.briefingCache = null;
      this._persist();
    },
    dismissBriefing(dayKey) {
      this.briefingDismissedOn = String(dayKey || "");
      this._persist();
    },

    setAppearance(patch) {
      const next = { ...this.appearance, ...patch };
      if (!("preset" in patch) && PRESET_KEYS.some((k) => k in patch)) next.preset = "custom";
      if (("uiFont" in patch || "displayFont" in patch || "editorBodyFont" in patch) && !("fontPairing" in patch)) next.fontPairing = "custom";
      this.appearance = next;
      this._persist();
    },
    // Save the current look as a named custom preset and make it active.
    saveCustomPreset(name) {
      const id = `cp_${Date.now().toString(36)}`;
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
    // `fontSize`, `paragraphIndent`, and `lineSpacing` accept `null` to mean
    // "follow theme default" — the editor reads through to the active theme's
    // values when the field is null. Don't coerce null → 0 / "" here.
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
    setChapterMode(m) {
      this.chapterMode = m;
      this._persist();
    },
    setChapterEditStyle(s) {
      this.chapterEditStyle = s;
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
        chapterMode: this.chapterMode,
        chapterEditStyle: this.chapterEditStyle,
        briefingCache: this.briefingCache,
        briefingDismissedOn: this.briefingDismissedOn,
        showVariations: this.showVariations,
      });
    },
  },
});
