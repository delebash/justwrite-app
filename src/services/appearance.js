// Appearance / theming — JustWrite.
//
// The GENERIC engine + catalogs are shared (kit @delebash/ui appearance):
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
} from "@delebash/ui";

// Re-export the shared catalogs (SettingsView / TitleBar import them from here).
export {
  UI_FONTS, DISPLAY_FONTS, PAIRINGS, SURFACE_TINTS, INK_PALETTES, UI_SCALES,
  SIDEBAR_HEADING_STYLES, SIDEBAR_HEADING_SIZES, NAV_ITEM_STYLES, NAV_ITEM_SIZES,
  ACCENT_PRESETS, GOLD_PRESETS, FUNCTIONAL_PRESETS,
  BUTTON_RADIUS_OPTIONS, BUTTON_DENSITY_OPTIONS, BUTTON_LABEL_CASE_OPTIONS,
  currentMode,
} from "@delebash/ui";

// ── JustWrite-specific: manuscript editor paper tints ────────────────
export const PAPER_TINTS = {
  match: { labelKey: "settings.appearance.paper.match", var: "var(--paper)" },
  cream: { labelKey: "settings.appearance.paper.cream", light: "#fdf8ec", dark: "#221f17" },
  white: { labelKey: "settings.appearance.paper.white", light: "#ffffff", dark: "#242120" },
  sepia: { labelKey: "settings.appearance.paper.sepia", light: "#f4ead3", dark: "#241f16" },
  grey:  { labelKey: "settings.appearance.paper.grey",  light: "#eceae6", dark: "#1d1e1f" },
};

// ── JustWrite-specific: the editor's highlight and text colours ──────
// A scene stores `var(--color-highlight-<key>)` / `var(--color-text-<key>)`, never the colour itself —
// Tiptap's way to theme a colour mark (tiptap.dev/docs/ui-components/components/color-highlight-button)
// — so a highlight or a coloured word reads in both modes. Light: the colours the editor always had.
// Dark: a highlight is its colour at the plain highlight's 35% over the paper (RichEditor's `mark`);
// a text colour is the same Tailwind hue a step Tailwind uses on dark grounds (700 → 400, the greys
// 900 → 100 and 500 → 400).
const darkHighlight = (light) => `color-mix(in oklch, ${light} 35%, transparent)`;
export const HIGHLIGHT_COLORS = {
  yellow: { labelKey: "richEditor.color.yellow", light: "#ffe8a3", dark: darkHighlight("#ffe8a3") },
  green:  { labelKey: "richEditor.color.green",  light: "#bdf0c4", dark: darkHighlight("#bdf0c4") },
  blue:   { labelKey: "richEditor.color.blue",   light: "#bfe1ff", dark: darkHighlight("#bfe1ff") },
  pink:   { labelKey: "richEditor.color.pink",   light: "#ffc9de", dark: darkHighlight("#ffc9de") },
  purple: { labelKey: "richEditor.color.purple", light: "#e2ccff", dark: darkHighlight("#e2ccff") },
  orange: { labelKey: "richEditor.color.orange", light: "#ffd2a6", dark: darkHighlight("#ffd2a6") },
};
export const TEXT_COLORS = {
  ink:    { light: "#111827", dark: "#f3f4f6" },
  grey:   { light: "#6b7280", dark: "#9ca3af" },
  red:    { light: "#b91c1c", dark: "#f87171" },
  orange: { light: "#c2410c", dark: "#fb923c" },
  green:  { light: "#15803d", dark: "#4ade80" },
  teal:   { light: "#0f766e", dark: "#2dd4bf" },
  blue:   { light: "#1d4ed8", dark: "#60a5fa" },
  purple: { light: "#6d28d9", dark: "#a78bfa" },
  pink:   { light: "#be185d", dark: "#f472b6" },
};
export const highlightVar = (key) => `var(--color-highlight-${key})`;
export const textColorVar = (key) => `var(--color-text-${key})`;

/** The editor colours' custom properties in a mode ("light" | "dark"), as [name, value] pairs. */
export function editorColorVars(mode) {
  return [
    ...Object.entries(HIGHLIGHT_COLORS).map(([key, c]) => [`--color-highlight-${key}`, c[mode]]),
    ...Object.entries(TEXT_COLORS).map(([key, c]) => [`--color-text-${key}`, c[mode]]),
    // the words on a highlight that isn't one of these (an older scene's, a pasted one's), in dark
    ["--color-text-on-highlight", TEXT_COLORS.ink.light],
  ];
}

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
    id: "studio", nameKey: "settings.appearance.preset.studio.name", hintKey: "settings.appearance.preset.studio.hint",
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
    id: "fine-press", nameKey: "settings.appearance.preset.finePress.name", hintKey: "settings.appearance.preset.finePress.hint",
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
    id: "ivory-press", nameKey: "settings.appearance.preset.ivoryPress.name", hintKey: "settings.appearance.preset.ivoryPress.hint",
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
    id: "calm-modern", nameKey: "settings.appearance.preset.calmModern.name", hintKey: "settings.appearance.preset.calmModern.hint",
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
    id: "editorial", nameKey: "settings.appearance.preset.editorial.name", hintKey: "settings.appearance.preset.editorial.hint",
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
  for (const [name, value] of editorColorVars(mode)) s.setProperty(name, value);
}

export function applyAppearance(appearance) {
  applyGeneric({ ...DEFAULT_APPEARANCE, ...(appearance || {}) }, { extraApply: editorExtraApply });
}

export function migrateAppearance(persisted = {}) {
  return migrateGeneric(persisted, DEFAULT_APPEARANCE);
}
