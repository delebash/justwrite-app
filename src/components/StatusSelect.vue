<script setup>
// Shared status picker. Reads the project-wide, user-definable status palette and
// lets any entity detail view set its status. Renders a colored pill; the menu
// lists every defined status (in its color), an Unset option, and a quick "New
// status…" that adds to the palette and selects it. Recolor/rename/delete live
// in Settings → Project.
//
// Built on Quasar's QSelect (the kit's controls on Quasar — the kit's
// docs/plans/2026-10-09-kit-controls-on-quasar.md, slice 7b; Reka UI's Select
// before it, 2026-07-20, which replaced a hand-rolled listbox with NO keyboard
// support). QSelect gives arrow-key nav, type-ahead, Enter/Esc, focus management
// and the ARIA; the pill is its control, the menu its list. Visual parity is
// preserved (color dots, colored labels, the "New status…" footer), and the items
// keep Reka's state attributes (data-highlighted, data-state) the styles read.
// "New status…" is an option of its own: picking it (mouse OR keyboard) opens the
// prompt instead of setting a status. The two rules are disabled options, so the
// keys pass over them.

import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { QSelect } from "quasar";
import { promptDialog, Icon, useModalPopup } from "@delebash/llm-ui";
import { useProjectStore } from "../stores/project.js";

const props = defineProps({
  modelValue: { type: String, default: "" },
});
const emit = defineEmits(["update:modelValue"]);
const project = useProjectStore();
const { t } = useI18n();

const NEW_SENTINEL = "__status_new__";

// "Unset" is a synthetic, non-editable status: items with no status id still
// display a real value ("Unset") in the pill rather than a placeholder hint.
const UNSET = { label: "Status Unset", color: "var(--muted)" };
const real = computed(() => project.statusById(props.modelValue));
const current = computed(() => real.value || UNSET);

const options = computed(() => [
  { value: "", label: t("status.unset"), unset: true },
  { value: "__rule_1__", rule: true, disable: true },
  ...project.statuses.map((s) => ({ value: s.id, label: s.label, color: s.color })),
  { value: "__rule_2__", rule: true, disable: true },
  { value: NEW_SENTINEL, label: t("status.new"), add: true },
]);

function pick(v) {
  if (v === NEW_SENTINEL) { addNew(); return; } // don't change the value
  emit("update:modelValue", v ?? "");
}

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

const open = ref(false);
// while the list is open the page behind takes no pointer, as under Reka (the kit's useModalPopup)
useModalPopup(open);
// the option slot gets QItem's props; the item here is a plain element, so only these reach it
function itemAttrs(p) {
  return {
    id: p.id, role: p.role, tabindex: p.tabindex,
    "aria-selected": p["aria-selected"], "aria-setsize": p["aria-setsize"], "aria-posinset": p["aria-posinset"],
    onClick: p.onClick, onPointermove: p.onPointermove,
  };
}
</script>

<template>
  <QSelect
    :model-value="modelValue || ''"
    :options="options"
    option-label="label"
    option-value="value"
    emit-value
    map-options
    borderless
    dense
    hide-bottom-space
    hide-dropdown-icon
    options-dense
    behavior="menu"
    popup-content-class="status-menu"
    menu-anchor="bottom right"
    menu-self="top right"
    :menu-offset="[0, 4]"
    :transition-duration="0"
    :aria-label="$t('status.ariaLabel')"
    class="status-pill"
    :class="{ 'is-open': open }"
    @update:model-value="pick"
    @popup-show="open = true"
    @popup-hide="open = false"
  >
    <template #selected>
      <span class="status-pill-dot" :class="{ 'status-pill-dot--empty': !real }" :style="real ? { background: current.color } : null" />
      <span class="status-pill-label" :style="{ color: current.color }">{{ current.label }}</span>
    </template>
    <template #append>
      <Icon name="ChevDown" :size="13" class="status-pill-chev" />
    </template>
    <template #option="{ itemProps, opt, selected, focused }">
      <div v-if="opt.rule" class="status-menu-sep" role="separator" />
      <div
        v-else
        v-bind="itemAttrs(itemProps)"
        class="status-opt"
        :class="{ 'status-opt-muted': opt.unset || opt.add }"
        :style="opt.color ? { color: opt.color } : null"
        :data-highlighted="focused ? '' : undefined"
        :data-state="selected && !opt.add ? 'checked' : 'unchecked'"
      >
        <Icon v-if="opt.add" name="Plus" :size="13" />
        <span v-else class="status-pill-dot" :class="{ 'status-pill-dot--empty': opt.unset }" :style="opt.color ? { background: opt.color } : null" />
        <span class="status-opt-label">{{ opt.label }}</span>
        <span v-if="selected && !opt.add" class="status-opt-check"><Icon name="Check" :size="13" /></span>
      </div>
    </template>
  </QSelect>
</template>

<style scoped>
/* QSelect's root holds the pill; its control (where QSelect hangs the menu) is the pill's box,
   the wrappers around it pass through, and the value and the chevron sit in the box's row. */
.status-pill {
  display: inline-flex; vertical-align: middle; cursor: pointer;
  font: inherit; font-size: 12.5px; color: var(--ink);
  letter-spacing: normal; word-spacing: normal; text-transform: none;
}
.status-pill :deep(.q-field__inner),
.status-pill :deep(.q-field__control-container),
.status-pill :deep(.q-field__native),
.status-pill :deep(.q-field__append) { display: contents; }
/* QSelect sets its own text metrics on the value; the pill's are the button's it replaced */
.status-pill :deep(.q-field__native) { font: inherit; letter-spacing: inherit; line-height: inherit; color: inherit; }
.status-pill :deep(.q-field__control) {
  display: inline-flex; align-items: center; gap: 7px;
  height: 30px; min-height: 0; padding: 0 9px;
  border: 1px solid var(--border); border-radius: 8px;
  background: var(--surface); color: inherit;
}
.status-pill :deep(.q-field__control::before),
.status-pill :deep(.q-field__control::after) { display: none; }
.status-pill:hover :deep(.q-field__control) { border-color: var(--border-strong); background: var(--surface-2); }
.status-pill.is-open :deep(.q-field__control) { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
.status-pill-dot { width: 9px; height: 9px; border-radius: 50%; background: var(--border-strong); flex: none; }
.status-pill-dot--empty { background: transparent; border: 1px dashed var(--border-strong); }
.status-pill-label { font-weight: 500; }
.status-pill-chev { color: var(--muted); transition: transform .15s ease; }
.status-pill.is-open .status-pill-chev { transform: rotate(180deg); }

/* the menu is QSelect's, teleported out of this component: its box is a global rule */
:global(.status-menu) {
  pointer-events: auto;
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
