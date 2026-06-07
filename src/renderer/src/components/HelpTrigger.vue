<script setup>
// Small "?" affordance — opens JwHelpDrawer scoped to the given doc slug.
// Usually rendered automatically by PaneHeader when its `helpKey` prop
// is set, but it can also be embedded inline next to any control.
//
// Props:
//   slug — the doc filename (without .md). "audio-studio", "writing",
//          "story-bible", etc. See docs/toc.json for the canonical list.
//   label — overrides the tooltip's "what surface this opens" half.

import { computed } from "vue";
import { useUiStore } from "../stores/ui.js";
import { titleForSlug } from "../services/helpDocs.js";
import Icon from "./Icon.vue";

const props = defineProps({
  slug:  { type: String, required: true },
  label: { type: String, default: "" },
});

const ui = useUiStore();

const tooltipText = computed(() => {
  const surface = props.label || titleForSlug(props.slug);
  return `Help — ${surface}`;
});

function open() {
  ui.openHelp(props.slug);
}
</script>

<template>
  <button
    type="button"
    class="help-trigger"
    :aria-label="tooltipText"
    v-tooltip.bottom="tooltipText"
    @click="open">
    <Icon name="Help" :size="14" />
  </button>
</template>

<style scoped>
.help-trigger {
  appearance: none; border: 0; background: transparent;
  width: 24px; height: 24px;
  display: inline-grid; place-items: center;
  border-radius: 50%; cursor: pointer;
  color: var(--muted);
  transition: background 120ms ease, color 120ms ease;
}
.help-trigger:hover {
  background: var(--hover, color-mix(in oklab, var(--ink) 8%, transparent));
  color: var(--ink);
}
.help-trigger:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
</style>
