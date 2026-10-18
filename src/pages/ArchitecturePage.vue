<script setup>
import { computed, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { useProjectStore } from "../stores/project.js";
import { useUiStore } from "../stores/ui.js";
import RichEditor from "../components/RichEditor.vue";
import { EDITOR_TOOLBAR_DOC } from "../services/editorToolbars.js";
import { Icon, pageFill } from "@delebash/ui";
import { UiButton } from "@delebash/ui";
import { UiTag } from "@delebash/ui";
import { UiTable } from "@delebash/ui";
import StatusSelect from "../components/StatusSelect.vue";
import { PaneHeader } from "@delebash/ui";
import { bookIndexOn } from "../services/rag/vectorStore.js";
import { AiTaskStrip, UiBanner, useAiTasksStore } from "@delebash/ui";
import { PLANNING_FEATURE, draftFromPremise } from "../services/analysis/planningDraft.js";
import { tEnglish } from "../i18n/index.js";
import { ARCH_DOCS } from "../services/architectureDocs.js";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

const props = defineProps({ id: { type: String, default: "" } });
const project = useProjectStore();
const ui = useUiStore();
const router = useRouter();

// The three foundation docs are a FIXED set (services/architectureDocs.js — shared with the
// sidebar): their name and "what this is" line come from the catalog by id.
function docMeta(id) {
  const d = ARCH_DOCS[id];
  return d ? { title: t(d.titleKey), description: t(d.descriptionKey) } : { title: id, description: "" };
}

const doc = computed(() => props.id ? project.architecture[props.id] : null);

function update(k, v) { project.updateArchitecture(doc.value.id, { [k]: v }); }

// Draft from the premise (slice 3, 2026-10-16; the spec §5): the Fabula and the Setting from the
// book's premise, landing in the editor as one change to accept or reject (RichEditor
// proposeDocument). The model reads the document's name and purpose in English.
const PREMISE_DRAFTED = ["fabula", "setting"];
const docEditor = ref(null);
const aiTasks = useAiTasksStore();
const draftTask = computed(() => aiTasks.runningTasks.find(
  (task) => task.feature === PLANNING_FEATURE && task.meta?.docId === doc.value?.id));
const draftError = ref("");
watch(() => doc.value?.id, () => { draftError.value = ""; });
async function draftDoc() {
  const d = doc.value;
  if (!d || draftTask.value) return;
  draftError.value = "";
  const keys = ARCH_DOCS[d.id];
  try {
    const { html } = await draftFromPremise({
      project, docId: d.id, title: tEnglish(keys.titleKey), purpose: tEnglish(keys.descriptionKey),
    });
    if (doc.value?.id !== d.id) return; // the writer moved to another document meanwhile
    if (!html) { draftError.value = t("architecture.draft.empty"); return; }
    docEditor.value?.proposeDocument(html);
  } catch (e) {
    const msg = e?.message || String(e);
    if (!/abort|cancel/i.test(msg)) draftError.value = msg;
  }
}
function openEvents() { router.push("/architecture/setting/events"); }
function askTheBook() {
  if (!doc.value) return;
  ui.openChatPanelFor({
    mode: "book",
    question: t("architecture.askAbout", { doc: doc.value.id }),
    sourceKey: `ask:arch:${doc.value.id}`,
  });
}

const rows = computed(() => Object.values(project.architecture).filter(Boolean));

const columns = computed(() => [
  { accessorKey: "title",       header: t("common.title"),       sortable: true,  headerStyle: "min-width: 180px" },
  { accessorKey: "description",  header: t("common.description"), sortable: false, headerStyle: "min-width: 260px" },
  { accessorKey: "status",      header: t("common.status"),      sortable: true,  headerStyle: "min-width: 120px" },
]);

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
  <q-page :style-fn="pageFill" class="main">
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
      <PaneHeader :crumbs="[{ label: $t('nav.architecture'), to: '/architecture' }]" :title="docMeta(doc.id).title">
        <UiButton v-if="bookIndexOn" intent="ghost" size="small" data-panel-toggle @click="askTheBook"
          v-tooltip.bottom="$t('architecture.askTheBookAbout', { title: doc.title })">
          <Icon name="Chat" :size="14" /> {{ $t("sidebar.nav.askTheBook") }}
        </UiButton>
        <UiButton v-if="PREMISE_DRAFTED.includes(doc.id)" intent="ghost" size="small" :disabled="!!draftTask" @click="draftDoc"
          v-tooltip.bottom="$t('architecture.draft.tooltip')">
          <Icon name="Sparkle" :size="14" /> {{ $t("architecture.draft.button") }}
        </UiButton>
        <UiButton v-if="doc.id === 'setting'" intent="ghost" size="small" @click="openEvents"><Icon name="Calendar" :size="14" /> {{ $t("common.events") }}</UiButton>
        <StatusSelect :model-value="doc.status || ''" @update:model-value="(v) => update('status', v)" />
      </PaneHeader>

      <div class="pane-card">
        <div class="arch-wrap scrollarea">
          <p class="arch-desc">{{ docMeta(doc.id).description }}</p>
          <AiTaskStrip :task="draftTask" />
          <UiBanner v-if="draftError">{{ draftError }}</UiBanner>

          <RichEditor ref="docEditor"
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
      <PaneHeader :crumbs="[{ label: $t('nav.architecture'), to: '/architecture' }]" :title="$t('architecture.notFoundTitle')"></PaneHeader>
      <div class="pane-card" style="display:grid;place-items:center;padding:60px">
        <div class="t-muted" style="text-align:center">
          {{ $t("architecture.notFoundBody") }}<br />
          <UiButton intent="ghost" style="margin-top:14px" @click="router.push('/architecture')">{{ $t("architecture.backToList") }}</UiButton>
        </div>
      </div>
    </template>
  </q-page>
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
