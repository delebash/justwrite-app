<script setup>
import { computed, ref } from "vue";
import { useProjectStore } from "../stores/project.js";
import { useUiStore } from "../stores/ui.js";
import { useRouter } from "vue-router";
import { Icon } from "@delebash/llm-ui";
import { UiButton } from "@delebash/llm-ui";
import { UiInput } from "@delebash/llm-ui";
import { UiTag } from "@delebash/llm-ui";
import { UiTable } from "@delebash/llm-ui";
import { UiCheckbox } from "@delebash/llm-ui";
import ImagesModal from "../components/ImagesModal.vue";
import RichEditor from "../components/RichEditor.vue";
import { EDITOR_TOOLBAR_SLIM } from "../services/editorToolbars.js";
import StatusSelect from "../components/StatusSelect.vue";
import MentionRefList from "../components/MentionRefList.vue";
import { Breadcrumb } from "@delebash/llm-ui";
import PaneHeader from "../components/PaneHeader.vue";
import { promptDialog } from "@delebash/llm-ui";
import { NEW_ENTITY_META } from "../services/entityMeta.js";
import JwColorPicker from "@renderer/components/ui/JwColorPicker.vue";

const props = defineProps({ id: { type: String, default: "" } });
const project = useProjectStore();
const ui = useUiStore();
const router = useRouter();

const g = computed(() => props.id ? project.groupById(props.id) : null);
const modal = ref(null);
const KIND_ICON = { character: "Users", location: "Pin", object: "Cube", strand: "Strands" };
const KIND_HEADING = { character: "Characters", location: "Locations", object: "Objects", strand: "Narrative strands" };
const KIND_ORDER = ["character", "location", "object", "strand"];
const KIND_ROUTE = { character: "characters", location: "locations", object: "objects", strand: "strands" };

function goMember(m) {
  const base = KIND_ROUTE[m.kind];
  if (!base) return;
  ui.select(base, m.id);
  router.push(`/${base}/${m.id}`);
}

const memberGroups = computed(() => {
  const byKind = new Map();
  for (const m of (g.value?.members || [])) {
    if (!byKind.has(m.kind)) byKind.set(m.kind, []);
    byKind.get(m.kind).push(m);
  }
  const kinds = [
    ...KIND_ORDER.filter((k) => byKind.has(k)),
    ...[...byKind.keys()].filter((k) => !KIND_ORDER.includes(k)),
  ];
  return kinds.map((kind) => ({ kind, label: KIND_HEADING[kind] || kind, members: byKind.get(kind) }));
});

function update(k, v) { project.updateGroup(g.value.id, { [k]: v }); }
async function addGroup() {
  const name = await promptDialog(NEW_ENTITY_META.groups);
  if (!name) return;
  const id = project.addGroup({ name }); ui.select("groups", id); router.push(`/groups/${id}`);
}
function askTheBook() {
  if (!g.value) return;
  ui.openChatPanelFor({
    mode: "book",
    question: `Tell me about the group "${g.value.name}"`,
    sourceKey: `ask:group:${g.value.id}`,
  });
}
function deleteGroup() {
  project.removeGroup(g.value.id);
  const next = project.groups[0];
  if (next) { ui.select("groups", next.id); router.push(`/groups/${next.id}`); } else router.push("/groups");
}

// ── List mode: table + facets ────────────────────────────────────────
const rows = computed(() => project.groups);

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

const columns = [
  { accessorKey: "name",    header: "Name",    sortable: true,  headerStyle: "min-width: 200px" },
  { accessorKey: "members", header: "Members", sortable: true,  headerStyle: "min-width: 100px; text-align: center" },
  { accessorKey: "status",  header: "Status",  sortable: true,  headerStyle: "min-width: 120px" },
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
  if (id) { ui.select("groups", id); router.push(`/groups/${id}`); }
}
</script>

<template>
  <!-- ── List mode (no id in URL) ─────────────────────────────── -->
  <template v-if="!g && !id">
    <PaneHeader eyebrow="Story world" :title="$t('nav.groups')" help-key="story-bible#groups">
      <UiButton label="New group" intent="primary" size="small" @click="addGroup">
        <template #icon><Icon name="Plus" :size="14" /></template>
      </UiButton>
    </PaneHeader>

    <!-- Empty state -->
    <div v-if="project.groups.length === 0" class="pane-card" style="display:grid;place-items:center;padding:60px">
      <div class="t-muted" style="text-align:center;max-width:420px">
        <div style="font-size:14px;color:var(--ink);margin-bottom:6px">No groups yet.</div>
        <div style="font-size:12.5px;margin-bottom:14px">Factions and organizations. Group members together to see alliances drawn as edges in the Relations graph.</div>
        <UiButton intent="primary" @click="addGroup"><Icon name="Plus" :size="14" /> Create your first group</UiButton>
      </div>
    </div>

    <div v-else class="pane-card">
      <div class="scrollarea" style="padding:18px 22px 40px">
        <p class="gr-desc" style="margin: 0 0 18px">
          A <strong>group</strong> is a cluster of characters, locations, objects, or narrative
          strands that belong together — a faction, a family, a crew. Members are added from each
          entity's own <strong>Groups</strong> button; shared membership draws edges between
          members in the <strong>Relations</strong> graph.
        </p>
        <!-- Toolbar -->
        <div class="gr-toolbar">
          <span class="gr-search">
            <Icon name="Search" :size="13" class="gr-search-icon" />
            <UiInput
              :value="globalQuery"
              placeholder="Search groups…"
              @input="onGlobalInput"
              class="gr-search-input"
            />
          </span>
          <UiButton v-if="globalQuery || hasActiveFacets" label="Clear filters" intent="ghost" size="small" @click="clearAllFilters" />
          <span class="gr-count">{{ filteredRows.length }} of {{ rows.length }}</span>
        </div>

        <!-- Facets -->
        <div class="gr-facets" v-if="statusOptions.length">
          <div class="gr-facet">
            <span class="gr-facet-label">Status</span>
            <button class="gr-chip" :class="{ active: selectedStatus === null }" @click="selectedStatus = null">All</button>
            <button v-for="s in statusOptions" :key="s.value"
              class="gr-chip" :class="{ active: selectedStatus === s.value }"
              @click="selectedStatus = selectedStatus === s.value ? null : s.value">
              {{ s.label }}
            </button>
          </div>
        </div>

        <UiTable
          :data="filteredRows"
          :columns="columns"
          data-key="id"
          row-hover
          :global-filter="globalQuery"
          :global-filter-fields="['name']"
          :pagination="{ pageSize: 20, pageSizeOptions: [10, 20, 50, 100] }"
          class="gr-table"
          @row-click="onRowClick"
        >
          <template #empty>
            <div class="gr-empty">No groups match your search.</div>
          </template>

          <template #name="{ row }">
            <div class="gr-cell-title">
              <span v-if="row.color" class="gr-color-dot" :style="{ background: row.color }"></span>
              <span class="gr-cell-title-text">{{ row.name }}</span>
            </div>
          </template>

          <template #members="{ row }">
            <span class="gr-member-count">{{ (row.members || []).length }}</span>
          </template>

          <template #status="{ row }">
            <UiTag v-if="row.status" :value="statusLabel(row.status)" :intent="statusSeverity(row.status)" />
            <span v-else class="gr-status-empty">—</span>
          </template>
        </UiTable>
      </div>
    </div>
  </template>

  <!-- ── Detail mode (id present, group found) ─────────────────── -->
  <template v-else-if="g">
    <header class="pane-header group-pane-header">
      <div class="pane-title">
        <Breadcrumb :segments="[{ label: 'Group', to: '/groups' }]" />
        <input class="group-name"
          :value="g.name"
          placeholder="Group name"
          @input="update('name', $event.target.value)" />
      </div>
      <div class="pane-actions">
        <UiButton intent="ghost" size="small" data-chat-toggle @click="askTheBook"
          v-tooltip.bottom="`Ask the book about ${g.name}`">
          <Icon name="Chat" :size="14" /> Ask the book
        </UiButton>
        <UiButton intent="ghost" size="small" @click="modal = 'images'"><Icon name="Image" :size="14" /> Images</UiButton>
        <router-link :to="`/groups/${g.id}/events`" custom v-slot="{ navigate }">
          <UiButton intent="ghost" size="small" @click="navigate"><Icon name="Calendar" :size="14" /> Events</UiButton>
        </router-link>
        <UiButton intent="ghost" size="small" @click="deleteGroup">Delete</UiButton>
        <UiButton intent="primary" size="small" @click="addGroup"><Icon name="Plus" :size="14" /> New group</UiButton>
        <StatusSelect :model-value="g.status || ''" @update:model-value="(v) => update('status', v)" />
      </div>
    </header>
    <div class="pane-card">
      <div style="padding:24px 28px 40px;display:flex;flex-direction:column;gap:14px;flex:1;min-height:0">
        <p class="gr-desc">
          A <strong>group</strong> is a cluster of characters, locations, objects, or narrative
          strands that belong together — a faction, a family, a crew. Members are added from each
          entity's own <strong>Groups</strong> button; the page below collects everything that's
          been linked here, and shared membership draws edges between members in the
          <strong>Relations</strong> graph.
        </p>
        <RichEditor
          :model-value="g.blurb || ''"
          placeholder="Blurb"
          variant="inline"
          :toolbar="EDITOR_TOOLBAR_SLIM"
          :fill="true"
          @change="(html) => update('blurb', html)"
        />
        <div style="flex:3;min-height:0;overflow-y:auto">
        <div class="group-color-picker">
          <span class="t-eyebrow" style="font-size:10px;color:var(--muted)">Color</span>
          <JwColorPicker
            :model-value="g.color"
            aria-label="Group color"
            @update:model-value="update('color', $event)" />
          <label class="chip" style="cursor:pointer;gap:6px;margin-left:auto"
            v-tooltip.bottom="'Hides this entity from any AI feature that pulls in story-world context.'">
            <UiCheckbox :model-value="!!g.excludeFromAi" @update:model-value="(v) => update('excludeFromAi', v)" />
            Exclude from AI
          </label>
        </div>
        <div style="margin-top:24px">
          <div class="t-eyebrow" style="margin-bottom:10px">Members ({{ (g.members || []).length }})</div>
          <p class="t-muted" style="font-size:12px;margin:0 0 10px">Use characters/location/objects/narrative strands "Groups" button to add it here.</p>
          <div v-if="(g.members || []).length === 0" class="t-muted" style="font-size:12.5px;text-align:center;padding:24px 0;background:var(--surface-2);border-radius:8px">No members yet.</div>
          <div v-for="grp in memberGroups" :key="grp.kind" class="member-group">
            <div class="t-eyebrow member-group-head">{{ grp.label }} ({{ grp.members.length }})</div>
            <div class="member-grid">
              <div v-for="(m, mi) in grp.members" :key="`${m.kind}-${m.id}-${mi}`"
                class="card tight" style="display:flex;align-items:center;gap:10px;padding:12px">
                <UiButton intent="ghost" size="small" class="member-open" :title="`Open ${m.name}`" @click="goMember(m)">
                  <template #icon><Icon :name="KIND_ICON[m.kind] || 'Star'" :size="15" /></template>
                  {{ m.name }}
                </UiButton>
                <UiButton intent="ghost" size="small" v-tooltip.bottom="'Remove from group'" @click="project.removeGroupMember(g.id, m.kind, m.id)">×</UiButton>
              </div>
            </div>
          </div>
        </div>

        <div style="margin-top:24px">
          <div class="t-eyebrow" style="margin-bottom:10px">Mentioned in prose</div>
          <MentionRefList :entity-id="g.id" />
        </div>
        </div>
      </div>
    </div>
    <ImagesModal v-if="modal === 'images'" :entity-id="g.id" :entity-name="g.name" @close="modal = null" />
  </template>

  <!-- ── id in URL but group not found ─────────────────────────── -->
  <template v-else>
    <header class="pane-header group-pane-header">
      <div class="pane-title">
        <Breadcrumb :segments="[{ label: 'Group', to: '/groups' }]" />
        <h1 class="pane-h1">Group not found</h1>
      </div>
      <div class="pane-actions">
        <UiButton intent="primary" size="small" @click="addGroup"><Icon name="Plus" :size="14" /> New group</UiButton>
      </div>
    </header>
    <div class="pane-card" style="display:grid;place-items:center;padding:60px">
      <div class="t-muted" style="text-align:center">
        This group no longer exists.<br />
        <UiButton intent="ghost" style="margin-top:14px" @click="router.push('/groups')">Back to groups</UiButton>
      </div>
    </div>
  </template>
</template>

<style scoped>
.gr-desc {
  font-size: 14px; line-height: 1.55; color: var(--muted);
  margin: 0;
}
.gr-desc strong { color: var(--ink-2); font-weight: 600; }

.group-pane-header .pane-title { gap: 2px; }
.group-name {
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
.group-name:hover { border-color: var(--border-soft); }
.group-name:focus { border-color: var(--accent); background: var(--surface); box-shadow: 0 0 0 3px var(--accent-soft); }

.group-color-picker {
  display: flex; align-items: center; gap: 10px;
  margin-top: 10px;
}
.group-color-picker .t-eyebrow { margin-right: 4px; flex-shrink: 0; }

.member-group { margin-top: 18px; }
.member-group-head { margin-bottom: 8px; }
.member-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 10px;
}

.member-open {
  appearance: none; background: none; border: 0; padding: 0;
  flex: 1; min-width: 0; cursor: pointer;
  display: flex; align-items: center; gap: 10px;
  text-align: left; font: inherit; color: inherit;
}
.member-icon {
  width: 32px; height: 32px; border-radius: 7px;
  background: var(--surface-3); color: var(--muted);
  display: grid; place-items: center; flex: none;
  transition: background .12s ease, color .12s ease;
}
.member-name {
  flex: 1; min-width: 0;
  font-weight: 500; font-size: 12.5px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.member-open:hover .member-name { color: var(--accent); }
.member-open:hover .member-icon { background: var(--accent-soft); color: var(--accent-ink); }

/* ── List view ─────────────────────────────────────────────────── */
.gr-toolbar {
  display: flex; align-items: center; gap: 10px;
  margin-bottom: 14px;
}
.gr-search {
  position: relative; flex: 1; max-width: 360px;
}
.gr-search-icon {
  position: absolute; left: 10px; top: 50%;
  transform: translateY(-50%);
  color: var(--muted); pointer-events: none;
}
.gr-search-input { width: 100%; padding-left: 30px !important; }
.gr-count { margin-left: auto; font-family: var(--font-mono); font-size: 11px; color: var(--muted); font-variant-numeric: tabular-nums; }

.gr-facets {
  display: flex; flex-direction: column;
  gap: 8px;
  padding: 10px 0 14px;
}
.gr-facet { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.gr-facet-label {
  font-family: var(--font-mono);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--muted);
  min-width: 64px;
}
.gr-chip {
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
.gr-chip:hover { background: var(--surface-3); border-color: var(--border-strong); }
.gr-chip.active {
  background: var(--accent-soft);
  border-color: var(--accent-line);
  color: var(--accent-ink);
}

.gr-table { font-size: 13px; }
.gr-cell-title { display: flex; align-items: center; gap: 7px; cursor: pointer; }
.gr-color-dot { width: 10px; height: 10px; border-radius: 50%; flex: none; }
.gr-cell-title-text { font-family: var(--font-serif); font-size: 14px; color: var(--ink); }
.gr-member-count { font-family: var(--font-mono); font-size: 13px; color: var(--ink-2); display: block; text-align: center; }
.gr-status-empty { color: var(--muted); }
.gr-empty { padding: 28px; text-align: center; color: var(--muted); font-style: italic; }
</style>
