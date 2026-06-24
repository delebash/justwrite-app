<script setup>
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { useProjectStore } from "../stores/project.js";
import { useUiStore } from "../stores/ui.js";
import PaneHeader from "../components/PaneHeader.vue";
import { Icon } from "@delebash/llm-ui";
import { UiButton } from "@delebash/llm-ui";
import { UiInput } from "@delebash/llm-ui";
import JwSelect from "@renderer/components/ui/JwSelect.vue";
import { UiTextarea } from "@delebash/llm-ui";
import { UiTag } from "@delebash/llm-ui";
import JwTable from "@renderer/components/ui/JwTable.vue";
import RichEditor from "../components/RichEditor.vue";
import { EDITOR_TOOLBAR_DOC } from "../services/editorToolbars.js";
import StatusSelect from "../components/StatusSelect.vue";
import SceneRefList from "../components/SceneRefList.vue";
import GroupsModal from "../components/GroupsModal.vue";
import Breadcrumb from "../components/Breadcrumb.vue";
import { promptDialog } from "@delebash/llm-ui";
import { NEW_ENTITY_META } from "../services/entityMeta.js";
import JwColorPicker from "@renderer/components/ui/JwColorPicker.vue";

const props = defineProps({ id: { type: String, default: "" } });
const project = useProjectStore();
const ui = useUiStore();
const router = useRouter();
const modal = ref(null);

const s = computed(() => props.id ? project.strandById(props.id) : null);

const BEAT_PRESETS = [
  "Inciting", "First turn", "Midpoint",
  "Crisis", "Climax", "Resolution",
  "Setup", "Reveal", "Setback", "Refusal",
];

const scenesInStrand = computed(() => {
  if (!s.value) return [];
  const out = [];
  for (const ch of project.allChapters) {
    const list = project.scenesFor(ch.id);
    list.forEach((scn, idx) => {
      if ((scn.strands || []).includes(s.value.id)) {
        out.push({
          sceneId: scn.id,
          sceneTitle: scn.title || `Scene ${idx + 1}`,
          sceneIdx: idx + 1,
          chapterId: ch.id,
          chapterTitle: ch.title,
          chapterNum: ch.num,
          sceneStatus: scn.status,
        });
      }
    });
  }
  return out;
});

function chapterById(id) { return project.chapterById(id); }
function beatSceneStatus(b) {
  if (!b.chapterId || !b.sceneId) return "";
  const scn = project.scenesFor(b.chapterId).find((s) => s.id === b.sceneId);
  return scn?.status || "";
}
function update(k, v) { project.updateStrand(s.value.id, { [k]: v }); }
function updateBeat(beatId, k, v) { project.updateStrandBeat(s.value.id, beatId, { [k]: v }); }
function removeBeat(beatId) { project.removeStrandBeat(s.value.id, beatId); }

const sceneOptions = computed(() => {
  const out = [];
  for (const c of project.allChapters) {
    const scenes = project.scenesFor(c.id);
    if (!scenes.length) continue;
    scenes.forEach((scn, i) => {
      out.push({
        value: `${c.id}::${scn.id}`,
        label: `Ch. ${c.num} · Scene ${i + 1}${scn.title ? ` — ${scn.title}` : ""}`,
      });
    });
  }
  return out;
});
function sceneRefLabel(b) {
  const ch = chapterById(b.chapterId);
  if (!ch) return "(no chapter)";
  const scenes = project.scenesFor(b.chapterId);
  const idx = scenes.findIndex((s) => s.id === b.sceneId);
  if (idx < 0) return `Ch. ${ch.num} · ${ch.title}`;
  const scn = scenes[idx];
  return `Ch. ${ch.num} · Scene ${idx + 1}${scn.title ? ` — ${scn.title}` : ""}`;
}
function beatRefValue(b) {
  return b.chapterId && b.sceneId ? `${b.chapterId}::${b.sceneId}` : "";
}
function setBeatRef(beatId, encoded) {
  if (!encoded) {
    project.updateStrandBeat(s.value.id, beatId, { chapterId: null, sceneId: null });
    return;
  }
  const [chapterId, sceneId] = encoded.split("::");
  project.updateStrandBeat(s.value.id, beatId, { chapterId, sceneId });
}
function goBeat(b) {
  if (!b.chapterId) return;
  ui.select("chapters", b.chapterId);
  router.push(b.sceneId ? `/chapters/${b.chapterId}/${b.sceneId}` : `/chapters/${b.chapterId}`);
}

async function addStrand() {
  const name = await promptDialog(NEW_ENTITY_META.strands);
  if (!name) return;
  const id = project.addStrand({ name });
  ui.select("strands", id);
  router.push(`/strands/${id}`);
}

function askTheBook() {
  if (!s.value) return;
  ui.openChatPanelFor({
    mode: "book",
    question: `Tell me about the narrative strand "${s.value.name}"`,
    sourceKey: `ask:strand:${s.value.id}`,
  });
}
function deleteStrand() {
  const removedId = s.value.id;
  project.removeStrand(removedId);
  const next = project.strands[0];
  if (next) { ui.select("strands", next.id); router.push(`/strands/${next.id}`); }
  else router.push("/strands");
}

async function addBeat() {
  const opts = sceneOptions.value;
  const values = await promptDialog({
    title: `New beat — ${s.value.name}`,
    confirmLabel: "Add beat",
    fields: [
      {
        key: "label",
        label: "Beat",
        placeholder: "e.g. Inciting, Midpoint, Climax",
      },
      {
        key: "ref",
        label: "Scene",
        type: "select",
        defaultValue: opts[0]?.value || "",
        options: opts,
      },
      {
        key: "note",
        label: "Note (optional)",
        placeholder: "What happens at this beat?",
        optional: true,
      },
    ],
  });
  if (!values) return;
  const [chapterId, sceneId] = (values.ref || "").split("::");
  project.addStrandBeat(s.value.id, {
    label: values.label,
    chapterId: chapterId || null,
    sceneId: sceneId || null,
    note: values.note || "",
  });
}

const sortedBeats = computed(() => {
  if (!s.value) return [];
  const chOrder = new Map(project.allChapters.map((c, i) => [c.id, i]));
  const sceneIdx = (b) => {
    if (!b.chapterId || !b.sceneId) return Number.POSITIVE_INFINITY;
    const list = project.scenesFor(b.chapterId);
    const i = list.findIndex((s) => s.id === b.sceneId);
    return i < 0 ? Number.POSITIVE_INFINITY : i;
  };
  return [...(s.value.beats || [])].sort((a, b) => {
    const ai = chOrder.has(a.chapterId) ? chOrder.get(a.chapterId) : Number.POSITIVE_INFINITY;
    const bi = chOrder.has(b.chapterId) ? chOrder.get(b.chapterId) : Number.POSITIVE_INFINITY;
    if (ai !== bi) return ai - bi;
    return sceneIdx(a) - sceneIdx(b);
  });
});

// ── List mode ────────────────────────────────────────────────────────
const rows = computed(() => project.strands);

const globalQuery = ref("");
const selectedStatus = ref(null);

function onGlobalInput(e) { globalQuery.value = e.target.value; }
function clearAllFilters() {
  globalQuery.value = "";
  selectedStatus.value = null;
}

const statusOptions = computed(() =>
  project.statuses.map((s) => ({ value: s.id, label: s.label })),
);

const filteredRows = computed(() => {
  const rs = rows.value;
  if (!selectedStatus.value) return rs;
  return rs.filter((r) => r.status === selectedStatus.value);
});

const hasActiveFacets = computed(() => !!selectedStatus.value);

function scenesCountFor(strandId) {
  let count = 0;
  for (const ch of project.allChapters) {
    for (const scn of project.scenesFor(ch.id)) {
      if ((scn.strands || []).includes(strandId)) count++;
    }
  }
  return count;
}

const columns = [
  { accessorKey: "name",   header: "Name",   sortable: true, headerStyle: "min-width: 200px" },
  { accessorKey: "beats",  header: "Beats",  sortable: true, headerStyle: "min-width: 80px" },
  { accessorKey: "scenes", header: "Scenes", sortable: true, headerStyle: "min-width: 80px" },
  { accessorKey: "status", header: "Status", sortable: true, headerStyle: "min-width: 120px" },
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
  if (id) { ui.select("strands", id); router.push(`/strands/${id}`); }
}

const tableRows = computed(() =>
  filteredRows.value.map((r) => ({
    ...r,
    beats: (r.beats || []).length,
    scenes: scenesCountFor(r.id),
  })),
);
</script>

<template>
  <!-- ── List mode (no id in URL) ─────────────────────────────── -->
  <template v-if="!s && !id">
    <PaneHeader :title="$t('nav.strands')" help-key="plot-and-time#strands-view-planning-one-thread-in-detail">
      <UiButton label="New narrative strand" intent="primary" size="small" @click="addStrand">
        <template #icon><Icon name="Plus" :size="14" /></template>
      </UiButton>
    </PaneHeader>

    <div v-if="project.strands.length === 0" class="pane-card" style="display:grid;place-items:center;padding:60px">
      <div class="t-muted" style="text-align:center;max-width:420px">
        <div style="font-size:14px;color:var(--ink);margin-bottom:6px">No narrative strands yet.</div>
        <div style="font-size:12.5px;margin-bottom:14px">Narrative strands are the storylines you're weaving. Tag scenes with a strand and it surfaces on the Plot Board as a coloured lane.</div>
        <UiButton intent="primary" @click="addStrand"><Icon name="Plus" :size="14" /> Create your first narrative strand</UiButton>
      </div>
    </div>

    <div v-else class="pane-card">
      <div class="scrollarea" style="padding:18px 22px 40px">
        <div class="strands-toolbar">
          <span class="strands-search">
            <Icon name="Search" :size="13" class="strands-search-icon" />
            <UiInput
              :value="globalQuery"
              placeholder="Search narrative strands…"
              @input="onGlobalInput"
              class="strands-search-input"
            />
          </span>
          <UiButton v-if="globalQuery || hasActiveFacets" label="Clear filters" intent="ghost" size="small" @click="clearAllFilters" />
          <span class="strands-count">{{ filteredRows.length }} of {{ rows.length }}</span>
        </div>

        <div class="strands-facets" v-if="statusOptions.length">
          <div class="strands-facet">
            <span class="strands-facet-label">Status</span>
            <button class="strands-chip" :class="{ active: selectedStatus === null }" @click="selectedStatus = null">All</button>
            <button v-for="st in statusOptions" :key="st.value"
              class="strands-chip" :class="{ active: selectedStatus === st.value }"
              @click="selectedStatus = selectedStatus === st.value ? null : st.value">
              {{ st.label }}
            </button>
          </div>
        </div>

        <JwTable
          :data="tableRows"
          :columns="columns"
          data-key="id"
          row-hover
          :global-filter="globalQuery"
          :global-filter-fields="['name', 'blurb']"
          :pagination="{ pageSize: 20, pageSizeOptions: [10, 20, 50, 100] }"
          class="strands-table"
          @row-click="onRowClick"
        >
          <template #empty>
            <div class="strands-empty">No narrative strands match your search.</div>
          </template>

          <template #name="{ row }">
            <div class="strands-cell-title">
              <span v-if="row.color" class="strand-name-dot" :style="{ background: row.color }" />
              <span class="strands-cell-title-text">{{ row.name }}</span>
            </div>
          </template>

          <template #beats="{ row }">
            <span class="strands-num">{{ row.beats }}</span>
          </template>

          <template #scenes="{ row }">
            <span class="strands-num">{{ row.scenes }}</span>
          </template>

          <template #status="{ row }">
            <UiTag v-if="row.status" :value="statusLabel(row.status)" :intent="statusSeverity(row.status)" />
            <span v-else class="strands-status-empty">—</span>
          </template>
        </JwTable>
      </div>
    </div>
  </template>

  <!-- ── Detail mode (id present, strand found) ───────────────── -->
  <template v-else-if="s">
    <header class="pane-header strand-pane-header">
      <div class="pane-title">
        <Breadcrumb :segments="[{ label: 'Narrative strand', to: '/strands' }]" />
        <div class="strand-name-row">
          <span v-if="s.color" class="strand-name-dot" :style="{ background: s.color }" :title="s.color" />
          <input class="strand-name"
            :value="s.name"
            placeholder="Narrative strand name"
            @input="update('name', $event.target.value)" />
        </div>
      </div>
      <div class="pane-actions">
        <UiButton intent="ghost" size="small" data-chat-toggle @click="askTheBook"
          v-tooltip.bottom="`Ask the book about ${s.name}`">
          <Icon name="Chat" :size="14" /> Ask the book
        </UiButton>
        <UiButton intent="ghost" size="small" @click="modal = 'groups'"><Icon name="GroupIcon" :size="14" /> Groups</UiButton>
        <UiButton intent="ghost" size="small" @click="deleteStrand">Delete</UiButton>
        <UiButton intent="primary" size="small" @click="addStrand"><Icon name="Plus" :size="14" /> New narrative strand</UiButton>
        <StatusSelect :model-value="s.status || ''" @update:model-value="(v) => update('status', v)" />
      </div>
    </header>

    <div class="pane-card">
      <div class="strand-body">
            <p class="strand-desc">
              A <strong>narrative strand</strong> is a thread that runs through your manuscript —
              the main plot, a subplot, a character arc, a thematic spine. Write your synopsis
              and notes below; add <strong>beats</strong> to mark where the thread turns; tag
              scenes with this strand via each scene's <strong>Links</strong> panel. Strand
              membership also feeds the <strong>Relations</strong> graph.
            </p>
            <UiTextarea class="strand-blurb"
              :model-value="s.blurb || ''"
              placeholder="What is this narrative strand about? (One or two sentences)"
              :rows="2"
              auto-resize
              @update:model-value="(v) => update('blurb', v)" />

            <div class="strand-meta-row">
              <div class="strand-color-picker">
                <span class="t-eyebrow" style="font-size:10px;color:var(--muted)">Color</span>
                <JwColorPicker
                  :model-value="s.color"
                  aria-label="Strand color"
                  @update:model-value="update('color', $event)" />
              </div>
              <span class="strand-count">
                {{ scenesInStrand.length }} scene{{ scenesInStrand.length === 1 ? "" : "s" }}
              </span>
            </div>

            <RichEditor
              :model-value="s.body || ''"
              placeholder="Write the narrative strand in detail — synopsis, character arcs, beats in prose, anything you want to remember…"
              variant="inline"
              :toolbar="EDITOR_TOOLBAR_DOC"
              :fill="true"
              @change="(html) => update('body', html)"
            />

            <div class="strand-below">
            <div class="beats-section">
              <div class="beats-head">
                <span class="beats-title">Beats</span>
                <UiButton intent="ghost" size="small" @click="addBeat">
                  <Icon name="Plus" :size="11" /> Add beat
                </UiButton>
              </div>

              <div v-if="(s.beats || []).length === 0" class="beats-empty">
                No beats yet. Add Inciting / Midpoint / Climax-style turning points so you can see where this narrative strand pays off.
              </div>
              <div v-else class="beats-list">
                <div v-for="b in sortedBeats" :key="b.id" class="beat-row">
                  <button class="beat-chapter"
                    :class="{ missing: !chapterById(b.chapterId) }"
                    :aria-label="`Go to ${sceneRefLabel(b)}`"
                    @click="goBeat(b)">
                    <span v-if="chapterById(b.chapterId)" class="status-dot" :class="beatSceneStatus(b)" />
                    <span class="beat-chapter-text">{{ sceneRefLabel(b) }}</span>
                  </button>
                  <div class="beat-body">
                    <input class="beat-label"
                      :value="b.label"
                      placeholder="Beat label (e.g. Midpoint)"
                      list="beat-presets"
                      @input="updateBeat(b.id, 'label', $event.target.value)" />
                    <input class="beat-note"
                      :value="b.note || ''"
                      placeholder="Note (optional)"
                      @input="updateBeat(b.id, 'note', $event.target.value)" />
                  </div>
                  <JwSelect class="beat-rechapter"
                    :model-value="beatRefValue(b)"
                    v-tooltip.bottom="'Reassign to a different scene'"
                    @update:model-value="(v) => setBeatRef(b.id, v)"
                    :options="[{ label: '(no scene)', value: '' }, ...sceneOptions]" />
                  <UiButton intent="ghost" size="small" class="beat-delete" aria-label="Remove beat" v-tooltip.bottom="'Remove beat'" @click="removeBeat(b.id)">
                    <Icon name="Trash" :size="14" />
                  </UiButton>
                </div>
              </div>
            </div>

            <div style="margin-top:22px">
              <div class="t-eyebrow" style="margin-bottom:10px">Appears in scenes</div>
              <SceneRefList field="strands" :entity-id="s.id"
                empty-text="No scenes linked to this narrative strand yet. Open a scene → Links → Narrative strands to add one." />
            </div>
            </div>
          </div>

      <datalist id="beat-presets">
        <option v-for="preset in BEAT_PRESETS" :key="preset" :value="preset" />
      </datalist>
    </div>

    <GroupsModal v-if="modal === 'groups'"
      :entity-id="s.id" :entity-name="s.name" entity-kind="strand"
      @close="modal = null" />
  </template>

  <!-- ── id in URL but strand not found ───────────────────────── -->
  <template v-else>
    <header class="pane-header strand-pane-header">
      <div class="pane-title">
        <Breadcrumb :segments="[{ label: 'Narrative strand', to: '/strands' }]" />
        <h1 class="pane-h1">Narrative strand not found</h1>
      </div>
      <div class="pane-actions">
        <UiButton intent="primary" size="small" @click="addStrand"><Icon name="Plus" :size="14" /> New narrative strand</UiButton>
      </div>
    </header>
    <div class="pane-card" style="display:grid;place-items:center;padding:60px">
      <div class="t-muted" style="text-align:center">
        This narrative strand no longer exists.<br />
        <UiButton intent="ghost" style="margin-top:14px" @click="router.push('/strands')">Back to strands</UiButton>
      </div>
    </div>
  </template>
</template>

<style scoped>
.strand-desc {
  font-size: 14px; line-height: 1.55; color: var(--muted);
  margin: 0;
}
.strand-desc strong { color: var(--ink-2); font-weight: 600; }

.strand-body {
  flex: 1; min-width: 0; min-height: 0;
  display: flex; flex-direction: column; gap: 12px;
  padding: 22px 26px 40px;
}
.strand-below {
  flex: 1; min-height: 0;
  overflow-y: auto;
}

.strand-pane-header .pane-title { gap: 2px; }
.strand-name-row {
  display: flex; align-items: center; gap: 8px;
  min-width: 0;
}
.strand-name-dot {
  width: 12px; height: 12px; border-radius: 50%;
  box-shadow: inset 0 0 0 1px var(--shadow-soft);
  flex: none;
}
.strand-name {
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
.strand-name:hover { border-color: var(--border-soft); }
.strand-name:focus { border-color: var(--accent); background: var(--surface); box-shadow: 0 0 0 3px var(--accent-soft); }

.strand-blurb {
  appearance: none;
  width: 100%;
  resize: vertical;
  min-height: 44px;
  border: 1px solid transparent;
  background: transparent;
  border-radius: 6px;
  padding: 6px 8px;
  margin-left: -8px;
  font: inherit;
  font-size: 14px;
  line-height: 1.55;
  font-family: var(--font-serif);
  color: var(--ink-2);
  font-style: italic;
  outline: none;
}
.strand-blurb:hover { border-color: var(--border-soft); }
.strand-blurb:focus { border-color: var(--accent); background: var(--surface); box-shadow: 0 0 0 3px var(--accent-soft); }
.strand-blurb::placeholder { color: var(--muted); }

.strand-meta-row {
  display: flex; align-items: center; gap: 14px;
}
.strand-count { margin-left: auto; font-size: 11.5px; color: var(--muted); }

.strand-color-picker {
  display: flex; align-items: center; gap: 10px;
}
.strand-color-picker .t-eyebrow { margin-right: 4px; flex-shrink: 0; }

.beats-section {
  border-top: 1px dashed var(--border-soft);
  padding-top: 12px;
  margin-top: 4px;
}
.beats-head {
  display: flex; align-items: center; gap: 8px;
  margin-bottom: 6px;
}
.beats-title {
  font-size: 10.5px; font-weight: 600;
  text-transform: uppercase; letter-spacing: 0.08em;
  color: var(--muted);
}
.beats-empty {
  font-size: 12px;
  color: var(--muted);
  font-style: italic;
  padding: 4px 0;
}
.beats-list {
  display: flex; flex-direction: column;
  gap: 6px;
}
.beat-row {
  display: grid;
  grid-template-columns: 180px 1fr auto auto;
  gap: 8px; align-items: center;
  padding: 6px 8px;
  background: var(--surface-2);
  border: 1px solid var(--border-soft);
  border-radius: 8px;
}
.beat-chapter {
  appearance: none; border: 0; background: transparent;
  display: inline-flex; align-items: center; gap: 5px;
  padding: 3px 6px;
  border-radius: 5px;
  font: inherit;
  font-size: 11.5px;
  color: var(--ink-2);
  cursor: default;
  text-align: left;
  overflow: hidden;
}
.beat-chapter:hover { background: var(--surface-3); color: var(--ink); }
.beat-chapter.missing { color: var(--muted); font-style: italic; cursor: not-allowed; }
.beat-chapter-text {
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.beat-body {
  display: flex; flex-direction: column; gap: 3px;
  min-width: 0;
}
.beat-label, .beat-note {
  appearance: none;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 5px;
  padding: 2px 6px;
  font: inherit;
  outline: none;
  width: 100%;
}
.beat-label {
  font-weight: 600;
  font-size: 12.5px;
  color: var(--ink);
}
.beat-note {
  font-size: 11.5px;
  color: var(--ink-2);
  font-style: italic;
}
.beat-label:hover, .beat-note:hover { border-color: var(--border-soft); }
.beat-label:focus, .beat-note:focus { border-color: var(--accent); background: var(--surface); box-shadow: 0 0 0 2px var(--accent-soft); }
.beat-label::placeholder, .beat-note::placeholder { color: var(--muted); }

.beat-rechapter {
  appearance: none;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 5px;
  padding: 2px 6px;
  font: inherit;
  font-size: 11px;
  color: var(--muted);
  max-width: 28px;
  text-indent: -9999px;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'%3E%3Cpath d='M5 8h14M5 16h14'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: center;
  background-size: 14px 14px;
  cursor: default;
}
.beat-rechapter:hover { background-color: var(--surface-3); }
.beat-rechapter option { text-indent: 0; color: var(--ink); }

.beat-delete { color: var(--muted); width: 24px; height: 24px; padding: 4px; }
.beat-delete:hover { color: var(--danger); background: var(--surface-3); }

/* ── List view ─────────────────────────────────────────────────── */
.strands-toolbar {
  display: flex; align-items: center; gap: 10px;
  margin-bottom: 14px;
}
.strands-search {
  position: relative; flex: 1; max-width: 360px;
}
.strands-search-icon {
  position: absolute; left: 10px; top: 50%;
  transform: translateY(-50%);
  color: var(--muted); pointer-events: none;
}
.strands-search-input { width: 100%; padding-left: 30px !important; }
.strands-count { margin-left: auto; font-family: var(--font-mono); font-size: 11px; color: var(--muted); font-variant-numeric: tabular-nums; }

.strands-facets {
  display: flex; flex-direction: column;
  gap: 8px;
  padding: 10px 0 14px;
}
.strands-facet { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.strands-facet-label {
  font-family: var(--font-mono);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--muted);
  min-width: 64px;
}
.strands-chip {
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
.strands-chip:hover { background: var(--surface-3); border-color: var(--border-strong); }
.strands-chip.active {
  background: var(--accent-soft);
  border-color: var(--accent-line);
  color: var(--accent-ink);
}

.strands-table { font-size: 13px; }
.strands-cell-title { display: flex; align-items: center; gap: 7px; cursor: pointer; }
.strands-cell-title-text { font-family: var(--font-serif); font-size: 14px; color: var(--ink); }
.strands-num { font-family: var(--font-mono); font-size: 12px; color: var(--ink-2); font-variant-numeric: tabular-nums; }
.strands-status-empty { color: var(--muted); }
.strands-empty { padding: 28px; text-align: center; color: var(--muted); font-style: italic; }
</style>
