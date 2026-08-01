<script setup>
import { computed } from "vue";
import { useRouter } from "vue-router";
import { useProjectStore } from "../stores/project.js";
import { useUiStore } from "../stores/ui.js";
import RichEditor from "../components/RichEditor.vue";
import { EDITOR_TOOLBAR_DOC } from "../services/editorToolbars.js";
import { Icon } from "@delebash/llm-ui";
import { UiButton } from "@delebash/llm-ui";
import { UiTag } from "@delebash/llm-ui";
import { UiTable } from "@delebash/llm-ui";
import StatusSelect from "../components/StatusSelect.vue";
import { Breadcrumb } from "@delebash/llm-ui";
import PaneHeader from "../components/PaneHeader.vue";

const props = defineProps({ id: { type: String, default: "" } });
const project = useProjectStore();
const ui = useUiStore();
const router = useRouter();

// The three foundation docs are a FIXED set — their name and their "what this is"
// line are not per-book data (they never change), so both are hardcoded here rather
// than stored/edited. The body (the rich editor) is the only thing the user writes.
const ARCH_DOCS = {
  premise: { title: "Premise", description: "The whole novel in one sentence — the core conflict and its resolution." },
  fabula:  { title: "Fabula",  description: "The events of the story in logical, chronological order — cause and effect." },
  setting: { title: "Setting", description: "The place, time, and social context the story unfolds in." },
};
function docMeta(id) { return ARCH_DOCS[id] || { title: id, description: "" }; }

const doc = computed(() => props.id ? project.architecture[props.id] : null);

function update(k, v) { project.updateArchitecture(doc.value.id, { [k]: v }); }
function openEvents() { router.push("/architecture/setting/events"); }
function askTheBook() {
  if (!doc.value) return;
  ui.openChatPanelFor({
    mode: "book",
    question: `Tell me about the ${doc.value.id} document`,
    sourceKey: `ask:arch:${doc.value.id}`,
  });
}

const rows = computed(() => Object.values(project.architecture).filter(Boolean));

const columns = [
  { accessorKey: "title",       header: "Title",       sortable: true,  headerStyle: "min-width: 180px" },
  { accessorKey: "description",  header: "Description", sortable: false, headerStyle: "min-width: 260px" },
  { accessorKey: "status",      header: "Status",      sortable: true,  headerStyle: "min-width: 120px" },
];

function statusLabel(id) { return project.statusById(id)?.label || id || ""; }
function statusSeverity(id) {
  if (id === "done")   return "success";
  if (id === "revise") return "accent2";
  if (id === "draft")  return "info";
  if (id === "todo")   return "secondary";
  return "secondary";
}

function onRowClick(event) {
  const id = event?.data?.id;
  if (id) { ui.select("architecture", id); router.push(`/architecture/${id}`); }
}
</script>

<template>
  <!-- ── List mode (no id in URL) ─────────────────────────────── -->
  <template v-if="!doc && !id">
    <PaneHeader :eyebrow="$t('panes.architecture.eyebrow')" :title="$t('nav.architecture')" help-key="worldbuilding#architecture" />

    <div class="pane-card">
      <div class="scrollarea" style="padding:18px 22px 40px">
        <div class="arch-count">{{ $t("architecture.documentCount", { n: rows.length }, rows.length) }}</div>

        <UiTable
          :data="rows"
          :columns="columns"
          data-key="id"
          row-hover
          class="entity-table"
          @row-click="onRowClick"
        >
          <template #title="{ row }">
            <div class="entity-cell-title">
              <span class="entity-cell-title-text">{{ docMeta(row.id).title }}</span>
            </div>
          </template>

          <template #description="{ row }">
            <span class="entity-cell-sub">{{ docMeta(row.id).description || '—' }}</span>
          </template>

          <template #status="{ row }">
            <UiTag v-if="row.status" :value="statusLabel(row.status)" :intent="statusSeverity(row.status)" />
            <span v-else class="entity-status-empty">—</span>
          </template>
        </UiTable>
      </div>
    </div>
  </template>

  <!-- ── Detail mode (id present, doc found) ──────────────────── -->
  <template v-else-if="doc">
    <header class="pane-header arch-pane-header">
      <div class="pane-title">
        <Breadcrumb :segments="[{ label: 'Architecture', to: '/architecture' }]" />
        <h1 class="arch-title">{{ docMeta(doc.id).title }}</h1>
      </div>
      <div class="pane-actions">
        <UiButton intent="ghost" size="small" data-panel-toggle @click="askTheBook"
          v-tooltip.bottom="$t('architecture.askTheBookAbout', { title: doc.title })">
          <Icon name="Chat" :size="14" /> {{ $t("sidebar.nav.askTheBook") }}
        </UiButton>
        <UiButton v-if="doc.id === 'setting'" intent="ghost" size="small" @click="openEvents"><Icon name="Calendar" :size="14" /> {{ $t("common.events") }}</UiButton>
        <StatusSelect :model-value="doc.status || ''" @update:model-value="(v) => update('status', v)" />
      </div>
    </header>

    <div class="pane-card">
      <div class="arch-wrap scrollarea">
        <p class="arch-desc">{{ docMeta(doc.id).description }}</p>

        <RichEditor
          :model-value="doc.body"
          :placeholder="$t('architecture.bodyPlaceholder')"
          variant="inline"
          :toolbar="EDITOR_TOOLBAR_DOC"
          :min-height="280"
          @change="(html) => update('body', html)"
        />
      </div>
    </div>
  </template>

  <!-- ── id in URL but doc not found ─────────────────────────── -->
  <template v-else>
    <header class="pane-header arch-pane-header">
      <div class="pane-title">
        <Breadcrumb :segments="[{ label: $t('nav.architecture'), to: '/architecture' }]" />
        <h1 class="pane-h1">{{ $t("architecture.notFoundTitle") }}</h1>
      </div>
    </header>
    <div class="pane-card" style="display:grid;place-items:center;padding:60px">
      <div class="t-muted" style="text-align:center">
        {{ $t("architecture.notFoundBody") }}<br />
        <UiButton intent="ghost" style="margin-top:14px" @click="router.push('/architecture')">{{ $t("architecture.backToList") }}</UiButton>
      </div>
    </div>
  </template>
</template>

<style scoped>
.arch-wrap {
  flex: 1;
  min-height: 0;
  padding: 22px 26px 40px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.arch-pane-header .pane-title { gap: 4px; }
.arch-title {
  font-family: var(--font-serif);
  font-size: 22px;
  font-weight: 600;
  margin: 0;
  line-height: 1.2;
}
/* Fixed "what this section is" line — a hint, not editable, not stored. */
.arch-desc {
  font-family: var(--font-serif);
  font-style: italic;
  color: var(--ink-2);
  font-size: 14px;
  margin: 0;
}

/* List view: shared shapes = global .entity-*; only the doc count stays local. */
.arch-count { font-family: var(--font-mono); font-size: 11px; color: var(--muted); font-variant-numeric: tabular-nums; margin-bottom: 14px; }
</style>
