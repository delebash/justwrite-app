<script setup>
// Shared eyebrow + H1 header used at the top of every pane/view.
//
// When `helpKey` is set, a small "?" affordance (HelpTrigger) is pinned
// to the far right of the header — always the rightmost element,
// regardless of any action buttons passed via the default slot. Click
// opens the kit's HelpDrawer scoped to that doc — single source of truth:
// docs/*.md, identified by the slug in docs/toc.json.

import { HelpTrigger } from "@delebash/llm-ui";

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
    <div class="pane-actions" v-if="$slots.default">
      <slot />
    </div>
    <HelpTrigger v-if="helpKey" :slug="helpKey" :label="title" class="pane-help" />
  </header>
</template>
