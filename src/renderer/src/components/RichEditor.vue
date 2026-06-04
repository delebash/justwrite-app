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
import { AiDiff, hasPendingChanges, listPendingChanges } from "@renderer/services/aiDiff";
import * as writerAI from "@renderer/services/writerAI";
import { PROSE_RULES, PROSE_RULE_ORDER } from "@renderer/services/writerAI";
import { useAiProgress } from "@renderer/composables/useAiProgress";
import { useUiStore } from "../stores/ui.js";
import Icon from "./Icon.vue";
import JwButton from "@renderer/components/ui/JwButton.vue";
import EditorSettingsModal from "./EditorSettingsModal.vue";
import AiProgressBar from "./AiProgressBar.vue";

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
        "data-label": idx != null ? `Scene ${Number(idx) + 1}${title ? " — " + title : ""}` : (title || "New scene"),
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
  onSelectionUpdate({ editor }) { syncDiffState(editor); maybeTypewriter(); },
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
// Selection-driven actions live in the bubble menu (Rewrite / Expand /
// Tighten / Continue + Prose pass). Each call replaces the selection
// with a paired <del>/<ins> diff that the user accepts or rejects.
const aiRunning = ref(false);
const aiError = ref("");
const aiActionLabel = ref("");          // human label for the currently running action
const proseMenuOpen = ref(false);
const proseMenuWrap = ref(null);
const PROSE_RULES_LIST = PROSE_RULE_ORDER.map((k) => ({ key: k, ...PROSE_RULES[k] }));

// Shared progress for whichever writer-AI action is in flight. Prose
// actions (rewrite/expand/tighten/continue) stream readable text, so
// we expose a preview toggle for them. Persisted across sessions so
// the user's pick sticks (small enough to live in localStorage directly).
const aiProgress = useAiProgress();
const aiShowPreview = ref(loadShowPreview());
function loadShowPreview() {
  try { return localStorage.getItem("justwrite:ui:aiShowPreview") === "1"; } catch { return false; }
}
watch(aiShowPreview, (v) => {
  try { localStorage.setItem("justwrite:ui:aiShowPreview", v ? "1" : "0"); } catch {}
});

// JSON-output actions don't benefit from a live preview — they stream
// gibberish until the closing brace lands. The bubble menu only
// surfaces prose actions, so we always allow preview here; the lab
// page can branch on this if it adds JSON actions later.
function isProseAction(actionKey) {
  // Match the writerAI ACTIONS plus PROSE_RULES (prose-pass actions
  // also stream readable text).
  return actionKey === "rewrite" || actionKey === "expand" ||
         actionKey === "tighten" || actionKey === "continue" ||
         actionKey?.startsWith?.("rule:");
}

// Pending-changes state — drives the "N changes" header bar and the
// inline accept/reject overlay. Recomputed on every doc/selection update.
const pendingCount = ref(0);
const currentChangeId = ref(null);

function syncDiffState(ed) {
  const list = listPendingChanges(ed);
  pendingCount.value = list.length;
  // If the cursor is inside an aiIns or aiDel mark, surface its
  // changeId so the inline overlay can show Accept / Reject buttons
  // for just that change.
  const marks = ed.state.selection.$from.marks?.() || [];
  const aiMark = marks.find((m) => m.type.name === "aiIns" || m.type.name === "aiDel");
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

const ACTION_LABELS = {
  rewrite: "Rewriting selection…",
  expand: "Expanding selection…",
  tighten: "Tightening selection…",
  continue: "Continuing from cursor…",
};

async function runWriterAction(actionKey) {
  if (!editor.value || aiRunning.value) return;
  proseMenuOpen.value = false;
  const { from, to, html } = readSelectionHtml();
  // For "continue" with no selection, anchor at the cursor and feed the
  // last paragraph as context.
  if (actionKey === "continue" && from === to) {
    const ctx = grabContextBeforeCursor(800);
    if (!ctx.trim()) { aiError.value = "Place the cursor at the end of some prose to continue from."; return; }
    aiRunning.value = true; aiError.value = "";
    aiActionLabel.value = ACTION_LABELS.continue;
    aiProgress.start();
    try {
      const result = await writerAI.continueFrom({
        html: `<p>${ctx}</p>`,
        signal: aiProgress.signal,
        onDelta: aiProgress.onDelta,
      });
      // Guard empty/whitespace-only responses — otherwise proposeContinuation
      // inserts nothing visible and the user sees the progress bar vanish
      // with no result and no error.
      if (!result?.html?.trim()) {
        aiError.value = "AI returned an empty response. Try again — and verify the model is running and isn't returning only thinking tags.";
      } else {
        editor.value.chain().focus().proposeContinuation({ at: from, newHtml: result.html }).run();
      }
      aiProgress.finish();
    } catch (err) {
      if (!aiProgress.cancelled.value) aiError.value = err?.message || String(err);
      aiProgress.finish();
    } finally {
      aiRunning.value = false;
    }
    return;
  }
  if (from === to) { aiError.value = "Select some text first."; return; }
  aiRunning.value = true; aiError.value = "";
  aiActionLabel.value = ACTION_LABELS[actionKey] || "Working…";
  aiProgress.start();
  try {
    const fn = actionKey === "rewrite" ? writerAI.rewrite
             : actionKey === "expand" ? writerAI.expand
             : actionKey === "tighten" ? writerAI.tighten
             : writerAI.continueFrom;
    const result = await fn({
      html,
      signal: aiProgress.signal,
      onDelta: aiProgress.onDelta,
    });
    // Guard empty/whitespace-only responses — proposeReplacement would
    // deleteRange()+insertContentAt("") and silently nuke the selection
    // without surfacing an error.
    if (!result?.html?.trim()) {
      aiError.value = "AI returned an empty response. Try again — and verify the model is running and isn't returning only thinking tags.";
    } else {
      editor.value.chain().focus().proposeReplacement({ from, to, originalHtml: html, newHtml: result.html }).run();
    }
    aiProgress.finish();
  } catch (err) {
    if (!aiProgress.cancelled.value) aiError.value = err?.message || String(err);
    aiProgress.finish();
  } finally {
    aiRunning.value = false;
  }
}

async function runProsePass(ruleKey) {
  if (!editor.value || aiRunning.value) return;
  proseMenuOpen.value = false;
  const { from, to, html } = readSelectionHtml();
  if (from === to) { aiError.value = "Select the passage to run the prose pass on."; return; }
  aiRunning.value = true; aiError.value = "";
  aiActionLabel.value = `Running prose pass: ${PROSE_RULES[ruleKey]?.label || ruleKey}…`;
  aiProgress.start();
  try {
    const result = await writerAI.applyRule(ruleKey, {
      html,
      signal: aiProgress.signal,
      onDelta: aiProgress.onDelta,
    });
    if (!result?.html?.trim()) {
      aiError.value = "AI returned an empty response. Try again — and verify the model is running and isn't returning only thinking tags.";
    } else {
      editor.value.chain().focus().proposeReplacement({ from, to, originalHtml: html, newHtml: result.html }).run();
    }
    aiProgress.finish();
  } catch (err) {
    if (!aiProgress.cancelled.value) aiError.value = err?.message || String(err);
    aiProgress.finish();
  } finally {
    aiRunning.value = false;
  }
}

function grabContextBeforeCursor(limit = 800) {
  if (!editor.value) return "";
  const pos = editor.value.state.selection.from;
  const text = editor.value.state.doc.textBetween(Math.max(0, pos - limit), pos, "\n\n");
  return text;
}

function acceptCurrentChange() {
  if (!currentChangeId.value || !editor.value) return;
  editor.value.chain().focus().acceptChange(currentChangeId.value).run();
}
function rejectCurrentChange() {
  if (!currentChangeId.value || !editor.value) return;
  editor.value.chain().focus().rejectChange(currentChangeId.value).run();
}
function acceptAllAiChanges() { editor.value?.chain().focus().acceptAllChanges().run(); }
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
    // Stop the window-level focus-mode Esc handler from also firing —
    // a single Esc should close the find bar, not also exit focus mode.
    e.stopPropagation();
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
        <button v-if="show('sceneBreak')" class="tb-btn" @click="run('setHorizontalRule')" data-tip="Scene break (in-scene * * *)"><Icon name="SceneBreak" :size="14" /></button>
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

      <div class="group" v-if="show('link') || show('image') || show('table') || show('pageBreak') || show('newScene')">
        <button v-if="show('link')" class="tb-btn" :class="{ active: isActive('link') }" @click="setLink" :data-tip="TIP.link"><Icon name="Link" :size="14" /></button>
        <button v-if="show('image')" class="tb-btn" @click="pickImage" data-tip="Insert image"><Icon name="Image" :size="14" /></button>
        <button v-if="show('table')" class="tb-btn" @click="insertTable" data-tip="Insert table"><Icon name="Table" :size="14" /></button>
        <button v-if="show('pageBreak')" class="tb-btn" @click="run('setPageBreak')" data-tip="Page break (⌘⏎)"><Icon name="PageBreak" :size="14" /></button>
        <button v-if="show('newScene')" class="tb-btn" @click="run('setSceneBoundary')" :data-tip="TIP.newScene"><Icon name="Strands" :size="14" /></button>
      </div>

      <div class="group" v-if="show('comment')">
        <button class="tb-btn" :class="{ active: isActive('comment') }" :disabled="editor.state.selection.empty" @click="openCommentEditor" data-tip="Add comment"><Icon name="Comment" :size="14" /></button>
        <button class="tb-btn" :disabled="!hasComments" @click="gotoComment(-1)" data-tip="Previous comment"><Icon name="ChevRight" :size="13" style="transform:rotate(180deg)" /></button>
        <button class="tb-btn" :disabled="!hasComments" @click="gotoComment(1)" data-tip="Next comment"><Icon name="ChevRight" :size="13" /></button>
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
      <span class="bubble-sep" aria-hidden="true"></span>
      <button class="tb-btn ai-btn" :disabled="aiRunning" @click="runWriterAction('rewrite')" data-tip="Rewrite — vivid + specific">
        <Icon name="Sparkle" :size="13" /><span class="ai-lbl">Rewrite</span>
      </button>
      <button class="tb-btn ai-btn" :disabled="aiRunning" @click="runWriterAction('expand')" data-tip="Expand — add sensory detail">
        <span class="ai-lbl">Expand</span>
      </button>
      <button class="tb-btn ai-btn" :disabled="aiRunning" @click="runWriterAction('tighten')" data-tip="Tighten — cut filler">
        <span class="ai-lbl">Tighten</span>
      </button>
      <button class="tb-btn ai-btn" :disabled="aiRunning" @click="runWriterAction('continue')" data-tip="Continue from cursor">
        <span class="ai-lbl">Continue</span>
      </button>
      <div class="tb-highlight" ref="proseMenuWrap">
        <button class="tb-btn tb-btn-split ai-btn" :class="{ active: proseMenuOpen }" :disabled="aiRunning" @click="toggleProseMenu" data-tip="Prose pass — focused rewrites">
          <span class="ai-lbl">Prose pass</span><Icon name="ChevDown" :size="9" class="tb-caret" />
        </button>
        <div v-if="proseMenuOpen" class="prose-menu">
          <button v-for="r in PROSE_RULES_LIST" :key="r.key" class="prose-menu-item" @click="runProsePass(r.key)" :disabled="aiRunning">
            <div class="prose-menu-label">{{ r.label }}</div>
            <div class="prose-menu-desc">{{ r.description }}</div>
          </button>
        </div>
      </div>
    </bubble-menu>

    <!-- AI progress bar — shown while a writerAI call is running.
         Streams a live preview for prose actions (opt-in via toggle). -->
    <div v-if="aiRunning" class="ai-progress-wrap">
      <AiProgressBar
        :progress="aiProgress"
        :label="aiActionLabel"
        :show-preview="aiShowPreview"
        :can-toggle-preview="true" />
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

    <div v-if="variant === 'manuscript'" class="manuscript scrollarea" ref="manuscriptEl">
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

    <EditorSettingsModal v-if="settingsOpen" @close="settingsOpen = false" />

    <div v-if="commentState.open" ref="commentPopEl" class="comment-pop"
      :style="{ left: `${commentState.x}px`, top: `${commentState.y}px` }" @keydown="onCommentKeydown">
      <template v-if="commentState.mode === 'edit'">
        <textarea ref="commentInput" v-model="commentState.text" class="comment-pop-input" rows="3" placeholder="Add a comment…" />
        <div class="comment-pop-actions">
          <JwButton intent="ghost" size="small" @click="closeComment">Cancel</JwButton>
          <JwButton intent="primary" size="small" @click="saveComment">Save</JwButton>
        </div>
      </template>
      <template v-else>
        <div class="comment-pop-text">{{ commentState.text }}</div>
        <div class="comment-pop-actions">
          <JwButton intent="ghost" size="small" @click="deleteComment">Delete</JwButton>
          <JwButton intent="ghost" size="small" @click="editComment">Edit</JwButton>
          <JwButton intent="primary" size="small" @click="closeComment">Close</JwButton>
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
.ai-btn {
  display: inline-flex !important; gap: 5px; align-items: center;
  width: auto !important;
  padding: 0 10px !important;
  color: var(--accent-ink);
}
/* Tighten internal label spacing on AI buttons so multi-word labels
   don't run flush against the next button's icon/label. */
.ai-btn + .ai-btn { margin-left: 2px; }
.ai-btn:hover { background: var(--accent-soft); }
.ai-btn:disabled { opacity: 0.55; cursor: not-allowed; }
.ai-btn .ai-lbl {
  font-size: 11px; font-weight: 600; letter-spacing: 0.01em;
}

.prose-menu {
  position: absolute; top: calc(100% + 4px); right: 0;
  width: 280px; max-width: 92vw;
  background: var(--surface); border: 1px solid var(--border);
  border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,.18);
  padding: 4px; z-index: 60;
  display: flex; flex-direction: column;
}
.prose-menu-item {
  display: flex; flex-direction: column; gap: 2px;
  padding: 8px 10px; border-radius: 6px;
  text-align: left; background: none; border: 0; cursor: pointer;
  color: inherit;
}
.prose-menu-item:hover { background: var(--surface-2); }
.prose-menu-item:disabled { opacity: 0.5; cursor: not-allowed; }
.prose-menu-label { font-size: 13px; font-weight: 600; }
.prose-menu-desc  { font-size: 11.5px; color: var(--muted); line-height: 1.4; }

/* Wrap the new AiProgressBar so it gets the same edge margin as the
   pending-changes bar — the bar itself draws its own border/background. */
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