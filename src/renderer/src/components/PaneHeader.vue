<script setup>
// Shared eyebrow + H1 header used at the top of every pane/view.
//
// When `helpKey` is set, a small "?" affordance (HelpTrigger) is rendered
// at the start of the actions row. Clicking it opens the JwHelpDrawer
// scoped to that doc — single source of truth: docs/*.md, identified by
// the slug in docs/toc.json.

import HelpTrigger from "./HelpTrigger.vue";

defineProps({
  eyebrow: { type: String, default: "" },
  title:   { type: String, default: "" },
  helpKey: { type: String, default: "" },
});
</script>

<template>
  <header class="pane-header">
    <div class="pane-title">
      <span v-if="eyebrow" class="pane-eyebrow">{{ eyebrow }}</span>
      <h1 class="pane-h1">{{ title }}</h1>
    </div>
    <div class="pane-actions" v-if="helpKey || $slots.default">
      <HelpTrigger v-if="helpKey" :slug="helpKey" :label="title" />
      <slot />
    </div>
  </header>
</template>
