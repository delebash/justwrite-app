<script setup>
import { computed, ref } from "vue";
import { useProjectStore } from "../stores/project.js";
import { useUiStore } from "../stores/ui.js";
import { useRouter } from "vue-router";
import Icon from "../components/Icon.vue";
import JwInput from "@renderer/components/ui/JwInput.vue";
import JwButton from "@renderer/components/ui/JwButton.vue";
import JwTag from "@renderer/components/ui/JwTag.vue";
import JwTable from "@renderer/components/ui/JwTable.vue";
import JwCheckbox from "@renderer/components/ui/JwCheckbox.vue";
import ImagesModal from "../components/ImagesModal.vue";
import EntitySweepModal from "../components/EntitySweepModal.vue";
import RichEditor from "../components/RichEditor.vue";
import { EDITOR_TOOLBAR_DOC } from "../services/editorToolbars.js";
import StatusSelect from "../components/StatusSelect.vue";
import GroupsModal from "../components/GroupsModal.vue";
import TagEditor from "../components/TagEditor.vue";
import SceneRefList from "../components/SceneRefList.vue";
import MentionRefList from "../components/MentionRefList.vue";
import Breadcrumb from "../components/Breadcrumb.vue";
import PaneHeader from "../components/PaneHeader.vue";
import { promptDialog } from "../services/dialog.js";
import { NEW_ENTITY_META } from "../services/entityMeta.js";

const props = defineProps({ id: { type: String, default: "" } });
const project = useProjectStore();
const ui = useUiStore();
const router = useRouter();
const sweepOpen = ref(false);

// When id is present → detail mode. When absent → list mode.
const obj = computed(() => props.id ? project.objectById(props.id) : null);
const modal = ref(null);

function update(k, v) { project.updateObject(obj.value.id, { [k]: v }); }

const tagPool = computed(() => {
  const out = [];
  for (const o of project.objects) for (const t of (o.tags || [])) out.push(t);
  return out;
});

async function addObject() {
  const name = await promptDialog(NEW_ENTITY_META.objects);
  if (!name) return;
  const id = project.addObject({ name }); ui.select("objects", id); router.push(`/objects/${id}`);
}
function deleteObject() {
  project.removeObject(obj.value.id);
  const next = project.objects[0];
  if (next) { ui.select("objects", next.id); router.push(`/objects/${next.id}`); } else router.push("/objects");
}

// ── List mode: table + facets ────────────────────────────────────────
const rows = computed(() => project.objects);

const globalQuery = ref("");
const selectedStatus = ref(null);
const selectedKind = ref(null);
const selectedTags = ref(new Set());

function onGlobalInput(e) { globalQuery.value = e.target.value; }
function toggleTag(t) {
  const next = new Set(selectedTags.value);
  if (next.has(t)) next.delete(t); else next.add(t);
  selectedTags.value = next;
}
function clearAllFilters() {
  globalQuery.value = "";
  selectedStatus.value = null;
  selectedKind.value = null;
  selectedTags.value = new Set();
}

const statusOptions = computed(() =>
  project.statuses.map((s) => ({ value: s.id, label: s.label })),
);
// Kind options derived from in-use kind values only.
const allKinds = computed(() => {
  const set = new Set();
  for (const o of project.objects) if (o.kind) set.add(o.kind);
  return [...set].sort();
});
const allTags = computed(() => {
  const set = new Set();
  for (const o of project.objects) for (const t of (o.tags || [])) set.add(t);
  return [...set].sort();
});

const filteredRows = computed(() => {
  const rs = rows.value;
  if (!selectedStatus.value && !selectedKind.value && selectedTags.value.size === 0) return rs;
  return rs.filter((r) => {
    if (selectedStatus.value && r.status !== selectedStatus.value) return false;
    if (selectedKind.value && r.kind !== selectedKind.value) return false;
    if (selectedTags.value.size > 0) {
      const rt = r.tags || [];
      if (!rt.some((t) => selectedTags.value.has(t))) return false;
    }
    return true;
  });
});

const hasActiveFacets = computed(() =>
  !!selectedStatus.value || !!selectedKind.value || selectedTags.value.size > 0,
);

const columns = [
  { accessorKey: "name",   header: "Name",   sortable: true,  headerStyle: "min-width: 200px" },
  { accessorKey: "kind",   header: "Kind",   sortable: true,  headerStyle: "min-width: 140px" },
  { accessorKey: "tags",   header: "Tags",   sortable: false, headerStyle: "min-width: 160px", enableGlobalFilter: true },
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
  if (id) router.push(`/objects/${id}`);
}
</script>

<template>
  <!-- ── List mode (no id in URL) ─────────────────────────────── -->
  <template v-if="!obj && !id">
    <PaneHeader :eyebrow="$t('panes.objects.eyebrow')" :title="$t('nav.objects')">
      <JwButton intent="ghost" size="small" @click="sweepOpen = true" v-tooltip.bottom="'Scan the manuscript for new characters, locations, and objects'">
        <Icon name="Sparkle" :size="13" /> Find new entities
      </JwButton>
      <JwButton label="New object" intent="primary" size="small" @click="addObject">
        <template #icon><Icon name="Plus" :size="14" /></template>
      </JwButton>
    </PaneHeader>

    <!-- Empty state -->
    <div v-if="project.objects.length === 0" class="pane-card" style="display:grid;place-items:center;padding:60px">
      <div class="t-muted" style="text-align:center">
        No objects yet.<br />
        <JwButton intent="primary" style="margin-top:14px" @click="addObject"><Icon name="Plus" :size="14" /> Create your first object</JwButton>
      </div>
    </div>

    <div v-else class="pane-card">
      <div class="scrollarea" style="padding:18px 22px 40px">
        <p class="obj-desc" style="margin: 0 0 18px">
          An <strong>object</strong> is a significant prop — a weapon, a letter, a relic, a
          vehicle. File one when the thing carries weight in the plot or recurs across scenes;
          throwaway items don't need an entry. Objects feed the <strong>Relations</strong>
          graph and AI features that draw on story-world context.
        </p>
        <!-- Toolbar -->
        <div class="obj-toolbar">
          <span class="obj-search">
            <Icon name="Search" :size="13" class="obj-search-icon" />
            <JwInput
              :value="globalQuery"
              placeholder="Search objects…"
              @input="onGlobalInput"
              class="obj-search-input"
            />
          </span>
          <JwButton v-if="globalQuery || hasActiveFacets" label="Clear filters" intent="ghost" size="small" @click="clearAllFilters" />
          <span class="obj-count">{{ filteredRows.length }} of {{ rows.length }}</span>
        </div>

        <!-- Facets -->
        <div class="obj-facets" v-if="allKinds.length || statusOptions.length || allTags.length">
          <div v-if="allKinds.length" class="obj-facet">
            <span class="obj-facet-label">Kind</span>
            <button class="obj-chip" :class="{ active: selectedKind === null }" @click="selectedKind = null">All</button>
            <button v-for="k in allKinds" :key="k"
              class="obj-chip" :class="{ active: selectedKind === k }"
              @click="selectedKind = selectedKind === k ? null : k">
              {{ k }}
            </button>
          </div>
          <div v-if="statusOptions.length" class="obj-facet">
            <span class="obj-facet-label">Status</span>
            <button class="obj-chip" :class="{ active: selectedStatus === null }" @click="selectedStatus = null">All</button>
            <button v-for="s in statusOptions" :key="s.value"
              class="obj-chip" :class="{ active: selectedStatus === s.value }"
              @click="selectedStatus = selectedStatus === s.value ? null : s.value">
              {{ s.label }}
            </button>
          </div>
          <div v-if="allTags.length" class="obj-facet">
            <span class="obj-facet-label">Tags</span>
            <button v-for="t in allTags" :key="t"
              class="obj-chip" :class="{ active: selectedTags.has(t) }"
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
          :global-filter-fields="['name', 'tags']"
          :pagination="{ pageSize: 20, pageSizeOptions: [10, 20, 50, 100] }"
          class="obj-table"
          @row-click="onRowClick"
        >
          <template #empty>
            <div class="obj-empty">No objects match your search.</div>
          </template>

          <template #name="{ row }">
            <div class="obj-cell-title">
              <span class="obj-cell-title-text">{{ row.name }}</span>
            </div>
          </template>

          <template #kind="{ row }">
            <span class="obj-kind">{{ row.kind || '' }}</span>
          </template>

          <template #tags="{ row }">
            <div class="obj-tags">
              <JwTag v-for="t in row.tags" :key="t" :value="t" intent="secondary" />
            </div>
          </template>

          <template #status="{ row }">
            <JwTag v-if="row.status" :value="statusLabel(row.status)" :intent="statusSeverity(row.status)" />
            <span v-else class="obj-status-empty">—</span>
          </template>
        </JwTable>
      </div>
    </div>
  </template>

  <!-- ── Detail mode (id present, object found) ───────────────── -->
  <template v-else-if="obj">
    <header class="pane-header object-pane-header">
      <div class="pane-title">
        <Breadcrumb :segments="[{ label: 'Object', to: '/objects' }]" />
        <input class="object-name"
          :value="obj.name"
          placeholder="Object name"
          @input="update('name', $event.target.value)" />
      </div>
      <div class="pane-actions">
        <JwButton intent="ghost" size="small" @click="modal = 'images'"><Icon name="Image" :size="14" /> Images</JwButton>
        <router-link :to="`/objects/${obj.id}/events`" custom v-slot="{ navigate }">
          <JwButton intent="ghost" size="small" @click="navigate"><Icon name="Calendar" :size="14" /> Events</JwButton>
        </router-link>
        <JwButton intent="ghost" size="small" @click="modal = 'groups'"><Icon name="GroupIcon" :size="14" /> Groups</JwButton>
        <JwButton intent="ghost" size="small" @click="deleteObject">Delete</JwButton>
        <JwButton intent="primary" size="small" @click="addObject"><Icon name="Plus" :size="14" /> New object</JwButton>
        <StatusSelect :model-value="obj.status || ''" @update:model-value="(v) => update('status', v)" />
      </div>
    </header>
    <div class="pane-card">
      <div style="padding:24px 28px 40px;display:flex;flex-direction:column;gap:14px;flex:1;min-height:0">
        <p class="obj-desc">
          An <strong>object</strong> is a significant prop — a weapon, a letter, a relic, a
          vehicle. File one when the thing carries weight in the plot or recurs across scenes;
          throwaway items don't need an entry. Objects feed the <strong>Relations</strong>
          graph and AI features that draw on story-world context.
        </p>
        <JwInput fluid placeholder="Kind"
          :model-value="obj.kind" @update:model-value="update('kind', $event)" />
        <TagEditor
          :model-value="obj.tags || []"
          :pool="tagPool"
          :curated="project.tagVocabularies.objects"
          @update:model-value="(v) => update('tags', v)" />
        <label class="chip" style="cursor:pointer;gap:6px;align-self:flex-start"
          v-tooltip.bottom="'Hides this entity from any AI feature that pulls in story-world context.'">
          <JwCheckbox :model-value="!!obj.excludeFromAi" @update:model-value="(v) => update('excludeFromAi', v)" />
          Exclude from AI
        </label>
        <RichEditor
          :model-value="obj.note || ''"
          placeholder="Description"
          variant="inline"
          :toolbar="EDITOR_TOOLBAR_DOC"
          :fill="true"
          @change="(html) => update('note', html)"
        />
        <div style="flex:1;min-height:0;overflow-y:auto">
          <div style="margin-top:22px">
            <div class="t-eyebrow" style="margin-bottom:10px">Appears in scenes</div>
            <SceneRefList field="objects" :entity-id="obj.id"
              empty-text="No scenes feature this object yet. Open a scene → Links → Objects to add one." />
          </div>

          <div style="margin-top:22px">
            <div class="t-eyebrow" style="margin-bottom:10px">Mentioned in prose</div>
            <MentionRefList :entity-id="obj.id" />
          </div>
        </div>
      </div>
    </div>
    <ImagesModal v-if="modal === 'images'" :entity-id="obj.id" :entity-name="obj.name" @close="modal = null" />
    <GroupsModal v-if="modal === 'groups'" :entity-id="obj.id" :entity-name="obj.name" entity-kind="object" @close="modal = null" />
  </template>

  <!-- ── id in URL but object not found ───────────────────────── -->
  <template v-else>
    <header class="pane-header object-pane-header">
      <div class="pane-title">
        <Breadcrumb :segments="[{ label: 'Object', to: '/objects' }]" />
        <h1 class="pane-h1">Object not found</h1>
      </div>
      <div class="pane-actions">
        <JwButton intent="primary" size="small" @click="addObject"><Icon name="Plus" :size="14" /> New object</JwButton>
      </div>
    </header>
    <div class="pane-card" style="display:grid;place-items:center;padding:60px">
      <div class="t-muted" style="text-align:center">
        This object no longer exists.<br />
        <JwButton intent="ghost" style="margin-top:14px" @click="router.push('/objects')">Back to objects</JwButton>
      </div>
    </div>
  </template>

  <EntitySweepModal v-if="sweepOpen"
    @close="sweepOpen = false"
    @committed="sweepOpen = false" />
</template>

<style scoped>
.obj-desc {
  font-size: 14px; line-height: 1.55; color: var(--muted);
  margin: 0;
}
.obj-desc strong { color: var(--ink-2); font-weight: 600; }

.object-pane-header .pane-title { gap: 2px; }
.object-name {
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
.object-name:hover { border-color: var(--border-soft); }
.object-name:focus { border-color: var(--accent); background: var(--surface); box-shadow: 0 0 0 3px var(--accent-soft); }

/* ── List view ─────────────────────────────────────────────────── */
.obj-toolbar {
  display: flex; align-items: center; gap: 10px;
  margin-bottom: 14px;
}
.obj-search {
  position: relative; flex: 1; max-width: 360px;
}
.obj-search-icon {
  position: absolute; left: 10px; top: 50%;
  transform: translateY(-50%);
  color: var(--muted); pointer-events: none;
}
.obj-search-input { width: 100%; padding-left: 30px !important; }
.obj-count { margin-left: auto; font-family: var(--font-mono); font-size: 11px; color: var(--muted); font-variant-numeric: tabular-nums; }

.obj-facets {
  display: flex; flex-direction: column;
  gap: 8px;
  padding: 10px 0 14px;
}
.obj-facet { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.obj-facet-label {
  font-family: var(--font-mono);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--muted);
  min-width: 64px;
}
.obj-chip {
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
.obj-chip:hover { background: var(--surface-3); border-color: var(--border-strong); }
.obj-chip.active {
  background: var(--accent-soft);
  border-color: var(--accent-line);
  color: var(--accent-ink);
}

.obj-table { font-size: 13px; }
.obj-cell-title { display: flex; flex-direction: column; gap: 2px; cursor: pointer; }
.obj-cell-title-text { font-family: var(--font-serif); font-size: 14px; color: var(--ink); }
.obj-kind { font-size: 12.5px; color: var(--ink-2); }
.obj-tags { display: flex; gap: 4px; flex-wrap: wrap; }
.obj-status-empty { color: var(--muted); }
.obj-empty { padding: 28px; text-align: center; color: var(--muted); font-style: italic; }
</style>
