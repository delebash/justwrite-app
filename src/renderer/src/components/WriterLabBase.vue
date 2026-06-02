<script setup>
// WriterLabBase — shared input area + action picker for Writer Lab views.
//
// Props:
//   modelValue: { inputText, loadedChapterId, selectedAction, showPreview }
//
// Emits: update:modelValue (full object replacement)
//
// No "Run" button — the parent decides when and how to run.

import { computed, watch } from "vue";
import { useProjectStore } from "../stores/project.js";
import Icon from "./Icon.vue";
import { ACTION_GROUPS, stripHtml, countWords } from "../services/writerLab.js";
import Button from "primevue/button";

const props = defineProps({
  modelValue: {
    type: Object,
    required: true,
    // { inputText: string, loadedChapterId: string, selectedAction: object|null, showPreview: boolean }
  },
});

const emit = defineEmits(["update:modelValue"]);

const project = useProjectStore();

// ─── Derived state ───────────────────────────────────────────────────────
const wordCount = computed(() => countWords(props.modelValue.inputText));
const charCount = computed(() => props.modelValue.inputText.length);

const isProseAction = computed(() => {
  const a = props.modelValue.selectedAction;
  return a?.kind === "writerAction" || a?.kind === "rule";
});

// Preview toggle disabled when no action or action is analysis
const previewToggleDisabled = computed(() => {
  const a = props.modelValue.selectedAction;
  return !a || a.kind === "analysis";
});

// ─── Patch helpers ────────────────────────────────────────────────────────
function patch(fields) {
  emit("update:modelValue", { ...props.modelValue, ...fields });
}

// ─── Chapter load ─────────────────────────────────────────────────────────
function loadChapter(id) {
  if (!id) {
    patch({ loadedChapterId: "" });
    return;
  }
  const html = project.chapterBody?.[id] || "";
  patch({ loadedChapterId: id, inputText: stripHtml(html).trim() });
}

// If the user edits the text, unlink the loaded chapter
watch(
  () => props.modelValue.inputText,
  (text) => {
    const chId = props.modelValue.loadedChapterId;
    if (!chId) return;
    const html = project.chapterBody?.[chId] || "";
    if (text !== stripHtml(html).trim()) {
      patch({ loadedChapterId: "" });
    }
  },
);

function clearInput() {
  patch({ inputText: "", loadedChapterId: "" });
}

// ─── Action selection ─────────────────────────────────────────────────────
function selectAction(item) {
  // When switching to an analysis action, force showPreview off (it's N/A)
  const showPreview = item.kind === "analysis" ? false : props.modelValue.showPreview;
  patch({ selectedAction: item, showPreview });
}

// ─── Preview toggle ───────────────────────────────────────────────────────
function togglePreview(e) {
  if (previewToggleDisabled.value) return;
  patch({ showPreview: e.target.checked });
}
</script>

<template>
  <!-- ── INPUT ──────────────────────────────────────────────────────── -->
  <section class="card">
    <div class="card-head">
      <span class="t-eyebrow">Input passage</span>
      <div class="stat-row">
        <span class="stat"><b>{{ wordCount }}</b> words</span>
        <span class="stat"><b>{{ charCount }}</b> chars</span>
      </div>
    </div>
    <div class="toolbar">
      <select class="input sm" :value="modelValue.loadedChapterId" @change="(e) => loadChapter(e.target.value)">
        <option value="">Load chapter&#9660;</option>
        <option v-for="ch in project.allChapters" :key="ch.id" :value="ch.id">
          Ch. {{ ch.num }} — {{ ch.title }}
        </option>
      </select>
      <Button severity="secondary" size="small" @click="clearInput" :disabled="!modelValue.inputText">
        <Icon name="Close" :size="12" /> Clear
      </Button>
      <span class="t-muted" style="font-size:11.5px;margin-left:auto">
        Paste prose or load a chapter.
      </span>
    </div>
    <textarea
      :value="modelValue.inputText"
      @input="(e) => patch({ inputText: e.target.value })"
      class="input mono"
      rows="8"
      style="min-height:200px"
      placeholder="Paste manuscript text here, or load a chapter above…"
    />
  </section>

  <!-- ── ACTION PICKER ──────────────────────────────────────────────── -->
  <section class="card">
    <div class="card-head">
      <span class="t-eyebrow">Operation</span>
      <span v-if="modelValue.selectedAction" class="selected-badge">{{ modelValue.selectedAction.label }}</span>
      <label
        class="toggle-label"
        :class="{ 'toggle-label--dim': previewToggleDisabled }"
        :title="previewToggleDisabled ? 'Preview only available for prose actions' : 'Show preview while streaming'"
        style="margin-left:auto"
      >
        <input
          type="checkbox"
          :checked="modelValue.showPreview"
          :disabled="previewToggleDisabled"
          @change="togglePreview"
        />
        Show preview
      </label>
    </div>
    <div v-for="group in ACTION_GROUPS" :key="group.label" class="action-group">
      <div class="action-group-label">{{ group.label }}</div>
      <div class="action-grid">
        <button
          v-for="item in group.items"
          :key="item.key"
          class="action-card"
          :class="{ 'action-card--active': modelValue.selectedAction?.key === item.key && modelValue.selectedAction?.kind === item.kind }"
          @click="selectAction(item)"
        >
          <div class="action-card-label">{{ item.label }}</div>
          <div class="action-card-desc">{{ item.description }}</div>
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* ── Layout ─────────────────────────────────────────────────────────── */
.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow: hidden;
  /* When this component renders inside a flex-column scrollarea (the
     Writer Lab views), the default flex-shrink: 1 would compress the
     action-picker section and clip the Analysis group at the bottom.
     Disable shrinking so content overflows naturally and the
     scrollarea takes over. */
  flex-shrink: 0;
}

.card-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px 8px;
  border-bottom: 1px solid var(--border);
  background: var(--surface-2);
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border-bottom: 1px solid var(--border);
  flex-wrap: wrap;
}

textarea.input.mono {
  font-family: var(--font-mono);
  font-size: 12.5px;
  line-height: 1.55;
  resize: vertical;
  width: 100%;
  box-sizing: border-box;
  border: 0;
  border-radius: 0;
  padding: 12px 14px;
  background: var(--surface);
}

/* ── Stats ──────────────────────────────────────────────────────────── */
.stat-row {
  display: flex;
  gap: 10px;
  margin-left: auto;
}

.stat {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--muted);
}

.selected-badge {
  font-size: 11.5px;
  font-family: var(--font-mono);
  color: var(--accent-ink);
  background: var(--accent-soft);
  padding: 1px 7px;
  border-radius: 99px;
}

/* ── Action picker ───────────────────────────────────────────────────── */
.action-group {
  padding: 12px 14px 8px;
  border-bottom: 1px solid var(--border);
}

.action-group:last-child {
  border-bottom: 0;
}

.action-group-label {
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--muted);
  margin-bottom: 8px;
}

.action-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
  gap: 7px;
}

.action-card {
  text-align: left;
  padding: 9px 11px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--surface-2);
  cursor: pointer;
  transition: border-color 0.12s, background 0.12s;
}

.action-card:hover {
  border-color: var(--accent);
  background: var(--accent-soft);
}

.action-card--active {
  outline: 2px solid var(--accent);
  background: var(--accent-soft);
  border-color: var(--accent);
}

.action-card-label {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--ink);
  margin-bottom: 3px;
}

.action-card-desc {
  font-size: 11px;
  color: var(--muted);
  line-height: 1.4;
}

/* ── Preview toggle ──────────────────────────────────────────────────── */
.toggle-label {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11.5px;
  color: var(--ink);
  cursor: pointer;
  white-space: nowrap;
}

.toggle-label--dim {
  opacity: 0.45;
  pointer-events: none;
}
</style>
