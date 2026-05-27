<script setup>
defineProps({
  eyebrow: { type: String, default: "" },
  title:   { type: String, default: "" },
});
</script>

<template>
  <header class="pane-header">
    <div class="pane-title">
      <span v-if="eyebrow" class="pane-eyebrow">{{ eyebrow }}</span>
      <h1 class="pane-h1">{{ title }}</h1>
    </div>
    <div class="pane-actions" v-if="$slots.default"><slot /></div>
  </header>
</template>
