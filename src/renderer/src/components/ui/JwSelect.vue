<script setup>
// Custom select — replaces PrimeVue Select. Built on Reka UI's headless
// Select primitives (formerly Radix Vue) so we get focus management,
// arrow-key nav, type-ahead, Esc-to-close, and screen-reader support
// for free. All visuals come from tokens.css → ".jw-select-*" rules.
//
// API surface mirrors how PrimeVue Select was used across the app:
//   v-model="value"
//   :options="[{ label, value }, ...]"
//   option-label="label"  (default)
//   option-value="value"  (default)
//   placeholder, disabled, show-clear, input-id
//
// Reka UI's SelectItem requires string values internally; we string-
// roundtrip non-string values so callers can pass numbers/booleans too.
//
// Reka also forbids an empty-string value on SelectItem (it reserves ""
// as the "no selection" sentinel on SelectRoot). To let callers offer
// an "Any" / "None" option with value="" without hitting that error, we
// swap empty values for an internal sentinel at the SelectItem boundary
// and unwrap on emit. Callers see "" / null in v-model; Reka never sees
// a literal "" in an option.

import { computed } from "vue";

const EMPTY_SENTINEL = "__jw_empty__";
import {
  SelectRoot,
  SelectTrigger,
  SelectValue,
  SelectIcon,
  SelectPortal,
  SelectContent,
  SelectViewport,
  SelectItem,
  SelectItemText,
  SelectItemIndicator,
} from "reka-ui";
import Icon from "../Icon.vue";

const props = defineProps({
  modelValue: { type: [String, Number, Boolean, Object, null], default: null },
  options:    { type: Array, default: () => [] },
  optionLabel:{ type: String, default: "label" },
  optionValue:{ type: String, default: "value" },
  placeholder:{ type: String, default: "" },
  disabled:   { type: Boolean, default: false },
  showClear:  { type: Boolean, default: false },
  inputId:    { type: String, default: undefined },
});
const emit = defineEmits(["update:modelValue"]);

function valueFor(option) { return option == null ? null : option[props.optionValue]; }
function labelFor(option) { return option == null ? "" : option[props.optionLabel]; }

// Reka's SelectRoot deals in strings; we convert at the boundary so the
// outer v-model keeps the caller's native type (the common case is string
// anyway, but font-size enums and a few other selects use other types).
//   modelValue = null      → Reka value "" (no selection)
//   modelValue = ""        → Reka value EMPTY_SENTINEL (user picked the empty-value option)
//   modelValue = otherwise → Reka value String(modelValue)
const stringValue = computed({
  get() {
    if (props.modelValue == null) return "";
    if (props.modelValue === "") return EMPTY_SENTINEL;
    return String(props.modelValue);
  },
  set(s) {
    if (s == null || s === "") { emit("update:modelValue", null); return; }
    if (s === EMPTY_SENTINEL) { emit("update:modelValue", ""); return; }
    const match = props.options.find(o => String(valueFor(o)) === s);
    emit("update:modelValue", match ? valueFor(match) : s);
  },
});

// Sentinel-swap for the per-item value. Callers can declare an option
// with value="" and we render it with the sentinel so Reka accepts it.
function itemValue(opt) {
  const v = String(valueFor(opt));
  return v === "" ? EMPTY_SENTINEL : v;
}

const selectedLabel = computed(() => {
  if (props.modelValue == null) return "";
  const found = props.options.find(o => valueFor(o) === props.modelValue);
  return found ? labelFor(found) : "";
});

function clear(e) {
  e.stopPropagation();
  emit("update:modelValue", null);
}
</script>

<template>
  <SelectRoot v-model="stringValue" :disabled="disabled">
    <SelectTrigger :id="inputId" class="jw-select-trigger" :class="{ 'is-empty': !selectedLabel }">
      <SelectValue :placeholder="placeholder">{{ selectedLabel }}</SelectValue>
      <span class="jw-select-icons">
        <button
          v-if="showClear && modelValue != null && modelValue !== ''"
          type="button"
          class="jw-select-clear"
          tabindex="-1"
          @click.stop="clear"
          @pointerdown.stop
        >
          <Icon name="Close" :size="11" />
        </button>
        <SelectIcon class="jw-select-chev">
          <Icon name="ChevDown" :size="14" />
        </SelectIcon>
      </span>
    </SelectTrigger>
    <SelectPortal>
      <SelectContent class="jw-select-content" position="popper" :side-offset="4" :collision-padding="8">
        <SelectViewport class="jw-select-viewport">
          <SelectItem
            v-for="opt in options"
            :key="String(valueFor(opt))"
            :value="itemValue(opt)"
            class="jw-select-item"
          >
            <SelectItemText>{{ labelFor(opt) }}</SelectItemText>
            <SelectItemIndicator class="jw-select-indicator">
              <Icon name="Check" :size="12" />
            </SelectItemIndicator>
          </SelectItem>
        </SelectViewport>
      </SelectContent>
    </SelectPortal>
  </SelectRoot>
</template>
