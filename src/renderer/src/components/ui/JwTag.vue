<script setup>
// Custom tag chip — replaces PrimeVue Tag. Same single-intent API as
// JwButton (no separate severity/variant axes). Renders as <span> so it
// composes inside any text or row. Visual rules in tokens.css under
// the "JwTag" section.

import { computed, useSlots } from "vue";

const props = defineProps({
  intent: { type: String, default: "primary" }, // primary | secondary | success | info | accent2 | danger
  value:  { type: [String, Number], default: "" },
});

const slots = useSlots();
const classes = computed(() => ["jw-tag", `jw-tag--${props.intent}`]);
</script>

<template>
  <span :class="classes">
    <slot name="icon" />
    <slot>{{ value }}</slot>
  </span>
</template>
