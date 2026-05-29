// Writing/editor display settings — font, size, spacing, indent, spell
// check, and auto-capitalize. Applied as CSS custom properties on the
// document root (like the theme service) so every RichEditor reflects
// them; spell-check and capitalize are wired per-editor in RichEditor.

export const EDITOR_FONTS = [
  { label: "Theme default",   stack: null /* sentinel — see applyEditorSettings */ },
  { label: "Garamond",        stack: "Garamond, 'EB Garamond', 'Times New Roman', serif" },
  { label: "Georgia",         stack: "Georgia, 'Times New Roman', serif" },
  { label: "Times New Roman", stack: "'Times New Roman', Times, serif" },
  { label: "Palatino",        stack: "'Palatino Linotype', Palatino, 'Book Antiqua', serif" },
  { label: "System serif",    stack: "var(--font-serif)" },
  { label: "Sans-serif",      stack: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" },
  { label: "Monospace",       stack: "var(--font-mono)" },
];

const FONT_SIZE_PX = { small: 15, medium: 18, big: 21 };

// Each "theme-defaultable" setting uses null as the sentinel for "fall
// through to the theme value" (set by services/appearance.js). The editor
// modal renders a "theme" button alongside the explicit choices.
export const DEFAULT_EDITOR_SETTINGS = {
  font: "Theme default",
  fontSize: null,          // small | medium | big | null (= theme default)
  paragraphIndent: null,   // true | false | null
  capitalize: true,
  lineSpacing: null,       // 1 | 1.3 | 1.4 | 1.5 | 2 | null
  paragraphSpacing: null,  // 0 | 0.5 | 1 | 1.5 | 2 | null  (em)
  spellCheck: true,
};

export const LINE_SPACING_OPTIONS = [1, 1.3, 1.4, 1.5, 2];
export const PARAGRAPH_SPACING_OPTIONS = [0, 0.5, 1, 1.5, 2];

export function fontStack(name) {
  return (EDITOR_FONTS.find((f) => f.label === name) || EDITOR_FONTS[0]).stack;
}

export function applyEditorSettings(settings = {}) {
  const s = { ...DEFAULT_EDITOR_SETTINGS, ...settings };
  const root = document.documentElement.style;
  // "Theme default" / null → fall through to the matching --editor-body-*
  // var set by services/appearance.js; an explicit choice wins.
  const stack = fontStack(s.font);
  if (stack) root.setProperty("--editor-font", stack);
  else root.removeProperty("--editor-font");

  const px = FONT_SIZE_PX[s.fontSize];
  if (px) root.setProperty("--editor-font-size", `${px}px`);
  else root.removeProperty("--editor-font-size");

  if (s.lineSpacing != null) root.setProperty("--editor-line-height", String(s.lineSpacing));
  else root.removeProperty("--editor-line-height");

  if (s.paragraphIndent != null) root.setProperty("--editor-para-indent", s.paragraphIndent ? "1.6em" : "0");
  else root.removeProperty("--editor-para-indent");

  if (s.paragraphSpacing != null) root.setProperty("--editor-para-spacing", `${s.paragraphSpacing}em`);
  else root.removeProperty("--editor-para-spacing");
}
