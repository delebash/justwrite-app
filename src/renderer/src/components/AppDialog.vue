<script setup>
// Renderer-side host for promptDialog() / confirmDialog() in
// services/dialog.js. Mounted once at the top level in App.vue.
//
// Shell is PrimeVue <Dialog>; fields are PrimeVue InputText / Select; actions
// are PrimeVue <Button>. The prompt logic (per-field values, requireMatch,
// enter-to-submit on the last field, focus+select the first field) is
// unchanged from the hand-rolled version.

import { computed, nextTick, ref, watch } from "vue";
import { dialogState, _resolveDialog } from "../services/dialog.js";
import Dialog from "primevue/dialog";
import JwButton from "@renderer/components/ui/JwButton.vue";
import InputText from "primevue/inputtext";
import Select from "primevue/select";

// Normalize the active dialog into a uniform shape the template can read.
// Single-field prompts become a one-element `fields` list internally so
// the template only deals with one case.
const dialog = computed(() => {
  if (!dialogState.open) return null;
  const opts = dialogState.options || {};
  if (dialogState.kind === "confirm") {
    return {
      kind: "confirm",
      title: opts.title || "Are you sure?",
      message: opts.message || "",
      confirmLabel: opts.confirmLabel || "Confirm",
      cancelLabel: opts.cancelLabel || "Cancel",
      danger: !!opts.danger,
    };
  }
  // prompt
  const fields = Array.isArray(opts.fields) && opts.fields.length
    ? opts.fields
    : [{
        key: "value",
        label: opts.label || "",
        placeholder: opts.placeholder || "",
        defaultValue: opts.defaultValue ?? "",
        type: opts.type || "text",
        options: opts.options,
      }];
  return {
    kind: "prompt",
    title: opts.title || "",
    message: opts.message || "",
    confirmLabel: opts.confirmLabel || "OK",
    cancelLabel: opts.cancelLabel || "Cancel",
    danger: !!opts.danger,
    fields,
    isSingle: !Array.isArray(opts.fields),
    // requireMatch: a string the input value must equal (case-sensitive)
    // before the Confirm button enables. Used for "Type RESET to confirm"-style
    // double-confirmations.
    requireMatch: opts.requireMatch || null,
  };
});

// Dialog visibility mirrors the service's open flag; closing via ESC / X /
// mask routes through cancel() so the pending promise resolves correctly.
const visible = computed({
  get: () => dialogState.open,
  set: (v) => { if (!v) cancel(); },
});

// values keyed by field.key. Re-seeded each time a new dialog opens.
const values = ref({});
const firstInput = ref(null);

watch(
  () => dialogState.open,
  async (open) => {
    if (!open || !dialog.value || dialog.value.kind !== "prompt") return;
    const next = {};
    for (const f of dialog.value.fields) next[f.key] = f.defaultValue ?? "";
    values.value = next;
    await nextTick();
    const el = firstInput.value;
    if (el) { el.focus?.(); if (typeof el.select === "function") el.select(); }
  },
  { immediate: true },
);

const canSubmit = computed(() => {
  const d = dialog.value;
  if (!d || d.kind !== "prompt") return true;
  if (d.requireMatch != null) {
    const first = d.fields[0]?.key;
    if (String(values.value[first] ?? "") !== d.requireMatch) return false;
  }
  // Require non-empty text fields (selects always have a value).
  for (const f of d.fields) {
    if (f.type === "select") continue;
    if (f.optional) continue;
    const v = String(values.value[f.key] ?? "").trim();
    if (!v) return false;
  }
  return true;
});

// Capture the underlying DOM node so focus()/select() work whether the ref
// is a native element or a PrimeVue component instance ($el).
function captureFirst(el, i) {
  if (i !== 0) return;
  firstInput.value = el?.$el ?? el ?? null;
}

function cancel() {
  if (!dialog.value) return;
  _resolveDialog(dialog.value.kind === "confirm" ? false : null);
}

function submit() {
  const d = dialog.value;
  if (!d) return;
  if (d.kind === "confirm") { _resolveDialog(true); return; }
  if (!canSubmit.value) return;
  if (d.isSingle) {
    const v = String(values.value[d.fields[0].key] ?? "").trim();
    _resolveDialog(v);
  } else {
    const out = {};
    for (const f of d.fields) {
      const raw = values.value[f.key];
      out[f.key] = typeof raw === "string" ? raw.trim() : raw;
    }
    _resolveDialog(out);
  }
}

function onEnter(e, isLastField) {
  // Enter submits only when on the last field (or single-field prompts).
  // Shift+Enter is reserved for any future multiline inputs.
  if (e.shiftKey) return;
  if (isLastField) { e.preventDefault(); submit(); }
}
</script>

<template>
  <Dialog
    v-model:visible="visible"
    modal
    dismissableMask
    :draggable="false"
    class="app-dialog"
    :header="dialog?.title || ' '"
  >
    <div v-if="dialog" class="dlg-body">
      <div v-if="dialog.message" class="dlg-message">{{ dialog.message }}</div>

      <template v-if="dialog.kind === 'prompt'">
        <div
          v-for="(f, i) in dialog.fields"
          :key="f.key"
          class="dlg-field"
        >
          <label v-if="f.label" class="dlg-label" :for="`dlg-field-${f.key}`">{{ f.label }}</label>
          <Select
            v-if="f.type === 'select'"
            :input-id="`dlg-field-${f.key}`"
            :ref="el => captureFirst(el, i)"
            v-model="values[f.key]"
            :options="f.options || []"
            option-label="label"
            option-value="value"
            fluid
          />
          <InputText
            v-else
            :id="`dlg-field-${f.key}`"
            :ref="el => captureFirst(el, i)"
            :type="f.type || 'text'"
            :placeholder="f.placeholder || ''"
            v-model="values[f.key]"
            fluid
            @keydown.enter="onEnter($event, i === dialog.fields.length - 1)"
            @keydown.escape.prevent="cancel"
          />
          <div v-if="f.help" class="dlg-help">{{ f.help }}</div>
        </div>
      </template>
    </div>

    <template #footer>
      <JwButton :label="dialog?.cancelLabel || 'Cancel'" intent="ghost" @click="cancel" />
      <JwButton
        :label="dialog?.confirmLabel || 'OK'"
        :intent="dialog?.danger ? 'danger' : 'primary'"
        :disabled="!canSubmit"
        @click="submit"
      />
    </template>
  </Dialog>
</template>

<style scoped>
.dlg-body {
  display: flex; flex-direction: column;
  gap: 14px;
}
.dlg-message {
  font-size: 13px;
  line-height: 1.5;
  color: var(--ink-2);
  white-space: pre-line;
}
.dlg-field { display: flex; flex-direction: column; gap: 6px; }
.dlg-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--muted);
}
.dlg-help { font-size: 11.5px; color: var(--muted); }
</style>
