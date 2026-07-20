<script setup>
// Shared status picker. Reads the project-wide, user-definable status palette and
// lets any entity detail view set its status. Renders a colored pill; the menu
// lists every defined status (in its color), an Unset option, and a quick "New
// status…" that adds to the palette and selects it. Recolor/rename/delete live
// in Settings → Project.
//
// Built on Reka UI Select primitives (2026-07-20) — the hand-rolled listbox +
// raw document-mousedown dismissal it replaced had NO keyboard support. Reka
// gives arrow-key nav, type-ahead, Enter/Esc, focus management, and full ARIA
// for free. Visual parity is preserved (color dots, colored labels, the
// "New status…" footer). The create action is a sentinel-valued item: selecting
// it (mouse OR keyboard) opens the prompt instead of setting a status — the same
// pattern the kit's own shells use to compose behavior onto Reka primitives.

import { computed } from "vue";
import {
  SelectRoot, SelectTrigger, SelectPortal, SelectContent, SelectViewport,
  SelectItem, SelectItemText, SelectItemIndicator,
} from "reka-ui";
import { promptDialog, Icon } from "@delebash/llm-ui";
import { useProjectStore } from "../stores/project.js";

const props = defineProps({
  modelValue: { type: String, default: "" },
});
const emit = defineEmits(["update:modelValue"]);
const project = useProjectStore();

// Reka reserves "" as its no-selection value, so "Unset" rides an internal
// sentinel; "New status…" rides another (selecting it opens the prompt).
const UNSET_SENTINEL = "__status_unset__";
const NEW_SENTINEL = "__status_new__";

// "Unset" is a synthetic, non-editable status: items with no status id still
// display a real value ("Unset") in the pill rather than a placeholder hint.
const UNSET = { label: "Status Unset", color: "var(--muted)" };
const real = computed(() => project.statusById(props.modelValue));
const current = computed(() => real.value || UNSET);

// Round-trip the model through the sentinel for the empty ("unset") value.
const selected = computed({
  get() {
    return props.modelValue ? String(props.modelValue) : UNSET_SENTINEL;
  },
  set(v) {
    if (v === NEW_SENTINEL) { addNew(); return; }          // don't change the value
    emit("update:modelValue", v === UNSET_SENTINEL ? "" : v);
  },
});

// Curated, legible hues for newly-added statuses (defaults keep their
// theme-adaptive CSS vars).
const PALETTE = [
  "oklch(0.7 0.13 75)",  "oklch(0.65 0.13 30)",  "oklch(0.6 0.13 150)",
  "oklch(0.65 0.13 250)", "oklch(0.66 0.14 320)", "oklch(0.68 0.13 200)",
  "oklch(0.64 0.14 290)", "oklch(0.7 0.12 120)",
];

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
}
</script>

<template>
  <SelectRoot v-model="selected">
    <SelectTrigger class="status-pill" aria-label="Status" aria-haspopup="listbox">
      <span class="status-pill-dot" :class="{ 'status-pill-dot--empty': !real }" :style="real ? { background: current.color } : null" />
      <span class="status-pill-label" :style="{ color: current.color }">{{ current.label }}</span>
      <Icon name="ChevDown" :size="13" class="status-pill-chev" />
    </SelectTrigger>

    <SelectPortal>
      <SelectContent class="status-menu" position="popper" align="end" :side-offset="4" :collision-padding="8">
        <SelectViewport>
          <SelectItem :value="UNSET_SENTINEL" class="status-opt status-opt-muted">
            <span class="status-pill-dot status-pill-dot--empty" />
            <SelectItemText class="status-opt-label">Status Unset</SelectItemText>
            <SelectItemIndicator class="status-opt-check"><Icon name="Check" :size="13" /></SelectItemIndicator>
          </SelectItem>

          <div class="status-menu-sep" />

          <SelectItem v-for="s in project.statuses" :key="s.id" :value="s.id"
            class="status-opt" :style="{ color: s.color }">
            <span class="status-pill-dot" :style="{ background: s.color }" />
            <SelectItemText class="status-opt-label">{{ s.label }}</SelectItemText>
            <SelectItemIndicator class="status-opt-check"><Icon name="Check" :size="13" /></SelectItemIndicator>
          </SelectItem>

          <div class="status-menu-sep" />

          <SelectItem :value="NEW_SENTINEL" class="status-opt status-opt-muted">
            <Icon name="Plus" :size="13" />
            <SelectItemText class="status-opt-label">New status…</SelectItemText>
          </SelectItem>
        </SelectViewport>
      </SelectContent>
    </SelectPortal>
  </SelectRoot>
</template>

<style scoped>
.status-pill {
  appearance: none; cursor: pointer;
  display: inline-flex; align-items: center; gap: 7px;
  height: 30px; padding: 0 9px;
  border: 1px solid var(--border); border-radius: 8px;
  background: var(--surface); font: inherit; font-size: 12.5px;
  color: var(--ink);
}
.status-pill:hover { border-color: var(--border-strong); background: var(--surface-2); }
.status-pill[data-state="open"] { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
.status-pill-dot { width: 9px; height: 9px; border-radius: 50%; background: var(--border-strong); flex: none; }
.status-pill-dot--empty { background: transparent; border: 1px dashed var(--border-strong); }
.status-pill-label { font-weight: 500; }
.status-pill-chev { color: var(--muted); transition: transform .15s ease; }
.status-pill[data-state="open"] .status-pill-chev { transform: rotate(180deg); }

.status-menu {
  z-index: 40;
  min-width: 180px; padding: 4px;
  background: var(--surface); border: 1px solid var(--border-strong);
  border-radius: 9px; box-shadow: 0 8px 28px rgba(0, 0, 0, .18);
}
.status-opt {
  appearance: none; cursor: pointer; width: 100%;
  display: flex; align-items: center; gap: 9px;
  padding: 7px 9px; border: 0; border-radius: 6px;
  background: none; font: inherit; font-size: 13px; text-align: left;
  color: var(--ink); outline: none;
  user-select: none;
}
.status-opt[data-highlighted] { background: var(--surface-2); }
.status-opt[data-state="checked"] { background: var(--surface-2); }
.status-opt-label { flex: 1; font-weight: 500; }
.status-opt-check { color: var(--accent); display: inline-flex; }
.status-opt-muted { color: var(--muted); font-size: 12.5px; }
.status-opt-muted .status-opt-label { font-weight: 500; }
.status-menu-sep { height: 1px; background: var(--border-soft); margin: 4px 2px; }
</style>
