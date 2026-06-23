<script setup>
// Custom number input — replaces PrimeVue InputNumber. Uses
// Intl.NumberFormat for locale-aware thousands separator and decimal
// punctuation. While the user is typing the raw input value is preserved
// (so cursor position stays sane); on blur the value is parsed, clamped
// to min/max, and re-formatted. Up/Down arrow keys step by `step`.
//
// Locale defaults to vue-i18n's active locale (falls back to the
// browser's preferred locale before i18n boots); pass `locale` to pin a
// specific value for one input.

import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";

const props = defineProps({
  modelValue: { type: [Number, String, null], default: null },
  min:        { type: [Number, null], default: null },
  max:        { type: [Number, null], default: null },
  step:       { type: Number, default: 1 },
  // When false, render plain digits (1200) instead of grouped (1,200).
  useGrouping:{ type: Boolean, default: true },
  // null = browser default locale; pass e.g. "de-DE" for thousand-dot style.
  locale:     { type: String, default: null },
  placeholder:{ type: String, default: "" },
  disabled:   { type: Boolean, default: false },
  readonly:   { type: Boolean, default: false },
  // Match UiInput's size modifier (small/regular).
  size:       { type: String, default: "regular" },
  name:       { type: String, default: undefined },
  id:         { type: String, default: undefined },
  inputId:    { type: String, default: undefined }, // PrimeVue-compatible alias
  invalid:    { type: Boolean, default: false },
});
const emit = defineEmits(["update:modelValue", "blur", "focus", "keydown"]);

// Pull live locale from vue-i18n so the formatter retints when the user
// switches languages. The composable returns null when called outside
// a Vue setup() — we fall through to undefined (= browser default).
const { locale: i18nLocale } = useI18n({ useScope: "global" });
const fmt = computed(() => new Intl.NumberFormat(props.locale || i18nLocale.value || undefined, {
  useGrouping: props.useGrouping,
  maximumFractionDigits: 20,
}));

// Format a number for display.
function formatNumber(n) {
  if (n == null || n === "" || !Number.isFinite(Number(n))) return "";
  return fmt.value.format(Number(n));
}

// Parse a possibly-localized string back to a number.
// Strategy: strip any character that isn't a digit, minus sign, or
// decimal separator (which we infer from a 1.5 probe). This handles
// "1,200" (en-US) → 1200 AND "1.200" (de-DE) → 1200 without us having
// to enumerate locales.
function parseNumber(s) {
  const probe = fmt.value.format(1.5);                              // "1.5" or "1,5"
  const decimalSep = probe.replace(/\d/g, "")[0] || ".";
  const cleaned = String(s ?? "")
    .replace(new RegExp(`[^0-9${decimalSep === "." ? "\\." : decimalSep}\\-]`, "g"), "")
    .replace(decimalSep, ".");
  if (cleaned === "" || cleaned === "-") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function clamp(n) {
  if (n == null) return null;
  if (props.min != null && n < props.min) return props.min;
  if (props.max != null && n > props.max) return props.max;
  return n;
}

const inputEl = ref(null);
const display = ref(formatNumber(props.modelValue));

watch(() => props.modelValue, (v) => {
  // Don't reformat while the user is actively editing — the format pass
  // happens on blur. This preserves cursor position during entry.
  if (inputEl.value && document.activeElement === inputEl.value) return;
  display.value = formatNumber(v);
});

function emitParsed(raw, { commit }) {
  const parsed = parseNumber(raw);
  const next = commit ? clamp(parsed) : parsed;
  if (next !== props.modelValue) emit("update:modelValue", next);
  return next;
}

function onInput(e) {
  display.value = e.target.value;
  emitParsed(e.target.value, { commit: false });
}

function onBlur(e) {
  const committed = emitParsed(e.target.value, { commit: true });
  display.value = formatNumber(committed);
  emit("blur", e);
}

function onFocus(e) {
  emit("focus", e);
}

function bump(delta) {
  const current = parseNumber(display.value) ?? 0;
  const next = clamp(current + delta * props.step);
  emit("update:modelValue", next);
  display.value = formatNumber(next);
}

function onKeydown(e) {
  if (e.key === "ArrowUp")   { e.preventDefault(); bump(+1); }
  if (e.key === "ArrowDown") { e.preventDefault(); bump(-1); }
  emit("keydown", e);
}

const classes = computed(() => [
  "jw-input", "jw-number",
  props.size === "small" && "jw-input--small",
  { "is-invalid": props.invalid },
]);
</script>

<template>
  <input
    ref="inputEl"
    :class="classes"
    type="text"
    inputmode="decimal"
    :value="display"
    :placeholder="placeholder"
    :disabled="disabled"
    :readonly="readonly"
    :name="name"
    :id="id || inputId"
    :aria-invalid="invalid ? 'true' : undefined"
    @input="onInput"
    @blur="onBlur"
    @focus="onFocus"
    @keydown="onKeydown"
  />
</template>
