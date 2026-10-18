<script setup>
import { computed, ref, watch } from "vue";
import { useProjectStore } from "../stores/project.js";
import { useUiStore } from "../stores/ui.js";
import { useRouter } from "vue-router";
import { PaneHeader, pageFill } from "@delebash/ui";
import { Icon } from "@delebash/ui";
import RichEditor from "../components/RichEditor.vue";
import StatusSelect from "../components/StatusSelect.vue";
import TagEditor from "../components/TagEditor.vue";
import { promptDialog } from "@delebash/ui";
import { NEW_ENTITY_META } from "../services/entityMeta.js";

import EntityIndex from "../components/EntityIndex.vue";
import { UiInput } from "@delebash/ui";
import { UiTag } from "@delebash/ui";
import { UiButton } from "@delebash/ui";
import { UiTextarea } from "@delebash/ui";
import { UiCheckbox } from "@delebash/ui";
import { bookIndexOn } from "../services/rag/vectorStore.js";
import { AiTaskStrip, UiBanner, useAiTasksStore } from "@delebash/ui";
import { draftArticle, STORY_WORLD_FEATURE } from "../services/analysis/sheetDraft.js";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

const props = defineProps({ id: { type: String, default: "" } });
// A category saved without an icon of its own shows this one.
const FALLBACK_CATEGORY_ICON = "Sparkle";
const project = useProjectStore();
const ui = useUiStore();
const router = useRouter();
const article = computed(() => props.id ? project.worldbuildingById(props.id) : null);
const cat = computed(() => article.value ? project.worldbuildingCategories.find((c) => c.id === article.value.category) : null);

function update(k, v) { project.updateWorldbuilding(article.value.id, { [k]: v }); }

// Draft with AI (2026-10-16, the AI drafting spec §9.1): the body from the title, the summary and
// the book, landing in the editor as one change to accept or reject (RichEditor proposeDocument).
// Progress and Cancel are the shared AiTaskStrip's.
const bodyEditor = ref(null);
const aiTasks = useAiTasksStore();
const draftTask = computed(() => aiTasks.runningTasks.find(
  (task) => task.feature === STORY_WORLD_FEATURE && task.meta?.entityId === article.value?.id));
const draftError = ref("");
watch(() => article.value?.id, () => { draftError.value = ""; });
async function draftBody() {
  if (!article.value || draftTask.value) return;
  draftError.value = "";
  const id = article.value.id;
  try {
    const { html } = await draftArticle({ project, articleId: id });
    if (article.value?.id !== id) return; // the writer moved to another article meanwhile
    if (!html) { draftError.value = t("worldbuilding.draft.empty"); return; }
    bodyEditor.value?.proposeDocument(html);
  } catch (e) {
    const msg = e?.message || String(e);
    if (!/abort|cancel/i.test(msg)) draftError.value = msg;
  }
}

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
    title: t(M.titleKey),
    confirmLabel: t(M.confirmLabelKey),
    fields: [
      { key: "title", label: t(M.labelKey), placeholder: t(M.placeholderKey) },
      {
        key: "category",
        label: t("common.category"),
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
    question: t("common.tellMeAbout", { name: article.value.title }),
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
      categoryIcon:  c?.icon  || FALLBACK_CATEGORY_ICON,
      categoryHue:   c?.hue   || 200,
    };
  }),
);

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

// Declarative facets for the shared EntityIndex — Category and Status are
// single-select, Tags is multi-select with ANY-match semantics. The filtering,
// the chip markup and the clear-all live in components/EntityIndex.vue now, not
// in a private copy per view; global text search stays in UiTable's hands so its
// filteredRowModel still works.
const facets = computed(() => [
  { key: "category", label: t("common.category"), options: categoryOptions.value },
  { key: "status", label: t("common.status"), options: statusOptions.value },
  {
    key: "tags", label: t("common.tags"), multi: true,
    options: allTags.value.map((t) => ({ value: t, label: t })),
    match: (row, tag) => (row.tags || []).includes(tag),
  },
]);

// UiTable column definitions. Each column's accessorKey ties into the
// matching slot below (#title, #category, #tags, #status, #words).
const columns = computed(() => [
  { accessorKey: "title",     header: t("common.title"),    sortable: true, headerStyle: "min-width: 220px" },
  { accessorKey: "category",  header: t("common.category"), sortable: true, headerStyle: "min-width: 160px" },
  { accessorKey: "tags",      header: t("common.tags"),     sortable: false, headerStyle: "min-width: 160px", enableGlobalFilter: true },
  { accessorKey: "status",    header: t("common.status"),   sortable: true, headerStyle: "min-width: 120px" },
  { accessorKey: "words",     header: t("common.words"),    sortable: true, headerStyle: "min-width: 90px; text-align: right", cellStyle: "text-align: right" },
]);

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
  <q-page :style-fn="pageFill" class="main">
    <template v-if="!article">
      <PaneHeader :eyebrow="$t('panes.worldbuilding.eyebrow')" :title="$t('nav.worldbuilding')" help-key="worldbuilding#worldbuilding">
        <UiButton :label="$t('worldbuilding.newArticle')" intent="primary" size="small" @click="addArticle">
          <template #icon><Icon name="Plus" :size="14" /></template>
        </UiButton>
      </PaneHeader>
      <!-- Empty state -->
      <div v-if="project.worldbuilding.length === 0" class="pane-card" style="display:grid;place-items:center;padding:60px">
        <div class="t-muted" style="text-align:center;max-width:420px">
          <div style="font-size:14px;color:var(--ink);margin-bottom:6px">{{ $t("worldbuilding.emptyTitle") }}</div>
          <div style="font-size:12.5px;margin-bottom:14px">{{ $t("worldbuilding.emptyBody") }}</div>
          <UiButton intent="primary" @click="addArticle"><Icon name="Plus" :size="14" /> {{ $t("worldbuilding.createFirst") }}</UiButton>
        </div>
      </div>

      <EntityIndex v-else
        :rows="rows"
        :columns="columns"
        :facets="facets"
        :search-fields="['title', 'summary', 'tags']"
        :search-placeholder="t('worldbuilding.searchPlaceholder')"
        :empty-text="t('worldbuilding.searchEmpty')"
        @row-click="onRowClick">
        <template #intro>
          <p class="entity-desc wb-desc" style="padding: 0; margin: 0 0 18px">
            {{ $t("worldbuilding.intro", { articleTerm: $t("worldbuilding.articleTerm") }) }}
          </p>
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
          <span class="wb-words">{{ $n(row.words || 0) }}</span>
        </template>
      </EntityIndex>
    </template>

    <template v-else>
      <PaneHeader :crumbs="[{ label: cat?.label || $t('nav.worldbuilding'), to: '/worldbuilding' }]"
        editable :title="article.title" :placeholder="$t('worldbuilding.titlePlaceholder')"
        @update:title="(v) => update('title', v)">
        <UiButton v-if="bookIndexOn" intent="ghost" size="small" data-panel-toggle @click="askTheBook"
          v-tooltip.bottom="$t('common.askTheBookAbout', { title: article.title })">
          <Icon name="Chat" :size="14" /> {{ $t("sidebar.nav.askTheBook") }}
        </UiButton>
        <UiButton intent="ghost" size="small" :disabled="!!draftTask" @click="draftBody"
          v-tooltip.bottom="$t('worldbuilding.draft.tooltip')">
          <Icon name="Sparkle" :size="14" /> {{ $t("worldbuilding.draft.button") }}
        </UiButton>
        <UiButton :label="$t('common.back')" intent="ghost" size="small" @click="router.push('/worldbuilding')">
          <template #icon><Icon name="ChevRight" :size="12" style="transform:rotate(180deg)" /></template>
        </UiButton>
        <UiButton :label="$t('common.delete')" intent="ghost" size="small" @click="deleteArticle" />
        <UiButton :label="$t('worldbuilding.newArticle')" intent="primary" size="small" @click="addArticle">
          <template #icon><Icon name="Plus" :size="14" /></template>
        </UiButton>
        <StatusSelect :model-value="article.status || ''" @update:model-value="(v) => update('status', v)" />
      </PaneHeader>

      <div class="pane-card">
        <p class="entity-desc wb-desc">
          {{ $t("worldbuilding.intro", { articleTerm: $t("worldbuilding.articleTerm") }) }}
        </p>
        <div style="padding:14px 22px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:16px">
          <UiInput class="input"
            style="flex:1;font-style:italic;color:var(--muted);font-size:13.5px;border:0;background:transparent;padding:0;font-family:var(--font-serif)"
            :placeholder="$t('worldbuilding.summaryLabel')"
            :value="article.summary" @input="update('summary', $event.target.value)" />
        </div>

        <TagEditor
          :model-value="article.tags || []"
          :pool="tagPool"
          :curated="project.tagVocabularies.worldbuilding"
          @update:model-value="(v) => update('tags', v)" />

        <label class="chip" style="cursor:pointer;gap:6px;padding:8px 14px"
          v-tooltip.bottom="$t('common.excludeFromAiTooltip')">
          <UiCheckbox :model-value="!!article.excludeFromAi" @update:model-value="(v) => update('excludeFromAi', v)" />
          {{ $t("common.excludeFromAi") }}
        </label>

        <div v-if="draftTask || draftError" class="wb-draft">
          <AiTaskStrip :task="draftTask" />
          <UiBanner v-if="draftError">{{ draftError }}</UiBanner>
        </div>

        <RichEditor ref="bodyEditor"
          :model-value="article.body"
          :placeholder="$t('worldbuilding.bodyPlaceholder')"
          @change="(html) => update('body', html)"
        />
      </div>
    </template>
  </q-page>
</template>

<style scoped>
/* Shared shapes = global .entity-*; wb-desc composes its padding on top. */
.wb-desc { padding: 14px 22px 0; }
.wb-draft { padding: 8px 22px; }

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
