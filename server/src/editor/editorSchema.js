// SPDX-License-Identifier: MIT
// The editor's extensions — every node, mark and attribute a scene's HTML can hold, in the
// editor's own order. ONE list for two users:
//   - the editor (components/RichEditor.vue) calls editorExtensions() with its Vue node view and
//     its @-mention suggestion;
//   - the server's sync (server/src/sync.js) calls it with neither, to parse and render scene HTML
//     when two devices' edits to a scene merge — the same schema, so a merged scene renders back
//     exactly as the editor writes it.
// So this file and the modules it imports must load in Node: plain TipTap only, no Vue, no
// `@renderer/` alias, the DOM touched only inside functions. They live in the server package
// (`server/src/editor/`, which ships with the packaged app) and the renderer imports them as
// `justwrite-server/editor/<file>` (the Quasar move, 2026-10-08).

import { Extension, Mark, Node, mergeAttributes } from "@tiptap/core";
import CharacterCount from "@tiptap/extension-character-count";
import Focus from "@tiptap/extension-focus";
import Highlight from "@tiptap/extension-highlight";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Mention from "@tiptap/extension-mention";
import Placeholder from "@tiptap/extension-placeholder";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import TextAlign from "@tiptap/extension-text-align";
import { Color, TextStyle } from "@tiptap/extension-text-style";
import Typography from "@tiptap/extension-typography";
import Underline from "@tiptap/extension-underline";
import { AllSelection, TextSelection } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";
import { AiDiff } from "./aiDiff.js";
import { Marker } from "./markers.js";
import { SearchReplace } from "./searchReplace.js";

// Migrate legacy plain-text bodies into HTML so existing seed data
// renders with proper paragraph breaks. If the value already looks
// like HTML (leading tag) we pass it through untouched.
export function bodyToHtml(s) {
  if (!s) return "";
  if (/^\s*<[a-z]/i.test(s)) return s;
  const esc = (t) => t.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  return s
    .split(/\n{2,}/)
    .map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

// Font size as a textStyle attribute (TipTap has no official one). Lets
// the increase/decrease buttons set an inline font-size on the selection.
export const FontSize = Extension.create({
  name: "fontSize",
  addOptions() { return { types: ["textStyle"] }; },
  addGlobalAttributes() {
    return [{
      types: this.options.types,
      attributes: {
        fontSize: {
          default: null,
          parseHTML: (el) => el.style.fontSize || null,
          renderHTML: (attrs) => (attrs.fontSize ? { style: `font-size: ${attrs.fontSize}` } : {}),
        },
      },
    }];
  },
  addCommands() {
    return {
      setFontSize: (size) => ({ chain }) => chain().setMark("textStyle", { fontSize: size }).run(),
      unsetFontSize: () => ({ chain }) => chain().setMark("textStyle", { fontSize: null }).removeEmptyTextStyle().run(),
    };
  },
});

// Word-faithful Tab. Adds an `indent` attribute (integer level) to
// paragraph nodes that renders as inline `text-indent: N*1.6em` and
// round-trips through saved HTML. Tab/Shift-Tab nudge the level up/down
// on the current paragraph (or sink/lift on list items). Inline style
// overrides the .manuscript-inner auto-indent rule via specificity, so
// the writer's explicit Tab always wins over the automatic baseline.
export const Indent = Extension.create({
  name: "indent",
  addOptions() {
    return {
      types: ["paragraph"],
      minLevel: 0,
      maxLevel: 4,
      indentSize: 1.6, // em — matches --editor-para-indent
    };
  },
  addGlobalAttributes() {
    return [{
      types: this.options.types,
      attributes: {
        indent: {
          default: null,
          renderHTML: (attrs) => {
            const lvl = attrs.indent;
            if (lvl === null || lvl === undefined) return {};
            // Explicit 0 forces flush even when the CSS auto-indent is on.
            if (lvl <= 0) return { style: "text-indent: 0" };
            return { style: `text-indent: ${lvl * this.options.indentSize}em` };
          },
          parseHTML: (el) => {
            const t = el.style.textIndent;
            if (!t) return null;
            if (/^\s*0(\.0+)?(px|em|rem|%)?\s*$/i.test(t)) return 0;
            const m = t.match(/([\d.]+)/);
            if (!m) return null;
            const v = parseFloat(m[1]);
            if (!Number.isFinite(v) || !this.options.indentSize) return null;
            const lvl = Math.round(v / this.options.indentSize);
            return lvl > this.options.minLevel ? lvl : null;
          },
        },
      },
    }];
  },
  addCommands() {
    const adjust = (tr, pos, delta) => {
      const node = tr.doc.nodeAt(pos);
      if (!node) return tr;
      const cur = node.attrs.indent;
      const isExplicit = cur !== null && cur !== undefined;
      const curNum = isExplicit ? cur : 0;
      const next = Math.max(this.options.minLevel, Math.min(this.options.maxLevel, curNum + delta));
      // Allow null → explicit 0 transition so Shift-Tab can override CSS auto-indent.
      if (next === curNum && isExplicit) return tr;
      const attrs = { ...node.attrs };
      delete attrs.indent;
      return tr.setNodeMarkup(pos, node.type, { ...attrs, indent: next }, node.marks);
    };
    const step = (delta) => () => ({ tr, state, dispatch }) => {
      tr.setSelection(state.selection);
      const sel = state.selection;
      if (sel instanceof TextSelection || sel instanceof AllSelection) {
        const { from, to } = sel;
        tr.doc.nodesBetween(from, to, (node, pos) => {
          if (this.options.types.includes(node.type.name)) {
            tr = adjust(tr, pos, delta);
            return false;
          }
          return true;
        });
      }
      if (tr.docChanged) {
        if (dispatch) dispatch(tr);
        return true;
      }
      return false;
    };
    return {
      setIndent: step(1),
      setOutdent: step(-1),
    };
  },
  addKeyboardShortcuts() {
    // Always return true so Tab never escapes the editor — matches Word's
    // contract that Tab is a writing key, not a navigation key.
    return {
      Tab: () => {
        const ed = this.editor;
        if (ed.isActive("bulletList") || ed.isActive("orderedList")) ed.commands.sinkListItem("listItem");
        else if (ed.isActive("taskList")) ed.commands.sinkListItem("taskItem");
        else ed.commands.setIndent();
        return true;
      },
      "Shift-Tab": () => {
        const ed = this.editor;
        if (ed.isActive("bulletList") || ed.isActive("orderedList")) ed.commands.liftListItem("listItem");
        else if (ed.isActive("taskList")) ed.commands.liftListItem("taskItem");
        else ed.commands.setOutdent();
        return true;
      },
    };
  },
});

// Forced page break, Word's Cmd/Ctrl+Enter. Renders as a styled divider
// in the editor and Read view; the export adapters (pdf/docx) detect the
// node and emit a real page break. EPUB ignores it (reflowable format).
export const PageBreak = Node.create({
  name: "pageBreak",
  group: "block",
  selectable: true,
  atom: true,
  parseHTML() { return [{ tag: "div.page-break" }]; },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes({ class: "page-break", "data-content": "Page break" }, HTMLAttributes)];
  },
  addCommands() {
    return {
      setPageBreak: () => ({ commands }) => commands.insertContent({ type: this.name }),
    };
  },
  // No keyboard shortcut — the page break node + export plumbing stay
  // in place (PDF / DOCX honor it; EPUB skips), but it's no longer in
  // the toolbar and Mod-Enter is freed up. If a writer ever needs to
  // force a mid-chapter page break for a specific manuscript, the
  // `setPageBreak` command remains callable programmatically.
});

// Continuous-chapter scene boundary. In continuous editor mode we stitch
// every scene in a chapter into one document, separated by this node.
// Carries the scene's id/title/idx so the stitch can be split back into
// per-scene structure without losing metadata. Renders as a visible
// divider with the scene's title beneath it. Atomic (not editable as
// text) so a writer can't accidentally split one mid-typing — but IS
// deletable, which is the canonical way to merge two adjacent scenes.
// (The editor adds its Vue node view: editorExtensions({ sceneBoundaryView }).)
export const SceneBoundary = Node.create({
  name: "sceneBoundary",
  group: "block",
  selectable: true,
  atom: true,
  draggable: false,
  parseHTML() { return [{ tag: "div[data-scene-boundary]" }]; },
  renderHTML({ HTMLAttributes }) {
    const title = HTMLAttributes["data-scene-title"] || "";
    const idx = HTMLAttributes["data-scene-idx"];
    return [
      "div",
      mergeAttributes({ class: "scene-boundary" }, HTMLAttributes, {
        "data-scene-boundary": "true",
        "data-label": idx != null ? `Scene ${Number(idx) + 1}${title ? ` — ${title}` : ""}` : (title || "New scene"),
      }),
    ];
  },
  addAttributes() {
    return {
      sceneId: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-scene-id") || null,
        renderHTML: (attrs) => (attrs.sceneId ? { "data-scene-id": attrs.sceneId } : {}),
      },
      sceneTitle: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-scene-title") || "",
        renderHTML: (attrs) => (attrs.sceneTitle ? { "data-scene-title": attrs.sceneTitle } : {}),
      },
      sceneIdx: {
        default: 0,
        parseHTML: (el) => Number(el.getAttribute("data-scene-idx") || 0),
        renderHTML: (attrs) => ({ "data-scene-idx": String(attrs.sceneIdx ?? 0) }),
      },
    };
  },
  addCommands() {
    return {
      // Insert a new scene boundary at the cursor. No sceneId — the
      // continuous-chapter splitter (services/chapterStitch.js) treats
      // null-id boundaries as new scenes and the project store mints a
      // fresh sceneId on apply. We chain a trailing empty paragraph so
      // the cursor lands inside an editable body block (without it,
      // TipTap parks the cursor right after the atom node, which is
      // not a typeable position when the boundary is the last block).
      setSceneBoundary: () => ({ chain }) => chain()
        .insertContent([
          { type: this.name, attrs: { sceneId: null, sceneTitle: "", sceneIdx: 0 } },
          { type: "paragraph" },
        ])
        .focus()
        .run(),
    };
  },
  addKeyboardShortcuts() {
    return {
      "Mod-Shift-Enter": () => this.editor.commands.setSceneBoundary(),
    };
  },
});

// Word-style comment: a mark that wraps the commented text and stores the
// note in a data attribute (so it persists in the saved HTML). The note
// itself only renders in a popover when the marked text is clicked.
export const Comment = Mark.create({
  name: "comment",
  inclusive: false,
  addAttributes() {
    return {
      comment: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-comment") || "",
        renderHTML: (attrs) => (attrs.comment ? { "data-comment": attrs.comment } : {}),
      },
    };
  },
  parseHTML() { return [{ tag: "span[data-comment]" }]; },
  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes({ class: "comment-mark" }, HTMLAttributes), 0];
  },
  addCommands() {
    return {
      setComment: (comment) => ({ commands }) => commands.setMark("comment", { comment }),
      unsetComment: () => ({ commands }) => commands.unsetMark("comment"),
    };
  },
});

// The @-mention node's attributes and rendering — shared by the editor's mention (which adds the
// suggestion popup, services/editorMentions.js) and the schema-only mention below.
export function mentionAttributes() {
  return {
    id: {
      default: null,
      parseHTML: (el) => el.getAttribute("data-id"),
      renderHTML: (attrs) => (attrs.id == null ? {} : { "data-id": attrs.id }),
    },
    label: {
      default: null,
      parseHTML: (el) => el.getAttribute("data-label"),
      renderHTML: (attrs) => (attrs.label == null ? {} : { "data-label": attrs.label }),
    },
    kind: {
      default: "character",
      parseHTML: (el) => el.getAttribute("data-kind") || "character",
      renderHTML: (attrs) => ({ "data-kind": attrs.kind || "character" }),
    },
  };
}
export const MENTION_OPTIONS = {
  // Per-kind class for chip colouring; the data-kind attr drives the
  // actual colour in CSS, this just guarantees a base `.mention` hook.
  HTMLAttributes: { class: "mention" },
  renderText({ node }) {
    return `@${node.attrs.label ?? node.attrs.id}`;
  },
};

/** The mention node without the suggestion popup — what the server parses scene HTML with. */
export function schemaMention() {
  return Mention.extend({ addAttributes: mentionAttributes }).configure({ ...MENTION_OPTIONS });
}

/**
 * The editor's extensions in the editor's order.
 * @param {{ placeholder?: string, sceneBoundaryView?: () => any, mention?: object | null }} [opts]
 *   sceneBoundaryView: the editor's node view for scene boundaries; mention: the mention extension
 *   (the editor's, with its suggestion popup; the server passes schemaMention())
 */
export function editorExtensions({ placeholder = "", sceneBoundaryView = null, mention = null } = {}) {
  const extensions = [
    StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
    Placeholder.configure({ placeholder }),
    Underline,
    Subscript,
    Superscript,
    TextStyle,
    Color,
    FontSize,
    Comment,
    Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { rel: "noopener nofollow", target: "_blank" } }),
    Highlight.configure({ multicolor: true }),
    TextAlign.configure({ types: ["heading", "paragraph"] }),
    Typography,
    CharacterCount,
    Focus.configure({ className: "has-focus", mode: "shallowest" }),
    Image.configure({ allowBase64: true }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Table.configure({ resizable: true }),
    TableRow,
    TableHeader,
    TableCell,
    SearchReplace,
    AiDiff,
    Marker,
    Indent,
    PageBreak,
    sceneBoundaryView ? SceneBoundary.extend({ addNodeView: sceneBoundaryView }) : SceneBoundary,
  ];
  if (mention) extensions.push(mention);
  return extensions;
}
