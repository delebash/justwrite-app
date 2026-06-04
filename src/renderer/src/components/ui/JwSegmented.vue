<script setup>
// Segmented radio control. Replaces the dozens of bespoke
// `<div class="size-seg/seg/mode-seg">` + `<button v-for>` clusters that
// were rolled inline across SettingsView, EditorSettingsModal, etc.
//
// What it provides over the inline version:
//   - role="radiogroup" wrapper + role="radio" buttons with aria-checked
//   - roving tabindex (only the selected option is in the tab order;
//     arrow keys move within the group)
//   - Arrow keys (←/→/↑/↓) cycle and select; Home/End jump to ends
//   - :focus-visible ring driven from --accent-soft
//
// API mirrors JwSelect for familiarity:
//   v-model="value"
//   :options="[{ value, label, sublabel? }, ...]"
//   :option-label="label"  (default)
//   :option-value="value"  (default)
//   :option-sublabel="sublabel"  (default) — optional small text shown below label
//   :aria-label="…"   — label announced for the whole group
//
// Custom button content via slot:
//   <template #option="{ option, selected }">…</template>

import { nextTick, ref } from "vue";

const props = defineProps({
  modelValue:    {},                                       // current value (any)
  options:       { type: Array, required: true },          // [{ value, label, sublabel? }]
  optionLabel:   { type: String, default: "label" },
  optionValue:   { type: String, default: "value" },
  optionSublabel:{ type: String, default: "sublabel" },
  ariaLabel:     { type: String, default: "" },
  size:          { type: String, default: "regular" },     // small | regular
});
const emit = defineEmits(["update:modelValue"]);

const wrapperRef = ref(null);

function valueOf(opt) { return opt?.[props.optionValue]; }
function labelOf(opt) { return opt?.[props.optionLabel]; }
function sublabelOf(opt) { return opt?.[props.optionSublabel]; }

function pick(opt) { emit("update:modelValue", valueOf(opt)); }

function focusAt(i) {
  const wrap = wrapperRef.value;
  if (!wrap) return;
  const btns = wrap.querySelectorAll('button[role="radio"]');
  btns[i]?.focus();
}

function onKeydown(e, idx) {
  const max = props.options.length - 1;
  let target = idx;
  if (e.key === "ArrowRight" || e.key === "ArrowDown") target = idx >= max ? 0 : idx + 1;
  else if (e.key === "ArrowLeft" || e.key === "ArrowUp") target = idx <= 0 ? max : idx - 1;
  else if (e.key === "Home") target = 0;
  else if (e.key === "End") target = max;
  else return;
  e.preventDefault();
  pick(props.options[target]);
  nextTick(() => focusAt(target));
}
</script>

<template>
  <div ref="wrapperRef" class="jw-seg" :class="{ 'jw-seg--small': size === 'small' }"
    role="radiogroup" :aria-label="ariaLabel">
    <button v-for="(opt, i) in options" :key="valueOf(opt)"
      type="button"
      role="radio"
      :aria-checked="modelValue === valueOf(opt)"
      :tabindex="modelValue === valueOf(opt) ? 0 : -1"
      :class="{ active: modelValue === valueOf(opt) }"
      @click="pick(opt)"
      @keydown="onKeydown($event, i)">
      <slot name="option" :option="opt" :selected="modelValue === valueOf(opt)">
        <b>{{ labelOf(opt) }}</b>
        <span v-if="sublabelOf(opt)">{{ sublabelOf(opt) }}</span>
      </slot>
    </button>
  </div>
</template>

<style scoped>
.jw-seg {
  display: inline-flex;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 2px;
  gap: 1px;
}
.jw-seg button {
  appearance: none;
  background: transparent;
  border: 0;
  padding: 6px 12px;
  border-radius: 6px;
  cursor: pointer;
  color: var(--ink-2);
  font: inherit;
  display: inline-flex; align-items: center; gap: 6px;
  transition: background .12s ease, color .12s ease;
  white-space: nowrap;
}
.jw-seg button:hover { background: var(--surface-3); color: var(--ink); }
.jw-seg button.active {
  background: var(--surface);
  color: var(--ink);
  box-shadow: 0 1px 2px rgba(0, 0, 0, .06);
}
.jw-seg button:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--accent-soft);
}
.jw-seg button b { font-weight: 600; }
.jw-seg button span { font-size: 11px; color: var(--muted); }
.jw-seg--small button { padding: 4px 8px; font-size: 12px; }
</style>
