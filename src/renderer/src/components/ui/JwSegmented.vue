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

import { computed, nextTick } from "vue";
import { useRovingTabindex } from "@renderer/composables/useRovingTabindex.js";

const props = defineProps({
  modelValue:    {},                                       // current value (any)
  options:       { type: Array, required: true },          // [{ value, label, sublabel? }]
  optionLabel:   { type: String, default: "label" },
  optionValue:   { type: String, default: "value" },
  optionSublabel:{ type: String, default: "sublabel" },
  ariaLabel:     { type: String, default: "" },
  size:          { type: String, default: "regular" },     // small | regular
  variant:       { type: String, default: "default" },     // default | connected
});
const emit = defineEmits(["update:modelValue"]);

function valueOf(opt) { return opt?.[props.optionValue]; }
function labelOf(opt) { return opt?.[props.optionLabel]; }
function sublabelOf(opt) { return opt?.[props.optionSublabel]; }

function pick(opt) { emit("update:modelValue", valueOf(opt)); }

// JwSegmented drives tabindex from the *selected* value, not the roving
// focus state, so we use the composable only for key navigation and
// ignore its getTabindex/activeIndex entirely.
const length = computed(() => props.options.length);
const { onKeydown: rovingKeydown, registerItem, focusAt } = useRovingTabindex({
  length,
  orientation: "both",
  loop: true,
  onActivate: (i) => pick(props.options[i]),
});

// Type-ahead: collecting keystrokes to match option labels
let typeBuffer = "";
let typeTimer = null;
function onKeydown(e, idx) {
  // Let the composable handle arrow / Home / End / Enter / Space first.
  // It only calls preventDefault for those keys; others fall through.
  rovingKeydown(e, idx);
  if (e.defaultPrevented) return;

  // Type-ahead: printable single character → match option label
  if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
    clearTimeout(typeTimer);
    typeBuffer += e.key.toLowerCase();
    const match = props.options.findIndex((o) =>
      String(labelOf(o) ?? "").toLowerCase().startsWith(typeBuffer)
    );
    if (match >= 0) {
      e.preventDefault();
      pick(props.options[match]);
      nextTick(() => focusAt(match));
    }
    typeTimer = setTimeout(() => { typeBuffer = ""; }, 600);
  }
}
</script>

<template>
  <div class="jw-seg"
    :class="{
      'jw-seg--small': size === 'small',
      'jw-seg--connected': variant === 'connected',
    }"
    role="radiogroup" :aria-label="ariaLabel">
    <button v-for="(opt, i) in options" :key="valueOf(opt)"
      :ref="(el) => registerItem(i, el)"
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

/* Connected variant — buttons flex to fill the parent and stack
   their <b>label</b><span>sublabel</span> vertically. The 1px gap
   from the base reads as a hairline divider between segments. Caller
   still owns row-layout sizing (e.g. flex: 1; min-width: …). */
.jw-seg--connected { border-radius: 9px; }
.jw-seg--connected button {
  flex: 1;
  flex-direction: column; align-items: center; gap: 1px;
  padding: 6px 4px;
}
.jw-seg--connected button.active {
  color: var(--accent-ink);
  box-shadow: 0 0 0 1px var(--border), 0 1px 2px var(--shadow-soft);
}
.jw-seg--connected button b { font-size: 12px; }
.jw-seg--connected button span { font-size: 10px; color: var(--muted); }
.jw-seg--connected button.active span { color: var(--accent-ink); opacity: .8; }
</style>
