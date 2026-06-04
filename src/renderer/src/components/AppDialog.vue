<script setup>
// Renderer-side host for promptDialog() / confirmDialog() in
// services/dialog.js. Mounted once at the top level in App.vue. Reka UI
// Dialog primitives under the hood — same prompt logic (per-field values,
// requireMatch, enter-to-submit on the last field, focus+select the first
// field) as the PrimeVue version it replaces.
//
// Backdrop click and Esc both route through cancel() so the pending
// dialog promise resolves to the cancellation sentinel.

import { computed, nextTick, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { dialogState, _resolveDialog } from "../services/dialog.js";
import {
  DialogRoot,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogTitle,
  DialogClose,
} from "reka-ui";
import Icon from "./Icon.vue";
import JwButton from "@renderer/components/ui/JwButton.vue";
import JwInput from "@renderer/components/ui/JwInput.vue";
import JwSelect from "@renderer/components/ui/JwSelect.vue";

const { t } = useI18n();

// Normalize the active dialog into a uniform shape the template can read.
// Single-field prompts become a one-element `fields` list internally so
// the template only deals with one case.
//
// We intentionally do NOT gate on dialogState.open — the body needs to
// stay rendered during Reka UI's close animation, and the service keeps
// kind/options around for that purpose (see services/dialog.js).
// Visibility is driven by `visible` below; that's what controls whether
// Reka shows the dialog at all.
const dialog = computed(() => {
  if (!dialogState.kind) return null;
  const opts = dialogState.options || {};
  if (dialogState.kind === "confirm") {
    return {
      kind: "confirm",
      title: opts.title || t("dialog.defaultTitle"),
      message: opts.message || "",
      confirmLabel: opts.confirmLabel || t("dialog.confirmLabel"),
      cancelLabel: opts.cancelLabel || t("dialog.cancelLabel"),
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
    confirmLabel: opts.confirmLabel || t("dialog.okLabel"),
    cancelLabel: opts.cancelLabel || t("dialog.cancelLabel"),
    danger: !!opts.danger,
    fields,
    isSingle: !Array.isArray(opts.fields),
    // requireMatch: a string the input value must equal (case-sensitive)
    // before the Confirm button enables. Used for "Type RESET to confirm"-style
    // double-confirmations.
    requireMatch: opts.requireMatch || null,
  };
});

// Dialog visibility mirrors the service's open flag; closing via Esc /
// X / backdrop routes through cancel() so the pending promise resolves.
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
// is a native element or a component instance ($el).
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
  <DialogRoot :open="visible" @update:open="(v) => visible = v">
    <DialogPortal>
      <DialogOverlay class="app-modal-overlay" />
      <DialogContent class="app-modal app-dialog">
        <header class="app-modal-header">
          <DialogTitle as-child>
            <div class="app-modal-titleblock">
              <div v-if="dialog?.title" class="modal-title">{{ dialog.title }}</div>
            </div>
          </DialogTitle>
          <DialogClose class="app-modal-close" :aria-label="$t('dialog.closeLabel')">
            <Icon name="Close" :size="14" />
          </DialogClose>
        </header>

        <div v-if="dialog" class="app-modal-body dlg-body">
          <div v-if="dialog.message" class="dlg-message">{{ dialog.message }}</div>

          <template v-if="dialog.kind === 'prompt'">
            <div
              v-for="(f, i) in dialog.fields"
              :key="f.key"
              class="dlg-field"
            >
              <label v-if="f.label" class="dlg-label" :for="`dlg-field-${f.key}`">{{ f.label }}</label>
              <JwSelect
                v-if="f.type === 'select'"
                :input-id="`dlg-field-${f.key}`"
                :ref="el => captureFirst(el, i)"
                v-model="values[f.key]"
                :options="f.options || []"
                option-label="label"
                option-value="value"
              />
              <JwInput
                v-else
                :id="`dlg-field-${f.key}`"
                :ref="el => captureFirst(el, i)"
                :type="f.type || 'text'"
                :placeholder="f.placeholder || ''"
                v-model="values[f.key]"
                @keydown.enter="onEnter($event, i === dialog.fields.length - 1)"
                @keydown.escape.prevent="cancel"
              />
              <div v-if="f.help" class="dlg-help">{{ f.help }}</div>
            </div>
          </template>
        </div>

        <footer class="app-modal-footer">
          <JwButton :label="dialog?.cancelLabel || $t('dialog.cancelLabel')" intent="ghost" @click="cancel" />
          <JwButton
            :label="dialog?.confirmLabel || $t('dialog.okLabel')"
            :intent="dialog?.danger ? 'danger' : 'primary'"
            :disabled="!canSubmit"
            @click="submit"
          />
        </footer>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
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
