<script setup>
// Shared status picker. Reads the project-wide, user-definable status
// palette and lets any entity detail view set its status. Renders a
// colored pill; the menu lists every defined status (in its color), an
// Unset option, and a quick "New status…" that adds to the palette and
// selects it. Recolor/rename/delete live in Settings → Project.

import { ref, computed, onBeforeUnmount } from "vue";
import { useProjectStore } from "../stores/project.js";
import { promptDialog } from "../services/dialog.js";
import Icon from "./Icon.vue";

const props = defineProps({
  modelValue: { type: String, default: "" },
});
const emit = defineEmits(["update:modelValue"]);
const project = useProjectStore();

const open = ref(false);
const rootEl = ref(null);
// "Unset" is a synthetic, non-editable status: items with no status id
// still display a real value ("Unset") in the pill and the sidebar
// rather than a placeholder hint. It never appears in Settings.
const UNSET = { label: "Status Unset", color: "var(--muted)" };
const real = computed(() => project.statusById(props.modelValue));
const current = computed(() => real.value || UNSET);

// Curated, legible hues for newly-added statuses (defaults keep their
// theme-adaptive CSS vars).
const PALETTE = [
  "oklch(0.7 0.13 75)",  "oklch(0.65 0.13 30)",  "oklch(0.6 0.13 150)",
  "oklch(0.65 0.13 250)", "oklch(0.66 0.14 320)", "oklch(0.68 0.13 200)",
  "oklch(0.64 0.14 290)", "oklch(0.7 0.12 120)",
];

function toggle() { open.value = !open.value; }
function close() { open.value = false; }
function pick(id) { emit("update:modelValue", id); close(); }
async function addNew() {
  const label = await promptDialog({
    title: "New status",
    label: "Status name",
    placeholder: "e.g. Polishing",
    confirmLabel: "Add status",
  });
  if (!label) return;
  const color = PALETTE[project.statuses.length % PALETTE.length];
  const id = project.addStatusDef({ label, color });
  emit("update:modelValue", id);
  close();
}

function onDocClick(e) {
  if (open.value && rootEl.value && !rootEl.value.contains(e.target)) close();
}
document.addEventListener("mousedown", onDocClick);
onBeforeUnmount(() => document.removeEventListener("mousedown", onDocClick));
</script>

<template>
  <div class="status-select" ref="rootEl">
    <button type="button" class="status-pill" :class="{ open }" :aria-expanded="open" aria-haspopup="listbox" @click="toggle">
      <span class="status-pill-dot" :class="{ 'status-pill-dot--empty': !real }" :style="real ? { background: current.color } : null" />
      <span class="status-pill-label" :style="{ color: current.color }">{{ current.label }}</span>
      <Icon name="ChevDown" :size="13" class="status-pill-chev" />
    </button>

    <div v-if="open" class="status-menu" role="listbox" :aria-label="`Status for item`">
      <button type="button" role="option" :aria-selected="!modelValue" class="status-opt status-opt-muted" :class="{ active: !modelValue }" @click="pick('')">
        <span class="status-pill-dot status-pill-dot--empty" />
        <span class="status-opt-label">Status Unset</span>
        <Icon v-if="!modelValue" name="Check" :size="13" class="status-opt-check" />
      </button>

      <div class="status-menu-sep" />

      <button v-for="s in project.statuses" :key="s.id" type="button"
        role="option" :aria-selected="s.id === modelValue"
        class="status-opt" :class="{ active: s.id === modelValue }" @click="pick(s.id)">
        <span class="status-pill-dot" :style="{ background: s.color }" />
        <span class="status-opt-label" :style="{ color: s.color }">{{ s.label }}</span>
        <Icon v-if="s.id === modelValue" name="Check" :size="13" class="status-opt-check" />
      </button>

      <div class="status-menu-sep" />

      <button type="button" class="status-opt status-opt-muted" @click="addNew">
        <Icon name="Plus" :size="13" /> <span>New status…</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.status-select { position: relative; display: inline-block; }

.status-pill {
  appearance: none; cursor: pointer;
  display: inline-flex; align-items: center; gap: 7px;
  height: 30px; padding: 0 9px;
  border: 1px solid var(--border); border-radius: 8px;
  background: var(--surface); font: inherit; font-size: 12.5px;
  color: var(--ink);
}
.status-pill:hover { border-color: var(--border-strong); background: var(--surface-2); }
.status-pill.open { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
.status-pill-dot { width: 9px; height: 9px; border-radius: 50%; background: var(--border-strong); flex: none; }
.status-pill-dot--empty { background: transparent; border: 1px dashed var(--border-strong); }
.status-pill-label { font-weight: 500; }
.status-pill-chev { color: var(--muted); transition: transform .15s ease; }
.status-pill.open .status-pill-chev { transform: rotate(180deg); }

.status-menu {
  position: absolute; top: calc(100% + 4px); right: 0; z-index: 40;
  min-width: 180px; padding: 4px;
  background: var(--surface); border: 1px solid var(--border-strong);
  border-radius: 9px; box-shadow: 0 8px 28px rgba(0, 0, 0, .18);
}
.status-opt {
  appearance: none; cursor: pointer; width: 100%;
  display: flex; align-items: center; gap: 9px;
  padding: 7px 9px; border: 0; border-radius: 6px;
  background: none; font: inherit; font-size: 13px; text-align: left;
  color: var(--ink);
}
.status-opt:hover { background: var(--surface-2); }
.status-opt.active { background: var(--surface-2); }
.status-opt-label { flex: 1; font-weight: 500; }
.status-opt-check { color: var(--accent); }
.status-opt-muted { color: var(--muted); font-size: 12.5px; }
.status-menu-sep { height: 1px; background: var(--border-soft); margin: 4px 2px; }
</style>
