// Appearance / theming — JustWrite.
//
// The GENERIC engine + catalogs are shared (kit @delebash/llm-ui appearance):
// colour mode, accent/gold/functional hues, UI/display/mono fonts, button knobs,
// surface tints, ink palettes, UI scale, sidebar nav typography. This file adds
// JustWrite's MANUSCRIPT-EDITOR theming (paper tint, editor font/size/spacing,
// page-vs-full layout) on top via the engine's `extraApply` hook, plus JW's
// whole-look presets + brand defaults. Re-exports the shared catalogs so the
// Settings UI keeps importing them from here.

import {
  applyAppearance as applyGeneric,
  migrateAppearance as migrateGeneric,
  resolveTint,
  displayStack,
  DEFAULT_APPEARANCE as GENERIC_DEFAULT,
} from "@delebash/llm-ui";

// Re-export the shared catalogs (SettingsView / TitleBar import them from here).
export {
  UI_FONTS, DISPLAY_FONTS, PAIRINGS, SURFACE_TINTS, INK_PALETTES, UI_SCALES,
  SIDEBAR_HEADING_STYLES, SIDEBAR_HEADING_SIZES, NAV_ITEM_STYLES, NAV_ITEM_SIZES,
  ACCENT_PRESETS, GOLD_PRESETS, FUNCTIONAL_PRESETS,
  BUTTON_RADIUS_OPTIONS, BUTTON_DENSITY_OPTIONS, BUTTON_LABEL_CASE_OPTIONS,
  currentMode,
} from "@delebash/llm-ui";

// ── JustWrite-specific: manuscript editor paper tints ────────────────
export const PAPER_TINTS = {
  match: { label: "Match app", var: "var(--paper)" },
  cream: { label: "Cream",     light: "#fdf8ec", dark: "#221f17" },
  white: { label: "White",     light: "#ffffff", dark: "#242120" },
  sepia: { label: "Sepia",     light: "#f4ead3", dark: "#241f16" },
  grey:  { label: "Grey",      light: "#eceae6", dark: "#1d1e1f" },
};

const EDITOR_FONT_SIZE_PX = { small: 15, medium: 18, big: 21 };

// JustWrite default = the generic defaults + JW brand + editor fields. Matches
// the previous standalone DEFAULT_APPEARANCE exactly (Fine Press look).
export const DEFAULT_APPEARANCE = {
  ...GENERIC_DEFAULT,
  preset: "fine-press",
  fontPairing: "fine-press",
  uiFont: "Spline Sans",
  displayFont: "Fraunces",
  accentHue: 14, // oxblood
  inkPalette: "warm",
  // Editor (JustWrite-specific)
  editorBodyFont: "Fraunces",
  editorPaper: "match",
  editorLayout: "full",
  inlinePaper: false,
  editorFontSize: "medium",
  editorLineSpacing: 1.7,
  editorParaSpacing: 0,
  editorParaIndent: true,
};

// ── Whole-look presets (full configurations incl. editor fields) ─────
export const THEME_PRESETS = [
  {
    id: "studio", name: "Studio", hint: "Geist + teal, white surfaces — the original clean look.",
    patch: {
      mode: "system",
      fontPairing: "calm", uiFont: "Geist", displayFont: "Source Serif 4", editorBodyFont: "Source Serif 4",
      accentHue: 200, goldHue: 80,
      dangerHue: 35, successHue: 150, infoHue: 220,
      appBg: "paperwhite", sidebarBg: "paperwhite", editorPaper: "white",
      editorLayout: "full", inlinePaper: false,
      inkPalette: "warm", uiScale: 1,
      sidebarHeadingStyle: "eyebrow", sidebarHeadingSize: "s",
      navItemStyle: "standard", navItemSize: "s",
      editorFontSize: "medium", editorLineSpacing: 1.5, editorParaSpacing: 0.5, editorParaIndent: false,
    },
  },
  {
    id: "fine-press", name: "Fine Press", hint: "Fraunces + oxblood, full-width editor.",
    patch: {
      mode: "system",
      fontPairing: "fine-press", uiFont: "Spline Sans", displayFont: "Fraunces", editorBodyFont: "Fraunces",
      accentHue: 14, goldHue: 80,
      dangerHue: 35, successHue: 150, infoHue: 220,
      appBg: "neutral", sidebarBg: "neutral", editorPaper: "match",
      editorLayout: "full", inlinePaper: false,
      inkPalette: "warm", uiScale: 1,
      sidebarHeadingStyle: "eyebrow", sidebarHeadingSize: "s",
      navItemStyle: "standard", navItemSize: "s",
      editorFontSize: "medium", editorLineSpacing: 1.7, editorParaSpacing: 0, editorParaIndent: true,
    },
  },
  {
    id: "ivory-press", name: "Ivory Press", hint: "Ivory surfaces, cream paper, italic headings.",
    patch: {
      mode: "system",
      fontPairing: "fine-press", uiFont: "Spline Sans", displayFont: "Fraunces", editorBodyFont: "Fraunces",
      accentHue: 14, goldHue: 80,
      dangerHue: 35, successHue: 150, infoHue: 220,
      appBg: "ivory", sidebarBg: "ivory", editorPaper: "cream",
      editorLayout: "page", inlinePaper: true,
      inkPalette: "sepia", uiScale: 1,
      sidebarHeadingStyle: "display", sidebarHeadingSize: "m",
      navItemStyle: "editorial", navItemSize: "s",
      editorFontSize: "medium", editorLineSpacing: 1.8, editorParaSpacing: 0, editorParaIndent: true,
    },
  },
  {
    id: "calm-modern", name: "Calm Modern", hint: "Geist + teal, clean defaults.",
    patch: {
      mode: "system",
      fontPairing: "calm", uiFont: "Geist", displayFont: "Source Serif 4", editorBodyFont: "Source Serif 4",
      accentHue: 200, goldHue: 80,
      dangerHue: 35, successHue: 150, infoHue: 220,
      appBg: "neutral", sidebarBg: "neutral", editorPaper: "match",
      editorLayout: "full", inlinePaper: false,
      inkPalette: "auto", uiScale: 1,
      sidebarHeadingStyle: "eyebrow", sidebarHeadingSize: "s",
      navItemStyle: "standard", navItemSize: "s",
      editorFontSize: "medium", editorLineSpacing: 1.6, editorParaSpacing: 0, editorParaIndent: true,
    },
  },
  {
    id: "editorial", name: "Editorial", hint: "Newsreader + indigo, cool surfaces, mono headings.",
    patch: {
      mode: "system",
      fontPairing: "editorial", uiFont: "Hanken Grotesk", displayFont: "Newsreader", editorBodyFont: "Newsreader",
      accentHue: 270, goldHue: 55,
      dangerHue: 35, successHue: 150, infoHue: 220,
      appBg: "cool", sidebarBg: "cool", editorPaper: "white",
      editorLayout: "page", inlinePaper: false,
      inkPalette: "cool", uiScale: 1,
      sidebarHeadingStyle: "mono", sidebarHeadingSize: "s",
      navItemStyle: "standard", navItemSize: "s",
      editorFontSize: "medium", editorLineSpacing: 1.6, editorParaSpacing: 0.3, editorParaIndent: true,
    },
  },
];

// JustWrite's editor-specific token application — runs inside the shared engine
// pass via extraApply, so per-mode editor tints track the resolved mode.
function editorExtraApply({ a, root, s, mode }) {
  root.dataset.editorLayout = a.editorLayout === "page" ? "page" : "full";
  root.dataset.inlinePaper = a.inlinePaper ? "on" : "off";
  s.setProperty("--editor-body-font", displayStack(a.editorBodyFont));
  s.setProperty("--editor-body-font-size", `${EDITOR_FONT_SIZE_PX[a.editorFontSize] || 18}px`);
  s.setProperty("--editor-body-line-height", String(Number.isFinite(+a.editorLineSpacing) ? a.editorLineSpacing : 1.5));
  s.setProperty("--editor-body-para-spacing", `${Number.isFinite(+a.editorParaSpacing) ? a.editorParaSpacing : 0}em`);
  s.setProperty("--editor-body-para-indent", a.editorParaIndent ? "1.6em" : "0");
  s.setProperty("--editor-paper", resolveTint(a.editorPaper, PAPER_TINTS, mode));
}

export function applyAppearance(appearance) {
  applyGeneric({ ...DEFAULT_APPEARANCE, ...(appearance || {}) }, { extraApply: editorExtraApply });
}

export function migrateAppearance(persisted = {}) {
  return migrateGeneric(persisted, DEFAULT_APPEARANCE);
}
