<script setup>
// First-launch-after-upgrade modal. Shown when the app's package.json
// version differs from the last version the user dismissed. Source is
// docs/whats-new.md so changelog stays single-source with the marketing
// site.
//
// Pinned by ui.lastSeenVersion; markVersionSeen() persists the dismissal.

import { onMounted, ref } from "vue";
import { useUiStore } from "../stores/ui.js";
import { loadDoc } from "../services/helpDocs.js";
import { renderHelpMarkdown } from "../services/helpMarkdown.js";
import { AppModal } from "@delebash/llm-ui";
import { UiButton } from "@delebash/llm-ui";
import { Icon } from "@delebash/llm-ui";

const ui = useUiStore();
const open = ref(false);

// Resolved at module load from Vite's define. Falls back to a string
// constant — the real version flows in via build.
const APP_VERSION = import.meta.env.VITE_APP_VERSION || "1.0.0";

const renderedHtml = ref("");

// Temporarily disabled while QC'ing the AI/Models area (user request). Flip back
// to true to restore the first-launch-after-upgrade changelog popup.
const AUTO_SHOW = false;

onMounted(async () => {
  if (!AUTO_SHOW) return;
  // Show on a clean profile (first run ever) too — that's a fine
  // moment to surface the changelog.
  if (ui.lastSeenVersion !== APP_VERSION) {
    open.value = true;
    // Lazily load the changelog doc only when we're actually showing it.
    renderedHtml.value = renderHelpMarkdown((await loadDoc("whats-new")) || "");
  }
});

function close() {
  open.value = false;
  ui.markVersionSeen(APP_VERSION);
}
function openFullDocs() {
  ui.openHelp("whats-new");
  close();
}
</script>

<template>
  <AppModal
    v-if="open"
    title="What's new"
    :eyebrow="`Version ${APP_VERSION}`"
    @close="close"
  >
    <div class="whatsnew-body" v-html="renderedHtml" />

    <template #footer>
      <UiButton intent="ghost" size="small" @click="openFullDocs">
        <template #icon><Icon name="Book" :size="13" /></template>
        Open in help drawer
      </UiButton>
      <UiButton intent="primary" @click="close">Got it</UiButton>
    </template>
  </AppModal>
</template>

<style scoped>
.whatsnew-body {
  font-family: var(--font-body, inherit);
  font-size: 14px; line-height: 1.6; color: var(--ink);
}
.whatsnew-body :deep(h2) {
  font-family: var(--font-display, inherit);
  font-size: 17px;
  margin: 1.4em 0 0.5em;
  border-bottom: 1px solid var(--border);
  padding-bottom: 4px;
}
.whatsnew-body :deep(h2):first-of-type { margin-top: 0; }
.whatsnew-body :deep(h3) {
  font-family: var(--font-display, inherit);
  font-size: 14.5px; font-weight: 600;
  margin: 1.2em 0 0.4em;
}
.whatsnew-body :deep(p) { margin: 0 0 0.9em; }
.whatsnew-body :deep(strong) { font-weight: 600; }
.whatsnew-body :deep(ul) { margin: 0 0 0.9em 1.3em; padding: 0; }
.whatsnew-body :deep(li) { margin-bottom: 0.3em; }
.whatsnew-body :deep(hr) {
  border: 0; border-top: 1px solid var(--border); margin: 1.4em 0;
}
.whatsnew-body :deep(a) {
  color: var(--accent);
  text-decoration: underline;
}
</style>
