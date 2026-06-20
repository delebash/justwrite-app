// Appearance / theming.
//
// `applyAppearance(appearance)` is the single entry point — it owns colour
// mode resolution (incl. the system-preference listener) plus all the
// design-token overrides the user can drive from Settings → Appearance:
// accent + gold hue, UI/display fonts, per-area background tints, and the
// editor layout (full-width vs. traditional page). Called pre-mount from
// main.js, then reactively from App.vue.
//
// Tints/fonts/presets are exported so the Settings UI renders the same
// curated options this service knows how to apply.

const mql = typeof window !== "undefined" && window.matchMedia
  ? window.matchMedia("(prefers-color-scheme: dark)")
  : null;

let lastResolvedMode = "light";
let systemListener = null;
let lastApplied = null;

function resolveMode(mode) {
  if (mode === "dark" || mode === "light") return mode;
  return mql?.matches ? "dark" : "light";
}

// ── Curated fonts ────────────────────────────────────────────────────
// Stacks reference families loaded in index.html.
export const UI_FONTS = [
  { label: "Spline Sans",           stack: '"Spline Sans", ui-sans-serif, system-ui, sans-serif' },
  { label: "Geist",                 stack: '"Geist", ui-sans-serif, system-ui, sans-serif' },
  { label: "Hanken Grotesk",        stack: '"Hanken Grotesk", ui-sans-serif, system-ui, sans-serif' },
  { label: "Albert Sans",           stack: '"Albert Sans", ui-sans-serif, system-ui, sans-serif' },
  { label: "Manrope",               stack: '"Manrope", ui-sans-serif, system-ui, sans-serif' },
  { label: "DM Sans",               stack: '"DM Sans", ui-sans-serif, system-ui, sans-serif' },
  { label: "Atkinson Hyperlegible", stack: '"Atkinson Hyperlegible", ui-sans-serif, system-ui, sans-serif' },
];

export const DISPLAY_FONTS = [
  { label: "Fraunces",          stack: '"Fraunces", Georgia, "Times New Roman", serif' },
  { label: "Source Serif 4",    stack: '"Source Serif 4", Georgia, serif' },
  { label: "Newsreader",        stack: '"Newsreader", Georgia, serif' },
  { label: "Libre Caslon Text", stack: '"Libre Caslon Text", Georgia, serif' },
  { label: "Playfair Display",  stack: '"Playfair Display", Georgia, serif' },
  { label: "EB Garamond",       stack: '"EB Garamond", Garamond, Georgia, serif' },
  { label: "Spectral",          stack: '"Spectral", Georgia, serif' },
];

const MONO_STACK = '"Spline Sans Mono", ui-monospace, "SF Mono", Menlo, monospace';

function uiStack(label) {
  return (UI_FONTS.find((f) => f.label === label) || UI_FONTS[0]).stack;
}
function displayStack(label) {
  return (DISPLAY_FONTS.find((f) => f.label === label) || DISPLAY_FONTS[0]).stack;
}

// ── Font pairings (UI + display together) ────────────────────────────
export const PAIRINGS = [
  { id: "fine-press", name: "Fine Press",  ui: "Spline Sans",    display: "Fraunces" },
  { id: "calm",       name: "Calm Modern", ui: "Geist",          display: "Source Serif 4" },
  { id: "editorial",  name: "Editorial",   ui: "Hanken Grotesk", display: "Newsreader" },
  { id: "classic",    name: "Classic",     ui: "Albert Sans",    display: "Libre Caslon Text" },
];

// ── Surface tints (app + sidebar backgrounds) ────────────────────────
// `neutral` defers to the theme's own --surface-2 so the default is a
// no-op and stays mode-aware; the rest are explicit per-mode colours.
export const SURFACE_TINTS = {
  neutral:    { label: "Neutral",     var: "var(--surface-2)" },
  ivory:      { label: "Ivory",       light: "#f1ead9", dark: "#211d16" },
  paperwhite: { label: "Paper white", light: "#ffffff", dark: "#262320" },
  cool:       { label: "Cool grey",   light: "#eceef1", dark: "#191b1f" },
  slate:      { label: "Slate",       light: "#e8e9ec", dark: "#16181d" },
};

// ── Editor paper tints ───────────────────────────────────────────────
export const PAPER_TINTS = {
  match: { label: "Match app", var: "var(--paper)" },
  cream: { label: "Cream",     light: "#fdf8ec", dark: "#221f17" },
  white: { label: "White",     light: "#ffffff", dark: "#242120" },
  sepia: { label: "Sepia",     light: "#f4ead3", dark: "#241f16" },
  grey:  { label: "Grey",      light: "#eceae6", dark: "#1d1e1f" },
};

// Resolve a tint *value* — either a key into the curated `table` or a
// literal `#hex` for a custom user-picked colour — to the colour that
// belongs in the current mode.
function resolveTint(value, table, mode) {
  if (typeof value === "string" && value.startsWith("#")) return value;
  const t = (table?.[value]) || (table && (table.neutral || table.match)) || null;
  if (!t) return "";
  if (t.var) return t.var;
  return mode === "dark" ? t.dark : t.light;
}

// ── Ink (text) colour palettes ───────────────────────────────────────
// "auto" leaves the tokens.css defaults; every other palette sets --ink,
// --ink-2, --muted, --subtle together so the four text shades stay in a
// consistent family. Free-hex ink is intentionally NOT exposed — keeping
// prose legible at every setting.
export const INK_PALETTES = {
  auto:    { label: "Auto",    auto: true },
  warm:    { label: "Warm",    light: ["#221f18","#534c3d","#8c8369","#aaa089"], dark: ["#f0e9d8","#c9c0aa","#988e74","#6f6753"] },
  neutral: { label: "Neutral", light: ["#1c1c1f","#4a4a4f","#828286","#a8a8ad"], dark: ["#ededed","#c5c5c8","#8c8c92","#66666b"] },
  cool:    { label: "Cool",    light: ["#1a1d22","#474c54","#7d8590","#a5acb6"], dark: ["#e8eef2","#c3cbd3","#8893a0","#5e6976"] },
  sepia:   { label: "Sepia",   light: ["#3a2c20","#685440","#9a8267","#b69e83"], dark: ["#efe2ce","#c7b696","#9a8b6a","#6b5d40"] },
  soft:    { label: "Soft",    light: ["#3a3a3a","#6a6a6a","#9a9a9a","#b8b8b8"], dark: ["#dcdcdc","#b5b5b5","#8a8a8a","#666666"] },
};

// ── UI size scale ────────────────────────────────────────────────────
// Applied as CSS `zoom` on <html> (Chromium-supported; Tauri uses a
// Chromium webview), so it scales every px/em together — labels,
// controls, prose, the lot.
export const UI_SCALES = [
  { value: 0.9,  label: "Compact" },
  { value: 0.95, label: "Snug" },
  { value: 1,    label: "Normal" },
  { value: 1.05, label: "Comfortable" },
  { value: 1.1,  label: "Large" },
];

// ── Sidebar section heading typography ───────────────────────────────
// Drives the styling of the small labels that group the sidebar nav
// ("Manuscript", "Story world", etc.). The style switch re-tones every
// group label at once; size picks one of four tiers.
export const SIDEBAR_HEADING_STYLES = {
  eyebrow: { label: "Eyebrow",   font: "var(--font-ui)",    weight: 600, italic: "normal", transform: "uppercase", spacing: "0.1em" },
  mono:    { label: "Mono",      font: "var(--font-mono)",  weight: 500, italic: "normal", transform: "uppercase", spacing: "0.18em" },
  display: { label: "Editorial", font: "var(--font-serif)", weight: 500, italic: "italic", transform: "none",      spacing: "0" },
  plain:   { label: "Plain",     font: "var(--font-ui)",    weight: 600, italic: "normal", transform: "none",      spacing: "0" },
};

export const SIDEBAR_HEADING_SIZES = [
  { value: "xs", label: "XS", px: "9px" },
  { value: "s",  label: "S",  px: "10px" },
  { value: "m",  label: "M",  px: "12px" },
  { value: "l",  label: "L",  px: "14px" },
];

// ── Sidebar menu items (Home / Chapters / Characters / …) ────────────
// Same style + size pattern as section headings. "Standard" reproduces
// the default look; the others let the menu adopt the chosen typography.
export const NAV_ITEM_STYLES = {
  standard:  { label: "Standard",  font: "var(--font-ui)",    weight: 400, activeWeight: 500, italic: "normal", spacing: "0" },
  bold:      { label: "Bold",      font: "var(--font-ui)",    weight: 600, activeWeight: 700, italic: "normal", spacing: "0" },
  editorial: { label: "Editorial", font: "var(--font-serif)", weight: 400, activeWeight: 500, italic: "normal", spacing: "0" },
  mono:      { label: "Mono",      font: "var(--font-mono)",  weight: 400, activeWeight: 500, italic: "normal", spacing: "0.02em" },
};

export const NAV_ITEM_SIZES = [
  { value: "xs", label: "XS", px: "11.5px" },
  { value: "s",  label: "S",  px: "12.5px" },
  { value: "m",  label: "M",  px: "14px" },
  { value: "l",  label: "L",  px: "15.5px" },
];

// ── Accent / gold presets (hue-based) ────────────────────────────────
// `goldHue` / GOLD_PRESETS / --gold are the code names for what the UI
// labels "Accent 2" in Settings → Appearance. The `accent2` intent on
// JwButton/JwTag pulls from --gold, so re-tinting Accent 2 retints those.
// --warn-bg / --warn-ink stay tied to goldHue too because actual warning
// banners (.banner.warn) share the same soft-gold treatment.
export const ACCENT_PRESETS = [
  { hue: 14,  name: "Oxblood" },
  { hue: 200, name: "Teal" },
  { hue: 25,  name: "Rose" },
  { hue: 75,  name: "Amber" },
  { hue: 120, name: "Olive" },
  { hue: 270, name: "Indigo" },
  { hue: 320, name: "Plum" },
];
export const GOLD_PRESETS = [
  { hue: 80,  name: "Gold" },
  { hue: 55,  name: "Brass" },
  { hue: 45,  name: "Bronze" },
  { hue: 35,  name: "Copper" },
  { hue: 155, name: "Sage" },
  { hue: 140, name: "Verdigris" },
  { hue: 235, name: "Slate" },
  { hue: 340, name: "Mauve" },
];

// ── Functional-colour hue presets ────────────────────────────────────
// The semantic state colours (success / danger / info) are hue-driven like
// the accent: pick a hue and appearance.js retints the whole family while
// L/C stay fixed per mode (auto-legible). Native chips and the Jw* components
// read the derived vars, so changing a hue re-skins the whole semantic-colour
// family at once. Curated to sensible "this colour means X" hues.
export const FUNCTIONAL_PRESETS = {
  success: [
    { hue: 150, name: "Green" }, { hue: 165, name: "Emerald" },
    { hue: 130, name: "Moss" },  { hue: 185, name: "Teal" },
  ],
  danger: [
    { hue: 35, name: "Red" },    { hue: 20, name: "Crimson" },
    { hue: 45, name: "Rust" },   { hue: 10, name: "Ruby" },
  ],
  info: [
    { hue: 220, name: "Blue" },  { hue: 235, name: "Sky" },
    { hue: 260, name: "Indigo" },{ hue: 200, name: "Cyan" },
  ],
};

// ── Whole-look presets ───────────────────────────────────────────────
// Built-in presets are FULL configurations — every preset-defining field
// is set so re-clicking a preset resets every knob to that preset's idea
// of optimal (including any field the user has tweaked since).
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

// Default appearance — mirrors the Fine Press preset. New installs and
// any persisted state without an explicit preset land here. To pick a
// different default later, copy that preset's `patch` block over the
// values below.
export const DEFAULT_APPEARANCE = {
  mode: "system",
  preset: "fine-press",
  fontPairing: "fine-press",
  uiFont: "Spline Sans",
  displayFont: "Fraunces",
  editorBodyFont: "Fraunces",
  accentHue: 14,   // oxblood
  goldHue: 80,
  dangerHue: 35,    // functional-colour hues (success/danger/info), DaisyUI-style
  successHue: 150,
  infoHue: 220,
  appBg: "neutral",
  sidebarBg: "neutral",
  editorPaper: "match",
  editorLayout: "full",
  inlinePaper: false,    // also tint inline rich-text fields with editor-paper
  inkPalette: "warm",
  uiScale: 1,            // UI size multiplier (0.9 – 1.1)
  sidebarHeadingStyle: "eyebrow",
  sidebarHeadingSize: "s",
  navItemStyle: "standard",
  navItemSize: "s",
  // Editor writing defaults (theme-owned; per-doc Writing settings can
  // override each via "Theme default" in that modal).
  editorFontSize: "medium",     // small | medium | big
  editorLineSpacing: 1.7,
  editorParaSpacing: 0,         // em between paragraphs
  editorParaIndent: true,
  // Button theming knobs — see BUTTON_RADIUS_PX / BUTTON_DENSITY_PX below.
  btnRadius: "standard",        // sharp | standard | rounded | pill
  btnDensity: "comfy",          // compact | comfy
  btnLabelCase: "default",      // default | uppercase
};

// Lookup tables for the button theme knobs. Tunable here.
const BUTTON_RADIUS_PX = { sharp: "2px", standard: "6px", rounded: "10px", pill: "999px" };
const BUTTON_DENSITY = {
  compact: { padY: "5px", padX: "12px", padYSm: "3px", padXSm: "8px",  fontSize: "13px", fontSizeSm: "11.5px" },
  comfy:   { padY: "8px", padX: "16px", padYSm: "4px", padXSm: "11px", fontSize: "14px", fontSizeSm: "12px"   },
};

// Option lists for Settings → Appearance UI. Labels are user-facing.
export const BUTTON_RADIUS_OPTIONS = [
  { value: "sharp",    label: "Sharp" },
  { value: "standard", label: "Standard" },
  { value: "rounded",  label: "Rounded" },
  { value: "pill",     label: "Pill" },
];
export const BUTTON_DENSITY_OPTIONS = [
  { value: "compact", label: "Compact" },
  { value: "comfy",   label: "Comfy" },
];
export const BUTTON_LABEL_CASE_OPTIONS = [
  { value: "default",   label: "Sentence" },
  { value: "uppercase", label: "UPPERCASE" },
];

// Px values for the named editor font-size tiers.
const EDITOR_FONT_SIZE_PX = { small: 15, medium: 18, big: 21 };

// Fold a persisted (possibly old-shape) ui blob into an appearance object.
// Maps the legacy { theme, accentHue } keys onto the new model.
export function migrateAppearance(persisted = {}) {
  const a = { ...DEFAULT_APPEARANCE, ...(persisted.appearance || {}) };
  if (!persisted.appearance) {
    if (persisted.theme) a.mode = persisted.theme === "dark" || persisted.theme === "light" ? persisted.theme : "system";
    if (Number.isFinite(+persisted.accentHue)) a.accentHue = +persisted.accentHue;
  }
  return a;
}

export function applyAppearance(appearance) {
  if (typeof document === "undefined") return;
  const a = { ...DEFAULT_APPEARANCE, ...(appearance || {}) };
  const root = document.documentElement;
  const mode = resolveMode(a.mode);
  lastResolvedMode = mode;
  lastApplied = a;

  root.setAttribute("data-theme", mode);
  root.style.colorScheme = mode;
  root.dataset.editorLayout = a.editorLayout === "page" ? "page" : "full";
  root.dataset.inlinePaper = a.inlinePaper ? "on" : "off";

  const s = root.style;

  if (Number.isFinite(+a.accentHue)) s.setProperty("--accent-hue", String(a.accentHue));

  const gh = Number.isFinite(+a.goldHue) ? +a.goldHue : 80;
  if (mode === "dark") {
    s.setProperty("--gold", `oklch(0.78 0.10 ${gh})`);
    s.setProperty("--gold-soft", `oklch(0.32 0.045 ${gh})`);
    // Warn-* drives .banner.warn; track goldHue
    // so the 2nd-accent hue change retints them too.
    s.setProperty("--warn-bg",   `oklch(0.28 0.05 ${gh})`);
    s.setProperty("--warn-ink",  `oklch(0.86 0.09 ${gh})`);
    s.setProperty("--warn-line", `oklch(0.42 0.08 ${gh})`);
  } else {
    s.setProperty("--gold", `oklch(0.62 0.085 ${gh})`);
    s.setProperty("--gold-soft", `oklch(0.92 0.045 ${gh})`);
    s.setProperty("--warn-bg",   `oklch(0.97 0.03 ${gh})`);
    s.setProperty("--warn-ink",  `oklch(0.4 0.1 ${gh})`);
    s.setProperty("--warn-line", `oklch(0.85 0.08 ${gh})`);
  }

  // Functional-colour hues. Only the hue is set here; tokens.css holds the
  // per-mode L/C so each family stays legible. Falsy/NaN → keep the
  // tokens.css default.
  if (Number.isFinite(+a.dangerHue))  s.setProperty("--danger-hue",  String(a.dangerHue));
  if (Number.isFinite(+a.successHue)) s.setProperty("--success-hue", String(a.successHue));
  if (Number.isFinite(+a.infoHue))    s.setProperty("--info-hue",    String(a.infoHue));

  s.setProperty("--font-ui", uiStack(a.uiFont));
  s.setProperty("--font-serif", displayStack(a.displayFont));
  s.setProperty("--font-mono", MONO_STACK);
  // The theme's default manuscript body font. Per-doc editor settings
  // can still override via --editor-font (set by editorSettings.js).
  s.setProperty("--editor-body-font", displayStack(a.editorBodyFont));
  // Editor writing defaults — overridden per-doc by --editor-* vars set
  // in editorSettings.js when the user picks something other than
  // "Theme default" in the editor's ⚙ Writing settings.
  s.setProperty("--editor-body-font-size", `${EDITOR_FONT_SIZE_PX[a.editorFontSize] || 18}px`);
  s.setProperty("--editor-body-line-height", String(Number.isFinite(+a.editorLineSpacing) ? a.editorLineSpacing : 1.5));
  s.setProperty("--editor-body-para-spacing", `${Number.isFinite(+a.editorParaSpacing) ? a.editorParaSpacing : 0}em`);
  s.setProperty("--editor-body-para-indent", a.editorParaIndent ? "1.6em" : "0");

  // Button knobs — radius / density / label casing.
  s.setProperty("--btn-radius", BUTTON_RADIUS_PX[a.btnRadius] || BUTTON_RADIUS_PX.standard);
  const dens = BUTTON_DENSITY[a.btnDensity] || BUTTON_DENSITY.comfy;
  s.setProperty("--btn-pad-y", dens.padY);
  s.setProperty("--btn-pad-x", dens.padX);
  s.setProperty("--btn-pad-y-sm", dens.padYSm);
  s.setProperty("--btn-pad-x-sm", dens.padXSm);
  s.setProperty("--btn-font-size", dens.fontSize);
  s.setProperty("--btn-font-size-sm", dens.fontSizeSm);
  if (a.btnLabelCase === "uppercase") {
    s.setProperty("--btn-text-transform", "uppercase");
    s.setProperty("--btn-letter-spacing", "0.06em");
  } else {
    s.setProperty("--btn-text-transform", "none");
    s.setProperty("--btn-letter-spacing", "normal");
  }

  s.setProperty("--app-bg", resolveTint(a.appBg, SURFACE_TINTS, mode));
  s.setProperty("--sidebar-bg", resolveTint(a.sidebarBg, SURFACE_TINTS, mode));
  s.setProperty("--editor-paper", resolveTint(a.editorPaper, PAPER_TINTS, mode));

  // Ink (text) colour family — "auto" reverts to tokens.css defaults.
  const ink = INK_PALETTES[a.inkPalette] || INK_PALETTES.auto;
  if (ink.auto) {
    s.removeProperty("--ink"); s.removeProperty("--ink-2");
    s.removeProperty("--muted"); s.removeProperty("--subtle");
  } else {
    const shades = mode === "dark" ? ink.dark : ink.light;
    s.setProperty("--ink", shades[0]);
    s.setProperty("--ink-2", shades[1]);
    s.setProperty("--muted", shades[2]);
    s.setProperty("--subtle", shades[3]);
  }

  // UI size scale via `zoom` (chromium / Tauri webview).
  const scale = Number(a.uiScale);
  root.style.zoom = Number.isFinite(scale) && scale > 0 ? String(scale) : "";

  // Sidebar section heading typography.
  const hs = SIDEBAR_HEADING_STYLES[a.sidebarHeadingStyle] || SIDEBAR_HEADING_STYLES.eyebrow;
  const sz = SIDEBAR_HEADING_SIZES.find((x) => x.value === a.sidebarHeadingSize) || SIDEBAR_HEADING_SIZES[1];
  s.setProperty("--nav-section-font", hs.font);
  s.setProperty("--nav-section-weight", String(hs.weight));
  s.setProperty("--nav-section-style", hs.italic);
  s.setProperty("--nav-section-transform", hs.transform);
  s.setProperty("--nav-section-letter-spacing", hs.spacing);
  s.setProperty("--nav-section-size", sz.px);

  // Sidebar menu item typography (Home / Chapters / …).
  const ns = NAV_ITEM_STYLES[a.navItemStyle] || NAV_ITEM_STYLES.standard;
  const nz = NAV_ITEM_SIZES.find((x) => x.value === a.navItemSize) || NAV_ITEM_SIZES[1];
  s.setProperty("--nav-item-font", ns.font);
  s.setProperty("--nav-item-weight", String(ns.weight));
  s.setProperty("--nav-item-active-weight", String(ns.activeWeight));
  s.setProperty("--nav-item-style", ns.italic);
  s.setProperty("--nav-item-letter-spacing", ns.spacing);
  s.setProperty("--nav-item-size", nz.px);

  // Track the OS preference only while the user opts into "system", so an
  // explicit light/dark choice isn't flipped out from under them. The
  // listener re-applies the *whole* appearance because per-mode tints and
  // gold values change with the resolved mode.
  if (mql) {
    if (a.mode === "system" && !systemListener) {
      systemListener = () => applyAppearance(lastApplied);
      mql.addEventListener?.("change", systemListener);
    } else if (a.mode !== "system" && systemListener) {
      mql.removeEventListener?.("change", systemListener);
      systemListener = null;
    }
  }
}

export function currentMode() { return lastResolvedMode; }
