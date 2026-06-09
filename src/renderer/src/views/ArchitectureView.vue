<script setup>
import { computed } from "vue";
import { useRouter } from "vue-router";
import { useProjectStore } from "../stores/project.js";
import { useUiStore } from "../stores/ui.js";
import RichEditor from "../components/RichEditor.vue";
import { EDITOR_TOOLBAR_DOC } from "../services/editorToolbars.js";
import Icon from "../components/Icon.vue";
import JwButton from "@renderer/components/ui/JwButton.vue";
import JwTag from "@renderer/components/ui/JwTag.vue";
import JwTable from "@renderer/components/ui/JwTable.vue";
import StatusSelect from "../components/StatusSelect.vue";
import Breadcrumb from "../components/Breadcrumb.vue";
import JwTextarea from "@renderer/components/ui/JwTextarea.vue";
import PaneHeader from "../components/PaneHeader.vue";

const props = defineProps({ id: { type: String, default: "" } });
const project = useProjectStore();
const ui = useUiStore();
const router = useRouter();

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
  { accessorKey: "title",  header: "Title",  sortable: true,  headerStyle: "min-width: 180px" },
  { accessorKey: "blurb",  header: "Blurb",  sortable: false, headerStyle: "min-width: 260px" },
  { accessorKey: "status", header: "Status", sortable: true,  headerStyle: "min-width: 120px" },
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
        <p class="arch-desc" style="margin: 0 0 18px">
          <strong>Architecture</strong> holds your book's three foundation documents —
          <strong>Premise</strong> (one paragraph: what the book is about),
          <strong>Fabula</strong> (the cause-and-effect chain of events in story chronology),
          and <strong>Setting</strong> (world and time-period context). These three slots are
          always present; treat them as the bones the rest of your planning hangs on.
        </p>

        <div class="arch-count">{{ rows.length }} documents</div>

        <JwTable
          :data="rows"
          :columns="columns"
          data-key="id"
          row-hover
          class="arch-table"
          @row-click="onRowClick"
        >
          <template #title="{ row }">
            <div class="arch-cell-title">
              <span class="arch-cell-title-text">{{ row.title }}</span>
            </div>
          </template>

          <template #blurb="{ row }">
            <span class="arch-cell-blurb">{{ row.blurb || '—' }}</span>
          </template>

          <template #status="{ row }">
            <JwTag v-if="row.status" :value="statusLabel(row.status)" :intent="statusSeverity(row.status)" />
            <span v-else class="arch-status-empty">—</span>
          </template>
        </JwTable>
      </div>
    </div>
  </template>

  <!-- ── Detail mode (id present, doc found) ──────────────────── -->
  <template v-else-if="doc">
    <header class="pane-header arch-pane-header">
      <div class="pane-title">
        <Breadcrumb :segments="[{ label: 'Architecture', to: '/architecture' }]" />
        <input class="input arch-title"
          :value="doc.title" @input="update('title', $event.target.value)" />
      </div>
      <div class="pane-actions">
        <JwButton intent="ghost" size="small" data-chat-toggle @click="askTheBook"
          v-tooltip.bottom="`Ask the book about ${doc.title}`">
          <Icon name="Chat" :size="14" /> Ask the book
        </JwButton>
        <JwButton v-if="doc.id === 'setting'" intent="ghost" size="small" @click="openEvents"><Icon name="Calendar" :size="14" /> Events</JwButton>
        <StatusSelect :model-value="doc.status || ''" @update:model-value="(v) => update('status', v)" />
      </div>
    </header>

    <div class="pane-card">
      <div class="arch-wrap scrollarea">
        <p class="arch-desc">
          <strong>Architecture</strong> holds your book's three foundation documents —
          <strong>Premise</strong> (one paragraph: what the book is about),
          <strong>Fabula</strong> (the cause-and-effect chain of events in story chronology),
          and <strong>Setting</strong> (world and time-period context). These three slots are
          always present; treat them as the bones the rest of your planning hangs on.
        </p>
        <JwTextarea fluid class="arch-blurb" rows="2"
          placeholder="Blurb"
          :model-value="doc.blurb" @update:model-value="update('blurb', $event)" />

        <RichEditor
          :model-value="doc.body"
          placeholder="Write the document…"
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
        <Breadcrumb :segments="[{ label: 'Architecture', to: '/architecture' }]" />
        <h1 class="pane-h1">Document not found</h1>
      </div>
    </header>
    <div class="pane-card" style="display:grid;place-items:center;padding:60px">
      <div class="t-muted" style="text-align:center">
        This architecture document no longer exists.<br />
        <JwButton intent="ghost" style="margin-top:14px" @click="router.push('/architecture')">Back to architecture</JwButton>
      </div>
    </div>
  </template>
</template>

<style scoped>
.arch-desc {
  font-size: 14px; line-height: 1.55; color: var(--muted);
  margin: 0;
}
.arch-desc strong { color: var(--ink-2); font-weight: 600; }

.arch-wrap {
  flex: 1;
  min-height: 0;
  padding: 22px 26px 40px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.arch-pane-header .pane-title { gap: 4px; }
.arch-pane-header .arch-title {
  border: 0;
  background: transparent;
  padding: 0;
  height: auto;
}
.arch-title {
  font-family: var(--font-serif);
  font-size: 22px;
  font-weight: 600;
  border: 0;
  background: transparent;
  padding: 0;
}
.arch-blurb {
  font-family: var(--font-serif);
  font-style: italic;
  color: var(--ink-2);
  font-size: 14px;
}

/* ── List view ─────────────────────────────────────────────────── */
.arch-count { font-family: var(--font-mono); font-size: 11px; color: var(--muted); font-variant-numeric: tabular-nums; margin-bottom: 14px; }
.arch-table { font-size: 13px; }
.arch-cell-title { display: flex; flex-direction: column; gap: 2px; cursor: pointer; }
.arch-cell-title-text { font-family: var(--font-serif); font-size: 14px; color: var(--ink); }
.arch-cell-blurb { font-size: 12.5px; color: var(--ink-2); }
.arch-status-empty { color: var(--muted); }
.arch-empty { padding: 28px; text-align: center; color: var(--muted); font-style: italic; }
</style>
