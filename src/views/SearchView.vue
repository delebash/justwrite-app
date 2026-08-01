<script setup>
import { computed, ref, watch, onMounted, onBeforeUnmount, nextTick } from "vue";
import { useRouter } from "vue-router";
import { useProjectStore } from "../stores/project.js";
import PaneHeader from "../components/PaneHeader.vue";
import { Icon } from "@delebash/llm-ui";
import { buildIndex, searchIndex, renderSnippet, KIND_META } from "../services/search.js";
import { useUiStore } from "../stores/ui.js";
import { UiButton } from "@delebash/llm-ui";

const project = useProjectStore();
const ui = useUiStore();
const router = useRouter();

const q = ref("");
const inputEl = ref(null);
const selectedKinds = ref(new Set()); // empty = all kinds

// Build the index whenever project data changes. The store is reactive,
// so referencing its arrays here makes Vue track them.
const index = computed(() => buildIndex({
  parts: project.parts,
  scenes: project.scenes,
  characters: project.characters,
  characterExtras: project.characterExtras,
  locations: project.locations,
  objects: project.objects,
  notes: project.notes,
  groups: project.groups,
  strands: project.strands,
  worldbuilding: project.worldbuilding,
  architecture: project.architecture,
}));

const hits = computed(() => {
  if (!q.value.trim()) return [];
  const kinds = selectedKinds.value.size ? selectedKinds.value : null;
  return searchIndex(index.value, q.value, { kinds, limit: 200 });
});

// Group hits by kind, preserving the canonical order.
const grouped = computed(() => {
  const buckets = {};
  for (const hit of hits.value) {
    const k = hit.doc.kind;
    // biome-ignore lint/suspicious/noAssignInExpressions: get-or-init bucket idiom — initializes the array if missing and pushes in one expression.
    (buckets[k] = buckets[k] || []).push(hit);
  }
  return Object.entries(buckets)
    .map(([kind, list]) => ({ kind, meta: KIND_META[kind], list }))
    .sort((a, b) => (a.meta?.order ?? 99) - (b.meta?.order ?? 99));
});

// Counts per kind (over the unfiltered result set, so users can see
// what scope filters would reveal).
const allKindsForQuery = computed(() => {
  if (!q.value.trim()) return {};
  const all = searchIndex(index.value, q.value, { limit: 5000 });
  const counts = {};
  for (const h of all) counts[h.doc.kind] = (counts[h.doc.kind] || 0) + 1;
  return counts;
});

function toggleKind(k) {
  const next = new Set(selectedKinds.value);
  if (next.has(k)) next.delete(k); else next.add(k);
  selectedKinds.value = next;
}
function clearKinds() { selectedKinds.value = new Set(); }

// Reset filters when the search field is cleared.
watch(q, (v) => {
  if (!v.trim() && selectedKinds.value.size) selectedKinds.value = new Set();
});

function openHit(hit) { router.push(hit.doc.route); }

// Esc clears the query and filters when the input is focused. ⌘F is owned by App.vue.
function onKey(e) {
  if (e.key === "Escape" && document.activeElement === inputEl.value) {
    q.value = "";
    selectedKinds.value = new Set();
  }
}

onMounted(() => {
  window.addEventListener("keydown", onKey);
  nextTick(() => inputEl.value?.focus());
});
onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKey);
  q.value = "";
  selectedKinds.value = new Set();
});

// Helper: enumerate kinds for chip rendering, in canonical order.
const KIND_ENTRIES = Object.entries(KIND_META).sort((a, b) => a[1].order - b[1].order);
</script>

<template>
  <PaneHeader :eyebrow="$t('panes.search.eyebrow')" :title="$t('nav.search')" help-key="notes-and-search#search">
    <span v-if="q && hits.length" class="t-muted" style="font-size:12px">
      {{ $t("search.resultCount", { n: hits.length }, hits.length) }}
    </span>
    <UiButton intent="ghost" size="small" @click="ui.openProjectReplace(q)" v-tooltip.bottom="$t('search.replaceTooltip')">
      <Icon name="Replace" :size="13" /> {{ $t("search.replaceButton") }}
    </UiButton>
  </PaneHeader>

  <!-- Search bar -->
  <div style="padding:14px 22px;border-bottom:1px solid var(--border);background:var(--surface-2);display:flex;flex-direction:column;gap:10px">
    <div style="display:flex;align-items:center;gap:8px;padding:0 12px;background:var(--surface);border:1px solid var(--border-strong);border-radius:8px;height:36px">
      <Icon name="Search" :size="14" />
      <input ref="inputEl" v-model="q" :placeholder="$t('search.placeholder')"
        style="flex:1;border:0;outline:0;background:transparent;font:inherit;font-size:13.5px" />
      <UiButton v-if="q" intent="ghost" size="small" @click="q = ''" style="padding:2px 6px" v-tooltip.bottom="$t('common.clear')" :aria-label="$t('search.clearAriaLabel')">×</UiButton>
      <kbd class="kbd-pill">⌘F</kbd>
    </div>

    <!-- Kind filter chips -->
    <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center">
      <button class="filter-chip" :class="{ active: selectedKinds.size === 0 }" :aria-pressed="selectedKinds.size === 0" @click="clearKinds">{{ $t("common.all") }}</button>
      <button v-for="[kind, meta] in KIND_ENTRIES" :key="kind"
        class="filter-chip"
        :class="{ active: selectedKinds.has(kind), dim: q && !allKindsForQuery[kind] }"
        :disabled="q && !allKindsForQuery[kind]"
        :aria-pressed="selectedKinds.has(kind)"
        @click="toggleKind(kind)">
        <Icon :name="meta.icon" :size="12" />
        {{ $t(meta.i18n) }}
        <span v-if="q && allKindsForQuery[kind]" class="filter-count">{{ allKindsForQuery[kind] }}</span>
      </button>
    </div>
  </div>

  <!-- Results -->
  <div class="pane-card">
  <div class="scrollarea">
    <i18n-t keypath="search.intro" tag="p" class="search-desc" scope="global">
      <template #search><strong>{{ $t("nav.search") }}</strong></template>
      <template #replace><strong>{{ $t("search.replaceTerm") }}</strong></template>
    </i18n-t>
    <!-- Empty: no query -->
    <div v-if="!q" style="padding:60px 22px;display:grid;place-items:center">
      <div style="max-width:420px;text-align:center">
        <div style="width:64px;height:64px;border-radius:16px;margin:0 auto 18px;background:var(--accent-soft);color:var(--accent);display:grid;place-items:center">
          <Icon name="Search" :size="28" />
        </div>
        <h3 style="font-family:var(--font-serif);font-size:22px;font-weight:600;margin:0">{{ $t("search.emptyTitle") }}</h3>
        <p style="font-size:13.5px;color:var(--ink-2);margin-top:8px;line-height:1.55">
          {{ $t("search.emptyBody") }}
        </p>
        <p class="t-muted" style="font-size:11.5px;margin-top:14px;font-family:var(--font-mono)">
          {{ $t("search.docsIndexed", { n: index.docs.size }) }}
        </p>
      </div>
    </div>

    <!-- Empty: query, no results -->
    <div v-else-if="hits.length === 0" style="padding:60px 22px;display:grid;place-items:center">
      <div class="t-muted" style="text-align:center;max-width:360px">
        <div style="font-size:14px;color:var(--ink)">{{ $t("search.noMatchesFor", { term: `"${q}"` }) }}</div>
        <p style="font-size:12.5px;margin-top:8px;line-height:1.55">
          {{ $t("search.noMatchesHint") }}
        </p>
      </div>
    </div>

    <!-- Grouped results -->
    <div v-else style="padding:8px 22px 40px">
      <section v-for="g in grouped" :key="g.kind" style="margin-top:18px">
        <div class="result-group-head">
          <span class="result-group-icon">
            <Icon :name="g.meta?.icon || 'Note'" :size="13" />
          </span>
          <span style="font-size:11.5px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:var(--muted)">
            {{ g.meta?.i18n ? $t(g.meta.i18n) : g.kind }}
          </span>
          <span class="t-muted" style="font-size:11px;font-variant-numeric:tabular-nums">{{ g.list.length }}</span>
          <span style="flex:1;height:1px;background:var(--border-soft);margin-left:8px" />
        </div>
        <div style="display:flex;flex-direction:column">
          <button v-for="hit in g.list" :key="hit.doc.id" class="result-row" :aria-label="`Open ${hit.doc.title}`" @click="openHit(hit)">
            <div class="result-title">
              <template v-if="hit.doc.crumbs">
                <span class="result-crumbs">
                  <template v-for="(c, ci) in hit.doc.crumbs" :key="ci">
                    <span v-if="ci" class="result-crumb-sep"> › </span>{{ c }}
                  </template>
                </span>
              </template>
              <template v-else>
                <span>{{ hit.doc.title }}</span>
                <span v-if="hit.doc.sub" class="result-sub">· {{ hit.doc.sub }}</span>
              </template>
            </div>
            <div v-if="hit.snippet" class="result-snippet">
              <template v-for="(seg, i) in renderSnippet(hit.snippet, hit.snippetMatches)" :key="i">
                <mark v-if="seg.mark">{{ seg.text }}</mark>
                <span v-else>{{ seg.text }}</span>
              </template>
            </div>
            <Icon name="ChevRight" :size="13" class="result-chev" />
          </button>
        </div>
      </section>
    </div>
  </div>
  </div>

</template>

<style scoped>
.search-desc {
  font-size: 14px; line-height: 1.55; color: var(--muted);
  margin: 0 0 18px;
  padding: 14px 22px 0;
}
.search-desc strong { color: var(--ink-2); font-weight: 600; }

.filter-chip {
  appearance: none;
  display: inline-flex; align-items: center; gap: 5px;
  padding: 4px 9px;
  border-radius: 999px;
  font-size: 11.5px; font-weight: 500;
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--ink-2);
  cursor: default;
}
.filter-chip:hover:not(:disabled) { background: var(--surface-3); color: var(--ink); }
.filter-chip.active { background: var(--ink); color: var(--surface); border-color: var(--ink); }
.filter-chip.dim:disabled { opacity: 0.4; cursor: default; }
.filter-count {
  font-size: 10px; font-variant-numeric: tabular-nums;
  color: var(--muted);
  background: var(--surface-3);
  border-radius: 999px; padding: 0 5px; margin-left: 2px;
}
.filter-chip.active .filter-count {
  background: color-mix(in oklch, var(--surface) 20%, transparent);
  color: var(--surface);
}

.result-group-head {
  display: flex; align-items: center; gap: 8px;
  padding: 4px 0 10px;
}
.result-group-icon {
  width: 22px; height: 22px; border-radius: 6px;
  background: var(--accent-soft); color: var(--accent);
  display: grid; place-items: center;
}

.result-row {
  display: grid;
  grid-template-columns: 1fr auto;
  grid-template-rows: auto auto;
  column-gap: 12px; row-gap: 4px;
  padding: 10px 12px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  text-align: left;
  width: 100%;
  color: inherit;
  cursor: default;
}
.result-row:hover {
  background: var(--surface-2);
  border-color: var(--border);
}
.result-row .result-chev {
  grid-column: 2; grid-row: 1 / 3;
  align-self: center;
  color: var(--muted);
}
.result-title {
  font-family: var(--font-serif);
  font-size: 14.5px;
  font-weight: 600;
  letter-spacing: -0.005em;
  display: flex; align-items: baseline; gap: 6px;
  min-width: 0;
}
.result-sub {
  font-size: 11.5px; font-weight: 400;
  color: var(--muted);
  font-family: var(--font-ui);
  font-style: italic;
}
/* Part › Chapter › Scene breadcrumb — the separator sits quieter than the crumbs;
   the whole crumb line stays on one row and ellipsises rather than overflowing. */
.result-crumbs { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.result-crumb-sep { color: var(--muted); font-weight: 400; }
.result-snippet {
  font-size: 12.5px;
  color: var(--ink-2);
  line-height: 1.5;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.result-snippet mark {
  background: var(--accent-soft);
  color: var(--accent-ink);
  padding: 0 1px;
  border-radius: 2px;
}
</style>
