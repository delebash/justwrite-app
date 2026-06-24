<script setup>
import { computed, ref, watch, onMounted, nextTick } from "vue";
import { useRouter, useRoute } from "vue-router";
import PaneHeader from "../components/PaneHeader.vue";
import { Icon } from "@delebash/llm-ui";
import { UiButton } from "@delebash/llm-ui";
import {
  HELP_TOC,
  loadDoc,
  hasDoc,
  titleForSlug,
  webUrlFor,
} from "../services/helpDocs.js";
import { renderHelpMarkdown } from "@delebash/llm-ui";

const props = defineProps({ slug: { type: String, default: "" } });

const route = useRoute();
const router = useRouter();

const currentSlug = computed(() => props.slug || "");
const docTitle = computed(() => titleForSlug(currentSlug.value));
const webUrl = computed(() => webUrlFor(currentSlug.value));

const rawDoc = ref(null);
watch(currentSlug, async (s) => { rawDoc.value = await loadDoc(s); }, { immediate: true });
const renderedHtml = computed(() => renderHelpMarkdown(rawDoc.value));

const contentEl = ref(null);

function onContentClick(e) {
  const a = e.target.closest("a[data-help-link]");
  if (!a) return;
  e.preventDefault();
  const href = a.getAttribute("href") || "";
  router.push(href);
}

function openOnWeb() {
  // Tauri's webview swallows window.open for external URLs — route
  // through the bridge command so the OS browser actually opens.
  // The browser-only dev path (no window.justwrite) falls back to
  // a plain window.open which works there.
  const url = webUrl.value;
  if (window.justwrite?.shell?.openExternal) {
    window.justwrite.shell.openExternal(url);
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

function go(slug) {
  router.push(slug ? `/help/${slug}` : "/help");
}

const isActive = (slug) => (currentSlug.value || "") === (slug || "");

// Scroll the rendered content back to top on slug change so the user
// doesn't land mid-page when they jump between docs.
watch(currentSlug, async () => {
  await nextTick();
  contentEl.value?.scrollTo({ top: 0, behavior: "auto" });
});

onMounted(() => {
  // If the URL has a slug that doesn't exist, fall back to index.
  if (currentSlug.value && !hasDoc(currentSlug.value)) router.replace("/help");
});
</script>

<template>
  <div class="help-page">
    <PaneHeader :title="docTitle" :eyebrow="$t('panes.help.eyebrow')">
      <UiButton intent="secondary" size="small" @click="openOnWeb">
        <template #icon><Icon name="ExternalLink" :size="14" /></template>
        Open on the web
      </UiButton>
    </PaneHeader>

    <div class="help-body">
      <aside class="help-toc" aria-label="Help table of contents">
        <button
          class="toc-item toc-index"
          :class="{ active: isActive('') }"
          @click="go('')"
        >
          <span class="toc-title">Overview</span>
          <span class="toc-hint">What JustWrite is, where to start</span>
        </button>

        <div v-for="group in HELP_TOC" :key="group.section" class="toc-group">
          <div class="toc-section">{{ group.section }}</div>
          <button
            v-for="item in group.items"
            :key="item.slug"
            class="toc-item"
            :class="{ active: isActive(item.slug) }"
            @click="go(item.slug)"
          >
            <span class="toc-title">{{ item.title }}</span>
            <span class="toc-hint">{{ item.hint }}</span>
          </button>
        </div>
      </aside>

      <div ref="contentEl" class="help-content" @click="onContentClick">
        <article v-if="renderedHtml" class="help-prose" v-html="renderedHtml" />
        <div v-else class="help-empty">
          <p>That page is missing. <button class="link-btn" @click="go('')">Back to the overview</button>.</p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.help-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.help-body {
  display: grid;
  grid-template-columns: 280px 1fr;
  flex: 1;
  min-height: 0;
}

.help-toc {
  border-right: 1px solid var(--border);
  background: var(--surface, transparent);
  overflow-y: auto;
  padding: 16px 12px 24px;
}

.toc-group { margin-top: 18px; }
.toc-section {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--muted);
  padding: 0 10px 6px;
}

.toc-item {
  display: flex;
  flex-direction: column;
  width: 100%;
  text-align: left;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 8px;
  padding: 8px 10px;
  margin-bottom: 2px;
  cursor: pointer;
  color: inherit;
  font: inherit;
  transition: background 120ms ease, border-color 120ms ease;
}
.toc-item:hover {
  background: var(--hover);
}
.toc-item.active {
  background: color-mix(in oklab, var(--accent) 12%, transparent);
  border-color: color-mix(in oklab, var(--accent) 40%, transparent);
}

.toc-index { margin-bottom: 6px; }

.toc-title {
  font-size: 13px;
  font-weight: 500;
}
.toc-hint {
  font-size: 11px;
  color: var(--muted);
  margin-top: 1px;
  line-height: 1.35;
}

.help-content {
  overflow-y: auto;
  padding: 28px 40px 80px;
}

.help-prose {
  max-width: 760px;
  margin: 0 auto;
  font-family: var(--font-body, inherit);
  font-size: 15px;
  line-height: 1.65;
  color: var(--ink);
}

.help-prose :deep(h1),
.help-prose :deep(h2),
.help-prose :deep(h3) {
  font-family: var(--font-display, inherit);
  line-height: 1.25;
  margin-top: 1.8em;
  margin-bottom: 0.6em;
}
.help-prose :deep(h2) {
  font-size: 22px;
  border-bottom: 1px solid var(--border);
  padding-bottom: 6px;
}
.help-prose :deep(h3) {
  font-size: 17px;
}
.help-prose :deep(p) { margin: 0 0 1em; }
.help-prose :deep(ul),
.help-prose :deep(ol) { margin: 0 0 1em 1.4em; padding: 0; }
.help-prose :deep(li) { margin-bottom: 0.35em; }
.help-prose :deep(a) {
  color: var(--accent);
  text-decoration: underline;
  text-decoration-thickness: 1px;
  text-underline-offset: 2px;
}
.help-prose :deep(a:hover) {
  text-decoration-thickness: 2px;
}
.help-prose :deep(code) {
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 0.9em;
  background: color-mix(in oklab, var(--ink) 8%, transparent);
  padding: 1px 5px;
  border-radius: 4px;
}
.help-prose :deep(pre) {
  background: color-mix(in oklab, var(--ink) 6%, transparent);
  padding: 12px 14px;
  border-radius: 8px;
  overflow-x: auto;
  font-size: 13px;
  line-height: 1.5;
  margin: 0 0 1em;
}
.help-prose :deep(pre code) {
  background: transparent;
  padding: 0;
}
.help-prose :deep(blockquote) {
  margin: 0 0 1em;
  padding: 4px 14px;
  border-left: 3px solid var(--accent);
  color: var(--muted);
  font-style: italic;
}
.help-prose :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 0 0 1.4em;
  font-size: 14px;
}
.help-prose :deep(th),
.help-prose :deep(td) {
  border: 1px solid var(--border);
  padding: 8px 10px;
  text-align: left;
  vertical-align: top;
}
.help-prose :deep(th) {
  background: color-mix(in oklab, var(--ink) 5%, transparent);
  font-weight: 600;
}
.help-prose :deep(hr) {
  border: 0;
  border-top: 1px solid var(--border);
  margin: 2em 0;
}
.help-prose :deep(strong) { font-weight: 600; }

.help-empty {
  max-width: 600px;
  margin: 60px auto;
  text-align: center;
  color: var(--muted);
}
.link-btn {
  background: none;
  border: 0;
  color: var(--accent);
  cursor: pointer;
  text-decoration: underline;
  font: inherit;
  padding: 0;
}

@media (max-width: 720px) {
  .help-body { grid-template-columns: 1fr; }
  .help-toc { border-right: 0; border-bottom: 1px solid var(--border); max-height: 200px; }
  .help-content { padding: 20px 16px 60px; }
}
</style>
