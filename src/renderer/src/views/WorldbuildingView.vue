<script setup>
import { computed, ref } from "vue";
import { useProjectStore } from "../stores/project.js";
import { useUiStore } from "../stores/ui.js";
import { useRouter } from "vue-router";
import PaneHeader from "../components/PaneHeader.vue";
import { Icon } from "@delebash/llm-ui";
import RichEditor from "../components/RichEditor.vue";
import StatusSelect from "../components/StatusSelect.vue";
import { Breadcrumb } from "@delebash/llm-ui";
import TagEditor from "../components/TagEditor.vue";
import { promptDialog } from "@delebash/llm-ui";
import { NEW_ENTITY_META } from "../services/entityMeta.js";

import { UiTable } from "@delebash/llm-ui";
import { UiInput } from "@delebash/llm-ui";
import { UiTag } from "@delebash/llm-ui";
import { UiButton } from "@delebash/llm-ui";
import { UiTextarea } from "@delebash/llm-ui";
import { UiCheckbox } from "@delebash/llm-ui";

const props = defineProps({ id: { type: String, default: "" } });
const project = useProjectStore();
const ui = useUiStore();
const router = useRouter();
const article = computed(() => props.id ? project.worldbuildingById(props.id) : null);
const cat = computed(() => article.value ? project.worldbuildingCategories.find((c) => c.id === article.value.category) : null);

function update(k, v) { project.updateWorldbuilding(article.value.id, { [k]: v }); }

// Pool feeding the tag typeahead — every tag in use across every
// worldbuilding article. TagEditor dedups and filters internally; we
// just hand it the flat list.
const tagPool = computed(() => {
  const out = [];
  for (const a of project.worldbuilding) for (const t of (a.tags || [])) out.push(t);
  return out;
});

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
  if (!values?.title) return;
  const id = project.addWorldbuilding({ title: values.title, category: values.category || "geography" });
  router.push(`/worldbuilding/${id}`);
}

function askTheBook() {
  if (!article.value) return;
  ui.openChatPanelFor({
    mode: "book",
    question: `Tell me about ${article.value.title}`,
    sourceKey: `ask:wb:${article.value.id}`,
  });
}
function deleteArticle() {
  if (!article.value) return;
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
// table sees pre-filtered rows so UiTable doesn't have to model facets.
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

// Pre-filter rows by the three facets before handing to UiTable. Global
// text search stays in UiTable's hands so its filteredRowModel still works.
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

// UiTable column definitions. Each column's accessorKey ties into the
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
  // Map status ids onto UiTag intents so colors track the editorial palette.
  if (id === "done")    return "success";
  if (id === "revise")  return "accent2";
  if (id === "draft")   return "info";
  if (id === "todo")    return "secondary";
  return "secondary";
}

function onRowClick(event) {
  const id = event?.data?.id;
  if (id) { ui.select("worldbuilding", id); router.push(`/worldbuilding/${id}`); }
}
</script>

<template>
  <template v-if="!article">
    <PaneHeader :eyebrow="$t('panes.worldbuilding.eyebrow')" :title="$t('nav.worldbuilding')" help-key="worldbuilding#worldbuilding">
      <UiButton label="New article" intent="primary" size="small" @click="addArticle">
        <template #icon><Icon name="Plus" :size="14" /></template>
      </UiButton>
    </PaneHeader>
    <!-- Empty state -->
    <div v-if="project.worldbuilding.length === 0" class="pane-card" style="display:grid;place-items:center;padding:60px">
      <div class="t-muted" style="text-align:center;max-width:420px">
        <div style="font-size:14px;color:var(--ink);margin-bottom:6px">No worldbuilding articles yet.</div>
        <div style="font-size:12.5px;margin-bottom:14px">Long-form articles for lore, magic systems, cultures — anything you'd put in an appendix. AI features pull relevant articles as story-world context.</div>
        <UiButton intent="primary" @click="addArticle"><Icon name="Plus" :size="14" /> Create your first article</UiButton>
      </div>
    </div>

    <div v-else class="pane-card">
      <div class="scrollarea" style="padding:18px 22px 40px">
        <p class="entity-desc wb-desc" style="padding: 0; margin: 0 0 18px">
          A <strong>worldbuilding article</strong> is long-form reference that doesn't belong on
          a character, location, or object sheet — a magic system, a kingdom's history, an
          invented language, a calendar, a religion. Organise articles by category, tag them
          freely; AI features that draw on story-world context will reach for the article when
          it's relevant.
        </p>

        <!-- Global search + filter reset -->
        <div class="entity-toolbar">
          <span class="entity-search">
            <Icon name="Search" :size="13" class="entity-search-icon" />
            <UiInput
              :value="globalQuery"
              placeholder="Search articles…"
              @input="onGlobalInput"
              class="entity-search-input"
            />
          </span>
          <UiButton v-if="globalQuery || hasActiveFacets" label="Clear filters" intent="ghost" size="small" @click="clearAllFilters" />
          <span class="entity-count">{{ filteredRows.length }} of {{ rows.length }}</span>
        </div>

        <!-- Facet filter chips: Category (single), Status (single), Tags (multi). -->
        <div class="entity-facets" v-if="categoryOptions.length || statusOptions.length || allTags.length">
          <div v-if="categoryOptions.length" class="entity-facet">
            <span class="entity-facet-label">Category</span>
            <button class="entity-chip" :class="{ active: !selectedCategory }" @click="selectedCategory = null">All</button>
            <button v-for="c in categoryOptions" :key="c.value"
              class="entity-chip" :class="{ active: selectedCategory === c.value }"
              @click="selectedCategory = selectedCategory === c.value ? null : c.value">
              {{ c.label }}
            </button>
          </div>
          <div v-if="statusOptions.length" class="entity-facet">
            <span class="entity-facet-label">Status</span>
            <button class="entity-chip" :class="{ active: !selectedStatus }" @click="selectedStatus = null">All</button>
            <button v-for="s in statusOptions" :key="s.value"
              class="entity-chip" :class="{ active: selectedStatus === s.value }"
              @click="selectedStatus = selectedStatus === s.value ? null : s.value">
              {{ s.label }}
            </button>
          </div>
          <div v-if="allTags.length" class="entity-facet">
            <span class="entity-facet-label">Tags</span>
            <button v-for="t in allTags" :key="t"
              class="entity-chip" :class="{ active: selectedTags.has(t) }"
              @click="toggleTag(t)">
              {{ t }}
            </button>
          </div>
        </div>

        <UiTable
          :data="filteredRows"
          :columns="columns"
          data-key="id"
          row-hover
          :global-filter="globalQuery"
          :global-filter-fields="['title', 'summary', 'tags']"
          :pagination="{ pageSize: 20, pageSizeOptions: [10, 20, 50, 100] }"
          class="entity-table"
          @row-click="onRowClick"
        >
          <template #empty>
            <div class="entity-empty">No articles match your search.</div>
          </template>

          <template #title="{ row }">
            <div class="entity-cell-title">
              <span class="entity-cell-title-text">{{ row.title }}</span>
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
            <div class="entity-tags">
              <UiTag v-for="t in row.tags" :key="t" :value="t" intent="secondary" />
            </div>
          </template>

          <template #status="{ row }">
            <UiTag v-if="row.status" :value="statusLabel(row.status)" :intent="statusSeverity(row.status)" />
            <span v-else class="entity-status-empty">—</span>
          </template>

          <template #words="{ row }">
            <span class="wb-words">{{ (row.words || 0).toLocaleString() }}</span>
          </template>
        </UiTable>
      </div>
    </div>
  </template>

  <template v-else>
    <header class="pane-header entity-pane-header">
      <div class="pane-title">
        <Breadcrumb :segments="[{ label: cat?.label || 'Worldbuilding', to: '/worldbuilding' }]" />
        <input class="entity-name"
          placeholder="Article title"
          :value="article.title" @input="update('title', $event.target.value)" />
      </div>
      <div class="pane-actions">
        <UiButton intent="ghost" size="small" data-panel-toggle @click="askTheBook"
          v-tooltip.bottom="`Ask the book about ${article.title}`">
          <Icon name="Chat" :size="14" /> Ask the book
        </UiButton>
        <UiButton label="Back" intent="ghost" size="small" @click="router.push('/worldbuilding')">
          <template #icon><Icon name="ChevRight" :size="12" style="transform:rotate(180deg)" /></template>
        </UiButton>
        <UiButton label="Delete" intent="ghost" size="small" @click="deleteArticle" />
        <UiButton label="New article" intent="primary" size="small" @click="addArticle">
          <template #icon><Icon name="Plus" :size="14" /></template>
        </UiButton>
        <StatusSelect :model-value="article.status || ''" @update:model-value="(v) => update('status', v)" />
      </div>
    </header>

    <div class="pane-card">
      <p class="entity-desc wb-desc">
        A <strong>worldbuilding article</strong> is long-form reference that doesn't belong on
        a character, location, or object sheet — a magic system, a kingdom's history, an
        invented language, a calendar, a religion. Organise articles by category, tag them
        freely; AI features that draw on story-world context will reach for the article when
        it's relevant.
      </p>
      <div style="padding:14px 22px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:16px">
        <UiInput class="input"
          style="flex:1;font-style:italic;color:var(--muted);font-size:13.5px;border:0;background:transparent;padding:0;font-family:var(--font-serif)"
          placeholder="Summary"
          :value="article.summary" @input="update('summary', $event.target.value)" />
      </div>

      <TagEditor
        :model-value="article.tags || []"
        :pool="tagPool"
        :curated="project.tagVocabularies.worldbuilding"
        @update:model-value="(v) => update('tags', v)" />

      <label class="chip" style="cursor:pointer;gap:6px;padding:8px 14px"
        v-tooltip.bottom="'Hides this entity from any AI feature that pulls in story-world context.'">
        <UiCheckbox :model-value="!!article.excludeFromAi" @update:model-value="(v) => update('excludeFromAi', v)" />
        Exclude from AI
      </label>

      <RichEditor
        :model-value="article.body"
        placeholder="Write the article…"
        @change="(html) => update('body', html)"
      />
    </div>
  </template>
</template>

<style scoped>
/* Shared shapes = global .entity-*; wb-desc composes its padding on top. */
.wb-desc { padding: 14px 22px 0; }

/* List view: shared shapes = global .entity-*; only these per-view cells stay local. */
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

.wb-words { font-family: var(--font-mono); font-size: 11.5px; font-variant-numeric: tabular-nums; color: var(--ink-2); }
</style>
