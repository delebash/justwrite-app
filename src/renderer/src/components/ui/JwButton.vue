<script setup>
// Custom button — one source of truth for the app's button look and
// behaviour. The `intent` prop encodes BOTH the semantic role AND the
// visual style (solid/outlined/ghost), so callsites read like English
// and there's no boolean-modifier trap. All visual rules live in
// tokens.css under the "JwButton" section.
//
//   primary   → solid accent       (main affordance: Save, Create, Edit)
//   secondary → outlined neutral   (supporting action: Cancel, Test)
//   ghost     → no border, no fill (quiet utility: row icons, Delete on lists)
//   danger    → solid danger       (destructive: Discard, Remove)
//   success   → solid success      (positive: Confirm, Apply)
//   info      → solid info         (informational)
//   accent2   → solid gold         (user's second accent — Resume CTA, etc.)

import { computed, useSlots } from "vue";

const props = defineProps({
  intent:   { type: String,  default: "primary" }, // primary | secondary | ghost | danger | success | info | accent2
  size:     { type: String,  default: "regular" }, // small | regular
  loading:  { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  as:       { type: String,  default: "button" },  // "button" | "label" | "a"
  label:    { type: String,  default: "" },
  type:     { type: String,  default: "button" },  // for actual <button>
});

const slots = useSlots();
const isInteractiveButton = computed(() => props.as === "button");
const classes = computed(() => [
  "jw-btn",
  `jw-btn--${props.intent}`,
  props.size === "small" && "jw-btn--small",
  { "is-loading": props.loading, "is-disabled": props.disabled || props.loading },
]);
</script>

<template>
  <component
    :is="as"
    :class="classes"
    :type="isInteractiveButton ? type : undefined"
    :disabled="isInteractiveButton ? (disabled || loading) : undefined"
    :aria-disabled="!isInteractiveButton && (disabled || loading) ? 'true' : undefined"
    :aria-busy="loading ? 'true' : undefined"
  >
    <span v-if="loading" class="jw-btn-spinner" aria-hidden="true" />
    <slot v-else name="icon" />
    <span v-if="label || slots.default" class="jw-btn-label">
      <slot>{{ label }}</slot>
    </span>
  </component>
</template>

<style scoped>
@keyframes jw-btn-spin { to { transform: rotate(360deg); } }
.jw-btn-spinner {
  width: 12px; height: 12px;
  border: 2px solid currentColor;
  border-right-color: transparent;
  border-radius: 50%;
  animation: jw-btn-spin .7s linear infinite;
  display: inline-block;
}
</style>
