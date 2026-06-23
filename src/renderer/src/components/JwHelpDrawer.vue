<script setup>
// Right-side help drawer — opens when ui.helpDrawerSlug is set.
// Mounted once in App.vue; every "?" button on a PaneHeader (HelpTrigger)
// just calls ui.openHelp(slug).
//
// Renders the same docs/*.md content as HelpView (the full-pane reader)
// via the shared services/helpMarkdown.js renderer, so intra-doc links,
// external link targeting, and H1-stripping all match.
//
// Behavior:
//   - Esc closes (Reka Dialog default).
//   - Backdrop click closes.
//   - "Open full docs" hands off to /help/<slug> for the TOC + reading view.
//   - "Open on the web" routes through the bridge so the OS browser opens
//     the marketing-site copy (handy when the user wants to copy text).

import { computed, watch, nextTick, ref } from "vue";
import { useRouter } from "vue-router";
import {
  DialogRoot,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogTitle,
  DialogClose,
} from "reka-ui";
import { useUiStore } from "../stores/ui.js";
import {
  loadDoc,
  hasDoc,
  titleForSlug,
  webUrlFor,
} from "../services/helpDocs.js";
import { renderHelpMarkdown } from "../services/helpMarkdown.js";
import Icon from "./Icon.vue";
import { UiButton } from "@delebash/llm-ui";

const ui = useUiStore();
const router = useRouter();

const open = computed({
  get: () => ui.helpDrawerSlug !== null,
  set: (v) => { if (!v) ui.closeHelp(); },
});

const slug = computed(() => ui.helpDrawerSlug || "");
const anchor = computed(() => ui.helpDrawerAnchor || "");
const title = computed(() => titleForSlug(slug.value));
const rawDoc = ref(null);
// Load the doc lazily when the drawer opens / navigates (not at app boot).
watch(slug, async (s) => { rawDoc.value = s ? await loadDoc(s) : null; }, { immediate: true });
const renderedHtml = computed(() => renderHelpMarkdown(rawDoc.value));
const exists = computed(() => hasDoc(slug.value));

const contentEl = ref(null);

// Scroll to the named anchor when the drawer opens with one (or when the
// slug/anchor changes while open). Falls back to scroll-to-top otherwise.
// Two nextTicks because v-html mounts the new prose tree on the first tick
// and querySelector needs the element actually in the DOM on the second.
watch([slug, anchor], async () => {
  await nextTick();
  await nextTick();
  const root = contentEl.value;
  if (!root) return;
  const a = anchor.value;
  if (a) {
    const el = root.querySelector(`[id="${CSS.escape(a)}"]`);
    if (el) { el.scrollIntoView({ behavior: "auto", block: "start" }); return; }
  }
  root.scrollTo({ top: 0, behavior: "auto" });
}, { immediate: true });

function onContentClick(e) {
  const a = e.target.closest("a[data-help-link]");
  if (!a) return;
  e.preventDefault();
  const href = a.getAttribute("href") || "";
  // Internal help links jump within the drawer rather than navigating
  // the whole app to the full HelpView. Preserve any #section anchor
  // so cross-doc links land on the right heading.
  const m = href.match(/^\/help(?:\/([^#]+))?(?:#(.+))?$/);
  if (m) {
    ui.openHelp(m[1] || "", m[2] || "");
    return;
  }
  router.push(href);
  ui.closeHelp();
}

function openFullDocs() {
  const s = slug.value;
  router.push(s ? `/help/${s}` : "/help");
  ui.closeHelp();
}

function openOnWeb() {
  const url = webUrlFor(slug.value);
  if (window.justwrite?.shell?.openExternal) {
    window.justwrite.shell.openExternal(url);
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}
</script>

<template>
  <DialogRoot v-model:open="open">
    <DialogPortal>
      <DialogOverlay class="help-drawer-overlay" />
      <DialogContent class="help-drawer" aria-label="Help">
        <header class="help-drawer-header">
          <DialogTitle as-child>
            <div class="help-drawer-titleblock">
              <div class="t-eyebrow">Help</div>
              <div class="help-drawer-title">{{ title }}</div>
            </div>
          </DialogTitle>
          <DialogClose class="help-drawer-close" aria-label="Close help">
            <Icon name="Close" :size="14" />
          </DialogClose>
        </header>

        <div ref="contentEl" class="help-drawer-body" @click="onContentClick">
          <article v-if="renderedHtml" class="help-drawer-prose" v-html="renderedHtml" />
          <div v-else class="help-drawer-empty">
            <p>
              No help article for this surface yet.
              <button class="help-drawer-link" @click="openFullDocs">Browse all docs</button>.
            </p>
          </div>
        </div>

        <footer class="help-drawer-footer">
          <UiButton intent="ghost" size="small" @click="openFullDocs" v-if="exists">
            <template #icon><Icon name="Book" :size="13" /></template>
            Open full docs
          </UiButton>
          <UiButton intent="ghost" size="small" @click="openOnWeb" v-if="exists">
            <template #icon><Icon name="ExternalLink" :size="13" /></template>
            Open on the web
          </UiButton>
        </footer>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<style scoped>
.help-drawer-overlay {
  position: fixed; inset: 0; z-index: 250;
  background: color-mix(in oklab, black 28%, transparent);
  animation: helpFadeIn 160ms ease;
}
.help-drawer {
  position: fixed; top: 0; right: 0; bottom: 0;
  width: min(480px, 92vw);
  z-index: 251;
  background: var(--surface); color: var(--ink);
  border-left: 1px solid var(--border);
  box-shadow: -8px 0 32px rgba(0, 0, 0, 0.18);
  display: flex; flex-direction: column;
  animation: helpSlideIn 220ms cubic-bezier(.22, 1, .36, 1);
  outline: none;
}
@keyframes helpFadeIn {
  from { opacity: 0; } to { opacity: 1; }
}
@keyframes helpSlideIn {
  from { transform: translateX(8%); opacity: 0; }
  to   { transform: translateX(0); opacity: 1; }
}

.help-drawer-header {
  display: flex; align-items: flex-start; justify-content: space-between;
  gap: 12px;
  padding: 14px 18px 12px;
  border-bottom: 1px solid var(--border);
}
.help-drawer-titleblock { min-width: 0; }
.help-drawer-title {
  font-family: var(--font-display, inherit);
  font-size: 18px; font-weight: 600;
  line-height: 1.2;
  margin-top: 2px;
}
.help-drawer-close {
  appearance: none; border: 0; background: transparent;
  width: 28px; height: 28px;
  display: grid; place-items: center;
  border-radius: 6px; cursor: pointer; color: var(--muted);
}
.help-drawer-close:hover { background: var(--hover); color: var(--ink); }

.help-drawer-body {
  flex: 1; min-height: 0; overflow-y: auto;
  padding: 18px 22px 28px;
}
.help-drawer-prose {
  font-family: var(--font-body, inherit);
  font-size: 14.5px; line-height: 1.65; color: var(--ink);
}
.help-drawer-prose :deep(h2),
.help-drawer-prose :deep(h3) {
  font-family: var(--font-display, inherit);
  line-height: 1.25;
  margin-top: 1.4em; margin-bottom: 0.5em;
}
.help-drawer-prose :deep(h2) {
  font-size: 17px;
  border-bottom: 1px solid var(--border);
  padding-bottom: 4px;
}
.help-drawer-prose :deep(h3) { font-size: 14.5px; font-weight: 600; }
.help-drawer-prose :deep(p) { margin: 0 0 0.9em; }
.help-drawer-prose :deep(ul),
.help-drawer-prose :deep(ol) { margin: 0 0 0.9em 1.3em; padding: 0; }
.help-drawer-prose :deep(li) { margin-bottom: 0.3em; }
.help-drawer-prose :deep(a) {
  color: var(--accent);
  text-decoration: underline;
  text-decoration-thickness: 1px;
  text-underline-offset: 2px;
}
.help-drawer-prose :deep(a:hover) { text-decoration-thickness: 2px; }
.help-drawer-prose :deep(code) {
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 0.88em;
  background: color-mix(in oklab, var(--ink) 8%, transparent);
  padding: 1px 5px; border-radius: 4px;
}
.help-drawer-prose :deep(pre) {
  background: color-mix(in oklab, var(--ink) 6%, transparent);
  padding: 10px 12px; border-radius: 8px;
  overflow-x: auto; font-size: 12.5px; line-height: 1.5;
  margin: 0 0 0.9em;
}
.help-drawer-prose :deep(pre code) { background: transparent; padding: 0; }
.help-drawer-prose :deep(blockquote) {
  margin: 0 0 0.9em;
  padding: 4px 12px;
  border-left: 3px solid var(--accent);
  color: var(--muted); font-style: italic;
}
.help-drawer-prose :deep(table) {
  width: 100%; border-collapse: collapse;
  margin: 0 0 1em; font-size: 13px;
}
.help-drawer-prose :deep(th),
.help-drawer-prose :deep(td) {
  border: 1px solid var(--border);
  padding: 6px 8px; text-align: left; vertical-align: top;
}
.help-drawer-prose :deep(th) {
  background: color-mix(in oklab, var(--ink) 5%, transparent);
  font-weight: 600;
}
.help-drawer-prose :deep(hr) {
  border: 0; border-top: 1px solid var(--border);
  margin: 1.5em 0;
}
.help-drawer-prose :deep(strong) { font-weight: 600; }

.help-drawer-empty {
  padding: 40px 20px; text-align: center; color: var(--muted);
  font-size: 13px;
}
.help-drawer-link {
  background: none; border: 0; padding: 0;
  color: var(--accent); cursor: pointer; font: inherit;
  text-decoration: underline;
}

.help-drawer-footer {
  display: flex; gap: 8px;
  padding: 10px 16px;
  border-top: 1px solid var(--border);
  background: var(--surface-2);
}
</style>
