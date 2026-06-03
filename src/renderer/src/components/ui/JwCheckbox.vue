<script setup>
// Custom checkbox — replaces PrimeVue Checkbox in binary mode (the only
// mode we use across the app). Wraps a native <input type="checkbox">
// in a <label> so clicking the label toggles too. Visual rules in
// tokens.css under the "JwCheckbox" section.

import { computed } from "vue";

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  disabled:   { type: Boolean, default: false },
  // Optional inline label rendered after the box. Default slot wins if
  // both are provided — same convention as JwButton.
  label:      { type: String, default: "" },
  name:       { type: String, default: undefined },
  id:         { type: String, default: undefined },
});
const emit = defineEmits(["update:modelValue", "change"]);

const classes = computed(() => [
  "jw-checkbox",
  { "is-checked": props.modelValue, "is-disabled": props.disabled },
]);

function onChange(e) {
  emit("update:modelValue", e.target.checked);
  emit("change", e);
}
</script>

<template>
  <label :class="classes">
    <input
      type="checkbox"
      class="jw-checkbox-input"
      :checked="modelValue"
      :disabled="disabled"
      :name="name"
      :id="id"
      @change="onChange"
    />
    <span class="jw-checkbox-box" aria-hidden="true">
      <svg class="jw-checkbox-tick" viewBox="0 0 16 16" fill="none">
        <path d="M3 8.5l3 3 7-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </span>
    <span v-if="label || $slots.default" class="jw-checkbox-label">
      <slot>{{ label }}</slot>
    </span>
  </label>
</template>
