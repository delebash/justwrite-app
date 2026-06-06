<script setup>
// Single-select combobox: typeable input + click-to-open dropdown.
// Two modes governed by props:
//   - searchable=true (default): user can type to filter the list
//   - freeText=true: typed values that don't match any item are still
//     committed as the modelValue (use for "pick a known model OR type
//     a custom one"). Implies searchable.
//
// Items can be plain strings or objects; supply `itemValue` / `itemLabel`
// to point at the right object fields.

import { ref, reactive, computed, onBeforeUnmount, nextTick, watch } from "vue";
import Icon from "./Icon.vue";

const props = defineProps({
  modelValue: { type: [String, Number], default: "" },
  items: { type: Array, default: () => [] },
  itemValue: { type: String, default: "value" },
  itemLabel: { type: String, default: "label" },
  freeText: { type: Boolean, default: false },
  searchable: { type: Boolean, default: true },
  placeholder: { type: String, default: "" },
  disabled: { type: Boolean, default: false },
  chevTitle: { type: String, default: "" },
});
const emit = defineEmits(["update:modelValue"]);

function valueOf(item) {
  return typeof item === "string" ? item : item?.[props.itemValue];
}
function labelOf(item) {
  if (typeof item === "string") return item;
  return item?.[props.itemLabel] ?? String(item?.[props.itemValue] ?? "");
}

const selectedItem = computed(() =>
  props.items.find((it) => valueOf(it) === props.modelValue),
);

const state = reactive({ open: false, hover: -1 });
const filterText = ref("");
let boxEl = null;
let listEl = null;

const isSearchable = computed(() => props.searchable || props.freeText);

// What the <input> shows.
//   - dropdown open + searchable → the active filter text (so the user
//     can see what they're typing)
//   - freeText + closed → the raw modelValue (no item required)
//   - otherwise (closed-set picker, closed) → the matched item's label
const displayValue = computed(() => {
  if (state.open && isSearchable.value) return filterText.value;
  if (props.freeText) return String(props.modelValue ?? "");
  return selectedItem.value ? labelOf(selectedItem.value) : "";
});

const filtered = computed(() => {
  const q = (state.open && isSearchable.value ? filterText.value : "").trim().toLowerCase();
  if (!q) return props.items;
  return props.items.filter((it) => labelOf(it).toLowerCase().includes(q));
});

function openIt() {
  if (props.disabled) return;
  if (!props.items.length && !props.freeText) return;
  state.open = true;
  filterText.value = "";
  state.hover = Math.max(0, props.items.findIndex((it) => valueOf(it) === props.modelValue));
  nextTick(scrollActive);
}
function closeIt() { state.open = false; filterText.value = ""; }
function toggleIt() { state.open ? closeIt() : openIt(); }
function pick(item) {
  emit("update:modelValue", valueOf(item));
  closeIt();
}

function onInput(e) {
  if (!isSearchable.value) return;
  filterText.value = e.target.value;
  if (props.freeText) emit("update:modelValue", e.target.value);
  if (!state.open) state.open = true;
  state.hover = 0;
}

function onKey(e) {
  if (e.key === "ArrowDown") {
    e.preventDefault();
    if (!state.open) return openIt();
    state.hover = Math.min(filtered.value.length - 1, state.hover + 1);
    scrollActive();
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    if (!state.open) return openIt();
    state.hover = Math.max(0, state.hover - 1);
    scrollActive();
  } else if (e.key === "Enter") {
    if (state.open && filtered.value[state.hover]) {
      e.preventDefault();
      pick(filtered.value[state.hover]);
    }
  } else if (e.key === "Escape") {
    if (state.open) { e.preventDefault(); closeIt(); }
  }
}

function scrollActive() {
  nextTick(() => {
    const el = listEl?.children?.[state.hover];
    el?.scrollIntoView({ block: "nearest" });
  });
}

function onDocClick(e) {
  if (state.open && boxEl && !boxEl.contains(e.target)) closeIt();
}
document.addEventListener("mousedown", onDocClick);
onBeforeUnmount(() => document.removeEventListener("mousedown", onDocClick));

// Keep hover in range when the item list changes while open.
watch(() => filtered.value.length, (n) => {
  if (state.hover >= n) state.hover = Math.max(0, n - 1);
});
</script>

<template>
  <div class="combobox" :class="{ open: state.open, disabled }" :ref="(el) => (boxEl = el)">
    <input class="input combobox-input"
      :value="displayValue"
      :readonly="!isSearchable"
      :disabled="disabled"
      :placeholder="placeholder"
      @input="onInput"
      @focus="openIt"
      @click="openIt"
      @keydown="onKey" />
    <button type="button" class="combobox-chev"
      :disabled="disabled || (!items.length && !freeText)"
      v-tooltip.bottom="chevTitle || 'Toggle options'"
      :aria-label="chevTitle || 'Toggle options'"
      @mousedown.prevent
      @click="toggleIt">
      <Icon name="ChevDown" :size="13" class="combobox-chev-icon" />
    </button>
    <ul v-if="state.open && filtered.length" :ref="(el) => (listEl = el)" class="combobox-list"
      role="listbox">
      <li v-for="(item, i) in filtered" :key="valueOf(item)"
        role="option"
        :aria-selected="valueOf(item) === modelValue"
        :class="{ active: i === state.hover, selected: valueOf(item) === modelValue }"
        @mousedown.prevent="pick(item)"
        @mouseenter="state.hover = i">
        <slot name="item" :item="item" :label="labelOf(item)">{{ labelOf(item) }}</slot>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.combobox { position: relative; display: flex; }
.combobox.disabled { opacity: 0.55; pointer-events: none; }
.combobox-input { width: 100%; padding-right: 30px; }
.combobox-chev {
  position: absolute;
  top: 50%;
  right: 4px;
  transform: translateY(-50%);
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
  border: 0;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  border-radius: 4px;
}
.combobox-chev:hover:not(:disabled) { color: var(--ink); background: var(--surface-3); }
.combobox-chev:disabled { opacity: 0.35; cursor: not-allowed; }
.combobox-chev-icon { transition: transform 0.15s ease; }
.combobox.open .combobox-chev-icon { transform: rotate(180deg); }
.combobox-list {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  z-index: 50;
  margin: 0;
  padding: 4px;
  list-style: none;
  background: var(--surface);
  border: 1px solid var(--border-strong, var(--border));
  border-radius: 8px;
  box-shadow: 0 8px 24px var(--shadow-medium);
  max-height: 240px;
  overflow-y: auto;
}
.combobox-list li {
  padding: 6px 10px;
  font-size: 12.5px;
  border-radius: 5px;
  cursor: pointer;
  color: var(--ink);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.combobox-list li.active { background: var(--surface-3); }
.combobox-list li.selected { color: var(--accent-ink, var(--accent)); font-weight: 600; }
.combobox-list li.selected.active { background: var(--accent-soft); }
</style>
