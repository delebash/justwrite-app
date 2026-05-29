// Writing/editor display settings — font, size, spacing, indent, spell
// check, and auto-capitalize. Applied as CSS custom properties on the
// document root (like the theme service) so every RichEditor reflects
// them; spell-check and capitalize are wired per-editor in RichEditor.

export const EDITOR_FONTS = [
  { label: "Garamond",        stack: "Garamond, 'EB Garamond', 'Times New Roman', serif" },
  { label: "Georgia",         stack: "Georgia, 'Times New Roman', serif" },
  { label: "Times New Roman", stack: "'Times New Roman', Times, serif" },
  { label: "Palatino",        stack: "'Palatino Linotype', Palatino, 'Book Antiqua', serif" },
  { label: "System serif",    stack: "var(--font-serif)" },
  { label: "Sans-serif",      stack: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" },
  { label: "Monospace",       stack: "var(--font-mono)" },
];

const FONT_SIZE_PX = { small: 15, medium: 18, big: 21 };

export const DEFAULT_EDITOR_SETTINGS = {
  font: "Garamond",
  fontSize: "medium",      // small | medium | big
  paragraphIndent: true,
  capitalize: true,
  lineSpacing: 1.5,        // 1 | 1.3 | 1.4 | 1.5 | 2
  paragraphSpacing: 1,     // 0 | 0.5 | 1 | 1.5 | 2  (em between paragraphs)
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
  root.setProperty("--editor-font", fontStack(s.font));
  root.setProperty("--editor-font-size", `${FONT_SIZE_PX[s.fontSize] || FONT_SIZE_PX.medium}px`);
  root.setProperty("--editor-line-height", String(s.lineSpacing));
  root.setProperty("--editor-para-indent", s.paragraphIndent ? "1.6em" : "0");
  root.setProperty("--editor-para-spacing", `${s.paragraphSpacing}em`);
}
