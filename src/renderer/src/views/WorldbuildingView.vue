<script setup>
import { computed, ref } from "vue";
import { useProjectStore } from "../stores/project.js";
import { useRouter } from "vue-router";
import PaneHeader from "../components/PaneHeader.vue";
import Icon from "../components/Icon.vue";
import RichEditor from "../components/RichEditor.vue";
import StatusSelect from "../components/StatusSelect.vue";
import Breadcrumb from "../components/Breadcrumb.vue";
import { promptDialog, confirmDialog } from "../services/dialog.js";
import { NEW_ENTITY_META } from "../services/entityMeta.js";

// ── PrimeVue components (spike) ──────────────────────────────────────
import DataTable from "primevue/datatable";
import Column from "primevue/column";
import InputText from "primevue/inputtext";
import Select from "primevue/select";
import MultiSelect from "primevue/multiselect";
import Tag from "primevue/tag";
import Button from "primevue/button";
import { FilterMatchMode, FilterOperator } from "@primevue/core/api";

const props = defineProps({ id: { type: String, default: "" } });
const project = useProjectStore();
const router = useRouter();
const article = computed(() => props.id ? project.worldbuildingById(props.id) : null);
const cat = computed(() => article.value ? project.worldbuildingCategories.find((c) => c.id === article.value.category) : null);

function update(k, v) { project.updateWorldbuilding(article.value.id, { [k]: v }); }

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

// Distinct values per filterable column — fed to MultiSelect / Select dropdowns.
const categoryOptions = computed(() =>
  project.worldbuildingCategories.map((c) => ({ value: c.id, label: c.label })),
);
const statusOptions = computed(() => {
  const seen = new Set();
  const out = [];
  for (const s of project.statuses) {
    if (seen.has(s.id)) continue;
    seen.add(s.id);
    out.push({ value: s.id, label: s.label });
  }
  return out;
});
const allTags = computed(() => {
  const tags = new Set();
  for (const a of project.worldbuilding) for (const t of (a.tags || [])) tags.add(t);
  return [...tags].sort().map((t) => ({ value: t, label: t }));
});

// PrimeVue DataTable filter config — `global` powers the search box,
// per-column filters drive the in-column filter UI.
const filters = ref({
  global:   { value: null, matchMode: FilterMatchMode.CONTAINS },
  title:    { operator: FilterOperator.AND, constraints: [{ value: null, matchMode: FilterMatchMode.CONTAINS }] },
  category: { value: null, matchMode: FilterMatchMode.EQUALS },
  status:   { value: null, matchMode: FilterMatchMode.EQUALS },
  tags:     { value: null, matchMode: FilterMatchMode.ARRAY_CONTAINS_ANY },
});
const globalQuery = ref("");
function onGlobalInput(e) {
  globalQuery.value = e.target.value;
  filters.value.global.value = e.target.value || null;
}
function clearAllFilters() {
  globalQuery.value = "";
  filters.value.global.value = null;
  filters.value.title.constraints[0].value = null;
  filters.value.category.value = null;
  filters.value.status.value = null;
  filters.value.tags.value = null;
}

function statusLabel(id) { return project.statusById(id)?.label || id || ""; }
function statusSeverity(id) {
  // Map status ids onto PrimeVue Tag severities so the colors track
  // the editorial palette via our preset overrides.
  if (id === "done")    return "success";
  if (id === "revise")  return "warn";
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
      <Button label="New article" severity="primary" size="small" @click="addArticle">
        <template #icon><Icon name="Plus" :size="14" /></template>
      </Button>
    </PaneHeader>
    <div class="pane-card">
      <div class="scrollarea" style="padding:18px 22px 40px">

        <!-- Global search + filter reset -->
        <div class="wb-toolbar">
          <span class="wb-search">
            <Icon name="Search" :size="13" class="wb-search-icon" />
            <InputText
              :value="globalQuery"
              placeholder="Search articles…"
              @input="onGlobalInput"
              class="wb-search-input"
            />
          </span>
          <Button label="Clear filters" severity="secondary" text size="small" @click="clearAllFilters" />
          <span class="wb-count">{{ rows.length }} article{{ rows.length === 1 ? "" : "s" }}</span>
        </div>

        <DataTable
          :value="rows"
          v-model:filters="filters"
          :global-filter-fields="['title', 'summary', 'tags']"
          filter-display="menu"
          row-hover
          selection-mode="single"
          data-key="id"
          @row-click="onRowClick"
          paginator
          :rows="20"
          :rows-per-page-options="[10, 20, 50, 100]"
          class="wb-table"
        >
          <template #empty>
            <div class="wb-empty">No articles match your filters.</div>
          </template>

          <Column field="title" header="Title" sortable :show-filter-match-modes="false" style="min-width: 220px">
            <template #body="{ data }">
              <div class="wb-cell-title">
                <span class="wb-cell-title-text">{{ data.title }}</span>
                <span v-if="data.summary" class="wb-cell-title-sum">{{ data.summary }}</span>
              </div>
            </template>
            <template #filter="{ filterModel }">
              <InputText v-model="filterModel.value" placeholder="Title contains…" />
            </template>
          </Column>

          <Column field="category" header="Category" sortable :show-filter-match-modes="false" style="min-width: 160px">
            <template #body="{ data }">
              <span class="wb-cat" :style="`--h:${data.categoryHue}`">
                <Icon :name="data.categoryIcon" :size="11" />
                {{ data.categoryLabel }}
              </span>
            </template>
            <template #filter="{ filterModel }">
              <Select
                v-model="filterModel.value"
                :options="categoryOptions"
                option-label="label"
                option-value="value"
                placeholder="Any category"
                show-clear
              />
            </template>
          </Column>

          <Column field="tags" header="Tags" :show-filter-match-modes="false" style="min-width: 160px">
            <template #body="{ data }">
              <div class="wb-tags">
                <Tag v-for="t in data.tags" :key="t" :value="t" severity="secondary" rounded />
              </div>
            </template>
            <template #filter="{ filterModel }">
              <MultiSelect
                v-model="filterModel.value"
                :options="allTags"
                option-label="label"
                option-value="value"
                placeholder="Any tag"
                :max-selected-labels="2"
              />
            </template>
          </Column>

          <Column field="status" header="Status" sortable :show-filter-match-modes="false" style="min-width: 120px">
            <template #body="{ data }">
              <Tag v-if="data.status" :value="statusLabel(data.status)" :severity="statusSeverity(data.status)" />
              <span v-else class="wb-status-empty">—</span>
            </template>
            <template #filter="{ filterModel }">
              <Select
                v-model="filterModel.value"
                :options="statusOptions"
                option-label="label"
                option-value="value"
                placeholder="Any status"
                show-clear
              />
            </template>
          </Column>

          <Column field="words" header="Words" sortable data-type="numeric" style="min-width: 90px; text-align: right">
            <template #body="{ data }">
              <span class="wb-words">{{ (data.words || 0).toLocaleString() }}</span>
            </template>
          </Column>
        </DataTable>
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
        <Button label="Back" severity="secondary" text size="small" @click="router.push('/worldbuilding')">
          <template #icon><Icon name="ChevRight" :size="12" style="transform:rotate(180deg)" /></template>
        </Button>
        <Button label="Delete" severity="secondary" text size="small" @click="deleteArticle" />
        <Button label="New article" severity="primary" size="small" @click="addArticle">
          <template #icon><Icon name="Plus" :size="14" /></template>
        </Button>
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
.wb-count { margin-left: auto; font-family: var(--font-mono); font-size: 11px; color: var(--muted); }

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
.wb-status-empty { color: var(--muted); }
.wb-words { font-family: var(--font-mono); font-size: 11.5px; font-variant-numeric: tabular-nums; color: var(--ink-2); }
.wb-empty { padding: 28px; text-align: center; color: var(--muted); font-style: italic; }
</style>
