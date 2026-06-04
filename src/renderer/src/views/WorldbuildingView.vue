<script setup>
import { computed, ref, nextTick, watch } from "vue";
import { useProjectStore } from "../stores/project.js";
import { useRouter } from "vue-router";
import PaneHeader from "../components/PaneHeader.vue";
import Icon from "../components/Icon.vue";
import RichEditor from "../components/RichEditor.vue";
import StatusSelect from "../components/StatusSelect.vue";
import Breadcrumb from "../components/Breadcrumb.vue";
import { promptDialog, confirmDialog } from "../services/dialog.js";
import { NEW_ENTITY_META } from "../services/entityMeta.js";

import JwTable from "@renderer/components/ui/JwTable.vue";
import JwInput from "@renderer/components/ui/JwInput.vue";
import JwTag from "@renderer/components/ui/JwTag.vue";
import JwButton from "@renderer/components/ui/JwButton.vue";

const props = defineProps({ id: { type: String, default: "" } });
const project = useProjectStore();
const router = useRouter();
const article = computed(() => props.id ? project.worldbuildingById(props.id) : null);
const cat = computed(() => article.value ? project.worldbuildingCategories.find((c) => c.id === article.value.category) : null);

function update(k, v) { project.updateWorldbuilding(article.value.id, { [k]: v }); }

// Tag editor — comma or Enter commits; Backspace on an empty input
// removes the last chip. Duplicates and blanks are silently dropped.
// Typeahead surfaces existing tags from the project so writers reuse
// vocabulary instead of accidentally splintering it (magic/Magic/magick).
const tagDraft = ref("");
const tagInputRef = ref(null);
const tagSuggestOpen = ref(false);
const tagSuggestIndex = ref(0);

function addTag(raw) {
  const parts = String(raw || "").split(",").map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return;
  const current = article.value.tags || [];
  const next = [...current];
  for (const p of parts) if (!next.includes(p)) next.push(p);
  if (next.length !== current.length) update("tags", next);
}
function commitDraft() {
  const draft = tagDraft.value;
  tagDraft.value = "";
  tagSuggestOpen.value = false;
  if (draft.trim()) addTag(draft);
}
function pickSuggestion(t) {
  tagDraft.value = "";
  tagSuggestOpen.value = false;
  addTag(t);
  nextTick(() => tagInputRef.value?.focus());
}
function removeTagAt(i) {
  const next = (article.value.tags || []).slice();
  next.splice(i, 1);
  update("tags", next);
}

// Route param change leaves the component mounted (it's the same view,
// just a different article id). Reset draft + dropdown so the editor
// state doesn't bleed between articles.
watch(() => article.value?.id, () => {
  tagDraft.value = "";
  tagSuggestOpen.value = false;
  tagSuggestIndex.value = 0;
});

// Suggestions: every project-wide tag that contains the draft (case-
// insensitive) and isn't already on this article. Cap at 8 so the
// dropdown stays manageable.
const tagSuggestions = computed(() => {
  const q = tagDraft.value.trim().toLowerCase();
  const used = new Set(article.value?.tags || []);
  const all = [];
  for (const a of project.worldbuilding) for (const t of (a.tags || [])) all.push(t);
  const uniq = Array.from(new Set(all));
  const matches = uniq
    .filter((t) => !used.has(t))
    .filter((t) => !q || t.toLowerCase().includes(q));
  return matches.slice(0, 8);
});

function onTagInput() {
  tagSuggestOpen.value = true;
  tagSuggestIndex.value = 0;
}
function onTagFocus() {
  tagSuggestOpen.value = true;
  tagSuggestIndex.value = 0;
}
function onTagBlur() {
  // Delay so a click on a suggestion fires before the list unmounts.
  setTimeout(() => {
    tagSuggestOpen.value = false;
    if (tagDraft.value.trim()) commitDraft();
  }, 120);
}
function onTagKeydown(e) {
  const list = tagSuggestions.value;
  if (e.key === "ArrowDown" && list.length) {
    e.preventDefault();
    tagSuggestOpen.value = true;
    tagSuggestIndex.value = (tagSuggestIndex.value + 1) % list.length;
  } else if (e.key === "ArrowUp" && list.length) {
    e.preventDefault();
    tagSuggestOpen.value = true;
    tagSuggestIndex.value = (tagSuggestIndex.value - 1 + list.length) % list.length;
  } else if (e.key === "Enter") {
    e.preventDefault();
    if (tagSuggestOpen.value && list.length && tagDraft.value.trim() &&
        list[tagSuggestIndex.value]?.toLowerCase().includes(tagDraft.value.trim().toLowerCase())) {
      pickSuggestion(list[tagSuggestIndex.value]);
    } else {
      commitDraft();
    }
  } else if (e.key === ",") {
    e.preventDefault();
    commitDraft();
  } else if (e.key === "Escape" && tagSuggestOpen.value) {
    e.preventDefault();
    tagSuggestOpen.value = false;
  } else if (e.key === "Backspace" && !tagDraft.value && (article.value.tags || []).length) {
    e.preventDefault();
    removeTagAt(article.value.tags.length - 1);
  }
}

async function addArticle() {
  const M = NEW_ENTITY_META.worldbuilding;
  const values = await promptDialog({
    title: M.title,
    confirmLabel: M.confirmLabel,
    fields: [
      { key: "title", label: M.label, placeholder: M.placeholder },
      {
        key: "category",
        label: "Category",
        type: "select",
        defaultValue: "geography",
        options: project.worldbuildingCategories.map((c) => ({ value: c.id, label: c.label })),
      },
    ],
  });
  if (!values || !values.title) return;
  const id = project.addWorldbuilding({ title: values.title, category: values.category || "geography" });
  router.push(`/worldbuilding/${id}`);
}

async function deleteArticle() {
  if (!article.value) return;
  const yes = await confirmDialog({
    title: `Delete "${article.value.title}"?`,
    confirmLabel: "Delete",
    danger: true,
  });
  if (!yes) return;
  project.removeWorldbuilding(article.value.id);
  router.push("/worldbuilding");
}

// ── DataTable wiring ─────────────────────────────────────────────────
// Enrich each article with its category label/icon/hue for display.
const rows = computed(() =>
  project.worldbuilding.map((a) => {
    const c = project.worldbuildingCategories.find((x) => x.id === a.category);
    return {
      ...a,
      categoryLabel: c?.label || a.category,
      categoryIcon:  c?.icon  || "Sparkle",
      categoryHue:   c?.hue   || 200,
    };
  }),
);

// Global search + per-facet filter chips. Category and Status are
// single-select (a row matches if it's in the selected value); Tags is
// multi-select with ANY-match semantics. Chips live above the table; the
// table sees pre-filtered rows so JwTable doesn't have to model facets.
const globalQuery = ref("");
const selectedCategory = ref(null);
const selectedStatus = ref(null);
const selectedTags = ref(new Set());

function onGlobalInput(e) { globalQuery.value = e.target.value; }
function toggleTag(t) {
  const next = new Set(selectedTags.value);
  if (next.has(t)) next.delete(t); else next.add(t);
  selectedTags.value = next;
}
function clearAllFilters() {
  globalQuery.value = "";
  selectedCategory.value = null;
  selectedStatus.value = null;
  selectedTags.value = new Set();
}

const categoryOptions = computed(() =>
  project.worldbuildingCategories.map((c) => ({ value: c.id, label: c.label })),
);
const statusOptions = computed(() =>
  project.statuses.map((s) => ({ value: s.id, label: s.label })),
);
const allTags = computed(() => {
  const set = new Set();
  for (const a of project.worldbuilding) for (const t of (a.tags || [])) set.add(t);
  return [...set].sort();
});

// Pre-filter rows by the three facets before handing to JwTable. Global
// text search stays in JwTable's hands so its filteredRowModel still works.
const filteredRows = computed(() => {
  const rs = rows.value;
  if (!selectedCategory.value && !selectedStatus.value && selectedTags.value.size === 0) return rs;
  return rs.filter((r) => {
    if (selectedCategory.value && r.category !== selectedCategory.value) return false;
    if (selectedStatus.value && r.status !== selectedStatus.value) return false;
    if (selectedTags.value.size > 0) {
      const rt = r.tags || [];
      const hit = rt.some((t) => selectedTags.value.has(t));
      if (!hit) return false;
    }
    return true;
  });
});

const hasActiveFacets = computed(() =>
  !!selectedCategory.value || !!selectedStatus.value || selectedTags.value.size > 0,
);

// JwTable column definitions. Each column's accessorKey ties into the
// matching slot below (#title, #category, #tags, #status, #words).
const columns = [
  { accessorKey: "title",     header: "Title",    sortable: true, headerStyle: "min-width: 220px" },
  { accessorKey: "category",  header: "Category", sortable: true, headerStyle: "min-width: 160px" },
  { accessorKey: "tags",      header: "Tags",     sortable: false, headerStyle: "min-width: 160px", enableGlobalFilter: true },
  { accessorKey: "status",    header: "Status",   sortable: true, headerStyle: "min-width: 120px" },
  { accessorKey: "words",     header: "Words",    sortable: true, headerStyle: "min-width: 90px; text-align: right", cellStyle: "text-align: right" },
];

function statusLabel(id) { return project.statusById(id)?.label || id || ""; }
function statusSeverity(id) {
  // Map status ids onto JwTag intents so colors track the editorial palette.
  if (id === "done")    return "success";
  if (id === "revise")  return "accent2";
  if (id === "draft")   return "info";
  if (id === "todo")    return "secondary";
  return "secondary";
}

function onRowClick(event) {
  const id = event?.data?.id;
  if (id) router.push(`/worldbuilding/${id}`);
}
</script>

<template>
  <template v-if="!article">
    <PaneHeader eyebrow="Story world" title="Worldbuilding">
      <JwButton label="New article" intent="primary" size="small" @click="addArticle">
        <template #icon><Icon name="Plus" :size="14" /></template>
      </JwButton>
    </PaneHeader>
    <div class="pane-card">
      <div class="scrollarea" style="padding:18px 22px 40px">

        <!-- Global search + filter reset -->
        <div class="wb-toolbar">
          <span class="wb-search">
            <Icon name="Search" :size="13" class="wb-search-icon" />
            <JwInput
              :value="globalQuery"
              placeholder="Search articles…"
              @input="onGlobalInput"
              class="wb-search-input"
            />
          </span>
          <JwButton v-if="globalQuery || hasActiveFacets" label="Clear filters" intent="ghost" size="small" @click="clearAllFilters" />
          <span class="wb-count">{{ filteredRows.length }} of {{ rows.length }}</span>
        </div>

        <!-- Facet filter chips: Category (single), Status (single), Tags (multi). -->
        <div class="wb-facets" v-if="categoryOptions.length || statusOptions.length || allTags.length">
          <div v-if="categoryOptions.length" class="wb-facet">
            <span class="wb-facet-label">Category</span>
            <button class="wb-chip" :class="{ active: !selectedCategory }" @click="selectedCategory = null">All</button>
            <button v-for="c in categoryOptions" :key="c.value"
              class="wb-chip" :class="{ active: selectedCategory === c.value }"
              @click="selectedCategory = selectedCategory === c.value ? null : c.value">
              {{ c.label }}
            </button>
          </div>
          <div v-if="statusOptions.length" class="wb-facet">
            <span class="wb-facet-label">Status</span>
            <button class="wb-chip" :class="{ active: !selectedStatus }" @click="selectedStatus = null">All</button>
            <button v-for="s in statusOptions" :key="s.value"
              class="wb-chip" :class="{ active: selectedStatus === s.value }"
              @click="selectedStatus = selectedStatus === s.value ? null : s.value">
              {{ s.label }}
            </button>
          </div>
          <div v-if="allTags.length" class="wb-facet">
            <span class="wb-facet-label">Tags</span>
            <button v-for="t in allTags" :key="t"
              class="wb-chip" :class="{ active: selectedTags.has(t) }"
              @click="toggleTag(t)">
              {{ t }}
            </button>
          </div>
        </div>

        <JwTable
          :data="filteredRows"
          :columns="columns"
          data-key="id"
          row-hover
          :global-filter="globalQuery"
          :global-filter-fields="['title', 'summary', 'tags']"
          :pagination="{ pageSize: 20, pageSizeOptions: [10, 20, 50, 100] }"
          class="wb-table"
          @row-click="onRowClick"
        >
          <template #empty>
            <div class="wb-empty">No articles match your search.</div>
          </template>

          <template #title="{ row }">
            <div class="wb-cell-title">
              <span class="wb-cell-title-text">{{ row.title }}</span>
              <span v-if="row.summary" class="wb-cell-title-sum">{{ row.summary }}</span>
            </div>
          </template>

          <template #category="{ row }">
            <span class="wb-cat" :style="`--h:${row.categoryHue}`">
              <Icon :name="row.categoryIcon" :size="11" />
              {{ row.categoryLabel }}
            </span>
          </template>

          <template #tags="{ row }">
            <div class="wb-tags">
              <JwTag v-for="t in row.tags" :key="t" :value="t" intent="secondary" />
            </div>
          </template>

          <template #status="{ row }">
            <JwTag v-if="row.status" :value="statusLabel(row.status)" :intent="statusSeverity(row.status)" />
            <span v-else class="wb-status-empty">—</span>
          </template>

          <template #words="{ row }">
            <span class="wb-words">{{ (row.words || 0).toLocaleString() }}</span>
          </template>
        </JwTable>
      </div>
    </div>
  </template>

  <template v-else>
    <header class="pane-header wb-pane-header">
      <div class="pane-title">
        <Breadcrumb :segments="[{ label: cat?.label || 'Worldbuilding', to: '/worldbuilding' }]" />
        <input class="wb-title"
          placeholder="Article title"
          :value="article.title" @input="update('title', $event.target.value)" />
      </div>
      <div class="pane-actions">
        <JwButton label="Back" intent="ghost" size="small" @click="router.push('/worldbuilding')">
          <template #icon><Icon name="ChevRight" :size="12" style="transform:rotate(180deg)" /></template>
        </JwButton>
        <JwButton label="Delete" intent="ghost" size="small" @click="deleteArticle" />
        <JwButton label="New article" intent="primary" size="small" @click="addArticle">
          <template #icon><Icon name="Plus" :size="14" /></template>
        </JwButton>
        <StatusSelect :model-value="article.status || ''" @update:model-value="(v) => update('status', v)" />
      </div>
    </header>

    <div class="pane-card">
      <div style="padding:14px 22px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:16px">
        <input class="input"
          style="flex:1;font-style:italic;color:var(--muted);font-size:13.5px;border:0;background:transparent;padding:0;font-family:var(--font-serif)"
          placeholder="Summary"
          :value="article.summary" @input="update('summary', $event.target.value)" />
      </div>

      <div class="wb-tag-editor">
        <span class="wb-tag-editor-label">Tags</span>
        <div class="wb-tag-chip" v-for="(t, i) in (article.tags || [])" :key="t + i">
          <span>{{ t }}</span>
          <button type="button" class="wb-tag-chip-x" @click="removeTagAt(i)" aria-label="Remove tag">
            <Icon name="Close" :size="10" />
          </button>
        </div>
        <div class="wb-tag-input-wrap">
          <input ref="tagInputRef" class="wb-tag-input"
            v-model="tagDraft"
            placeholder="Add tag…"
            @input="onTagInput"
            @focus="onTagFocus"
            @blur="onTagBlur"
            @keydown="onTagKeydown" />
          <ul v-if="tagSuggestOpen && tagSuggestions.length" class="wb-tag-suggest" role="listbox">
            <li v-for="(t, i) in tagSuggestions" :key="t"
              class="wb-tag-suggest-item"
              :class="{ active: i === tagSuggestIndex }"
              role="option"
              :aria-selected="i === tagSuggestIndex"
              @mouseenter="tagSuggestIndex = i"
              @mousedown.prevent="pickSuggestion(t)">
              {{ t }}
            </li>
          </ul>
        </div>
      </div>

      <RichEditor
        :model-value="article.body"
        placeholder="Write the article…"
        @change="(html) => update('body', html)"
      />
    </div>
  </template>
</template>

<style scoped>
.wb-pane-header .pane-title { gap: 2px; }
.wb-title {
  appearance: none;
  font-family: var(--font-serif);
  font-size: 20px; font-weight: 600;
  letter-spacing: -0.015em;
  color: var(--ink);
  border: 1px solid transparent;
  background: transparent;
  border-radius: 6px;
  padding: 2px 6px;
  margin-left: -6px;
  outline: none;
  min-width: 0;
}
.wb-title:hover { border-color: var(--border-soft); }
.wb-title:focus { border-color: var(--accent); background: var(--surface); box-shadow: 0 0 0 3px var(--accent-soft); }

/* ── List view (PrimeVue spike) ─────────────────────────────────── */
.wb-toolbar {
  display: flex; align-items: center; gap: 10px;
  margin-bottom: 14px;
}
.wb-search {
  position: relative; flex: 1; max-width: 360px;
}
.wb-search-icon {
  position: absolute; left: 10px; top: 50%;
  transform: translateY(-50%);
  color: var(--muted); pointer-events: none;
}
.wb-search-input { width: 100%; padding-left: 30px !important; }
.wb-count { margin-left: auto; font-family: var(--font-mono); font-size: 11px; color: var(--muted); font-variant-numeric: tabular-nums; }

/* Facet filter chips — Category / Status / Tags rows above the table. */
.wb-facets {
  display: flex; flex-direction: column;
  gap: 8px;
  padding: 10px 0 14px;
}
.wb-facet { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.wb-facet-label {
  font-family: var(--font-mono);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--muted);
  min-width: 64px;
}
.wb-chip {
  appearance: none;
  background: transparent;
  border: 1px solid var(--border);
  color: var(--ink-2);
  padding: 3px 9px;
  border-radius: 999px;
  font: 500 11.5px/1.4 var(--font-ui);
  cursor: pointer;
  transition: background-color .12s, border-color .12s, color .12s;
}
.wb-chip:hover { background: var(--surface-3); border-color: var(--border-strong); }
.wb-chip.active {
  background: var(--accent-soft);
  border-color: var(--accent-line);
  color: var(--accent-ink);
}

.wb-table { font-size: 13px; }
.wb-cell-title { display: flex; flex-direction: column; gap: 2px; cursor: pointer; }
.wb-cell-title-text { font-family: var(--font-serif); font-size: 14px; color: var(--ink); }
.wb-cell-title-sum {
  font-size: 12px; color: var(--muted); line-height: 1.4;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  max-width: 460px;
}

/* Category chip — pulls hue from the category record so colors track
   the existing tile palette. */
.wb-cat {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 2px 8px; border-radius: 999px;
  font-family: var(--font-mono); font-size: 10.5px;
  letter-spacing: 0.04em;
  background: oklch(var(--tile-bg-l, 0.95) var(--tile-bg-c, 0.02) var(--h));
  color:      oklch(var(--tile-ink-l, 0.35) var(--tile-ink-c, 0.05) var(--h));
}

.wb-tags { display: flex; gap: 4px; flex-wrap: wrap; }

/* Inline tag editor on the article detail view. Sits below the summary,
   above the body, in the same flat-bordered band style. */
.wb-tag-editor {
  display: flex; align-items: center; flex-wrap: wrap; gap: 6px;
  padding: 10px 22px;
  border-bottom: 1px solid var(--border);
}
.wb-tag-editor-label {
  font-size: 11.5px; font-weight: 600; letter-spacing: 0.04em;
  text-transform: uppercase; color: var(--muted);
  margin-right: 4px;
}
.wb-tag-chip {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 2px 4px 2px 10px; border-radius: 999px;
  background: var(--surface-3); color: var(--ink);
  font-size: 12px; line-height: 1.4;
  border: 1px solid var(--border);
}
.wb-tag-chip-x {
  display: inline-flex; align-items: center; justify-content: center;
  width: 18px; height: 18px; border: 0; border-radius: 999px;
  background: var(--border); color: var(--ink); cursor: pointer;
  transition: background .12s ease, color .12s ease;
}
.wb-tag-chip-x:hover { background: var(--danger); color: var(--surface); }
.wb-tag-input-wrap {
  position: relative;
  flex: 1; min-width: 140px;
}
.wb-tag-input {
  width: 100%;
  border: 0; background: transparent; outline: none;
  font-size: 13px; color: var(--ink);
  padding: 2px 0;
}
.wb-tag-input::placeholder { color: var(--muted); }
.wb-tag-suggest {
  position: absolute; top: calc(100% + 4px); left: -6px;
  margin: 0; padding: 4px; list-style: none;
  background: var(--surface); border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, .14);
  min-width: 160px; max-width: 280px;
  z-index: 40;
  max-height: 240px; overflow-y: auto;
}
.wb-tag-suggest-item {
  padding: 5px 10px; border-radius: 5px;
  font-size: 13px; color: var(--ink);
  cursor: pointer;
}
.wb-tag-suggest-item.active { background: var(--accent-soft); color: var(--accent-ink); }
.wb-status-empty { color: var(--muted); }
.wb-words { font-family: var(--font-mono); font-size: 11.5px; font-variant-numeric: tabular-nums; color: var(--ink-2); }
.wb-empty { padding: 28px; text-align: center; color: var(--muted); font-style: italic; }
</style>
