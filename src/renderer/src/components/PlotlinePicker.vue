<script setup>
// Inline multi-plotline picker. Trigger displays the current plotlines as
// colored chips; clicking opens a popover with a checkbox per plotline.
// Toggling a checkbox emits a `toggle` event with the plotline id —
// parent calls the store action (so undo/redo flows through normally).

import { computed, ref, onBeforeUnmount } from "vue";
import { useProjectStore } from "../stores/project.js";
import Icon from "./Icon.vue";

const props = defineProps({
  modelValue: { type: Array, default: () => [] },  // array of plotline ids
  variant:    { type: String, default: "inline" }, // "inline" | "chip"
});
const emit = defineEmits(["toggle"]);

const project = useProjectStore();
const rootRef = ref(null);
const open = ref(false);

const selected = computed(() => (props.modelValue || [])
  .map((id) => project.plotlineById(id))
  .filter(Boolean));

function toggle(plotlineId) { emit("toggle", plotlineId); }

function close() { open.value = false; }
function onDocClick(e) {
  if (!open.value) return;
  if (rootRef.value && !rootRef.value.contains(e.target)) close();
}
document.addEventListener("mousedown", onDocClick);
onBeforeUnmount(() => document.removeEventListener("mousedown", onDocClick));
</script>

<template>
  <div ref="rootRef" class="plotline-picker" :class="`v-${variant}`" @click.stop>
    <button type="button" class="plotline-picker-trigger" @click="open = !open">
      <template v-if="selected.length === 0">
        <span class="plotline-picker-empty">
          <span class="dot empty-dot" />
          <span>No plotline</span>
        </span>
      </template>
      <template v-else>
        <span v-for="s in selected" :key="s.id" class="plotline-picker-chip">
          <span class="dot" :style="`background:${s.color}`" />
          <span class="chip-label">{{ s.name }}</span>
        </span>
      </template>
      <Icon name="ChevDown" :size="10" class="plotline-picker-chev" :class="{ open }" />
    </button>

    <div v-if="open" class="plotline-picker-menu" role="listbox">
      <div class="plotline-picker-head">Plotlines</div>
      <div v-if="!project.plotlines.length" class="plotline-picker-blank">
        No plotlines yet. Add one in Planning → Plotlines.
      </div>
      <label v-for="s in project.plotlines" :key="s.id"
        class="plotline-picker-row"
        :class="{ checked: modelValue.includes(s.id) }">
        <input type="checkbox"
          :checked="modelValue.includes(s.id)"
          @change="toggle(s.id)" />
        <span class="dot" :style="`background:${s.color}`" />
        <span class="row-label">{{ s.name }}</span>
        <Icon v-if="modelValue.includes(s.id)" name="Check" :size="12" class="row-check" />
      </label>
    </div>
  </div>
</template>

<style scoped>
.plotline-picker { position: relative; display: inline-block; }

.plotline-picker-trigger {
  appearance: none;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 6px;
  padding: 2px 6px;
  display: inline-flex; align-items: center; gap: 6px;
  font: inherit;
  font-size: 11.5px;
  color: var(--ink-2);
  cursor: default;
  max-width: 280px;
}
.plotline-picker-trigger:hover { border-color: var(--border); background: var(--surface-2); color: var(--ink); }
.plotline-picker-trigger:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-soft); }

.plotline-picker-empty {
  display: inline-flex; align-items: center; gap: 5px;
  color: var(--muted);
  font-style: italic;
}
.empty-dot {
  width: 8px; height: 8px;
  border-radius: 2px;
  border: 1px dashed var(--border-strong);
}

.plotline-picker-chip {
  display: inline-flex; align-items: center; gap: 4px;
  padding-right: 4px;
}
.plotline-picker-chip + .plotline-picker-chip { border-left: 1px solid var(--border-soft); padding-left: 6px; }
.plotline-picker-chip .dot {
  width: 8px; height: 8px; border-radius: 2px;
  flex-shrink: 0;
}
.chip-label {
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  max-width: 110px;
}

.plotline-picker-chev { color: var(--muted); transition: transform .12s ease; }
.plotline-picker-chev.open { transform: rotate(180deg); color: var(--ink-2); }

.plotline-picker-menu {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  z-index: 60;
  min-width: 220px;
  max-width: 280px;
  background: var(--surface);
  border: 1px solid var(--border-strong);
  border-radius: 8px;
  box-shadow: var(--shadow-2, 0 8px 24px rgba(0,0,0,0.15));
  padding: 4px 0;
}
.plotline-picker-head {
  padding: 6px 10px 2px;
  font-size: 10px; font-weight: 600;
  text-transform: uppercase; letter-spacing: 0.08em;
  color: var(--muted);
}
.plotline-picker-blank {
  padding: 10px;
  font-size: 12px;
  color: var(--muted);
  font-style: italic;
  text-align: center;
}
.plotline-picker-row {
  display: grid;
  grid-template-columns: auto auto 1fr auto;
  gap: 8px; align-items: center;
  padding: 6px 10px;
  cursor: default;
  font-size: 12.5px;
  color: var(--ink);
}
.plotline-picker-row:hover { background: var(--surface-2); }
.plotline-picker-row.checked { background: var(--accent-soft); color: var(--accent-ink); }
.plotline-picker-row .dot { width: 10px; height: 10px; border-radius: 3px; }
.plotline-picker-row input[type="checkbox"] { width: 13px; height: 13px; accent-color: var(--accent); }
.row-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.row-check { color: var(--accent); }

.plotline-picker.v-chip .plotline-picker-trigger {
  padding: 2px 4px;
  font-size: 11px;
}
</style>
