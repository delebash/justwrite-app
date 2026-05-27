<script setup>
import { watch, onBeforeUnmount } from "vue";
import { useEditor, EditorContent } from "@tiptap/vue-3";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Icon from "./Icon.vue";

const props = defineProps({
  modelValue: { type: String, default: "" },
  placeholder: { type: String, default: "Start writing…" },
  autofocus: { type: Boolean, default: false },
  // "manuscript" — full-bleed editor with serif manuscript chrome (chapters).
  // "inline" — sits inside any container; toolbar above, no manuscript wrapper.
  variant: { type: String, default: "manuscript" },
  // Visible toolbar buttons. `["bold","italic","h1","h2","quote","list","undo","redo"]`
  toolbar: { type: Array, default: () => ["bold", "italic", "h1", "h2", "quote", "list", "undo", "redo"] },
  minHeight: { type: [Number, String], default: null },
});

const emit = defineEmits(["update:modelValue", "change"]);

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

const editor = useEditor({
  content: toHtml(props.modelValue),
  autofocus: props.autofocus,
  extensions: [
    StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
    Placeholder.configure({ placeholder: props.placeholder }),
  ],
  editorProps: {
    attributes: { class: "tiptap-content" },
  },
  onUpdate({ editor }) {
    const html = editor.getHTML();
    emit("update:modelValue", html);
    emit("change", html);
  },
});

// Keep external value changes in sync (e.g. switching the selected entity).
watch(() => props.modelValue, (val) => {
  if (!editor.value) return;
  const incoming = toHtml(val);
  if (incoming !== editor.value.getHTML()) {
    editor.value.commands.setContent(incoming, false);
  }
});

onBeforeUnmount(() => editor.value?.destroy());

// Toolbar helpers — bound to the editor commands.
const run = (cmd) => editor.value?.chain().focus()[cmd]().run();
const isActive = (name, attrs) => editor.value?.isActive(name, attrs) || false;
const show = (b) => props.toolbar.includes(b);

defineExpose({ editor });
</script>

<template>
  <div class="rich-editor" :class="`rich-editor--${variant}`">
    <div class="editor-toolbar" v-if="editor">
      <div class="group" v-if="show('bold') || show('italic')">
        <button v-if="show('bold')" class="tb-btn" :class="{ active: isActive('bold') }" @click="run('toggleBold')" title="Bold">
          <Icon name="Bold" :size="14" />
        </button>
        <button v-if="show('italic')" class="tb-btn" :class="{ active: isActive('italic') }" @click="run('toggleItalic')" title="Italic">
          <Icon name="Italic" :size="14" />
        </button>
      </div>
      <div class="group" v-if="show('h1') || show('h2')">
        <button v-if="show('h1')" class="tb-btn" :class="{ active: isActive('heading', { level: 1 }) }"
          @click="editor.chain().focus().toggleHeading({ level: 1 }).run()" title="Heading 1">H1</button>
        <button v-if="show('h2')" class="tb-btn" :class="{ active: isActive('heading', { level: 2 }) }"
          @click="editor.chain().focus().toggleHeading({ level: 2 }).run()" title="Heading 2">H2</button>
      </div>
      <div class="group" v-if="show('quote') || show('list')">
        <button v-if="show('quote')" class="tb-btn" :class="{ active: isActive('blockquote') }" @click="run('toggleBlockquote')" title="Block quote">
          <Icon name="Quote" :size="14" />
        </button>
        <button v-if="show('list')" class="tb-btn" :class="{ active: isActive('bulletList') }" @click="run('toggleBulletList')" title="Bullet list">
          <Icon name="List" :size="14" />
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

    <div v-if="variant === 'manuscript'" class="manuscript scrollarea">
      <div class="manuscript-inner">
        <editor-content :editor="editor" />
      </div>
    </div>
    <div v-else class="inline-editor-body"
      :style="minHeight ? { minHeight: typeof minHeight === 'number' ? `${minHeight}px` : minHeight } : null">
      <editor-content :editor="editor" />
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

/* Inline variant — used inside cards, alongside other fields. */
.rich-editor--inline .editor-toolbar {
  padding: 4px 6px;
  border: 1px solid var(--border);
  border-radius: 7px 7px 0 0;
  border-bottom: 0;
  background: var(--surface-2);
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
</style>
