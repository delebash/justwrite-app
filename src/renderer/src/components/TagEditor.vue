<script setup>
// Reusable tag-chip editor with project-wide typeahead. Used by every
// taggable entity surface (Worldbuilding, Characters, Locations, Objects).
//
// Caller wires:
//   v-model="entity.tags"   — array of strings; emits the full next array
//   :pool="allKnownTags"    — flat array used to populate the suggestion
//                             dropdown. Caller typically derives this by
//                             flat-mapping every same-kind entity's tags.
//   :curated="[{id,label}]" — preferred vocabulary; suggestions appear first
//                             and are marked. Committed tags are canonicalized
//                             to the curated label casing to prevent splintering.
//
// Keyboard:
//   Enter / comma        — commit the typed draft (or the highlighted
//                          suggestion, if it matches what's typed)
//   ↑ / ↓                — navigate the suggestion dropdown
//   Esc                  — close the dropdown
//   Backspace (empty)    — remove the last chip
//
// Duplicates and blanks are silently dropped; the chip × deletes; blur
// commits any pending draft. Suggestions exclude tags already on the
// entity to keep the dropdown signal-only.

import { ref, computed, nextTick } from "vue";
import Icon from "./Icon.vue";

const props = defineProps({
  modelValue:  { type: Array,  default: () => [] },
  pool:        { type: Array,  default: () => [] },
  curated:     { type: Array,  default: () => [] },
  label:       { type: String, default: "Tags" },
  placeholder: { type: String, default: "Add tag…" },
});
const emit = defineEmits(["update:modelValue"]);

const inputRef = ref(null);
const draft = ref("");
const suggestOpen = ref(false);
const suggestIndex = ref(0);

function canonicalize(label) {
  const lower = String(label || "").trim().toLowerCase();
  const match = (props.curated || []).find((c) => c.label.toLowerCase() === lower);
  return match ? match.label : String(label || "").trim();
}

function addTag(raw) {
  const parts = String(raw || "").split(",").map((p) => canonicalize(p)).filter(Boolean);
  if (!parts.length) return;
  const current = props.modelValue || [];
  const lowerCurrent = new Set(current.map((s) => s.toLowerCase()));
  const next = [...current];
  for (const p of parts) if (!lowerCurrent.has(p.toLowerCase())) { next.push(p); lowerCurrent.add(p.toLowerCase()); }
  if (next.length !== current.length) emit("update:modelValue", next);
}
function commitDraft() {
  const d = draft.value;
  draft.value = "";
  suggestOpen.value = false;
  if (d.trim()) addTag(d);
}
function pick(t) {
  draft.value = "";
  suggestOpen.value = false;
  addTag(t);
  nextTick(() => inputRef.value?.focus());
}
function removeAt(i) {
  const next = (props.modelValue || []).slice();
  next.splice(i, 1);
  emit("update:modelValue", next);
}

const suggestions = computed(() => {
  const q = draft.value.trim().toLowerCase();
  const used = new Set((props.modelValue || []).map((s) => s.toLowerCase()));
  const curatedLabelsLower = new Set((props.curated || []).map((c) => c.label.toLowerCase()));
  const curatedItems = (props.curated || [])
    .filter((c) => !used.has(c.label.toLowerCase()))
    .filter((c) => !q || c.label.toLowerCase().includes(q))
    .map((c) => ({ label: c.label, isCurated: true }));
  const poolItems = Array.from(new Set(props.pool || []))
    .filter((t) => !used.has(t.toLowerCase()))
    .filter((t) => !curatedLabelsLower.has(t.toLowerCase()))
    .filter((t) => !q || t.toLowerCase().includes(q))
    .map((t) => ({ label: t, isCurated: false }));
  return [...curatedItems, ...poolItems].slice(0, 8);
});

function isChipCurated(label) {
  const lower = String(label || "").toLowerCase();
  return (props.curated || []).some((c) => c.label.toLowerCase() === lower);
}

function onInput() { suggestOpen.value = true; suggestIndex.value = 0; }
function onFocus() { suggestOpen.value = true; suggestIndex.value = 0; }
function onBlur() {
  // Delay so a click on a suggestion fires before the list unmounts.
  setTimeout(() => {
    suggestOpen.value = false;
    if (draft.value.trim()) commitDraft();
  }, 120);
}
function onKeydown(e) {
  const list = suggestions.value;
  if (e.key === "ArrowDown" && list.length) {
    e.preventDefault();
    suggestOpen.value = true;
    suggestIndex.value = (suggestIndex.value + 1) % list.length;
  } else if (e.key === "ArrowUp" && list.length) {
    e.preventDefault();
    suggestOpen.value = true;
    suggestIndex.value = (suggestIndex.value - 1 + list.length) % list.length;
  } else if (e.key === "Enter") {
    e.preventDefault();
    if (suggestOpen.value && list.length && draft.value.trim() &&
        list[suggestIndex.value]?.label.toLowerCase().includes(draft.value.trim().toLowerCase())) {
      pick(list[suggestIndex.value].label);
    } else {
      commitDraft();
    }
  } else if (e.key === ",") {
    e.preventDefault();
    commitDraft();
  } else if (e.key === "Escape" && suggestOpen.value) {
    e.preventDefault();
    suggestOpen.value = false;
  } else if (e.key === "Backspace" && !draft.value && (props.modelValue || []).length) {
    e.preventDefault();
    removeAt(props.modelValue.length - 1);
  }
}
</script>

<template>
  <div class="tag-editor">
    <span v-if="label" class="tag-editor-label">{{ label }}</span>
    <div class="tag-chip" v-for="(t, i) in (modelValue || [])" :key="t + i"
      :class="{ 'is-curated': isChipCurated(t) }">
      <span>{{ t }}</span>
      <button type="button" class="tag-chip-x" @click="removeAt(i)" aria-label="Remove tag">
        <Icon name="Close" :size="10" />
      </button>
    </div>
    <div class="tag-input-wrap">
      <input ref="inputRef" class="tag-input"
        v-model="draft"
        :placeholder="placeholder"
        @input="onInput"
        @focus="onFocus"
        @blur="onBlur"
        @keydown="onKeydown" />
      <ul v-if="suggestOpen && suggestions.length" class="tag-suggest" role="listbox">
        <li v-for="(s, i) in suggestions" :key="s.label"
          class="tag-suggest-item"
          :class="{ active: i === suggestIndex, 'is-curated': s.isCurated }"
          role="option"
          :aria-selected="i === suggestIndex"
          @mouseenter="suggestIndex = i"
          @mousedown.prevent="pick(s.label)">
          {{ s.label }}
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.tag-editor {
  display: flex; align-items: center; flex-wrap: wrap; gap: 6px;
  padding: 10px 22px;
  border-bottom: 1px solid var(--border);
}
.tag-editor-label {
  font-size: 11.5px; font-weight: 600; letter-spacing: 0.04em;
  text-transform: uppercase; color: var(--muted);
  margin-right: 4px;
}
.tag-chip {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 2px 4px 2px 10px; border-radius: 999px;
  background: var(--surface-3); color: var(--ink);
  font-size: 12px; line-height: 1.4;
  border: 1px solid var(--border);
}
.tag-chip-x {
  display: inline-flex; align-items: center; justify-content: center;
  width: 18px; height: 18px; border: 0; border-radius: 999px;
  background: var(--border); color: var(--ink); cursor: pointer;
  transition: background .12s ease, color .12s ease;
}
.tag-chip-x:hover { background: var(--danger); color: var(--surface); }
.tag-input-wrap {
  position: relative;
  flex: 1; min-width: 140px;
}
.tag-input {
  width: 100%;
  border: 0; background: transparent; outline: none;
  font-size: 13px; color: var(--ink);
  padding: 2px 0;
}
.tag-input::placeholder { color: var(--muted); }
.tag-suggest {
  position: absolute; top: calc(100% + 4px); left: -6px;
  margin: 0; padding: 4px; list-style: none;
  background: var(--surface); border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, .14);
  min-width: 160px; max-width: 280px;
  z-index: 40;
  max-height: 240px; overflow-y: auto;
}
.tag-suggest-item {
  padding: 5px 10px; border-radius: 5px;
  font-size: 13px; color: var(--ink);
  cursor: pointer;
}
.tag-suggest-item.active { background: var(--accent-soft); color: var(--accent-ink); }
.tag-chip.is-curated::before,
.tag-suggest-item.is-curated::before {
  content: "";
  display: inline-block;
  width: 5px; height: 5px;
  border-radius: 999px;
  background: var(--accent);
  flex-shrink: 0;
}
.tag-chip.is-curated { padding-left: 7px; gap: 5px; }
.tag-suggest-item.is-curated { display: flex; align-items: center; gap: 6px; }
</style>
