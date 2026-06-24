<script setup>
// Small "?" affordance — opens JwHelpDrawer scoped to the given doc slug.
// Usually rendered automatically by PaneHeader when its `helpKey` prop
// is set, but it can also be embedded inline next to any control.
//
// Props:
//   slug — the doc filename (without .md), optionally with a section
//          anchor: "audio-studio", "story-bible#locations". See
//          docs/toc.json for the canonical slug list; section anchors
//          follow GitHub-style slug rules over the heading text.
//   label — overrides the tooltip's "what surface this opens" half.

import { computed } from "vue";
import { useUiStore } from "../stores/ui.js";
import { titleForSlug } from "../services/helpDocs.js";
import { Icon } from "@delebash/llm-ui";

const props = defineProps({
  slug:  { type: String, required: true },
  label: { type: String, default: "" },
});

const ui = useUiStore();

const slugOnly = computed(() => String(props.slug || "").split("#")[0]);

const tooltipText = computed(() => {
  const surface = props.label || titleForSlug(slugOnly.value);
  return `Help — ${surface}`;
});

function open() {
  // openHelp accepts the convenience form "slug#anchor" and splits it.
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
    <Icon name="Help" :size="16" />
  </button>
</template>

<style scoped>
.help-trigger {
  appearance: none; background: transparent;
  width: 26px; height: 26px;
  display: inline-grid; place-items: center;
  border: 1px solid var(--border); border-radius: 50%;
  cursor: pointer;
  color: var(--ink-2);
  transition: background 120ms ease, color 120ms ease, border-color 120ms ease;
}
.help-trigger:hover {
  background: var(--hover, color-mix(in oklab, var(--ink) 8%, transparent));
  border-color: var(--border-strong);
  color: var(--ink);
}
.help-trigger:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
</style>
