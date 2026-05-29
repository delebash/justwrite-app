<script setup>
import { ref, computed, watch, nextTick, onBeforeUnmount } from "vue";
import { useEditor, EditorContent, BubbleMenu } from "@tiptap/vue-3";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";
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
import { saveImage, urlFor } from "@renderer/services/imageStore";
import Icon from "./Icon.vue";

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
    default: () => [
      "bold", "italic", "underline", "strike",
      "h1", "h2", "quote", "list", "orderedList", "taskList",
      "sceneBreak", "align", "highlight", "link", "image", "table",
      "find", "focus", "undo", "redo",
    ],
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

const isManuscript = computed(() => props.variant === "manuscript");
// Rich chrome (bubble menu, find bar, word count) is manuscript-only.
const showWordCount = computed(() => isManuscript.value && props.countFooter);
const useBubble = computed(() => isManuscript.value);

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

const extensions = [
  StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
  Placeholder.configure({ placeholder: props.placeholder }),
  Underline,
  Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { rel: "noopener nofollow", target: "_blank" } }),
  Highlight,
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
  editorProps: { attributes: { class: "tiptap-content" } },
  onCreate({ editor }) { syncCounts(editor); },
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

onBeforeUnmount(() => editor.value?.destroy());

// --- toolbar helpers --------------------------------------------------
const run = (cmd) => editor.value?.chain().focus()[cmd]().run();
const isActive = (name, attrs) => editor.value?.isActive(name, attrs) || false;
const show = (b) => props.toolbar.includes(b);

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
      <div class="group" v-if="show('bold') || show('italic') || show('underline') || show('strike')">
        <button v-if="show('bold')" class="tb-btn" :class="{ active: isActive('bold') }" @click="run('toggleBold')" title="Bold">
          <Icon name="Bold" :size="14" />
        </button>
        <button v-if="show('italic')" class="tb-btn" :class="{ active: isActive('italic') }" @click="run('toggleItalic')" title="Italic">
          <Icon name="Italic" :size="14" />
        </button>
        <button v-if="show('underline')" class="tb-btn" :class="{ active: isActive('underline') }" @click="run('toggleUnderline')" title="Underline">
          <Icon name="Underline" :size="14" />
        </button>
        <button v-if="show('strike')" class="tb-btn" :class="{ active: isActive('strike') }" @click="run('toggleStrike')" title="Strikethrough">
          <Icon name="Strike" :size="14" />
        </button>
      </div>

      <div class="group" v-if="show('h1') || show('h2') || show('h3')">
        <button v-if="show('h1')" class="tb-btn" :class="{ active: isActive('heading', { level: 1 }) }" @click="setHeading(1)" title="Heading 1">H1</button>
        <button v-if="show('h2')" class="tb-btn" :class="{ active: isActive('heading', { level: 2 }) }" @click="setHeading(2)" title="Heading 2">H2</button>
        <button v-if="show('h3')" class="tb-btn" :class="{ active: isActive('heading', { level: 3 }) }" @click="setHeading(3)" title="Heading 3">H3</button>
      </div>

      <div class="group" v-if="show('quote') || show('list') || show('orderedList') || show('taskList')">
        <button v-if="show('quote')" class="tb-btn" :class="{ active: isActive('blockquote') }" @click="run('toggleBlockquote')" title="Block quote">
          <Icon name="Quote" :size="14" />
        </button>
        <button v-if="show('list')" class="tb-btn" :class="{ active: isActive('bulletList') }" @click="run('toggleBulletList')" title="Bullet list">
          <Icon name="List" :size="14" />
        </button>
        <button v-if="show('orderedList')" class="tb-btn" :class="{ active: isActive('orderedList') }" @click="run('toggleOrderedList')" title="Numbered list">
          <Icon name="ListOrdered" :size="14" />
        </button>
        <button v-if="show('taskList')" class="tb-btn" :class="{ active: isActive('taskList') }" @click="run('toggleTaskList')" title="Checklist">
          <Icon name="CheckSquare" :size="14" />
        </button>
      </div>

      <div class="group" v-if="show('sceneBreak') || show('align')">
        <button v-if="show('sceneBreak')" class="tb-btn" @click="run('setHorizontalRule')" title="Scene break">
          <Icon name="SceneBreak" :size="14" />
        </button>
        <template v-if="show('align')">
          <button class="tb-btn" :class="{ active: isActive({ textAlign: 'left' }) }" @click="setAlign('left')" title="Align left">
            <Icon name="AlignLeft" :size="14" />
          </button>
          <button class="tb-btn" :class="{ active: isActive({ textAlign: 'center' }) }" @click="setAlign('center')" title="Align center">
            <Icon name="AlignCenter" :size="14" />
          </button>
          <button class="tb-btn" :class="{ active: isActive({ textAlign: 'right' }) }" @click="setAlign('right')" title="Align right">
            <Icon name="AlignRight" :size="14" />
          </button>
        </template>
      </div>

      <div class="group" v-if="show('highlight') || show('link') || show('image') || show('table')">
        <button v-if="show('highlight')" class="tb-btn" :class="{ active: isActive('highlight') }" @click="run('toggleHighlight')" title="Highlight">
          <Icon name="Highlight" :size="14" />
        </button>
        <button v-if="show('link')" class="tb-btn" :class="{ active: isActive('link') }" @click="setLink" title="Link">
          <Icon name="Link" :size="14" />
        </button>
        <button v-if="show('image')" class="tb-btn" @click="pickImage" title="Insert image">
          <Icon name="Image" :size="14" />
        </button>
        <button v-if="show('table')" class="tb-btn" @click="insertTable" title="Insert table">
          <Icon name="Table" :size="14" />
        </button>
      </div>

      <div class="group" v-if="show('find') || show('focus')">
        <button v-if="show('find')" class="tb-btn" :class="{ active: findOpen }" @click="toggleFind" title="Find & replace">
          <Icon name="Search" :size="14" />
        </button>
        <button v-if="show('focus')" class="tb-btn" :class="{ active: focusMode }" @click="toggleFocus" title="Focus mode">
          <Icon name="Focus" :size="14" />
        </button>
      </div>

      <div class="group" v-if="show('undo') || show('redo')">
        <button v-if="show('undo')" class="tb-btn" :disabled="!editor.can().undo()" @click="run('undo')" title="Undo">
          <Icon name="Refresh" :size="14" style="transform:scaleX(-1)" />
        </button>
        <button v-if="show('redo')" class="tb-btn" :disabled="!editor.can().redo()" @click="run('redo')" title="Redo">
          <Icon name="Refresh" :size="14" />
        </button>
      </div>

      <div style="flex:1" />
      <slot name="toolbar-end" :editor="editor" />
    </div>

    <!-- Find & replace bar -->
    <div v-if="editor && findOpen" class="find-bar">
      <input ref="findInput" v-model="findTerm" class="find-input" type="text" placeholder="Find"
        @keydown.enter.prevent="findNext" @keydown.shift.enter.prevent="findPrev" />
      <span class="find-count">{{ searchInfo.count ? `${searchInfo.current}/${searchInfo.count}` : "0/0" }}</span>
      <button class="tb-btn" @click="findPrev" title="Previous match"><Icon name="ArrowUp" :size="14" /></button>
      <button class="tb-btn" @click="findNext" title="Next match"><Icon name="ArrowDown" :size="14" /></button>
      <label class="find-case" title="Match case">
        <input type="checkbox" v-model="caseSensitive" /> Aa
      </label>
      <input v-model="replaceTerm" class="find-input" type="text" placeholder="Replace with" />
      <button class="tb-btn tb-text" @click="doReplace" title="Replace current">Replace</button>
      <button class="tb-btn tb-text" @click="doReplaceAll" title="Replace all">All</button>
      <button class="tb-btn" @click="closeFind" title="Close"><Icon name="Close" :size="14" /></button>
    </div>

    <!-- Focus-mode floating controls -->
    <div v-if="editor && focusMode" class="focus-controls">
      <button class="tb-btn tb-text" :class="{ active: typewriter }" @click="toggleTypewriter"
        title="Typewriter scrolling — keep the current line centered">Typewriter</button>
      <button class="tb-btn" @click="toggleFocus" title="Exit focus mode (Esc)"><Icon name="Close" :size="14" /></button>
    </div>

    <!-- Selection bubble menu (manuscript only) -->
    <bubble-menu v-if="editor && useBubble" :editor="editor" :tippy-options="{ duration: 100 }" class="bubble-menu">
      <button class="tb-btn" :class="{ active: isActive('bold') }" @click="run('toggleBold')" title="Bold"><Icon name="Bold" :size="14" /></button>
      <button class="tb-btn" :class="{ active: isActive('italic') }" @click="run('toggleItalic')" title="Italic"><Icon name="Italic" :size="14" /></button>
      <button class="tb-btn" :class="{ active: isActive('underline') }" @click="run('toggleUnderline')" title="Underline"><Icon name="Underline" :size="14" /></button>
      <button class="tb-btn" :class="{ active: isActive('highlight') }" @click="run('toggleHighlight')" title="Highlight"><Icon name="Highlight" :size="14" /></button>
      <button class="tb-btn" :class="{ active: isActive('link') }" @click="setLink" title="Link"><Icon name="Link" :size="14" /></button>
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
  border-radius: 2px; padding: 0 1px;
}
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
  font-family: var(--font-serif);
  font-size: 15px;
  line-height: 1.65;
  color: var(--ink);
  border: 1px solid var(--border);
  border-radius: 0 0 7px 7px;
  background: var(--surface);
}
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