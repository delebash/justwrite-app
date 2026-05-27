<script setup>
// Renderer-side host for promptDialog() / confirmDialog() in
// services/dialog.js. Mounted once at the top level in App.vue.

import { computed, nextTick, ref, watch } from "vue";
import { dialogState, _resolveDialog } from "../services/dialog.js";

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
    if (el) { el.focus(); if (typeof el.select === "function") el.select(); }
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

function onKey(e) {
  if (!dialog.value) return;
  if (e.key === "Escape") { e.stopPropagation(); e.preventDefault(); cancel(); }
}

function onEnter(e, isLastField) {
  // Enter submits only when on the last field (or single-field prompts).
  // Shift+Enter is reserved for any future multiline inputs.
  if (e.shiftKey) return;
  if (isLastField) { e.preventDefault(); submit(); }
}
</script>

<template>
  <Transition name="dlg">
    <div v-if="dialog" class="dlg-overlay" @click.self="cancel" @keydown="onKey" tabindex="-1">
      <div class="dlg" role="dialog" aria-modal="true">
        <div class="dlg-head">
          <div class="dlg-title">{{ dialog.title }}</div>
        </div>
        <div class="dlg-body">
          <div v-if="dialog.message" class="dlg-message">{{ dialog.message }}</div>

          <template v-if="dialog.kind === 'prompt'">
            <div
              v-for="(f, i) in dialog.fields"
              :key="f.key"
              class="dlg-field"
            >
              <label v-if="f.label" class="dlg-label" :for="`dlg-field-${f.key}`">{{ f.label }}</label>
              <select
                v-if="f.type === 'select'"
                :id="`dlg-field-${f.key}`"
                :ref="el => { if (i === 0) firstInput = el; }"
                class="input"
                v-model="values[f.key]"
                @keydown.enter="onEnter($event, i === dialog.fields.length - 1)"
              >
                <option v-for="opt in (f.options || [])" :key="opt.value" :value="opt.value">
                  {{ opt.label }}
                </option>
              </select>
              <input
                v-else
                :id="`dlg-field-${f.key}`"
                :ref="el => { if (i === 0) firstInput = el; }"
                class="input"
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
        <div class="dlg-foot">
          <button class="btn ghost" @click="cancel">{{ dialog.cancelLabel }}</button>
          <button
            class="btn"
            :class="dialog.danger ? 'danger' : 'primary'"
            :disabled="!canSubmit"
            @click="submit"
          >
            {{ dialog.confirmLabel }}
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.dlg-overlay {
  position: fixed; inset: 0; z-index: 250;
  background: var(--scrim);
  backdrop-filter: blur(4px);
  display: grid; place-items: center;
  padding: 24px;
}
.dlg {
  width: min(440px, 100%);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 14px;
  box-shadow: var(--shadow-window, 0 24px 60px rgba(0,0,0,0.28));
  display: flex; flex-direction: column;
  overflow: hidden;
}
.dlg-head {
  padding: 16px 22px 4px;
}
.dlg-title {
  font-family: var(--font-serif);
  font-size: 18px;
  font-weight: 600;
  color: var(--ink);
  letter-spacing: -0.01em;
}
.dlg-body {
  padding: 8px 22px 18px;
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

.dlg-foot {
  padding: 12px 18px;
  background: var(--surface-2);
  border-top: 1px solid var(--border-soft, var(--border));
  display: flex; justify-content: flex-end; gap: 8px;
}

/* Danger variant — used for destructive confirms. Falls back gracefully
   if the project doesn't define danger tokens. */
.btn.danger {
  background: var(--danger, #c0392b);
  color: var(--on-danger, #fff);
  border-color: var(--danger, #c0392b);
}
.btn.danger:hover { filter: brightness(1.08); }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }

.dlg-enter-active, .dlg-leave-active { transition: opacity .14s ease; }
.dlg-enter-active .dlg, .dlg-leave-active .dlg { transition: transform .16s ease, opacity .16s ease; }
.dlg-enter-from, .dlg-leave-to { opacity: 0; }
.dlg-enter-from .dlg, .dlg-leave-to .dlg { transform: translateY(8px) scale(0.98); opacity: 0; }
</style>
