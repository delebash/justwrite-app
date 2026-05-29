<script setup>
import { ref, computed, watch, nextTick, onBeforeUnmount } from "vue";
import { useEditor, EditorContent, BubbleMenu } from "@tiptap/vue-3";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import TextStyle from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import { Extension, Mark, mergeAttributes } from "@tiptap/core";
import Link from "@tiptap/extension-link";
import Highlight from "@tiptap/extension-highlight";
import TextAlign from "@tiptap/extension-text-align";
import Typography from "@tiptap/extension-typography";
import CharacterCount from "@tiptap/extension-character-count";
import Focus from "@tiptap/extension-focus";
import Image from "@tiptap/extension-image";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableHeader from "@tiptap/extension-table-header";
import TableCell from "@tiptap/extension-table-cell";
import { useRouter } from "vue-router";
import { SearchReplace, searchReplacePluginKey } from "@renderer/services/searchReplace";
import { buildMentionExtension } from "@renderer/services/editorMentions";
import { EDITOR_TOOLBAR_FULL } from "@renderer/services/editorToolbars";
import { saveImage, urlFor } from "@renderer/services/imageStore";
import { useUiStore } from "../stores/ui.js";
import Icon from "./Icon.vue";
import EditorSettingsModal from "./EditorSettingsModal.vue";

const props = defineProps({
  modelValue: { type: String, default: "" },
  placeholder: { type: String, default: "Start writing…" },
  autofocus: { type: Boolean, default: false },
  // "manuscript" — full-bleed editor with serif manuscript chrome (chapters).
  // "inline" — sits inside any container; toolbar above, no manuscript wrapper.
  variant: { type: String, default: "manuscript" },
  // Visible toolbar buttons (whitelist). Manuscript uses the rich default;
  // inline callers pass a slimmer list.
  toolbar: {
    type: Array,
    default: () => EDITOR_TOOLBAR_FULL,
  },
  minHeight: { type: [Number, String], default: null },
  // When true (inline variant), the editor flexes to fill its parent and
  // scrolls internally. Lets a caller cap it to a share of the card via
  // flex weights so content below it stays reachable — tracks the card
  // height rather than the viewport.
  fill: { type: Boolean, default: false },
  // @-mention linking to the story bible. On by default.
  mentions: { type: Boolean, default: true },
  // Show the built-in word/char count footer (manuscript variant only).
  // Callers that surface their own counts can turn this off.
  countFooter: { type: Boolean, default: true },
});

const emit = defineEmits(["update:modelValue", "change"]);
const router = useRouter();
const ui = useUiStore();
const settingsOpen = ref(false);

const isManuscript = computed(() => props.variant === "manuscript");
// Rich chrome (bubble menu, find bar, word count) is manuscript-only.
const showWordCount = computed(() => isManuscript.value && props.countFooter);
// Selection bubble menu shows in both variants — manuscript and inline
// editors share the same controls.
const useBubble = computed(() => !!editor.value);

const toLen = (v) => (typeof v === "number" ? `${v}px` : v);
const inlineBodyStyle = computed(() => {
  // In fill mode the body is sized by flex (see .rich-editor--fill CSS).
  if (props.fill) return null;
  if (props.minHeight) return { minHeight: toLen(props.minHeight) };
  return null;
});

// Migrate legacy plain-text bodies into HTML so existing seed data
// renders with proper paragraph breaks. If the value already looks
// like HTML (leading tag) we pass it through untouched.
function toHtml(s) {
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
const FontSize = Extension.create({
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

// Word-style comment: a mark that wraps the commented text and stores the
// note in a data attribute (so it persists in the saved HTML). The note
// itself only renders in a popover when the marked text is clicked.
const Comment = Mark.create({
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

const extensions = [
  StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
  Placeholder.configure({ placeholder: props.placeholder }),
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
];
if (props.mentions) extensions.push(buildMentionExtension());

// --- live counters ----------------------------------------------------
const wordCount = ref(0);
const charCount = ref(0);
const searchInfo = ref({ count: 0, current: 0 });

function syncCounts(ed) {
  const cc = ed?.storage?.characterCount;
  if (cc) { wordCount.value = cc.words(); charCount.value = cc.characters(); }
}
function syncSearch(ed) {
  const st = searchReplacePluginKey.getState(ed.state);
  if (st) searchInfo.value = { count: st.results.length, current: st.results.length ? st.current + 1 : 0 };
}

const editor = useEditor({
  content: toHtml(props.modelValue),
  autofocus: props.autofocus,
  extensions,
  editorProps: {
    attributes: { class: "tiptap-content", spellcheck: String(ui.editorSettings.spellCheck) },
    // Auto-capitalize the first letter of a sentence as the user types,
    // when the setting is on. Returns true to take over the insertion.
    handleTextInput(view, from, to, text) {
      if (!ui.editorSettings.capitalize) return false;
      if (!/^[a-z]$/.test(text)) return false;
      const $from = view.state.doc.resolve(from);
      let atSentenceStart = $from.parentOffset === 0;
      if (!atSentenceStart) {
        const before = view.state.doc.textBetween(Math.max(0, from - 2), from, "\n", " ");
        if (/[.!?]["')\]]?\s$/.test(before)) atSentenceStart = true;
      }
      if (!atSentenceStart) return false;
      view.dispatch(view.state.tr.insertText(text.toUpperCase(), from, to));
      return true;
    },
  },
  onCreate({ editor }) { syncCounts(editor); editor.view.dom.spellcheck = ui.editorSettings.spellCheck; },
  onUpdate({ editor }) {
    const html = editor.getHTML();
    emit("update:modelValue", html);
    emit("change", html);
    syncCounts(editor);
    maybeTypewriter();
  },
  onSelectionUpdate() { maybeTypewriter(); },
  onTransaction({ editor }) { syncSearch(editor); },
});

// Keep external value changes in sync (e.g. switching the selected entity).
watch(() => props.modelValue, (val) => {
  if (!editor.value) return;
  const incoming = toHtml(val);
  if (incoming !== editor.value.getHTML()) {
    editor.value.commands.setContent(incoming, false);
    syncCounts(editor.value);
  }
});

// Spell check toggles live on the editor's DOM node.
watch(() => ui.editorSettings.spellCheck, (on) => {
  if (editor.value?.view?.dom) editor.value.view.dom.spellcheck = on;
});

onBeforeUnmount(() => editor.value?.destroy());

// --- toolbar helpers --------------------------------------------------
const run = (cmd) => editor.value?.chain().focus()[cmd]().run();
const isActive = (name, attrs) => editor.value?.isActive(name, attrs) || false;
const show = (b) => props.toolbar.includes(b);

// Tooltip shortcut hints. Most of these are TipTap/StarterKit built-ins;
// "mod" renders ⌘ on macOS, Ctrl elsewhere.
const isMac = typeof navigator !== "undefined" && /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent || "");
function sc(combo) {
  return combo.split("+").map((k) =>
    k === "mod" ? (isMac ? "⌘" : "Ctrl")
      : k === "shift" ? (isMac ? "⇧" : "Shift")
        : k === "alt" ? (isMac ? "⌥" : "Alt")
          : k
  ).join(isMac ? "" : "+");
}
const TIP = {
  bold: `Bold · ${sc("mod+B")}`,
  italic: `Italic · ${sc("mod+I")}`,
  underline: `Underline · ${sc("mod+U")}`,
  strike: `Strikethrough · ${sc("mod+shift+S")}`,
  superscript: `Superscript · ${sc("mod+.")}`,
  subscript: `Subscript · ${sc("mod+,")}`,
  h1: `Heading 1 · ${sc("mod+alt+1")}`,
  h2: `Heading 2 · ${sc("mod+alt+2")}`,
  h3: `Heading 3 · ${sc("mod+alt+3")}`,
  quote: `Block quote · ${sc("mod+shift+B")}`,
  bullet: `Bullet list · ${sc("mod+shift+8")}`,
  ordered: `Numbered list · ${sc("mod+shift+7")}`,
  task: `Checklist · ${sc("mod+shift+9")}`,
  highlight: `Highlight · ${sc("mod+shift+H")}`,
  alignLeft: `Align left · ${sc("mod+shift+L")}`,
  alignCenter: `Align center · ${sc("mod+shift+E")}`,
  alignRight: `Align right · ${sc("mod+shift+R")}`,
  justify: `Justify · ${sc("mod+shift+J")}`,
  link: `Link · ${sc("mod+K")}`,
  undo: `Undo · ${sc("mod+Z")}`,
  redo: `Redo · ${sc("mod+Y")}`,
  find: `Find & replace · ${sc("mod+F")}`,
  copy: `Copy · ${sc("mod+C")}`,
  cut: `Cut · ${sc("mod+X")}`,
  paste: `Paste · ${sc("mod+V")}`,
};

function setHeading(level) {
  editor.value?.chain().focus().toggleHeading({ level }).run();
}
function setAlign(align) {
  editor.value?.chain().focus().setTextAlign(align).run();
}
function setLink() {
  const prev = editor.value?.getAttributes("link").href;
  const url = window.prompt("Link URL", prev || "https://");
  if (url === null) return;
  if (url === "") { editor.value?.chain().focus().extendMarkRange("link").unsetLink().run(); return; }
  editor.value?.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
}
function insertTable() {
  editor.value?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
}

// --- highlight color dropdown -----------------------------------------
const HIGHLIGHT_COLORS = [
  { label: "Yellow", color: "#ffe8a3" },
  { label: "Green",  color: "#bdf0c4" },
  { label: "Blue",   color: "#bfe1ff" },
  { label: "Pink",   color: "#ffc9de" },
  { label: "Purple", color: "#e2ccff" },
  { label: "Orange", color: "#ffd2a6" },
];
// Separate open-state per surface (toolbar vs selection bubble) so the
// menu doesn't render in both at once; the apply/clear actions are shared.
const highlightOpen = ref(false);
const highlightBubbleOpen = ref(false);
const highlightWrap = ref(null);
const highlightWrapBubble = ref(null);
function toggleHighlightMenu() { highlightOpen.value = !highlightOpen.value; }
function toggleHighlightBubble() { highlightBubbleOpen.value = !highlightBubbleOpen.value; }
function setHighlightColor(color) {
  editor.value?.chain().focus().setHighlight({ color }).run();
  highlightOpen.value = false; highlightBubbleOpen.value = false;
}
function clearHighlight() {
  editor.value?.chain().focus().unsetHighlight().run();
  highlightOpen.value = false; highlightBubbleOpen.value = false;
}
// --- text color dropdown ----------------------------------------------
const TEXT_COLORS = [
  "#111827", "#6b7280", "#b91c1c", "#c2410c", "#15803d",
  "#0f766e", "#1d4ed8", "#6d28d9", "#be185d",
];
const textColorOpen = ref(false);
const textColorBubbleOpen = ref(false);
const textColorWrap = ref(null);
const textColorWrapBubble = ref(null);
function toggleTextColorMenu() { textColorOpen.value = !textColorOpen.value; }
function toggleTextColorBubble() { textColorBubbleOpen.value = !textColorBubbleOpen.value; }
function textColorValue() { return editor.value?.getAttributes("textStyle")?.color || null; }
function setTextColor(color) {
  editor.value?.chain().focus().setColor(color).run();
  textColorOpen.value = false; textColorBubbleOpen.value = false;
}
function clearTextColor() {
  editor.value?.chain().focus().unsetColor().run();
  textColorOpen.value = false; textColorBubbleOpen.value = false;
}

// --- font size (increase / decrease the selection's inline size) ------
function currentFontSize() {
  const fs = editor.value?.getAttributes("textStyle")?.fontSize;
  const n = fs ? parseFloat(fs) : NaN;
  return Number.isFinite(n) ? n : null;
}
function bumpFont(dir) {
  const base = currentFontSize() ?? 16;
  const next = Math.max(10, Math.min(48, Math.round(base) + dir * 2));
  editor.value?.chain().focus().setFontSize(`${next}px`).run();
}

// --- comments (Word-style) --------------------------------------------
// One floating popover: "edit" mode when adding/editing a comment on the
// selection, "view" mode when a commented span is clicked. The note only
// shows here — never inline — matching the requested behaviour.
const commentState = ref({ open: false, mode: "view", text: "", x: 0, y: 0 });
const commentInput = ref(null);
const commentPopEl = ref(null);

function selectionScreenRect() {
  try {
    const sel = window.getSelection();
    if (sel && sel.rangeCount) {
      const r = sel.getRangeAt(0).getBoundingClientRect();
      if (r && (r.width || r.height)) return r;
    }
  } catch {}
  return null;
}
function openCommentEditor() {
  if (!editor.value || editor.value.state.selection.empty) return;
  const existing = editor.value.getAttributes("comment")?.comment || "";
  const r = selectionScreenRect();
  commentState.value = { open: true, mode: "edit", text: existing, x: r ? r.left : 120, y: r ? r.bottom + 8 : 120 };
  highlightOpen.value = highlightBubbleOpen.value = textColorOpen.value = textColorBubbleOpen.value = false;
  nextTick(() => commentInput.value?.focus());
}
function saveComment() {
  const text = commentState.value.text.trim();
  const chain = editor.value?.chain().focus().extendMarkRange("comment");
  if (text) chain?.setComment(text).run();
  else chain?.unsetComment().run();
  commentState.value.open = false;
}
function deleteComment() {
  editor.value?.chain().focus().extendMarkRange("comment").unsetComment().run();
  commentState.value.open = false;
}
function editComment() { commentState.value.mode = "edit"; nextTick(() => commentInput.value?.focus()); }
function closeComment() { commentState.value.open = false; }
function onCommentKeydown(e) {
  e.stopPropagation();
  if (e.key === "Escape") closeComment();
}

// Collect every comment range in the document (contiguous text nodes that
// carry the comment mark are merged into one range) for prev/next jumps.
function commentRanges() {
  const out = [];
  const ed = editor.value;
  const type = ed?.schema?.marks?.comment;
  if (!ed || !type) return out;
  let cur = null;
  ed.state.doc.descendants((node, pos) => {
    if (!node.isText) return;
    const mark = node.marks.find((m) => m.type === type);
    if (mark) {
      if (cur && cur.to === pos) cur.to = pos + node.nodeSize;
      else { if (cur) out.push(cur); cur = { from: pos, to: pos + node.nodeSize, comment: mark.attrs.comment || "" }; }
    } else if (cur) { out.push(cur); cur = null; }
  });
  if (cur) out.push(cur);
  return out;
}
function gotoComment(dir) {
  const ranges = commentRanges();
  if (!ranges.length) return;
  const head = editor.value.state.selection.head;
  let target;
  if (dir > 0) target = ranges.find((r) => r.from > head) || ranges[0];
  else { const before = ranges.filter((r) => r.to < head); target = before.length ? before[before.length - 1] : ranges[ranges.length - 1]; }
  editor.value.chain().focus().setTextSelection({ from: target.from, to: target.to }).scrollIntoView().run();
  nextTick(() => {
    const r = selectionScreenRect();
    commentState.value = { open: true, mode: "view", text: target.comment, x: r ? r.left : 120, y: r ? r.bottom + 8 : 120 };
  });
}

function onMenuDocDown(e) {
  if (highlightOpen.value && highlightWrap.value && !highlightWrap.value.contains(e.target)) highlightOpen.value = false;
  if (highlightBubbleOpen.value && highlightWrapBubble.value && !highlightWrapBubble.value.contains(e.target)) highlightBubbleOpen.value = false;
  if (textColorOpen.value && textColorWrap.value && !textColorWrap.value.contains(e.target)) textColorOpen.value = false;
  if (textColorBubbleOpen.value && textColorWrapBubble.value && !textColorWrapBubble.value.contains(e.target)) textColorBubbleOpen.value = false;
  if (commentState.value.open && commentPopEl.value && !commentPopEl.value.contains(e.target) && !e.target?.closest?.(".comment-mark")) commentState.value.open = false;
}
document.addEventListener("mousedown", onMenuDocDown);
onBeforeUnmount(() => document.removeEventListener("mousedown", onMenuDocDown));

// --- clipboard / print / clear formatting -----------------------------
function doCopy() { editor.value?.chain().focus().run(); try { document.execCommand("copy"); } catch {} }
function doCut()  { editor.value?.chain().focus().run(); try { document.execCommand("cut"); } catch {} }
async function doPaste() {
  try {
    const text = await navigator.clipboard.readText();
    if (text) editor.value?.chain().focus().insertContent(text).run();
  } catch {}
}
function clearFormat() { editor.value?.chain().focus().unsetAllMarks().clearNodes().run(); }
function doPrint() {
  const html = editor.value?.getHTML() || "";
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
  document.body.appendChild(frame);
  const doc = frame.contentWindow?.document;
  if (!doc) { frame.remove(); return; }
  doc.open();
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>Print</title><style>
    body{font-family:Georgia,'Times New Roman',serif;font-size:12.5pt;line-height:1.7;color:#111;max-width:680px;margin:0 auto;padding:48px}
    h1,h2,h3{font-weight:600;line-height:1.3}h1{text-align:center}
    blockquote{border-left:3px solid #bbb;padding-left:16px;color:#444;margin:14px 0}
    img{max-width:100%}hr{border:0;text-align:center;margin:24px 0}hr::after{content:"\\2042";letter-spacing:4px;color:#888}
    table{border-collapse:collapse;width:100%;margin:14px 0}th,td{border:1px solid #ccc;padding:6px 9px}
    mark{padding:0 2px;border-radius:2px}
    p{margin:0 0 1em}
  </style></head><body>${html}</body></html>`);
  doc.close();
  setTimeout(() => {
    try { frame.contentWindow.focus(); frame.contentWindow.print(); } catch {}
    setTimeout(() => frame.remove(), 1000);
  }, 250);
}

// --- image insert (via the app's imageStore) --------------------------
const fileInput = ref(null);
function pickImage() { fileInput.value?.click(); }
async function onImagePicked(e) {
  const file = e.target.files?.[0];
  e.target.value = "";
  if (!file) return;
  const rec = await saveImage(file);
  const src = await urlFor(rec);
  if (src) editor.value?.chain().focus().setImage({ src, alt: rec.name }).run();
}

// --- focus mode -------------------------------------------------------
// Fullscreen, distraction-free writing. The `.rich-editor` becomes a
// fixed overlay (CSS) that covers the sidebar/titlebar; chrome is hidden
// and an optional typewriter mode keeps the caret line centred.
const focusMode = ref(false);
const typewriter = ref(false);
const manuscriptEl = ref(null);

function toggleFocus() {
  focusMode.value = !focusMode.value;
  if (focusMode.value && typewriter.value) nextTick(scrollCaretToCenter);
}
function toggleTypewriter() {
  typewriter.value = !typewriter.value;
  if (typewriter.value) nextTick(scrollCaretToCenter);
}

// Keep the caret's line vertically centred in the manuscript scroller.
function scrollCaretToCenter() {
  const ed = editor.value;
  const scroller = manuscriptEl.value;
  if (!ed || !scroller) return;
  try {
    const coords = ed.view.coordsAtPos(ed.state.selection.head);
    const rect = scroller.getBoundingClientRect();
    const caretY = (coords.top + coords.bottom) / 2;
    scroller.scrollTop += caretY - (rect.top + rect.height / 2);
  } catch {}
}
function maybeTypewriter() {
  if (focusMode.value && typewriter.value) nextTick(scrollCaretToCenter);
}

// --- find & replace ---------------------------------------------------
const findOpen = ref(false);
const findTerm = ref("");
const replaceTerm = ref("");
const caseSensitive = ref(false);
const findInput = ref(null);

watch(findTerm, (t) => editor.value?.commands.setSearchTerm(t));
watch(caseSensitive, (c) => editor.value?.commands.setSearchCaseSensitive(c));

function openFind() {
  findOpen.value = true;
  nextTick(() => findInput.value?.focus());
  if (findTerm.value) editor.value?.commands.setSearchTerm(findTerm.value);
}
function closeFind() {
  findOpen.value = false;
  editor.value?.commands.clearSearch();
}
function toggleFind() { findOpen.value ? closeFind() : openFind(); }
const findNext = () => editor.value?.commands.searchGoTo(1);
const findPrev = () => editor.value?.commands.searchGoTo(-1);
const doReplace = () => editor.value?.commands.replaceCurrent(replaceTerm.value);
const doReplaceAll = () => editor.value?.commands.replaceAll(replaceTerm.value);

// --- mention click → navigate to the bible entry ----------------------
const ROUTE_BY_KIND = { character: "Characters", location: "Locations", object: "Objects", group: "Groups" };
function onBodyClick(e) {
  const commentEl = e.target?.closest?.(".comment-mark");
  if (commentEl) {
    const r = commentEl.getBoundingClientRect();
    commentState.value = { open: true, mode: "view", text: commentEl.getAttribute("data-comment") || "", x: r.left, y: r.bottom + 8 };
    return;
  }
  const chip = e.target?.closest?.(".mention");
  if (!chip) return;
  const id = chip.getAttribute("data-id");
  const name = ROUTE_BY_KIND[chip.getAttribute("data-kind")];
  if (id && name) { e.preventDefault(); router.push({ name, params: { id } }); }
}

// --- keyboard ---------------------------------------------------------
function onKeydown(e) {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
    e.preventDefault();
    e.stopPropagation();
    openFind();
  } else if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === "k") {
    e.preventDefault();
    e.stopPropagation();
    setLink();
  } else if (e.key === "Escape" && findOpen.value) {
    closeFind();
  } else if (e.key === "Escape" && focusMode.value) {
    focusMode.value = false;
  }
}

defineExpose({ editor });
</script>

<template>
  <div class="rich-editor" :class="[`rich-editor--${variant}`, { 'rich-editor--fill': fill, 'focus-on': focusMode, 'typewriter-on': focusMode && typewriter }]" @keydown="onKeydown">
    <div class="editor-toolbar" v-if="editor && !focusMode">
      <div class="group" v-if="show('undo') || show('redo')">
        <button v-if="show('undo')" class="tb-btn" :disabled="!editor.can().undo()" @click="run('undo')" :data-tip="TIP.undo"><Icon name="Refresh" :size="14" style="transform:scaleX(-1)" /></button>
        <button v-if="show('redo')" class="tb-btn" :disabled="!editor.can().redo()" @click="run('redo')" :data-tip="TIP.redo"><Icon name="Refresh" :size="14" /></button>
      </div>
      <div class="group" v-if="show('copy') || show('cut') || show('paste')">
        <button v-if="show('copy')" class="tb-btn" @click="doCopy" :data-tip="TIP.copy"><Icon name="Copy" :size="14" /></button>
        <button v-if="show('cut')" class="tb-btn" @click="doCut" :data-tip="TIP.cut"><Icon name="Cut" :size="14" /></button>
        <button v-if="show('paste')" class="tb-btn" @click="doPaste" :data-tip="TIP.paste"><Icon name="Paste" :size="14" /></button>
      </div>
      <div class="group" v-if="show('bold') || show('italic') || show('underline') || show('strike') || show('subscript') || show('superscript') || show('sceneBreak')">
        <button v-if="show('bold')" class="tb-btn" :class="{ active: isActive('bold') }" @click="run('toggleBold')" :data-tip="TIP.bold"><Icon name="Bold" :size="14" /></button>
        <button v-if="show('italic')" class="tb-btn" :class="{ active: isActive('italic') }" @click="run('toggleItalic')" :data-tip="TIP.italic"><Icon name="Italic" :size="14" /></button>
        <button v-if="show('underline')" class="tb-btn" :class="{ active: isActive('underline') }" @click="run('toggleUnderline')" :data-tip="TIP.underline"><Icon name="Underline" :size="14" /></button>
        <button v-if="show('strike')" class="tb-btn" :class="{ active: isActive('strike') }" @click="run('toggleStrike')" :data-tip="TIP.strike"><Icon name="Strike" :size="14" /></button>
        <button v-if="show('superscript')" class="tb-btn tb-glyph" :class="{ active: isActive('superscript') }" @click="run('toggleSuperscript')" :data-tip="TIP.superscript">x²</button>
        <button v-if="show('subscript')" class="tb-btn tb-glyph" :class="{ active: isActive('subscript') }" @click="run('toggleSubscript')" :data-tip="TIP.subscript">x₂</button>
        <button v-if="show('sceneBreak')" class="tb-btn" @click="run('setHorizontalRule')" data-tip="Scene break"><Icon name="SceneBreak" :size="14" /></button>
      </div>

      <div class="group" v-if="show('highlight') || show('textColor') || show('fontDec') || show('fontInc') || show('clearFormat')">
        <div v-if="show('highlight')" class="tb-highlight" ref="highlightWrap">
          <button class="tb-btn tb-btn-split" :class="{ active: isActive('highlight') || highlightOpen }" @click="toggleHighlightMenu" :data-tip="TIP.highlight">
            <Icon name="Highlight" :size="14" /><Icon name="ChevDown" :size="9" class="tb-caret" />
          </button>
          <div v-if="highlightOpen" class="tb-highlight-menu">
            <button v-for="c in HIGHLIGHT_COLORS" :key="c.color" type="button" class="tb-swatch" :style="{ background: c.color }" :title="c.label" @click="setHighlightColor(c.color)" />
            <button type="button" class="tb-swatch tb-swatch-none" title="Remove highlight" @click="clearHighlight"><Icon name="Close" :size="11" /></button>
          </div>
        </div>
        <div v-if="show('textColor')" class="tb-highlight" ref="textColorWrap">
          <button class="tb-btn tb-btn-split" :class="{ active: textColorOpen }" @click="toggleTextColorMenu" data-tip="Text color">
            <span class="tb-A" :style="textColorValue() ? { color: textColorValue() } : null">A</span><Icon name="ChevDown" :size="9" class="tb-caret" />
          </button>
          <div v-if="textColorOpen" class="tb-highlight-menu">
            <button v-for="c in TEXT_COLORS" :key="c" type="button" class="tb-swatch" :style="{ background: c }" :title="c" @click="setTextColor(c)" />
            <button type="button" class="tb-swatch tb-swatch-none" title="Default color" @click="clearTextColor"><Icon name="Close" :size="11" /></button>
          </div>
        </div>
        <button v-if="show('fontDec')" class="tb-btn tb-glyph" @click="bumpFont(-1)" data-tip="Decrease font size">A−</button>
        <button v-if="show('fontInc')" class="tb-btn tb-glyph" @click="bumpFont(1)" data-tip="Increase font size">A+</button>
        <button v-if="show('clearFormat')" class="tb-btn" @click="clearFormat" data-tip="Clear formatting"><Icon name="Eraser" :size="14" /></button>
      </div>

      <div class="group" v-if="show('quote') || show('list') || show('orderedList') || show('taskList') || show('align')">
        <button v-if="show('quote')" class="tb-btn" :class="{ active: isActive('blockquote') }" @click="run('toggleBlockquote')" :data-tip="TIP.quote"><Icon name="Quote" :size="14" /></button>
        <button v-if="show('list')" class="tb-btn" :class="{ active: isActive('bulletList') }" @click="run('toggleBulletList')" :data-tip="TIP.bullet"><Icon name="List" :size="14" /></button>
        <button v-if="show('orderedList')" class="tb-btn" :class="{ active: isActive('orderedList') }" @click="run('toggleOrderedList')" :data-tip="TIP.ordered"><Icon name="ListOrdered" :size="14" /></button>
        <button v-if="show('taskList')" class="tb-btn" :class="{ active: isActive('taskList') }" @click="run('toggleTaskList')" :data-tip="TIP.task"><Icon name="CheckSquare" :size="14" /></button>
        <button v-if="show('align')" class="tb-btn" :class="{ active: isActive({ textAlign: 'left' }) }" @click="setAlign('left')" :data-tip="TIP.alignLeft"><Icon name="AlignLeft" :size="14" /></button>
        <button v-if="show('align')" class="tb-btn" :class="{ active: isActive({ textAlign: 'center' }) }" @click="setAlign('center')" :data-tip="TIP.alignCenter"><Icon name="AlignCenter" :size="14" /></button>
        <button v-if="show('align')" class="tb-btn" :class="{ active: isActive({ textAlign: 'right' }) }" @click="setAlign('right')" :data-tip="TIP.alignRight"><Icon name="AlignRight" :size="14" /></button>
        <button v-if="show('align')" class="tb-btn" :class="{ active: isActive({ textAlign: 'justify' }) }" @click="setAlign('justify')" :data-tip="TIP.justify"><Icon name="AlignJustify" :size="14" /></button>
      </div>

      <div class="group" v-if="show('h1') || show('h2') || show('h3')">
        <button v-if="show('h1')" class="tb-btn tb-glyph" :class="{ active: isActive('heading', { level: 1 }) }" @click="setHeading(1)" :data-tip="TIP.h1">H1</button>
        <button v-if="show('h2')" class="tb-btn tb-glyph" :class="{ active: isActive('heading', { level: 2 }) }" @click="setHeading(2)" :data-tip="TIP.h2">H2</button>
        <button v-if="show('h3')" class="tb-btn tb-glyph" :class="{ active: isActive('heading', { level: 3 }) }" @click="setHeading(3)" :data-tip="TIP.h3">H3</button>
      </div>

      <div class="group" v-if="show('link') || show('image') || show('table')">
        <button v-if="show('link')" class="tb-btn" :class="{ active: isActive('link') }" @click="setLink" :data-tip="TIP.link"><Icon name="Link" :size="14" /></button>
        <button v-if="show('image')" class="tb-btn" @click="pickImage" data-tip="Insert image"><Icon name="Image" :size="14" /></button>
        <button v-if="show('table')" class="tb-btn" @click="insertTable" data-tip="Insert table"><Icon name="Table" :size="14" /></button>
      </div>

      <div class="group" v-if="show('comment')">
        <button class="tb-btn" :class="{ active: isActive('comment') }" :disabled="editor.state.selection.empty" @click="openCommentEditor" data-tip="Add comment"><Icon name="Comment" :size="14" /></button>
        <button class="tb-btn" @click="gotoComment(-1)" data-tip="Previous comment"><Icon name="ChevRight" :size="13" style="transform:rotate(180deg)" /></button>
        <button class="tb-btn" @click="gotoComment(1)" data-tip="Next comment"><Icon name="ChevRight" :size="13" /></button>
      </div>

      <div class="group" v-if="show('find') || show('focus') || show('settings') || show('print')">
        <button v-if="show('find')" class="tb-btn" :class="{ active: findOpen }" @click="toggleFind" :data-tip="TIP.find"><Icon name="Search" :size="14" /></button>
        <button v-if="show('focus')" class="tb-btn" :class="{ active: focusMode }" @click="toggleFocus" data-tip="Focus mode"><Icon name="Focus" :size="14" /></button>
        <button v-if="show('settings')" class="tb-btn" @click="settingsOpen = true" data-tip="Writing settings"><Icon name="Settings" :size="14" /></button>
        <button v-if="show('print')" class="tb-btn" @click="doPrint" data-tip="Print"><Icon name="Print" :size="14" /></button>
      </div>

      <div style="flex:1" />
      <slot name="toolbar-end" :editor="editor" />
    </div>

    <!-- Find & replace bar -->
    <div v-if="editor && findOpen" class="find-bar">
      <input ref="findInput" v-model="findTerm" class="find-input" type="text" placeholder="Find"
        @keydown.enter.prevent="findNext" @keydown.shift.enter.prevent="findPrev" />
      <span class="find-count">{{ searchInfo.count ? `${searchInfo.current}/${searchInfo.count}` : "0/0" }}</span>
      <button class="tb-btn" @click="findPrev" data-tip="Previous"><Icon name="ArrowUp" :size="14" /></button>
      <button class="tb-btn" @click="findNext" data-tip="Next"><Icon name="ArrowDown" :size="14" /></button>
      <label class="find-case" title="Match case">
        <input type="checkbox" v-model="caseSensitive" /> Aa
      </label>
      <input v-model="replaceTerm" class="find-input" type="text" placeholder="Replace with" />
      <button class="tb-btn tb-text" @click="doReplace">Replace</button>
      <button class="tb-btn tb-text" @click="doReplaceAll">All</button>
      <button class="tb-btn" @click="closeFind" data-tip="Close"><Icon name="Close" :size="14" /></button>
    </div>

    <!-- Focus-mode floating controls -->
    <div v-if="editor && focusMode" class="focus-controls">
      <button class="tb-btn tb-text" :class="{ active: typewriter }" @click="toggleTypewriter"
        title="Typewriter scrolling — keep the current line centered">Typewriter</button>
      <button class="tb-btn" @click="toggleFocus" title="Exit focus mode (Esc)"><Icon name="Close" :size="14" /></button>
    </div>

    <!-- Selection bubble menu (manuscript only) -->
    <bubble-menu v-if="editor && useBubble" :editor="editor" :tippy-options="{ duration: 100 }" class="bubble-menu">
      <button class="tb-btn" :class="{ active: isActive('bold') }" @click="run('toggleBold')" :data-tip="TIP.bold"><Icon name="Bold" :size="14" /></button>
      <button class="tb-btn" :class="{ active: isActive('italic') }" @click="run('toggleItalic')" :data-tip="TIP.italic"><Icon name="Italic" :size="14" /></button>
      <button class="tb-btn" :class="{ active: isActive('underline') }" @click="run('toggleUnderline')" :data-tip="TIP.underline"><Icon name="Underline" :size="14" /></button>
      <div class="tb-highlight" ref="highlightWrapBubble">
        <button class="tb-btn tb-btn-split" :class="{ active: isActive('highlight') || highlightBubbleOpen }" @click="toggleHighlightBubble" :data-tip="TIP.highlight">
          <Icon name="Highlight" :size="14" /><Icon name="ChevDown" :size="9" class="tb-caret" />
        </button>
        <div v-if="highlightBubbleOpen" class="tb-highlight-menu">
          <button v-for="c in HIGHLIGHT_COLORS" :key="c.color" type="button" class="tb-swatch" :style="{ background: c.color }" :title="c.label" @click="setHighlightColor(c.color)" />
          <button type="button" class="tb-swatch tb-swatch-none" title="Remove highlight" @click="clearHighlight"><Icon name="Close" :size="11" /></button>
        </div>
      </div>
      <div class="tb-highlight" ref="textColorWrapBubble">
        <button class="tb-btn tb-btn-split" :class="{ active: textColorBubbleOpen }" @click="toggleTextColorBubble" data-tip="Text color">
          <span class="tb-A" :style="textColorValue() ? { color: textColorValue() } : null">A</span><Icon name="ChevDown" :size="9" class="tb-caret" />
        </button>
        <div v-if="textColorBubbleOpen" class="tb-highlight-menu">
          <button v-for="c in TEXT_COLORS" :key="c" type="button" class="tb-swatch" :style="{ background: c }" :title="c" @click="setTextColor(c)" />
          <button type="button" class="tb-swatch tb-swatch-none" title="Default color" @click="clearTextColor"><Icon name="Close" :size="11" /></button>
        </div>
      </div>
      <button class="tb-btn tb-glyph" @click="bumpFont(-1)" data-tip="Decrease font size">A−</button>
      <button class="tb-btn tb-glyph" @click="bumpFont(1)" data-tip="Increase font size">A+</button>
      <button class="tb-btn" :class="{ active: isActive('link') }" @click="setLink" :data-tip="TIP.link"><Icon name="Link" :size="14" /></button>
      <button class="tb-btn" :class="{ active: isActive('comment') }" @click="openCommentEditor" data-tip="Add comment"><Icon name="Comment" :size="14" /></button>
    </bubble-menu>

    <div v-if="variant === 'manuscript'" class="manuscript scrollarea" ref="manuscriptEl">
      <div class="manuscript-inner" @click="onBodyClick">
        <editor-content :editor="editor" />
      </div>
    </div>
    <div v-else class="inline-editor-body" @click="onBodyClick" :style="inlineBodyStyle">
      <editor-content :editor="editor" />
    </div>

    <div v-if="showWordCount && editor && !focusMode" class="editor-footer">
      <span>{{ wordCount.toLocaleString() }} words</span>
      <span>{{ charCount.toLocaleString() }} chars</span>
    </div>

    <input ref="fileInput" type="file" accept="image/*" style="display:none" @change="onImagePicked" />

    <EditorSettingsModal v-if="settingsOpen" @close="settingsOpen = false" />

    <div v-if="commentState.open" ref="commentPopEl" class="comment-pop"
      :style="{ left: `${commentState.x}px`, top: `${commentState.y}px` }" @keydown="onCommentKeydown">
      <template v-if="commentState.mode === 'edit'">
        <textarea ref="commentInput" v-model="commentState.text" class="comment-pop-input" rows="3" placeholder="Add a comment…" />
        <div class="comment-pop-actions">
          <button class="btn ghost sm" @click="closeComment">Cancel</button>
          <button class="btn primary sm" @click="saveComment">Save</button>
        </div>
      </template>
      <template v-else>
        <div class="comment-pop-text">{{ commentState.text }}</div>
        <div class="comment-pop-actions">
          <button class="btn ghost sm" @click="deleteComment">Delete</button>
          <button class="btn ghost sm" @click="editComment">Edit</button>
          <button class="btn primary sm" @click="closeComment">Close</button>
        </div>
      </template>
    </div>
  </div>
</template>

<style>
/* Shared editor content styles — apply to both variants. */
.rich-editor {
  display: flex; flex-direction: column;
  min-height: 0;
}
.rich-editor--manuscript { flex: 1; }
.rich-editor--inline { flex: 0 0 auto; }

/* Editor prose fills the full width of its container. The centered
   reading measure (max-width) is reserved for read-only views, so we
   override the shared .manuscript-inner cap only inside the editor, and
   tighten the side padding so prose sits closer to the edges. */
.rich-editor--manuscript .manuscript-inner { max-width: none; margin: 0; padding: 40px 28px 120px; }
/* Plain white writing surface for the scene editor (the cream "paper"
   gradient stays on read-only views, which keep the shared .manuscript). */
.rich-editor--manuscript .manuscript { background: var(--surface); }

.tiptap-content { outline: none; min-height: 80px; }
.tiptap-content p.is-editor-empty:first-child::before {
  content: attr(data-placeholder);
  color: var(--muted);
  pointer-events: none;
  float: left; height: 0;
}
.tiptap-content blockquote {
  border-left: 3px solid var(--accent);
  padding-left: 16px;
  margin: 12px 0;
  color: var(--ink-2);
}
.tiptap-content ul, .tiptap-content ol { padding-left: 20px; }
.tiptap-content mark {
  background: color-mix(in oklch, var(--accent) 35%, transparent);
  color: #1f2430;
  border-radius: 2px; padding: 0 1px;
}

/* Comment-marked text — reads as a subtle comment annotation, distinct
   from a (filled) highlight: a dotted accent underline plus a tiny
   speech-bubble marker. No persistent fill, so it can't be mistaken for a
   highlight. The note itself only shows in the popover when clicked. */
.tiptap-content .comment-mark {
  background: color-mix(in oklch, var(--accent) 18%, transparent);
  border-bottom: 2px solid color-mix(in oklch, var(--accent) 70%, transparent);
  cursor: pointer;
}
.tiptap-content .comment-mark:hover { background: color-mix(in oklch, var(--accent) 32%, transparent); }
/* Small speech-bubble icon — the cue that distinguishes a comment from a
   plain highlight. Drawn via an SVG mask so it's tinted by `background`. */
.tiptap-content .comment-mark::after {
  content: "";
  display: inline-block;
  width: 13px; height: 13px;
  margin-left: 3px;
  vertical-align: middle;
  background: var(--accent);
  opacity: .9;
  -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M20 2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4v4l5-4h7a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2Z'/%3E%3C/svg%3E") center / contain no-repeat;
  mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M20 2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4v4l5-4h7a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2Z'/%3E%3C/svg%3E") center / contain no-repeat;
}

/* Comment popover — fixed-position so it escapes editor overflow. */
.comment-pop {
  position: fixed; z-index: 200;
  width: 260px; max-width: 80vw;
  background: var(--surface);
  border: 1px solid var(--border-strong);
  border-radius: 10px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, .22);
  padding: 10px;
  display: flex; flex-direction: column; gap: 8px;
}
.comment-pop-input {
  width: 100%; resize: vertical; min-height: 56px;
  border: 1px solid var(--border); border-radius: 7px;
  padding: 7px 9px; font: inherit; font-size: 13px;
  background: var(--surface); color: var(--ink); outline: none;
}
.comment-pop-input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
.comment-pop-text { font-size: 13px; line-height: 1.5; color: var(--ink); white-space: pre-wrap; word-break: break-word; }
.comment-pop-actions { display: flex; justify-content: flex-end; gap: 6px; }
.tiptap-content a { color: var(--accent); text-decoration: underline; cursor: pointer; }
.tiptap-content img { max-width: 100%; height: auto; border-radius: 6px; margin: 8px 0; }

/* Scene break — horizontal rule rendered as a centred ornament. */
.tiptap-content hr {
  border: none; height: 1.5em; margin: 22px 0; position: relative;
}
.tiptap-content hr::after {
  content: "⁂"; position: absolute; inset: 0;
  display: flex; align-items: center; justify-content: center;
  color: var(--muted); letter-spacing: 4px;
}

/* Tables */
.tiptap-content table {
  border-collapse: collapse; width: 100%; margin: 14px 0; overflow: hidden;
}
.tiptap-content th, .tiptap-content td {
  border: 1px solid var(--border); padding: 6px 9px; vertical-align: top;
}
.tiptap-content th { background: var(--surface-2); font-weight: 600; text-align: left; }

/* Task lists */
.tiptap-content ul[data-type="taskList"] { list-style: none; padding-left: 4px; }
.tiptap-content ul[data-type="taskList"] li { display: flex; gap: 8px; align-items: flex-start; }
.tiptap-content ul[data-type="taskList"] li > label { margin-top: 3px; user-select: none; }
.tiptap-content ul[data-type="taskList"] li > div { flex: 1; }

/* Find/replace match highlights */
.search-match { background: color-mix(in oklch, var(--accent) 22%, transparent); border-radius: 2px; }
.search-match--current { background: var(--accent); color: #fff; }

/* @-mention chips */
.mention {
  border-radius: 5px; padding: 0 5px; font-weight: 500; cursor: pointer;
  background: var(--surface-2); color: var(--ink); white-space: nowrap;
  border: 1px solid var(--border);
}
.mention:hover { filter: brightness(0.96); }
.mention[data-kind="character"] { background: color-mix(in oklch, #6aa9ff 22%, transparent); border-color: color-mix(in oklch, #6aa9ff 45%, transparent); }
.mention[data-kind="location"]  { background: color-mix(in oklch, #57c08a 22%, transparent); border-color: color-mix(in oklch, #57c08a 45%, transparent); }
.mention[data-kind="object"]    { background: color-mix(in oklch, #d9a441 22%, transparent); border-color: color-mix(in oklch, #d9a441 45%, transparent); }
.mention[data-kind="group"]     { background: color-mix(in oklch, #b083e0 22%, transparent); border-color: color-mix(in oklch, #b083e0 45%, transparent); }

/* @-mention suggestion popup (appended to <body>) */
.mention-popup { position: fixed; z-index: 1000; }
.mention-list {
  background: var(--surface); border: 1px solid var(--border); border-radius: 9px;
  box-shadow: 0 8px 28px rgba(0,0,0,.18); min-width: 220px; max-width: 280px;
  max-height: 264px; overflow: auto; padding: 4px;
}
.mention-item {
  display: flex; align-items: center; gap: 9px; width: 100%;
  padding: 6px 9px; border: 0; background: none; border-radius: 6px;
  cursor: pointer; text-align: left;
}
.mention-item.active { background: var(--surface-2); }
.mention-item-dot { width: 8px; height: 8px; border-radius: 50%; flex: none; background: var(--muted); }
.mention-item-dot[data-kind="character"] { background: #6aa9ff; }
.mention-item-dot[data-kind="location"]  { background: #57c08a; }
.mention-item-dot[data-kind="object"]    { background: #d9a441; }
.mention-item-dot[data-kind="group"]     { background: #b083e0; }
.mention-item-label { flex: 1; color: var(--ink); font-size: 13px; }
.mention-item-type { font-size: 11px; color: var(--muted); text-transform: capitalize; }
.mention-empty { padding: 9px; color: var(--muted); font-size: 13px; }

/* Focus mode — fullscreen, distraction-free. Fixed overlay covers the
   app chrome (sidebar/titlebar); active block stays lit, rest dims. */
.rich-editor.focus-on {
  position: fixed; inset: 0; z-index: 150;
  background: var(--paper);
}
.rich-editor.focus-on .tiptap-content > * { opacity: .32; transition: opacity .2s ease; }
.rich-editor.focus-on .tiptap-content .has-focus { opacity: 1; }
/* Typewriter scrolling — pad so any line (incl. first/last) can centre. */
.rich-editor.focus-on.typewriter-on .manuscript-inner { padding-top: 45vh; padding-bottom: 45vh; }

/* Focus-mode floating controls (top-right, subtle until hovered). */
.focus-controls {
  position: fixed; top: 14px; right: 18px; z-index: 160;
  display: flex; gap: 6px; align-items: center;
  padding: 4px; border-radius: 8px;
  background: var(--surface); border: 1px solid var(--border);
  box-shadow: 0 6px 20px rgba(0, 0, 0, .14);
  opacity: .35; transition: opacity .2s ease;
}
.focus-controls:hover { opacity: 1; }

/* Selection bubble menu */
.bubble-menu {
  display: flex; gap: 2px; padding: 4px;
  background: var(--surface); border: 1px solid var(--border);
  border-radius: 8px; box-shadow: 0 6px 20px rgba(0,0,0,.16);
}

/* Find & replace bar */
.find-bar {
  display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
  padding: 6px 10px; border-bottom: 1px solid var(--border);
  background: var(--surface-2);
}
.find-input {
  height: 26px; padding: 0 8px; font-size: 13px;
  border: 1px solid var(--border); border-radius: 6px;
  background: var(--surface); color: var(--ink); min-width: 140px;
}
.find-input:focus { outline: none; border-color: var(--accent); }
.find-count { font-size: 12px; color: var(--muted); min-width: 42px; text-align: center; }
.find-case { display: flex; align-items: center; gap: 3px; font-size: 12px; color: var(--muted); cursor: pointer; }
.tb-btn.tb-text { width: auto; padding: 0 8px; font-size: 12px; }

/* Word-count footer */
.editor-footer {
  display: flex; justify-content: flex-end; gap: 14px;
  padding: 5px 16px; font-size: 12px; color: var(--muted);
  border-top: 1px solid var(--border);
}

/* Inline variant — used inside cards, alongside other fields. */
.rich-editor--inline .editor-toolbar {
  padding: 4px 6px;
  border: 1px solid var(--border);
  border-radius: 7px 7px 0 0;
  border-bottom: 0;
  background: var(--surface-2);
  flex-wrap: wrap;
}
/* Find bar sits between the inline toolbar and body — match their side
   borders so it doesn't jut out. */
.rich-editor--inline .find-bar {
  border-left: 1px solid var(--border);
  border-right: 1px solid var(--border);
}
.rich-editor--inline .inline-editor-body {
  padding: 12px 14px;
  font-family: var(--editor-font, var(--font-serif));
  font-size: var(--editor-font-size, 15px);
  line-height: var(--editor-line-height, 1.65);
  color: var(--ink);
  border: 1px solid var(--border);
  border-radius: 0 0 7px 7px;
  background: var(--surface);
}
.rich-editor--inline .tiptap-content p { text-indent: var(--editor-para-indent, 0); }
.rich-editor--inline .tiptap-content p:first-of-type { text-indent: 0; }
.rich-editor--inline .tiptap-content p + p { margin-top: var(--editor-para-spacing, 0); }
.rich-editor--inline:focus-within .inline-editor-body,
.rich-editor--inline:focus-within .editor-toolbar {
  border-color: var(--accent);
}

/* Fill mode — editor flexes to fill its (definite-height) flex parent and
   scrolls internally, so callers can cap it to a share of the card via
   flex weights. */
.rich-editor--inline.rich-editor--fill { flex: 1 1 0; min-height: 0; }
.rich-editor--inline.rich-editor--fill .inline-editor-body {
  flex: 1 1 0; min-height: 0; overflow-y: auto;
}
</style>