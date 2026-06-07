<script setup>
// Cmd+/ overlay that prints the keyboard-shortcut reference.
// Sourced from docs/keyboard-shortcuts.md so writers see the same
// reference they get in the marketing-site docs — single source.

import { computed } from "vue";
import { useUiStore } from "../stores/ui.js";
import { getDoc } from "../services/helpDocs.js";
import { renderHelpMarkdown } from "../services/helpMarkdown.js";
import AppModal from "./AppModal.vue";
import JwButton from "./ui/JwButton.vue";
import Icon from "./Icon.vue";

const ui = useUiStore();

const renderedHtml = computed(() =>
  renderHelpMarkdown(getDoc("keyboard-shortcuts") || ""),
);

function close() { ui.closeShortcuts(); }
function openInDrawer() {
  ui.openHelp("keyboard-shortcuts");
  close();
}
</script>

<template>
  <AppModal
    v-if="ui.shortcutsOpen"
    title="Keyboard shortcuts"
    eyebrow="Cheatsheet"
    wide
    @close="close"
  >
    <div class="cheatsheet-body" v-html="renderedHtml" />

    <template #footer>
      <JwButton intent="ghost" size="small" @click="openInDrawer">
        <template #icon><Icon name="Book" :size="13" /></template>
        Open in help drawer
      </JwButton>
    </template>
  </AppModal>
</template>

<style scoped>
.cheatsheet-body {
  font-family: var(--font-body, inherit);
  font-size: 14px;
  line-height: 1.55;
}
.cheatsheet-body :deep(h2) {
  font-family: var(--font-display, inherit);
  font-size: 16px;
  margin: 1.2em 0 0.4em;
  border-bottom: 1px solid var(--border);
  padding-bottom: 4px;
}
.cheatsheet-body :deep(h2):first-of-type { margin-top: 0; }
.cheatsheet-body :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 0 0 1.2em;
  font-size: 13px;
}
.cheatsheet-body :deep(th),
.cheatsheet-body :deep(td) {
  border: 1px solid var(--border);
  padding: 6px 10px;
  text-align: left; vertical-align: top;
}
.cheatsheet-body :deep(th) {
  background: color-mix(in oklab, var(--ink) 5%, transparent);
  font-weight: 600;
}
.cheatsheet-body :deep(td:first-child) {
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  white-space: nowrap;
  background: color-mix(in oklab, var(--ink) 3%, transparent);
}
.cheatsheet-body :deep(p) { margin: 0 0 0.8em; color: var(--muted); }
.cheatsheet-body :deep(hr) {
  border: 0;
  border-top: 1px solid var(--border);
  margin: 1em 0;
}
.cheatsheet-body :deep(a) {
  color: var(--accent);
  text-decoration: underline;
}
</style>
