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
const loc = computed(() => props.id ? project.locationById(props.id) : null);
const modal = ref(null);

function update(k, v) { project.updateLocation(loc.value.id, { [k]: v }); }

const tagPool = computed(() => {
  const out = [];
  for (const l of project.locations) for (const t of (l.tags || [])) out.push(t);
  return out;
});

async function addLocation() {
  const name = await promptDialog(NEW_ENTITY_META.locations);
  if (!name) return;
  const id = project.addLocation({ name }); ui.select("locations", id); router.push(`/locations/${id}`);
}
function askTheBook() {
  if (!loc.value) return;
  ui.openChatPanelFor({
    mode: "book",
    question: `Tell me about ${loc.value.name}`,
    sourceKey: `ask:location:${loc.value.id}`,
  });
}
function deleteLocation() {
  project.removeLocation(loc.value.id);
  const next = project.locations[0];
  if (next) { ui.select("locations", next.id); router.push(`/locations/${next.id}`); } else router.push("/locations");
}

// ── List mode: table + facets ────────────────────────────────────────
const rows = computed(() => project.locations);

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
  for (const l of project.locations) if (l.kind) set.add(l.kind);
  return [...set].sort();
});
const allTags = computed(() => {
  const set = new Set();
  for (const l of project.locations) for (const t of (l.tags || [])) set.add(t);
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
  if (id) { ui.select("locations", id); router.push(`/locations/${id}`); }
}
</script>

<template>
  <!-- ── List mode (no id in URL) ─────────────────────────────── -->
  <template v-if="!loc && !id">
    <PaneHeader :eyebrow="$t('panes.locations.eyebrow')" :title="$t('nav.locations')" help-key="story-bible#locations">
      <JwButton intent="ghost" size="small" @click="sweepOpen = true" v-tooltip.bottom="'Scan the manuscript for new characters, locations, and objects'">
        <Icon name="Sparkle" :size="13" /> Find new entities
      </JwButton>
      <JwButton label="New location" intent="primary" size="small" @click="addLocation">
        <template #icon><Icon name="Plus" :size="14" /></template>
      </JwButton>
    </PaneHeader>

    <!-- Empty state -->
    <div v-if="project.locations.length === 0" class="pane-card" style="display:grid;place-items:center;padding:60px">
      <div class="t-muted" style="text-align:center;max-width:420px">
        <div style="font-size:14px;color:var(--ink);margin-bottom:6px">No locations yet.</div>
        <div style="font-size:12.5px;margin-bottom:14px">Places where your scenes happen — linkable from chapters and tracked across the Plot Board.</div>
        <JwButton intent="primary" @click="addLocation"><Icon name="Plus" :size="14" /> Create your first location</JwButton>
      </div>
    </div>

    <div v-else class="pane-card">
      <div class="scrollarea" style="padding:18px 22px 40px">
        <p class="loc-desc" style="margin: 0 0 18px">
          A <strong>location</strong> is a place that appears in your story — a city, a tavern,
          a starship interior, an abandoned house. Use an entry when the place shows up in more
          than one scene and you want a single source of truth for its layout, history, and
          sensory detail. Locations feed the <strong>Relations</strong> graph and AI features
          that draw on story-world context.
        </p>
        <!-- Toolbar -->
        <div class="loc-toolbar">
          <span class="loc-search">
            <Icon name="Search" :size="13" class="loc-search-icon" />
            <JwInput
              :value="globalQuery"
              placeholder="Search locations…"
              @input="onGlobalInput"
              class="loc-search-input"
            />
          </span>
          <JwButton v-if="globalQuery || hasActiveFacets" label="Clear filters" intent="ghost" size="small" @click="clearAllFilters" />
          <span class="loc-count">{{ filteredRows.length }} of {{ rows.length }}</span>
        </div>

        <!-- Facets -->
        <div class="loc-facets" v-if="allKinds.length || statusOptions.length || allTags.length">
          <div v-if="allKinds.length" class="loc-facet">
            <span class="loc-facet-label">Kind</span>
            <button class="loc-chip" :class="{ active: selectedKind === null }" @click="selectedKind = null">All</button>
            <button v-for="k in allKinds" :key="k"
              class="loc-chip" :class="{ active: selectedKind === k }"
              @click="selectedKind = selectedKind === k ? null : k">
              {{ k }}
            </button>
          </div>
          <div v-if="statusOptions.length" class="loc-facet">
            <span class="loc-facet-label">Status</span>
            <button class="loc-chip" :class="{ active: selectedStatus === null }" @click="selectedStatus = null">All</button>
            <button v-for="s in statusOptions" :key="s.value"
              class="loc-chip" :class="{ active: selectedStatus === s.value }"
              @click="selectedStatus = selectedStatus === s.value ? null : s.value">
              {{ s.label }}
            </button>
          </div>
          <div v-if="allTags.length" class="loc-facet">
            <span class="loc-facet-label">Tags</span>
            <button v-for="t in allTags" :key="t"
              class="loc-chip" :class="{ active: selectedTags.has(t) }"
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
          class="loc-table"
          @row-click="onRowClick"
        >
          <template #empty>
            <div class="loc-empty">No locations match your search.</div>
          </template>

          <template #name="{ row }">
            <div class="loc-cell-title">
              <span class="loc-cell-title-text">{{ row.name }}</span>
            </div>
          </template>

          <template #kind="{ row }">
            <span class="loc-kind">{{ row.kind || '' }}</span>
          </template>

          <template #tags="{ row }">
            <div class="loc-tags">
              <JwTag v-for="t in row.tags" :key="t" :value="t" intent="secondary" />
            </div>
          </template>

          <template #status="{ row }">
            <JwTag v-if="row.status" :value="statusLabel(row.status)" :intent="statusSeverity(row.status)" />
            <span v-else class="loc-status-empty">—</span>
          </template>
        </JwTable>
      </div>
    </div>
  </template>

  <!-- ── Detail mode (id present, location found) ─────────────── -->
  <template v-else-if="loc">
    <header class="pane-header location-pane-header">
      <div class="pane-title">
        <Breadcrumb :segments="[{ label: 'Location', to: '/locations' }]" />
        <input class="location-name"
          :value="loc.name"
          placeholder="Location name"
          @input="update('name', $event.target.value)" />
      </div>
      <div class="pane-actions">
        <JwButton intent="ghost" size="small" data-chat-toggle @click="askTheBook"
          v-tooltip.bottom="`Ask the book about ${loc.name}`">
          <Icon name="Chat" :size="14" /> Ask the book
        </JwButton>
        <JwButton intent="ghost" size="small" @click="modal = 'images'"><Icon name="Image" :size="14" /> Images</JwButton>
        <router-link :to="`/locations/${loc.id}/events`" custom v-slot="{ navigate }">
          <JwButton intent="ghost" size="small" @click="navigate"><Icon name="Calendar" :size="14" /> Events</JwButton>
        </router-link>
        <JwButton intent="ghost" size="small" @click="modal = 'groups'"><Icon name="GroupIcon" :size="14" /> Groups</JwButton>
        <JwButton intent="ghost" size="small" @click="deleteLocation">Delete</JwButton>
        <JwButton intent="primary" size="small" @click="addLocation"><Icon name="Plus" :size="14" /> New location</JwButton>
        <StatusSelect :model-value="loc.status || ''" @update:model-value="(v) => update('status', v)" />
      </div>
    </header>
    <div class="pane-card">
      <div style="padding:24px 28px 40px;display:flex;flex-direction:column;gap:14px;flex:1;min-height:0">
        <p class="loc-desc">
          A <strong>location</strong> is a place that appears in your story — a city, a tavern,
          a starship interior, an abandoned house. Use an entry when the place shows up in more
          than one scene and you want a single source of truth for its layout, history, and
          sensory detail. Locations feed the <strong>Relations</strong> graph and AI features
          that draw on story-world context.
        </p>
        <JwInput fluid placeholder="Kind"
          :model-value="loc.kind" @update:model-value="update('kind', $event)" />
        <TagEditor
          :model-value="loc.tags || []"
          :pool="tagPool"
          :curated="project.tagVocabularies.locations"
          @update:model-value="(v) => update('tags', v)" />
        <label class="chip" style="cursor:pointer;gap:6px;align-self:flex-start"
          v-tooltip.bottom="'Hides this entity from any AI feature that pulls in story-world context.'">
          <JwCheckbox :model-value="!!loc.excludeFromAi" @update:model-value="(v) => update('excludeFromAi', v)" />
          Exclude from AI
        </label>
        <RichEditor
          :model-value="loc.note || ''"
          placeholder="Description"
          variant="inline"
          :toolbar="EDITOR_TOOLBAR_DOC"
          :fill="true"
          @change="(html) => update('note', html)"
        />
        <div style="flex:1;min-height:0;overflow-y:auto">
          <div style="margin-top:22px">
            <div class="t-eyebrow" style="margin-bottom:10px">Appears in scenes</div>
            <SceneRefList field="locations" :entity-id="loc.id"
              empty-text="No scenes set in this location yet. Open a scene → Links → Locations to add one." />
          </div>

          <div style="margin-top:22px">
            <div class="t-eyebrow" style="margin-bottom:10px">Mentioned in prose</div>
            <MentionRefList :entity-id="loc.id" />
          </div>
        </div>
      </div>
    </div>
    <ImagesModal v-if="modal === 'images'" :entity-id="loc.id" :entity-name="loc.name" @close="modal = null" />
    <GroupsModal v-if="modal === 'groups'" :entity-id="loc.id" :entity-name="loc.name" entity-kind="location" @close="modal = null" />
  </template>

  <!-- ── id in URL but location not found ─────────────────────── -->
  <template v-else>
    <header class="pane-header location-pane-header">
      <div class="pane-title">
        <Breadcrumb :segments="[{ label: 'Location', to: '/locations' }]" />
        <h1 class="pane-h1">Location not found</h1>
      </div>
      <div class="pane-actions">
        <JwButton intent="primary" size="small" @click="addLocation"><Icon name="Plus" :size="14" /> New location</JwButton>
      </div>
    </header>
    <div class="pane-card" style="display:grid;place-items:center;padding:60px">
      <div class="t-muted" style="text-align:center">
        This location no longer exists.<br />
        <JwButton intent="ghost" style="margin-top:14px" @click="router.push('/locations')">Back to locations</JwButton>
      </div>
    </div>
  </template>

  <EntitySweepModal v-if="sweepOpen"
    @close="sweepOpen = false"
    @committed="sweepOpen = false" />
</template>

<style scoped>
.loc-desc {
  font-size: 14px; line-height: 1.55; color: var(--muted);
  margin: 0;
}
.loc-desc strong { color: var(--ink-2); font-weight: 600; }

.location-pane-header .pane-title { gap: 2px; }
.location-name {
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
.location-name:hover { border-color: var(--border-soft); }
.location-name:focus { border-color: var(--accent); background: var(--surface); box-shadow: 0 0 0 3px var(--accent-soft); }

/* ── List view ─────────────────────────────────────────────────── */
.loc-toolbar {
  display: flex; align-items: center; gap: 10px;
  margin-bottom: 14px;
}
.loc-search {
  position: relative; flex: 1; max-width: 360px;
}
.loc-search-icon {
  position: absolute; left: 10px; top: 50%;
  transform: translateY(-50%);
  color: var(--muted); pointer-events: none;
}
.loc-search-input { width: 100%; padding-left: 30px !important; }
.loc-count { margin-left: auto; font-family: var(--font-mono); font-size: 11px; color: var(--muted); font-variant-numeric: tabular-nums; }

.loc-facets {
  display: flex; flex-direction: column;
  gap: 8px;
  padding: 10px 0 14px;
}
.loc-facet { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.loc-facet-label {
  font-family: var(--font-mono);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--muted);
  min-width: 64px;
}
.loc-chip {
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
.loc-chip:hover { background: var(--surface-3); border-color: var(--border-strong); }
.loc-chip.active {
  background: var(--accent-soft);
  border-color: var(--accent-line);
  color: var(--accent-ink);
}

.loc-table { font-size: 13px; }
.loc-cell-title { display: flex; flex-direction: column; gap: 2px; cursor: pointer; }
.loc-cell-title-text { font-family: var(--font-serif); font-size: 14px; color: var(--ink); }
.loc-kind { font-size: 12.5px; color: var(--ink-2); }
.loc-tags { display: flex; gap: 4px; flex-wrap: wrap; }
.loc-status-empty { color: var(--muted); }
.loc-empty { padding: 28px; text-align: center; color: var(--muted); font-style: italic; }
</style>
