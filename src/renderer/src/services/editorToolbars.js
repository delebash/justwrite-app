// Toolbar button presets for RichEditor. One source of truth so the
// manuscript (scene) editor and the inline entity editors can't drift —
// e.g. adding a new control here surfaces it everywhere that opts in.
//
// Order here is the order shown in the toolbar. `show(name)` in RichEditor
// just checks membership, so omitting a name hides that button.

// Full set — the manuscript/scene editor default. Includes fullscreen
// Focus mode (manuscript-only chrome).
export const EDITOR_TOOLBAR_FULL = [
  "bold", "italic", "underline", "strike", "subscript", "superscript",
  "h1", "h2", "h3", "fontDec", "fontInc",
  "quote", "list", "orderedList", "taskList",
  "sceneBreak", "align", "highlight", "textColor", "link", "image", "table", "pageBreak",
  "clearFormat", "copy", "cut", "paste", "print",
  "comment", "find", "focus", "settings", "undo", "redo",
];

// Inline document fields (Architecture, Strands, Object/Location notes).
// Same controls as the manuscript, minus the fullscreen Focus mode.
export const EDITOR_TOOLBAR_DOC = EDITOR_TOOLBAR_FULL.filter((b) => b !== "focus");

// Short blurb fields (e.g. a Group blurb) — formatting essentials only,
// no insert/clipboard/print clutter.
export const EDITOR_TOOLBAR_SLIM = [
  "bold", "italic", "underline", "strike", "subscript", "superscript",
  "textColor", "link", "list", "quote", "clearFormat", "find", "settings", "undo", "redo",
];
