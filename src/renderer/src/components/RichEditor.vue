<script setup>
import { ref, computed, watch, nextTick, onBeforeUnmount } from "vue";
import { useEditor, EditorContent, VueNodeViewRenderer } from "@tiptap/vue-3";
import { BubbleMenu } from "@tiptap/vue-3/menus";
import SceneBoundaryView from "./SceneBoundaryView.vue";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import { TextStyle, Color } from "@tiptap/extension-text-style";
import { Extension, Mark, Node, mergeAttributes } from "@tiptap/core";
import { DOMSerializer } from "@tiptap/pm/model";
import { AllSelection, TextSelection } from "@tiptap/pm/state";
import Link from "@tiptap/extension-link";
import Highlight from "@tiptap/extension-highlight";
import TextAlign from "@tiptap/extension-text-align";
import Typography from "@tiptap/extension-typography";
import CharacterCount from "@tiptap/extension-character-count";
import Focus from "@tiptap/extension-focus";
import Image from "@tiptap/extension-image";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { Table, TableRow, TableHeader, TableCell } from "@tiptap/extension-table";
import { useRouter } from "vue-router";
import { SearchReplace, searchReplacePluginKey } from "@renderer/services/searchReplace";
import { buildMentionExtension } from "@renderer/services/editorMentions";
import { EDITOR_TOOLBAR_FULL } from "@renderer/services/editorToolbars";
import { saveImage, urlFor } from "@renderer/services/imageStore";
import { AiDiff, hasPendingChanges, hasStrikethroughs, listPendingChanges } from "@renderer/services/aiDiff";
import { Marker, MARKER_CATEGORIES, categoryById } from "@renderer/services/markers";
import * as writerAI from "@renderer/services/writerAI";
import VariationsModal from "./VariationsModal.vue";
import { PROSE_RULES, PROSE_RULE_ORDER } from "@renderer/services/writerAI";
import { useAiTasksStore, Icon, UiButton, AiTaskStrip } from "@delebash/llm-ui";
import { useUiStore } from "../stores/ui.js";
import { DEFAULT_EDITOR_SETTINGS } from "../services/editorSettings.js";
import EditorSettingsModal from "./EditorSettingsModal.vue";

const props = defineProps({
  modelValue: { type: String, default: "" },
  placeholder: { type: String, default: "Start writing…" },
  autofocus: { type: Boolean, default: false },
  // Running head (book title) + folio (chapter label) shown only in the
  // "page" editor layout (Settings → Appearance); ignored when full-width.
  runningHead: { type: String, default: "" },
  folioLabel: { type: String, default: "" },
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

// Decide whether the bubble menu should render for a given selection.
// Default behaviour (mirroring TipTap's): show when there's a non-empty
// text selection. We add a guard against atom-node selections (the
// scene-boundary NodeView, the page-break node) so clicking the
// boundary's title input doesn't immediately summon a Bold/Italic
// floating menu over an element that has no text formatting to apply.
function bubbleShouldShow({ state }) {
  if (!state) return false;
  const { selection } = state;
  if (!selection) return false;
  // NodeSelection on an atom (boundary, page break) — never show.
  if (selection.node?.type?.spec?.atom) return false;
  return !selection.empty;
}

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

// Word-faithful Tab. Adds an `indent` attribute (integer level) to
// paragraph nodes that renders as inline `text-indent: N*1.6em` and
// round-trips through saved HTML. Tab/Shift-Tab nudge the level up/down
// on the current paragraph (or sink/lift on list items). Inline style
// overrides the .manuscript-inner auto-indent rule via specificity, so
// the writer's explicit Tab always wins over the automatic baseline.
const Indent = Extension.create({
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
const PageBreak = Node.create({
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
const SceneBoundary = Node.create({
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
  addNodeView() {
    return VueNodeViewRenderer(SceneBoundaryView);
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
  AiDiff,
  Marker,
  Indent,
  PageBreak,
  SceneBoundary,
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
  onCreate({ editor }) { syncCounts(editor); syncDiffState(editor); editor.view.dom.spellcheck = ui.editorSettings.spellCheck; },
  onUpdate({ editor }) {
    const html = editor.getHTML();
    emit("update:modelValue", html);
    emit("change", html);
    syncCounts(editor);
    syncDiffState(editor);
    maybeTypewriter();
  },
  onSelectionUpdate({ editor }) {
    syncDiffState(editor);
    maybeTypewriter();
    hasSelection.value = !editor.state.selection.empty;
  },
  onTransaction({ editor }) { syncSearch(editor); docVersion.value++; },
});

// Bumps on every editor transaction (typing, formatting, scene-boundary
// insert, etc.). Computeds that need to walk the document for content-
// dependent state (`hasComments` below — could grow to more later)
// touch this ref so Vue knows to recompute when the doc changes.
const docVersion = ref(0);

// True when the document contains at least one comment mark. Drives the
// disabled state of the Prev/Next comment toolbar buttons so they don't
// dead-click in a comment-less document.
const hasComments = computed(() => {
  docVersion.value; // touch — trigger recompute on every transaction
  if (!editor.value) return false;
  let found = false;
  editor.value.state.doc.descendants((node) => {
    if (found) return false;
    if (node.marks?.some((m) => m.type.name === "comment")) found = true;
  });
  return found;
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

// --- AI assist (writerAI + aiDiff marks) ------------------------------
// Selection-driven actions live in the scene strip's AI dropdown
// (Rewrite / Expand / Tighten / Continue + Line edits). Each call
// replaces the selection with a paired <del>/<ins> diff that the
// user accepts or rejects.
const aiTasks = useAiTasksStore();
const myTask = computed(() => aiTasks.runningTasks.find((t) => t.feature === "writerAI"));
const aiRunning = computed(() => !!myTask.value);
function isAiAbort(e) { return e?.name === "AbortError" || /abort/i.test(e?.message || ""); }
const aiError = ref("");
const proseMenuOpen = ref(false);
const proseMenuWrap = ref(null);
const PROSE_RULES_LIST = PROSE_RULE_ORDER.map((k) => ({ key: k, ...PROSE_RULES[k] }));

// Reactive "is there a non-empty selection right now?" — the scene-strip
// AI dropdown reads this through defineExpose to grey out actions that
// need a selection (Rewrite/Expand/Tighten). Updated from
// onSelectionUpdate below since TipTap's selection state isn't directly
// observable by Vue's reactivity.
const hasSelection = ref(false);

// Three-alternative streaming. When set, the VariationsModal opens
// with the runnerFactory and applies the chosen result via the
// captured mode + target range. Cleared when the modal closes.
// Shape: { runnerFactory, mode, from, to, originalHtml, label, eyebrow }
//   - mode 'replace':       proposeReplacement at (from, to)
//   - mode 'continue-at':   proposeContinuation at `from`
const variationsFlow = ref(null);

// Helper invoked from each writer-action entry point. Captures the
// LLM-call shape and the target range, then opens the modal. The
// modal runs the runner three times concurrently; on Use this we
// apply the chosen result via the editor's existing diff machinery.
function startVariations({ runnerFactory, mode, from, to, originalHtml, label, eyebrow }) {
  variationsFlow.value = { runnerFactory, mode, from, to, originalHtml, label, eyebrow };
}
function onVariationChosen(result) {
  const flow = variationsFlow.value;
  variationsFlow.value = null;
  if (!flow || !editor.value || !result?.html?.trim()) return;
  if (flow.mode === "replace") {
    editor.value.chain().focus().proposeReplacement({
      from: flow.from, to: flow.to,
      originalHtml: flow.originalHtml,
      newHtml: result.html,
    }).run();
  } else if (flow.mode === "continue-at") {
    editor.value.chain().focus().proposeContinuation({
      at: flow.from, newHtml: result.html,
    }).run();
  }
}
function onVariationsClose() {
  variationsFlow.value = null;
}
// Per-call resolution of variations mode — caller may force it via
// shiftKey (passed through callAi handlers), otherwise the ui store's
// global toggle decides. Returns true when the modal should be used.
function shouldUseVariations(callerShift) {
  return !!callerShift || !!ui.showVariations;
}

// Pending-changes state — drives the "N changes" header bar and the
// inline accept/reject overlay. Recomputed on every doc/selection update.
const pendingCount = ref(0);
const currentChangeId = ref(null);
// Any AI strikethrough at all (pending or resolved) — enables the scene
// strip's "Clear all strikethroughs" item (#42).
const strikeCount = ref(0);

function syncDiffState(ed) {
  const list = listPendingChanges(ed);
  pendingCount.value = list.length;
  strikeCount.value = hasStrikethroughs(ed) ? 1 : 0;
  // If the cursor is inside an aiIns or aiDel mark, surface its
  // changeId so the inline overlay can show Accept / Reject buttons
  // for just that change. Resolved (kept) strikethroughs are history —
  // the cursor inside one must NOT offer Accept/Reject.
  const marks = ed.state.selection.$from.marks?.() || [];
  const aiMark = marks.find((m) => (m.type.name === "aiIns" || m.type.name === "aiDel") && !m.attrs.resolved);
  currentChangeId.value = aiMark?.attrs?.changeId || null;
}

function readSelectionHtml() {
  if (!editor.value) return { from: 0, to: 0, html: "" };
  const { from, to } = editor.value.state.selection;
  if (from === to) return { from, to, html: "" };
  const slice = editor.value.state.doc.cut(from, to);
  const dom = DOMSerializer.fromSchema(editor.value.schema).serializeFragment(slice.content);
  const div = document.createElement("div");
  div.appendChild(dom);
  return { from, to, html: div.innerHTML };
}

// Whole-document range + serialized HTML. Used as a fallback by actions
// that can operate on the entire scene when nothing is selected (Tighten,
// every line edit). Returns html === "" when the doc is empty so
// callers can early-out with a friendly error.
function readWholeDocHtml() {
  if (!editor.value) return { from: 0, to: 0, html: "" };
  const doc = editor.value.state.doc;
  const to = doc.content.size;
  const slice = doc.cut(0, to);
  const dom = DOMSerializer.fromSchema(editor.value.schema).serializeFragment(slice.content);
  const div = document.createElement("div");
  div.appendChild(dom);
  const html = div.innerHTML;
  return { from: 0, to, html: (div.textContent || "").trim() ? html : "" };
}

const ACTION_LABELS = {
  rewrite: "Rewriting selection…",
  expand: "Expanding selection…",
  tighten: { selection: "Tightening selection…", scene: "Tightening scene…" },
  continue: "Continuing from cursor…",
  describe: "Describing selection…",
};

// Actions that can fall back to the whole document when nothing is
// selected. Rewrite/Expand stay selection-only because applying them to
// a full scene is destructive at a scale users typically want to think
// about (run it in the Tasks tab's Lab, compare passes) rather than fire from a
// one-click menu.
const ACTIONS_WHOLE_SCENE_FALLBACK = new Set(["tighten"]);

async function runWriterAction(actionKey, opts = {}) {
  if (!editor.value || aiRunning.value) return;
  proseMenuOpen.value = false;
  const useVariations = shouldUseVariations(opts.shiftKey);
  let { from, to, html } = readSelectionHtml();
  let scope = from === to ? "scene" : "selection";
  // Describe — additive: takes the selection as the subject and inserts
  // fresh sensory prose ABOUT it right after the selection. Different
  // shape from rewrite/expand (which transform the selection) — closer
  // to "continue", but anchored at the selection end rather than the
  // cursor, so the original passage is preserved verbatim.
  if (actionKey === "describe") {
    if (from === to) { aiError.value = "Highlight the subject to describe (a place, person, object, or moment)."; return; }
    if (useVariations) {
      startVariations({
        runnerFactory: (temperature, signal, onDelta, taskMeta) => writerAI.describe({
          html, signal, onDelta, temperature,
          task: { label: "Writer assist · Describe", meta: { ...(taskMeta || {}), action: "describe" } },
        }),
        mode: "continue-at", from: to, to,
        originalHtml: "",
        eyebrow: "Describe — three variations",
        label: "Pick a description to insert",
      });
      return;
    }
    aiError.value = "";
    try {
      const result = await writerAI.describe({ html });
      if (!result?.html?.trim()) {
        aiError.value = "AI returned an empty response. Try again — and verify the model is running and isn't returning only thinking tags.";
      } else {
        editor.value.chain().focus().proposeContinuation({ at: to, newHtml: result.html }).run();
      }
    } catch (err) {
      if (!isAiAbort(err)) aiError.value = err?.message || String(err);
    }
    return;
  }
  // For "continue" with no selection, anchor at the cursor and feed the
  // last paragraph as context.
  if (actionKey === "continue" && from === to) {
    const ctx = grabContextBeforeCursor(800);
    if (!ctx.trim()) { aiError.value = "Place the cursor at the end of some prose to continue from."; return; }
    if (useVariations) {
      startVariations({
        runnerFactory: (temperature, signal, onDelta, taskMeta) => writerAI.continueFrom({
          html: `<p>${ctx}</p>`, signal, onDelta, temperature,
          task: { label: "Writer assist · Continue", meta: { ...(taskMeta || {}), action: "continue" } },
        }),
        mode: "continue-at", from, to: from,
        originalHtml: "",
        eyebrow: "Continue — three variations",
        label: "Pick a continuation to insert",
      });
      return;
    }
    aiError.value = "";
    try {
      const result = await writerAI.continueFrom({ html: `<p>${ctx}</p>` });
      // Guard empty/whitespace-only responses — otherwise proposeContinuation
      // inserts nothing visible and the user sees the progress bar vanish
      // with no result and no error.
      if (!result?.html?.trim()) {
        aiError.value = "AI returned an empty response. Try again — and verify the model is running and isn't returning only thinking tags.";
      } else {
        editor.value.chain().focus().proposeContinuation({ at: from, newHtml: result.html }).run();
      }
    } catch (err) {
      if (!isAiAbort(err)) aiError.value = err?.message || String(err);
    }
    return;
  }
  if (from === to) {
    // No selection — fall back to the whole document if this action
    // supports it. Otherwise tell the user to make a selection.
    if (ACTIONS_WHOLE_SCENE_FALLBACK.has(actionKey)) {
      ({ from, to, html } = readWholeDocHtml());
      if (!html) { aiError.value = "Nothing to work with — the scene is empty."; return; }
    } else {
      aiError.value = "Select some text first.";
      return;
    }
  }
  if (useVariations) {
    const fnVariation = actionKey === "rewrite" ? writerAI.rewrite
                      : actionKey === "expand"  ? writerAI.expand
                      : actionKey === "tighten" ? writerAI.tighten
                      : writerAI.continueFrom;
    const labelMap = ACTION_LABELS[actionKey];
    const labelText = typeof labelMap === "object" ? (labelMap[scope] || labelMap.selection) : (labelMap || "Variations");
    startVariations({
      runnerFactory: (temperature, signal, onDelta, taskMeta) => fnVariation({
        html, signal, onDelta, temperature,
        task: { label: `Writer assist · ${labelText.replace(/[….]+$/, "")}`, meta: { ...(taskMeta || {}), action: actionKey } },
      }),
      mode: "replace", from, to, originalHtml: html,
      eyebrow: `${labelText.replace(/[….]+$/, "")} — three variations`,
      label: "Pick a variation to apply",
    });
    return;
  }
  aiError.value = "";
  try {
    const fn = actionKey === "rewrite" ? writerAI.rewrite
             : actionKey === "expand" ? writerAI.expand
             : actionKey === "tighten" ? writerAI.tighten
             : writerAI.continueFrom;
    const result = await fn({ html });
    // Guard empty/whitespace-only responses — proposeReplacement would
    // deleteRange()+insertContentAt("") and silently nuke the selection
    // without surfacing an error.
    if (!result?.html?.trim()) {
      aiError.value = "AI returned an empty response. Try again — and verify the model is running and isn't returning only thinking tags.";
    } else {
      editor.value.chain().focus().proposeReplacement({ from, to, originalHtml: html, newHtml: result.html }).run();
    }
  } catch (err) {
    if (!isAiAbort(err)) aiError.value = err?.message || String(err);
  }
}

async function runProsePass(ruleKey, opts = {}) {
  if (!editor.value || aiRunning.value) return;
  proseMenuOpen.value = false;
  const useVariations = shouldUseVariations(opts.shiftKey);
  let { from, to, html } = readSelectionHtml();
  let scope = from === to ? "scene" : "selection";
  // Line edits are surgical revisions; running them on the whole scene
  // is the primary use case, so no selection → operate on the whole doc.
  if (from === to) {
    ({ from, to, html } = readWholeDocHtml());
    if (!html) { aiError.value = "Nothing to work with — the scene is empty."; return; }
  }
  if (useVariations) {
    const ruleLabel = PROSE_RULES[ruleKey]?.label || ruleKey;
    startVariations({
      runnerFactory: (temperature, signal, onDelta, taskMeta) => writerAI.applyRule(ruleKey, {
        html, signal, onDelta, temperature,
        task: { label: `Writer assist · ${ruleLabel}`, meta: { ...(taskMeta || {}), rule: ruleKey } },
      }),
      mode: "replace", from, to, originalHtml: html,
      eyebrow: `${ruleLabel} — three variations (${scope})`,
      label: "Pick a line-edit pass to apply",
    });
    return;
  }
  aiError.value = "";
  try {
    const result = await writerAI.applyRule(ruleKey, { html });
    if (!result?.html?.trim()) {
      aiError.value = "AI returned an empty response. Try again — and verify the model is running and isn't returning only thinking tags.";
    } else {
      editor.value.chain().focus().proposeReplacement({ from, to, originalHtml: html, newHtml: result.html }).run();
    }
  } catch (err) {
    if (!isAiAbort(err)) aiError.value = err?.message || String(err);
  }
}

function grabContextBeforeCursor(limit = 800) {
  if (!editor.value) return "";
  const pos = editor.value.state.selection.from;
  const text = editor.value.state.doc.textBetween(Math.max(0, pos - limit), pos, "\n\n");
  return text;
}

// --- Right-click context menu (B5-5 #41; redesigned QC-41, user option 1) --
// The menu ALWAYS opens (the selection gate is gone — it made a bare
// right-click look broken), and items enable/disable by what they need, the
// AI-menu scope-law (ChaptersView's ai-strip grammar: scope group headers, a
// greyed item + "Highlight text first to enable" hint). Rows follow the
// user's Windows-11 reference: compact rows with a leading icon, a
// right-aligned shortcut hint, thin group separators — and the bottom
// passthrough row ("Show more options" grammar) keeps the BROWSER's own menu
// (spell-check suggestions) reachable: it arms a one-shot passthrough, so the
// next right-click is native. The header AI menu (scene strip) remains the
// full surface; this is the quick path.
const ctxMenu = ref({ open: false, x: 0, y: 0 });
const ctxMenuEl = ref(null);
const ctxNativeOnce = ref(false); // armed by the "Show browser menu" row

// Scope split mirrors the ai-strip sections: Rewrite/Expand/Describe are
// selection-only (a whole-scene rewrite is too transformative for one click);
// Tighten runs on the selection or the whole scene.
const CTX_AI_SELECTION = [
  { key: "rewrite",  label: "Rewrite" },
  { key: "expand",   label: "Expand" },
  { key: "describe", label: "Describe" },
];
const CTX_AI_ANY = [
  { key: "tighten",  label: "Tighten" },
];

function onEditorContextMenu(e) {
  if (props.variant !== "manuscript") return;
  if (ctxNativeOnce.value) { ctxNativeOnce.value = false; return; } // the browser menu, once
  e.preventDefault();
  ctxMenu.value = { open: true, x: e.clientX, y: e.clientY };
  // Clamp into the viewport once the menu has a size.
  nextTick(() => {
    const el = ctxMenuEl.value;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = Math.min(ctxMenu.value.x, window.innerWidth - r.width - 8);
    const y = Math.min(ctxMenu.value.y, window.innerHeight - r.height - 8);
    ctxMenu.value = { open: true, x: Math.max(8, x), y: Math.max(8, y) };
  });
}
function closeCtxMenu() { ctxMenu.value = { open: false, x: 0, y: 0 }; }
function ctxShowBrowserMenu() { ctxNativeOnce.value = true; closeCtxMenu(); }
function ctxRun(fn, ...args) { closeCtxMenu(); fn(...args); }
// Esc must close the menu wherever focus sits (the menu's own keydown only
// fires when focus is inside it) — document-level listener while open.
function onCtxDocKey(e) {
  if (e.key === "Escape" && ctxMenu.value.open) { closeCtxMenu(); e.stopPropagation(); }
}
watch(() => ctxMenu.value.open, (open) => {
  if (open) document.addEventListener("keydown", onCtxDocKey, true);
  else document.removeEventListener("keydown", onCtxDocKey, true);
});
onBeforeUnmount(() => document.removeEventListener("keydown", onCtxDocKey, true));

// #42: accept honors the editor setting — keep the original as a resolved
// strikethrough (track-changes history) or replace it outright.
const keepOnAccept = computed(() => {
  const v = ui.editorSettings?.keepStrikethroughOnAccept;
  return v === undefined ? DEFAULT_EDITOR_SETTINGS.keepStrikethroughOnAccept : !!v;
});

function acceptCurrentChange() {
  if (!currentChangeId.value || !editor.value) return;
  editor.value.chain().focus().acceptChange(currentChangeId.value, { keepOriginal: keepOnAccept.value }).run();
}
function rejectCurrentChange() {
  if (!currentChangeId.value || !editor.value) return;
  editor.value.chain().focus().rejectChange(currentChangeId.value).run();
}
function acceptAllAiChanges() { editor.value?.chain().focus().acceptAllChanges({ keepOriginal: keepOnAccept.value }).run(); }
function clearAllStrikethroughs() { editor.value?.chain().focus().clearAllStrikethroughs().run(); }
function rejectAllAiChanges() { editor.value?.chain().focus().rejectAllChanges().run(); }

// ◀ Prev / Next ▶ navigation between pending AI changes. Steps through
// the list in document order; jumps the cursor to the first text of
// the targeted change. When no change is currently focused, lands on
// the first one (Next) or the last one (Prev).
function stepChange(dir) {
  if (!editor.value) return;
  const list = listPendingChanges(editor.value);
  if (!list.length) return;
  let idx = currentChangeId.value
    ? list.findIndex((c) => c.changeId === currentChangeId.value)
    : (dir > 0 ? -1 : list.length);
  idx = (idx + dir + list.length) % list.length;
  const target = list[idx];
  if (!target) return;
  // Move the cursor onto the change's text run so syncDiffState() picks
  // up the changeId and the per-change Accept/Reject buttons show.
  editor.value.chain().focus().setTextSelection({ from: target.pos, to: target.pos }).run();
  // Best-effort scroll into view — TipTap moves the cursor, but a
  // long doc may need an explicit scroll.
  const dom = editor.value.view.domAtPos(target.pos)?.node;
  const el = dom?.nodeType === 1 ? dom : dom?.parentElement;
  el?.scrollIntoView?.({ behavior: "smooth", block: "center" });
}
function prevChange() { stepChange(-1); }
function nextChange() { stepChange(1); }
function toggleProseMenu() { proseMenuOpen.value = !proseMenuOpen.value; }

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
  newScene: `New scene — splits chapter here · ${sc("mod+shift+Enter")}`,
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
const highlightOpen = ref(false);
const highlightWrap = ref(null);
function toggleHighlightMenu() { highlightOpen.value = !highlightOpen.value; }
function setHighlightColor(color) {
  editor.value?.chain().focus().setHighlight({ color }).run();
  highlightOpen.value = false;
}
function clearHighlight() {
  editor.value?.chain().focus().unsetHighlight().run();
  highlightOpen.value = false;
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
    if (sel?.rangeCount) {
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
  highlightOpen.value = textColorOpen.value = textColorBubbleOpen.value = false;
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

// --- markers (drop-a-pin notes) ---------------------------------------
// One floating popover for setting a marker: pick a category (Fix/Verify/…)
// + optional one-line label, click Drop. Operates on the current selection
// (or — convenience — the word at the cursor if no selection).
const MARKER_CATEGORIES_LIST = MARKER_CATEGORIES;
const markerState = ref({ open: false, mode: "create", category: "fix", label: "", markerId: null, x: 0, y: 0 });
const markerLabelInput = ref(null);
const markerPopEl = ref(null);

function openMarkerEditor() {
  if (!editor.value) return;
  const sel = editor.value.state.selection;
  let r = selectionScreenRect();
  if (sel.empty) {
    // No selection — try the cursor's word. If even that's empty, place
    // the popover at the cursor coords and let the user select first.
    const ranges = editor.value.view?.endOfTextblock
      ? null
      : null;
    try {
      const coords = editor.value.view.coordsAtPos(sel.from);
      r = r || { left: coords.left, bottom: coords.bottom };
    } catch {}
    // Expand the empty selection to the surrounding word so dropping a
    // marker at the cursor still wraps something visible.
    editor.value.chain().focus().setTextSelection({ from: sel.from, to: sel.from }).run();
  }
  // If cursor is inside a marker, edit it instead of creating a new one.
  const existing = editor.value.getAttributes("marker");
  if (existing?.markerId) {
    markerState.value = {
      open: true, mode: "edit",
      category: existing.category || "fix",
      label: existing.label || "",
      markerId: existing.markerId,
      x: r ? r.left : 120, y: r ? r.bottom + 8 : 120,
    };
  } else {
    markerState.value = {
      open: true, mode: "create",
      category: markerState.value.category || "fix",
      label: "",
      markerId: null,
      x: r ? r.left : 120, y: r ? r.bottom + 8 : 120,
    };
  }
  highlightOpen.value = textColorOpen.value = textColorBubbleOpen.value = false;
  nextTick(() => markerLabelInput.value?.focus());
}
function dropMarker() {
  const { category, label } = markerState.value;
  const ed = editor.value;
  if (!ed) return;
  if (ed.state.selection.empty) {
    // Expand to the surrounding word so the marker wraps real text.
    const $from = ed.state.selection.$from;
    const start = $from.start();
    const end = $from.end();
    const text = ed.state.doc.textBetween(start, end, "\n");
    const pos = $from.parentOffset;
    // Find the word boundary around `pos` in the parent's text.
    let ws = pos, we = pos;
    while (ws > 0 && /\S/.test(text[ws - 1])) ws--;
    while (we < text.length && /\S/.test(text[we])) we++;
    if (we > ws) {
      ed.chain().focus().setTextSelection({ from: start + ws, to: start + we }).run();
    }
  }
  if (ed.state.selection.empty) {
    markerState.value.open = false;
    return;
  }
  ed.chain().focus().setMarker({ category, label: label.trim() }).run();
  markerState.value.open = false;
}
function saveMarkerEdit() {
  const { category, label } = markerState.value;
  const ed = editor.value;
  if (!ed) return;
  // Re-set the mark on the existing marker range — extendMarkRange picks
  // up the full span carrying the same mark, so the new category/label
  // replace the old ones.
  ed.chain().focus().extendMarkRange("marker").setMark("marker", {
    category,
    label: label.trim(),
    markerId: markerState.value.markerId,
  }).run();
  markerState.value.open = false;
}
function removeMarkerHere() {
  const ed = editor.value;
  if (!ed) return;
  ed.chain().focus().extendMarkRange("marker").unsetMarker().run();
  markerState.value.open = false;
}
function closeMarker() { markerState.value.open = false; }
function onMarkerKeydown(e) {
  e.stopPropagation();
  if (e.key === "Escape") closeMarker();
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    markerState.value.mode === "edit" ? saveMarkerEdit() : dropMarker();
  }
}

const hasMarkers = computed(() => {
  docVersion.value;
  if (!editor.value) return false;
  let found = false;
  editor.value.state.doc.descendants((node) => {
    if (found) return false;
    if (node.marks?.some((m) => m.type.name === "marker")) found = true;
  });
  return found;
});

function markerRanges() {
  const out = [];
  const ed = editor.value;
  const type = ed?.schema?.marks?.marker;
  if (!ed || !type) return out;
  let cur = null;
  ed.state.doc.descendants((node, pos) => {
    if (!node.isText) return;
    const mark = node.marks.find((m) => m.type === type);
    if (mark) {
      if (cur && cur.to === pos && cur.markerId === mark.attrs.markerId) cur.to = pos + node.nodeSize;
      else {
        if (cur) out.push(cur);
        cur = {
          from: pos, to: pos + node.nodeSize,
          category: mark.attrs.category || "fix",
          label: mark.attrs.label || "",
          markerId: mark.attrs.markerId || null,
        };
      }
    } else if (cur) { out.push(cur); cur = null; }
  });
  if (cur) out.push(cur);
  return out;
}
function gotoMarker(dir) {
  const ranges = markerRanges();
  if (!ranges.length) return;
  const head = editor.value.state.selection.head;
  let target;
  if (dir > 0) target = ranges.find((r) => r.from > head) || ranges[0];
  else { const before = ranges.filter((r) => r.to < head); target = before.length ? before[before.length - 1] : ranges[ranges.length - 1]; }
  editor.value.chain().focus().setTextSelection({ from: target.from, to: target.to }).scrollIntoView().run();
  nextTick(openMarkerEditor);
}

function onMenuDocDown(e) {
  if (highlightOpen.value && highlightWrap.value && !highlightWrap.value.contains(e.target)) highlightOpen.value = false;
  if (textColorOpen.value && textColorWrap.value && !textColorWrap.value.contains(e.target)) textColorOpen.value = false;
  if (textColorBubbleOpen.value && textColorWrapBubble.value && !textColorWrapBubble.value.contains(e.target)) textColorBubbleOpen.value = false;
  if (commentState.value.open && commentPopEl.value && !commentPopEl.value.contains(e.target) && !e.target?.closest?.(".comment-mark")) commentState.value.open = false;
  if (markerState.value.open && markerPopEl.value && !markerPopEl.value.contains(e.target) && !e.target?.closest?.(".marker-mark")) markerState.value.open = false;
  if (proseMenuOpen.value && proseMenuWrap.value && !proseMenuWrap.value.contains(e.target)) proseMenuOpen.value = false;
}
document.addEventListener("mousedown", onMenuDocDown);
onBeforeUnmount(() => document.removeEventListener("mousedown", onMenuDocDown));

// Global Esc handler — focus mode's floating buttons (Typewriter / Close)
// can hold keyboard focus, and Esc on those targets doesn't reach the
// editor's local @keydown. A window-level capture guarantees Esc exits
// focus mode regardless of where focus currently sits.
function onWindowKeydown(e) {
  if (e.key === "Escape" && focusMode.value && !findOpen.value) {
    focusMode.value = false;
  }
}
window.addEventListener("keydown", onWindowKeydown);
onBeforeUnmount(() => window.removeEventListener("keydown", onWindowKeydown));

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
  try {
    const rec = await saveImage(file);
    const src = await urlFor(rec);
    if (src) editor.value?.chain().focus().setImage({ src, alt: rec.name }).run();
  } catch (err) {
    console.error("onImagePicked failed:", err);
    ui.showToast({ message: `Couldn't insert image — ${err?.message || err}` });
  }
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
  // Re-focus the editor first so coordsAtPos reflects the live caret,
  // not whatever stale position the editor had when the button took focus.
  if (typewriter.value) {
    editor.value?.commands.focus();
    nextTick(scrollCaretToCenter);
  }
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
  const markerEl = e.target?.closest?.(".marker-mark");
  if (markerEl) {
    const r = markerEl.getBoundingClientRect();
    markerState.value = {
      open: true, mode: "edit",
      category: markerEl.getAttribute("data-marker-category") || "fix",
      label: markerEl.getAttribute("data-marker-label") || "",
      markerId: markerEl.getAttribute("data-marker-id") || null,
      x: r.left, y: r.bottom + 8,
    };
    nextTick(() => markerLabelInput.value?.focus());
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
  } else if (e.altKey && !e.metaKey && !e.ctrlKey && e.key.toLowerCase() === "m") {
    e.preventDefault();
    e.stopPropagation();
    openMarkerEditor();
  } else if (e.key === "Escape" && findOpen.value) {
    closeFind();
    // Stop the window-level focus-mode Esc handler from also firing —
    // a single Esc should close the find bar, not also exit focus mode.
    e.stopPropagation();
  } else if (e.key === "Escape" && focusMode.value) {
    focusMode.value = false;
  }
}

// Guided Continue — same shape as the cursor-anchored continue branch
// of runWriterAction, but with a user-supplied instruction prepended.
// Returned to ChaptersView via defineExpose so the Unstuck modal can
// drive the editor without reaching into the writerAI service itself.
async function runGuidedContinue(instruction, opts = {}) {
  if (!editor.value || aiRunning.value) return;
  const text = String(instruction || "").trim();
  if (!text) { aiError.value = "Guided Continue needs a one-line direction."; return; }
  const ctx = grabContextBeforeCursor(800);
  if (!ctx.trim()) { aiError.value = "Place the cursor at the end of some prose to continue from."; return; }
  const pos = editor.value.state.selection.from;
  proseMenuOpen.value = false;
  if (shouldUseVariations(opts.shiftKey)) {
    startVariations({
      runnerFactory: (temperature, signal, onDelta, taskMeta) => writerAI.guidedContinue({
        html: `<p>${ctx}</p>`, instruction: text, signal, onDelta, temperature,
        task: { label: "Writer assist · Continue (guided)", meta: { ...(taskMeta || {}), action: "guidedContinue" } },
      }),
      mode: "continue-at", from: pos, to: pos,
      originalHtml: "",
      eyebrow: "Continue with direction — three variations",
      label: "Pick a continuation to insert",
    });
    return;
  }
  aiError.value = "";
  try {
    const result = await writerAI.guidedContinue({
      html: `<p>${ctx}</p>`,
      instruction: text,
    });
    if (!result?.html?.trim()) {
      aiError.value = "AI returned an empty response. Try again — and verify the model is running and isn't returning only thinking tags.";
    } else {
      editor.value.chain().focus().proposeContinuation({ at: pos, newHtml: result.html }).run();
    }
  } catch (err) {
    if (!isAiAbort(err)) aiError.value = err?.message || String(err);
  }
}

// The Unstuck modal needs the prose tail to feed the diagnostic. Expose
// a grab so callers don't have to reach into ProseMirror state.
function grabUnstuckContext(maxChars = 1800) {
  return grabContextBeforeCursor(maxChars);
}

// Sensory research — return the selected text so the modal knows what
// subject to research. Falls back to a small slice around the cursor
// when nothing is selected.
function grabSensorySubject() {
  if (!editor.value) return "";
  const { from, to } = editor.value.state.selection;
  if (from === to) return "";
  return editor.value.state.doc.textBetween(from, to, " ");
}

// Drop a sensory phrase into the editor at the end of the current
// selection (or at the cursor if none). Wraps the phrase in a space on
// each side so it doesn't run into adjacent text, but otherwise inserts
// as plain inline text — no AI-diff machinery. Repeated calls append
// onto the prior insertion point so the writer can stack multiple
// phrases in sequence.
function insertSensoryPhrase(phrase) {
  if (!editor.value) return;
  const text = String(phrase || "").trim();
  if (!text) return;
  const sel = editor.value.state.selection;
  const at = sel.to;
  // Add a leading space if the character right before is non-whitespace,
  // and a trailing space so the next insertion lands cleanly.
  const before = editor.value.state.doc.textBetween(Math.max(0, at - 1), at, " ");
  const lead = before && !/\s/.test(before) ? " " : "";
  editor.value.chain().focus().insertContentAt(at, `${lead}${text} `).run();
}

defineExpose({
  editor,
  // Exposed so the scene-strip AI dropdown (in ChaptersView) can drive
  // the same writerAI actions that used to live in the selection bubble.
  runWriterAction,
  runProsePass,
  runGuidedContinue,
  clearAllStrikethroughs,
  strikeCount,
  grabUnstuckContext,
  grabSensorySubject,
  insertSensoryPhrase,
  aiRunning,
  hasSelection,
  PROSE_RULES_LIST,
});
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
      <div class="group" v-if="show('bold') || show('italic') || show('underline') || show('strike') || show('subscript') || show('superscript')">
        <button v-if="show('bold')" class="tb-btn" :class="{ active: isActive('bold') }" @click="run('toggleBold')" :data-tip="TIP.bold"><Icon name="Bold" :size="14" /></button>
        <button v-if="show('italic')" class="tb-btn" :class="{ active: isActive('italic') }" @click="run('toggleItalic')" :data-tip="TIP.italic"><Icon name="Italic" :size="14" /></button>
        <button v-if="show('underline')" class="tb-btn" :class="{ active: isActive('underline') }" @click="run('toggleUnderline')" :data-tip="TIP.underline"><Icon name="Underline" :size="14" /></button>
        <button v-if="show('strike')" class="tb-btn" :class="{ active: isActive('strike') }" @click="run('toggleStrike')" :data-tip="TIP.strike"><Icon name="Strike" :size="14" /></button>
        <button v-if="show('superscript')" class="tb-btn tb-glyph" :class="{ active: isActive('superscript') }" @click="run('toggleSuperscript')" :data-tip="TIP.superscript">x²</button>
        <button v-if="show('subscript')" class="tb-btn tb-glyph" :class="{ active: isActive('subscript') }" @click="run('toggleSubscript')" :data-tip="TIP.subscript">x₂</button>
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

      <div class="group" v-if="show('link') || show('image') || show('table') || show('newScene')">
        <button v-if="show('link')" class="tb-btn" :class="{ active: isActive('link') }" @click="setLink" :data-tip="TIP.link"><Icon name="Link" :size="14" /></button>
        <button v-if="show('image')" class="tb-btn" @click="pickImage" data-tip="Insert image"><Icon name="Image" :size="14" /></button>
        <button v-if="show('table')" class="tb-btn" @click="insertTable" data-tip="Insert table"><Icon name="Table" :size="14" /></button>
        <button v-if="show('newScene')" class="tb-btn" @click="run('setSceneBoundary')" :data-tip="TIP.newScene"><Icon name="Strands" :size="14" /></button>
      </div>

      <div class="group" v-if="show('comment')">
        <button class="tb-btn" :class="{ active: isActive('comment') }" :disabled="editor.state.selection.empty" @click="openCommentEditor" data-tip="Add comment"><Icon name="Comment" :size="14" /></button>
        <button class="tb-btn" :disabled="!hasComments" @click="gotoComment(-1)" data-tip="Previous comment"><Icon name="ChevRight" :size="13" style="transform:rotate(180deg)" /></button>
        <button class="tb-btn" :disabled="!hasComments" @click="gotoComment(1)" data-tip="Next comment"><Icon name="ChevRight" :size="13" /></button>
      </div>

      <div class="group" v-if="show('marker')">
        <button class="tb-btn" :class="{ active: isActive('marker') }" @click="openMarkerEditor" :data-tip="`Drop a marker · ${sc('alt+M')}`"><Icon name="Pin" :size="14" /></button>
        <button class="tb-btn" :disabled="!hasMarkers" @click="gotoMarker(-1)" data-tip="Previous marker"><Icon name="ChevRight" :size="13" style="transform:rotate(180deg)" /></button>
        <button class="tb-btn" :disabled="!hasMarkers" @click="gotoMarker(1)" data-tip="Next marker"><Icon name="ChevRight" :size="13" /></button>
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
      <button v-if="show('newScene')" class="tb-btn" @click="run('setSceneBoundary')"
        :data-tip="TIP.newScene"><Icon name="Strands" :size="14" /></button>
      <button class="tb-btn tb-text" :class="{ active: typewriter }" @click="toggleTypewriter"
        data-tip="Typewriter scrolling — keep the current line centered">Typewriter</button>
      <button class="tb-btn" @click="toggleFocus" data-tip="Exit focus mode (Esc)"><Icon name="Close" :size="14" /></button>
    </div>

    <!-- Selection bubble menu (manuscript only) -->
    <bubble-menu v-if="editor && useBubble" :editor="editor" :tippy-options="{ duration: 100 }" :should-show="bubbleShouldShow" class="bubble-menu">
      <button class="tb-btn" :class="{ active: isActive('bold') }" @click="run('toggleBold')" :data-tip="TIP.bold"><Icon name="Bold" :size="14" /></button>
      <button class="tb-btn" :class="{ active: isActive('italic') }" @click="run('toggleItalic')" :data-tip="TIP.italic"><Icon name="Italic" :size="14" /></button>
      <button class="tb-btn" :class="{ active: isActive('underline') }" @click="run('toggleUnderline')" :data-tip="TIP.underline"><Icon name="Underline" :size="14" /></button>
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
      <!-- AI assist actions (Rewrite/Expand/Tighten/Continue/Line edits)
           moved to the scene strip's AI dropdown so they're always one
           click away (and not gated by a text selection appearing). -->
    </bubble-menu>

    <!-- AI progress strip — shown while a writerAI call is running. -->
    <div v-if="aiRunning" class="ai-progress-wrap">
      <AiTaskStrip :task="myTask" />
    </div>

    <!-- Pending changes / error bar — silent when nothing's going on. -->
    <div v-if="!aiRunning && (pendingCount > 0 || aiError)" class="ai-bar">
      <template v-if="aiError">
        <Icon name="Alert" :size="13" />
        <span class="ai-bar-msg">{{ aiError }}</span>
        <button class="tb-btn tb-text ai-bar-dismiss" @click="aiError = ''">Dismiss</button>
      </template>
      <template v-else>
        <Icon name="Sparkle" :size="13" />
        <span class="ai-bar-msg">{{ pendingCount }} pending {{ pendingCount === 1 ? "change" : "changes" }}</span>
        <button class="tb-btn tb-text ai-bar-step" @click="prevChange" :disabled="pendingCount === 0" title="Previous change">
          <Icon name="ChevRight" :size="11" style="transform:rotate(180deg)" />
        </button>
        <button class="tb-btn tb-text ai-bar-step" @click="nextChange" :disabled="pendingCount === 0" title="Next change">
          <Icon name="ChevRight" :size="11" />
        </button>
        <span v-if="currentChangeId" class="ai-bar-sep" aria-hidden="true">·</span>
        <button v-if="currentChangeId" class="tb-btn tb-text ai-bar-accept" @click="acceptCurrentChange">Accept this</button>
        <button v-if="currentChangeId" class="tb-btn tb-text ai-bar-reject" @click="rejectCurrentChange">Reject this</button>
        <span class="ai-bar-spacer"></span>
        <button class="tb-btn tb-text ai-bar-accept" @click="acceptAllAiChanges">Accept all</button>
        <button class="tb-btn tb-text ai-bar-reject" @click="rejectAllAiChanges">Reject all</button>
      </template>
    </div>

    <div v-if="variant === 'manuscript'" class="manuscript scrollarea" ref="manuscriptEl" @contextmenu="onEditorContextMenu">
      <div class="manuscript-inner" @click="onBodyClick">
        <div v-if="runningHead" class="page-runninghead">{{ runningHead }}</div>
        <editor-content :editor="editor" />
        <div class="page-folio">{{ folioLabel || "⁂" }}</div>
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

    <!-- Right-click context menu (#41, QC-41 option 1) — always opens; items
         enable/disable by scope (the AI-menu law); Windows-11 row grammar
         (icon · label · shortcut hint · separators); the bottom passthrough
         row keeps the browser's spell-check menu reachable. Backdrop click /
         Esc / any item closes it. -->
    <div v-if="ctxMenu.open" class="ctx-backdrop" @mousedown="closeCtxMenu" @contextmenu.prevent="closeCtxMenu" />
    <div v-if="ctxMenu.open" ref="ctxMenuEl" class="ctx-menu" role="menu"
      :style="{ left: `${ctxMenu.x}px`, top: `${ctxMenu.y}px` }"
      @keydown.escape="closeCtxMenu">
      <div class="ctx-section">
        Selection only
        <span v-if="!hasSelection" class="ctx-section-hint">Highlight text first to enable</span>
      </div>
      <button v-for="a in CTX_AI_SELECTION" :key="a.key" class="ctx-item" role="menuitem"
        :disabled="aiRunning || !hasSelection" @click="ctxRun(runWriterAction, a.key)">
        <Icon name="Sparkle" :size="13" class="ctx-ic" /><span class="ctx-label">{{ a.label }}</span>
      </button>
      <div class="ctx-section">Selection or whole scene</div>
      <button v-for="a in CTX_AI_ANY" :key="a.key" class="ctx-item" role="menuitem"
        :disabled="aiRunning" @click="ctxRun(runWriterAction, a.key)">
        <Icon name="Sparkle" :size="13" class="ctx-ic" /><span class="ctx-label">{{ a.label }}</span>
      </button>
      <div class="ctx-divider" />
      <div class="ctx-section">Line edits <span class="ctx-section-hint">Selection, or whole scene if none</span></div>
      <button v-for="r in PROSE_RULES_LIST" :key="r.key" class="ctx-item" role="menuitem"
        :disabled="aiRunning" @click="ctxRun(runProsePass, r.key)">
        <Icon name="Pencil" :size="13" class="ctx-ic" /><span class="ctx-label">{{ r.label }}</span>
      </button>
      <div class="ctx-divider" />
      <button class="ctx-item" role="menuitem" :disabled="!hasSelection" @click="ctxRun(doCut)">
        <Icon name="Cut" :size="13" class="ctx-ic" /><span class="ctx-label">Cut</span><kbd class="ctx-kbd">{{ sc("mod+X") }}</kbd>
      </button>
      <button class="ctx-item" role="menuitem" :disabled="!hasSelection" @click="ctxRun(doCopy)">
        <Icon name="Copy" :size="13" class="ctx-ic" /><span class="ctx-label">Copy</span><kbd class="ctx-kbd">{{ sc("mod+C") }}</kbd>
      </button>
      <button class="ctx-item" role="menuitem" @click="ctxRun(doPaste)">
        <Icon name="Paste" :size="13" class="ctx-ic" /><span class="ctx-label">Paste</span><kbd class="ctx-kbd">{{ sc("mod+V") }}</kbd>
      </button>
      <button class="ctx-item" role="menuitem" :disabled="!hasSelection" @click="ctxRun(openCommentEditor)">
        <Icon name="Comment" :size="13" class="ctx-ic" /><span class="ctx-label">Add comment</span>
      </button>
      <!-- The Windows-11 "Show more options" grammar: we cannot open the
           browser's own menu programmatically, so this arms a one-shot
           passthrough — the NEXT right-click is the native menu (with
           spell-check suggestions). Sticky at the menu's bottom so the
           spell-check door stays visible when the item list scrolls. -->
      <button class="ctx-item ctx-item-passthrough" role="menuitem" @click="ctxShowBrowserMenu">
        <span class="ctx-label">Show browser menu (spell check)</span><kbd class="ctx-kbd">right-click again</kbd>
      </button>
    </div>

    <EditorSettingsModal v-if="settingsOpen" @close="settingsOpen = false" />

    <div v-if="commentState.open" ref="commentPopEl" class="comment-pop"
      :style="{ left: `${commentState.x}px`, top: `${commentState.y}px` }" @keydown="onCommentKeydown">
      <template v-if="commentState.mode === 'edit'">
        <textarea ref="commentInput" v-model="commentState.text" class="comment-pop-input" rows="3" placeholder="Add a comment…" />
        <div class="comment-pop-actions">
          <UiButton intent="ghost" size="small" @click="closeComment">Cancel</UiButton>
          <UiButton intent="primary" size="small" @click="saveComment">Save</UiButton>
        </div>
      </template>
      <template v-else>
        <div class="comment-pop-text">{{ commentState.text }}</div>
        <div class="comment-pop-actions">
          <UiButton intent="ghost" size="small" @click="deleteComment">Delete</UiButton>
          <UiButton intent="ghost" size="small" @click="editComment">Edit</UiButton>
          <UiButton intent="primary" size="small" @click="closeComment">Close</UiButton>
        </div>
      </template>
    </div>

    <div v-if="markerState.open" ref="markerPopEl" class="marker-pop"
      :style="{ left: `${markerState.x}px`, top: `${markerState.y}px` }" @keydown="onMarkerKeydown">
      <div class="marker-pop-row">
        <div class="marker-pop-cats">
          <button v-for="c in MARKER_CATEGORIES_LIST" :key="c.id"
            type="button"
            class="marker-pop-cat"
            :class="{ active: markerState.category === c.id }"
            :style="{ '--marker-c': c.color }"
            @click="markerState.category = c.id">
            <span class="marker-pop-cat-dot" :style="{ background: c.color }" />
            {{ c.label }}
          </button>
        </div>
      </div>
      <input ref="markerLabelInput" v-model="markerState.label" class="marker-pop-input" type="text"
        placeholder="Optional one-line note (Enter to save)" />
      <div class="marker-pop-actions">
        <UiButton v-if="markerState.mode === 'edit'" intent="ghost" size="small" @click="removeMarkerHere">Resolve</UiButton>
        <UiButton intent="ghost" size="small" @click="closeMarker">Cancel</UiButton>
        <UiButton intent="primary" size="small"
          @click="markerState.mode === 'edit' ? saveMarkerEdit() : dropMarker()">
          {{ markerState.mode === "edit" ? "Save" : "Drop marker" }}
        </UiButton>
      </div>
    </div>

    <!-- Three-alternative streaming modal — opens when ui.showVariations
         is on OR the writer shift-clicks an AI dropdown item. Each
         column streams independently; the chosen one threads back into
         the existing proposeContinuation / proposeReplacement flow. -->
    <VariationsModal v-if="variationsFlow"
      :runner="variationsFlow.runnerFactory"
      :label="variationsFlow.label"
      :eyebrow="variationsFlow.eyebrow"
      @use-variation="onVariationChosen"
      @close="onVariationsClose" />
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
/* In the edit surface there's no visible heading anchoring the first
   paragraph, so a flush-left opening reads as an outlier rather than a
   convention. Restore the indent on the first paragraph while editing —
   read views and exports keep the typographic flush-left. */
.rich-editor--manuscript .manuscript-inner p:first-of-type {
  text-indent: var(--editor-para-indent, var(--editor-body-para-indent, 1.6em));
}
/* Writing surface for the scene editor. Uses the per-area editor-paper
   token so Settings → Appearance can retint it; defaults to the warm
   paper, matching the read-only views. */
.rich-editor--manuscript .manuscript { background: var(--editor-paper); }

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
  color: var(--ink);
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

/* In-text markers — colored dotted underline keyed off data attribute.
   Read by both the editor and any read view that renders raw scene HTML
   (since the mark stores its color via the data-marker-category attr,
   not inline style). */
.tiptap-content .marker-mark,
.scene-body .marker-mark,
.read-view .marker-mark {
  text-decoration: underline dotted;
  text-decoration-thickness: 2px;
  text-underline-offset: 3px;
  cursor: pointer;
  background: color-mix(in oklab, var(--marker-fix) 12%, transparent);
  border-radius: 2px;
}
.tiptap-content .marker-mark[data-marker-category="fix"],
.scene-body .marker-mark[data-marker-category="fix"],
.read-view .marker-mark[data-marker-category="fix"] {
  text-decoration-color: var(--marker-fix);
  background: color-mix(in oklab, var(--marker-fix) 12%, transparent);
}
.tiptap-content .marker-mark[data-marker-category="verify"],
.scene-body .marker-mark[data-marker-category="verify"],
.read-view .marker-mark[data-marker-category="verify"] {
  text-decoration-color: var(--marker-verify);
  background: color-mix(in oklab, var(--marker-verify) 12%, transparent);
}
.tiptap-content .marker-mark[data-marker-category="weak"],
.scene-body .marker-mark[data-marker-category="weak"],
.read-view .marker-mark[data-marker-category="weak"] {
  text-decoration-color: var(--marker-weak);
  background: color-mix(in oklab, var(--marker-weak) 12%, transparent);
}
.tiptap-content .marker-mark[data-marker-category="thread"],
.scene-body .marker-mark[data-marker-category="thread"],
.read-view .marker-mark[data-marker-category="thread"] {
  text-decoration-color: var(--marker-thread);
  background: color-mix(in oklab, var(--marker-thread) 12%, transparent);
}
.tiptap-content .marker-mark[data-marker-category="todo"],
.scene-body .marker-mark[data-marker-category="todo"],
.read-view .marker-mark[data-marker-category="todo"] {
  text-decoration-color: var(--marker-todo);
  background: color-mix(in oklab, var(--marker-todo) 12%, transparent);
}
.tiptap-content .marker-mark[data-marker-category="idea"],
.scene-body .marker-mark[data-marker-category="idea"],
.read-view .marker-mark[data-marker-category="idea"] {
  text-decoration-color: var(--marker-idea);
  background: color-mix(in oklab, var(--marker-idea) 12%, transparent);
}

/* Marker popover — same fixed-position pattern as the comment popover. */
.marker-pop {
  position: fixed; z-index: 200;
  width: 320px; max-width: 90vw;
  background: var(--surface);
  border: 1px solid var(--border-strong);
  border-radius: 10px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, .22);
  padding: 10px;
  display: flex; flex-direction: column; gap: 8px;
}
.marker-pop-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.marker-pop-cats {
  display: flex; flex-wrap: wrap; gap: 5px;
}
.marker-pop-cat {
  appearance: none;
  display: inline-flex; align-items: center; gap: 5px;
  padding: 4px 9px; border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--surface);
  font: inherit; font-size: 11.5px;
  color: var(--ink-2);
  cursor: pointer;
}
.marker-pop-cat:hover { background: var(--surface-2); }
.marker-pop-cat.active {
  background: color-mix(in oklab, var(--marker-c, var(--accent)) 18%, transparent);
  border-color: var(--marker-c, var(--accent));
  color: var(--ink);
}
.marker-pop-cat-dot {
  width: 8px; height: 8px; border-radius: 50%; flex: none;
}
.marker-pop-input {
  width: 100%;
  border: 1px solid var(--border); border-radius: 7px;
  padding: 7px 9px; font: inherit; font-size: 13px;
  background: var(--surface); color: var(--ink); outline: none;
}
.marker-pop-input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
.marker-pop-actions { display: flex; justify-content: flex-end; gap: 6px; }

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

/* Right-click context menu (#41, QC-41) — same popover idiom as .comment-pop;
   Windows-11 compact row grammar: leading icon · label · right-aligned
   shortcut hint; disabled rows grey out (the AI-menu scope-law). */
.ctx-backdrop { position: fixed; inset: 0; z-index: 199; background: transparent; }
.ctx-menu {
  position: fixed; z-index: 200;
  min-width: 220px; max-height: min(70vh, 480px); overflow-y: auto;
  background: var(--surface);
  border: 1px solid var(--border-strong);
  border-radius: 10px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, .22);
  padding: 6px;
  display: flex; flex-direction: column; gap: 1px;
}
.ctx-section {
  font-family: var(--font-mono); font-size: 9.5px;
  letter-spacing: 0.1em; text-transform: uppercase;
  color: var(--muted); font-weight: 600;
  padding: 5px 8px 3px;
}
.ctx-section-hint {
  text-transform: none; letter-spacing: 0; font-family: var(--font-ui);
  font-weight: 500; font-size: 10px; font-style: italic; margin-left: 6px;
}
.ctx-item {
  display: flex; align-items: center; gap: 8px; width: 100%; text-align: left;
  border: 0; background: transparent; cursor: pointer;
  padding: 5px 8px; border-radius: 6px;
  font-family: var(--font-ui); font-size: 12.5px; color: var(--ink);
}
.ctx-ic { color: var(--muted); flex: none; }
.ctx-label { flex: 1; min-width: 0; }
.ctx-kbd {
  flex: none; font-family: var(--font-ui); font-size: 10.5px;
  color: var(--muted); background: none; border: 0; padding: 0;
}
.ctx-item:hover:not(:disabled) { background: var(--surface-2); }
.ctx-item:disabled { color: var(--muted); cursor: default; }
.ctx-item:disabled .ctx-ic { opacity: .5; }
.ctx-item-passthrough {
  position: sticky; bottom: -6px; flex-shrink: 0;
  background: var(--surface); border-top: 1px solid var(--border-soft);
  border-radius: 0; margin: 3px -6px -6px; padding: 8px 14px; width: auto;
}
.ctx-divider { height: 1px; background: var(--border-soft); margin: 4px 2px; }
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
.search-match--current { background: var(--accent); color: var(--on-accent); }

/* @-mention chips */
.mention {
  border-radius: 5px; padding: 0 5px; font-weight: 500; cursor: pointer;
  background: var(--surface-2); color: var(--ink); white-space: nowrap;
  border: 1px solid var(--border);
}
.mention:hover { filter: brightness(0.96); }
.mention[data-kind="character"] { background: color-mix(in oklch, var(--mention-character) 22%, transparent); border-color: color-mix(in oklch, var(--mention-character) 45%, transparent); }
.mention[data-kind="location"]  { background: color-mix(in oklch, var(--mention-location) 22%, transparent);  border-color: color-mix(in oklch, var(--mention-location) 45%, transparent); }
.mention[data-kind="object"]    { background: color-mix(in oklch, var(--mention-object) 22%, transparent);    border-color: color-mix(in oklch, var(--mention-object) 45%, transparent); }
.mention[data-kind="group"]     { background: color-mix(in oklch, var(--mention-group) 22%, transparent);     border-color: color-mix(in oklch, var(--mention-group) 45%, transparent); }

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
.mention-item-dot[data-kind="character"] { background: var(--mention-character); }
.mention-item-dot[data-kind="location"]  { background: var(--mention-location); }
.mention-item-dot[data-kind="object"]    { background: var(--mention-object); }
.mention-item-dot[data-kind="group"]     { background: var(--mention-group); }
.mention-item-label { flex: 1; color: var(--ink); font-size: 13px; }
.mention-item-type { font-size: 11px; color: var(--muted); text-transform: capitalize; }
.mention-empty { padding: 9px; color: var(--muted); font-size: 13px; }

/* Focus mode — fullscreen, distraction-free. Fixed overlay covers the
   app chrome (sidebar/titlebar). All prose stays fully visible; the
   surrounding chrome (toolbar, scene strip, sidebar) is what gets cut. */
.rich-editor.focus-on {
  position: fixed; inset: 0; z-index: 150;
  background: var(--paper);
}
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
  display: flex; gap: 4px; padding: 4px; align-items: center;
  background: var(--surface); border: 1px solid var(--border);
  border-radius: 8px; box-shadow: 0 6px 20px rgba(0,0,0,.16);
  max-width: min(720px, 92vw);
  flex-wrap: wrap;
}
.bubble-sep {
  width: 1px; align-self: stretch; margin: 2px 4px;
  background: var(--border);
}

/* ── AI assist ───────────────────────────────────────────── */
/* Wraps the leading "AI" badge + every AI button as one visual block so
   the whole strip reads as "AI tools" instead of a continuation of the
   formatting controls before the separator. Subtle accent tint is the
   anchor; the badge is the explicit label. */
.ai-group {
  display: inline-flex; align-items: center; gap: 4px;
  /* Stay together as one cohesive block — never split the AI cluster
     across lines, even if the bubble itself wraps on a narrow window. */
  flex-shrink: 0;
  flex-wrap: nowrap;
}
.ai-badge {
  display: inline-flex; align-items: center;
  padding: 0 5px; height: 14px; border-radius: 3px;
  background: var(--accent); color: var(--on-accent, #fff);
  font-family: var(--font-mono);
  font-size: 9px; font-weight: 700; letter-spacing: 0.08em;
  margin-right: 2px;
}
.ai-btn {
  display: inline-flex !important; gap: 5px; align-items: center;
  width: auto !important;
  padding: 0 10px !important;
  color: var(--accent-ink);
}
.ai-btn + .ai-btn { margin-left: 0; }
.ai-btn:hover { background: var(--accent-soft); }
.ai-btn:disabled { opacity: 0.55; cursor: not-allowed; }
.ai-btn .ai-lbl {
  font-size: 11px; font-weight: 600; letter-spacing: 0.01em;
}
/* Carets inside AI buttons should match the button's accent-ink color, not
   the global .tb-caret muted gray, which would otherwise fade against the
   bolder AI button text. */
.ai-btn .tb-caret { color: inherit; opacity: 0.85; }

.prose-menu {
  position: absolute; top: calc(100% + 4px); right: 0;
  width: 380px; max-width: 92vw;
  background: var(--surface); border: 1px solid var(--border);
  border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,.18);
  padding: 6px; z-index: 60;
  display: flex; flex-direction: column;
}
.prose-menu-item {
  display: flex; flex-direction: column; gap: 3px;
  padding: 10px 12px; border-radius: 6px;
  text-align: left; background: none; border: 0; cursor: pointer;
  color: inherit;
}
.prose-menu-item:hover { background: var(--surface-2); }
.prose-menu-item:disabled { opacity: 0.5; cursor: not-allowed; }
.prose-menu-label { font-size: 14px; font-weight: 600; }
.prose-menu-desc  { font-size: 12.5px; color: var(--muted); line-height: 1.45; }

/* Wrap AiTaskStrip so it gets the same edge margin as the pending-changes
   bar — the strip itself draws its own border/background. */
.ai-progress-wrap { padding: 7px 12px; border-bottom: 1px solid var(--border); background: var(--surface); }

/* AI status bar above the editor body. Slim, single-row when possible. */
.ai-bar {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  padding: 7px 12px;
  border-bottom: 1px solid var(--border);
  background: var(--accent-soft);
  color: var(--accent-ink);
  font-size: 12.5px;
}
.ai-bar-msg { flex: 0 0 auto; }
.ai-bar-sep { color: var(--muted); }
.ai-bar-spacer { flex: 1; }
.ai-bar-accept { color: var(--accent-ink); font-weight: 600; }
.ai-bar-reject { color: var(--danger-ink, #b91c1c); }
.ai-bar-dismiss { color: var(--muted); margin-left: auto; }
.ai-bar-step {
  display: inline-flex; align-items: center; padding: 0 5px !important;
  color: var(--accent-ink); opacity: 0.85;
}
.ai-bar-step:disabled { opacity: 0.35; cursor: not-allowed; }
.ai-bar-step:hover:not(:disabled) { opacity: 1; }
.ai-spinner { animation: ai-spin 1.2s linear infinite; }
@keyframes ai-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

/* AI diff marks — inline insert/delete styling */
.tiptap-content .ai-ins {
  background: color-mix(in oklab, var(--status-done) 14%, transparent);
  color: inherit;
  text-decoration: none;
  border-radius: 2px;
  padding: 0 2px;
  border-bottom: 2px solid color-mix(in oklab, var(--status-done) 60%, transparent);
}
.tiptap-content .ai-del {
  background: color-mix(in oklab, var(--danger-ink, #b91c1c) 12%, transparent);
  color: var(--muted);
  text-decoration: line-through;
  text-decoration-color: color-mix(in oklab, var(--danger-ink, #b91c1c) 60%, transparent);
  border-radius: 2px;
  padding: 0 2px;
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
  font-family: var(--editor-font, var(--editor-body-font, var(--font-serif)));
  font-size: var(--editor-font-size, var(--editor-body-font-size, 15px));
  line-height: var(--editor-line-height, var(--editor-body-line-height, 1.65));
  color: var(--ink);
  border: 1px solid var(--border);
  border-radius: 0 0 7px 7px;
  background: var(--surface);
}
/* "Apply editor paper to inline fields" (Settings → Appearance) — inline
   editor bodies pick up the editor-paper tint instead of the surface. */
html[data-inline-paper="on"] .rich-editor--inline .inline-editor-body { background: var(--editor-paper); }
.rich-editor--inline .tiptap-content p { text-indent: var(--editor-para-indent, var(--editor-body-para-indent, 0)); }
.rich-editor--inline .tiptap-content p:first-of-type { text-indent: 0; }
.rich-editor--inline .tiptap-content p + p { margin-top: var(--editor-para-spacing, var(--editor-body-para-spacing, 0)); }
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