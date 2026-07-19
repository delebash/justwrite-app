<script setup>
import { computed, ref, watch, nextTick } from "vue";
import { useProjectStore } from "../stores/project.js";
import { useUiStore } from "../stores/ui.js";
import { useRoute, useRouter } from "vue-router";
import { Icon } from "@delebash/llm-ui";
import { UiInput } from "@delebash/llm-ui";
import { UiButton } from "@delebash/llm-ui";
import { UiTag } from "@delebash/llm-ui";
import { UiTable } from "@delebash/llm-ui";
import { UiCheckbox } from "@delebash/llm-ui";
import ImagesModal from "../components/ImagesModal.vue";
import EntitySweepModal from "../components/EntitySweepModal.vue";
import RichEditor from "../components/RichEditor.vue";
import { EDITOR_TOOLBAR_DOC } from "../services/editorToolbars.js";
import StatusSelect from "../components/StatusSelect.vue";
import GroupsModal from "../components/GroupsModal.vue";
import TagEditor from "../components/TagEditor.vue";
import SceneRefList from "../components/SceneRefList.vue";
import MentionRefList from "../components/MentionRefList.vue";
import { Breadcrumb } from "@delebash/llm-ui";
import PaneHeader from "../components/PaneHeader.vue";

const props = defineProps({ id: { type: String, default: "" } });
const project = useProjectStore();
const ui = useUiStore();
const router = useRouter();
const route = useRoute();
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

// The detail name input, focused + selected when we arrive via "+ New"
// (?new=1) so the first keystroke replaces the default "Untitled …"; the
// query is then stripped so a reload doesn't re-select.
const nameInput = ref(null);
watch(() => route.query.new, (isNew) => {
  if (!isNew) return;
  nextTick(() => {
    nameInput.value?.focus();
    nameInput.value?.select?.();
    router.replace({ query: {} });
  });
}, { immediate: true });

function addObject() {
  const id = project.addObject(); ui.select("objects", id); router.push(`/objects/${id}?new=1`);
}
function askTheBook() {
  if (!obj.value) return;
  ui.openChatPanelFor({
    mode: "book",
    question: `Tell me about ${obj.value.name}`,
    sourceKey: `ask:object:${obj.value.id}`,
  });
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
  if (id) { ui.select("objects", id); router.push(`/objects/${id}`); }
}
</script>

<template>
  <!-- ── List mode (no id in URL) ─────────────────────────────── -->
  <template v-if="!obj && !id">
    <PaneHeader :eyebrow="$t('panes.objects.eyebrow')" :title="$t('nav.objects')" help-key="story-bible#objects">
      <UiButton intent="ghost" size="small" @click="sweepOpen = true" v-tooltip.bottom="'Entity sweep — scan the whole manuscript for new characters, locations, and objects'">
        <Icon name="Sparkle" :size="13" /> Entity sweep
      </UiButton>
      <UiButton label="New object" intent="primary" size="small" @click="addObject">
        <template #icon><Icon name="Plus" :size="14" /></template>
      </UiButton>
    </PaneHeader>

    <!-- Empty state -->
    <div v-if="project.objects.length === 0" class="pane-card" style="display:grid;place-items:center;padding:60px">
      <div class="t-muted" style="text-align:center;max-width:420px">
        <div style="font-size:14px;color:var(--ink);margin-bottom:6px">No objects yet.</div>
        <div style="font-size:12.5px;margin-bottom:14px">Items and artifacts that move through the story. Link them to scenes to track their journey across the Relations graph.</div>
        <UiButton intent="primary" @click="addObject"><Icon name="Plus" :size="14" /> Create your first object</UiButton>
      </div>
    </div>

    <div v-else class="pane-card">
      <div class="scrollarea" style="padding:18px 22px 40px">
        <p class="entity-desc" style="margin: 0 0 18px">
          An <strong>object</strong> is a significant prop — a weapon, a letter, a relic, a
          vehicle. File one when the thing carries weight in the plot or recurs across scenes;
          throwaway items don't need an entry. Objects feed the <strong>Relations</strong>
          graph and AI features that draw on story-world context.
        </p>
        <!-- Toolbar -->
        <div class="entity-toolbar">
          <span class="entity-search">
            <Icon name="Search" :size="13" class="entity-search-icon" />
            <UiInput
              :value="globalQuery"
              placeholder="Search objects…"
              @input="onGlobalInput"
              class="entity-search-input"
            />
          </span>
          <UiButton v-if="globalQuery || hasActiveFacets" label="Clear filters" intent="ghost" size="small" @click="clearAllFilters" />
          <span class="entity-count">{{ filteredRows.length }} of {{ rows.length }}</span>
        </div>

        <!-- Facets -->
        <div class="entity-facets" v-if="allKinds.length || statusOptions.length || allTags.length">
          <div v-if="allKinds.length" class="entity-facet">
            <span class="entity-facet-label">Kind</span>
            <button class="entity-chip" :class="{ active: selectedKind === null }" @click="selectedKind = null">All</button>
            <button v-for="k in allKinds" :key="k"
              class="entity-chip" :class="{ active: selectedKind === k }"
              @click="selectedKind = selectedKind === k ? null : k">
              {{ k }}
            </button>
          </div>
          <div v-if="statusOptions.length" class="entity-facet">
            <span class="entity-facet-label">Status</span>
            <button class="entity-chip" :class="{ active: selectedStatus === null }" @click="selectedStatus = null">All</button>
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
          :global-filter-fields="['name', 'tags']"
          :pagination="{ pageSize: 20, pageSizeOptions: [10, 20, 50, 100] }"
          class="entity-table"
          @row-click="onRowClick"
        >
          <template #empty>
            <div class="entity-empty">No objects match your search.</div>
          </template>

          <template #name="{ row }">
            <div class="entity-cell-title">
              <span class="entity-cell-title-text">{{ row.name }}</span>
            </div>
          </template>

          <template #kind="{ row }">
            <span class="entity-cell-sub">{{ row.kind || '' }}</span>
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
        </UiTable>
      </div>
    </div>
  </template>

  <!-- ── Detail mode (id present, object found) ───────────────── -->
  <template v-else-if="obj">
    <header class="pane-header entity-pane-header">
      <div class="pane-title">
        <Breadcrumb :segments="[{ label: 'Object', to: '/objects' }]" />
        <input class="entity-name" ref="nameInput"
          :value="obj.name"
          placeholder="Object name"
          @input="update('name', $event.target.value)" />
      </div>
      <div class="pane-actions">
        <UiButton intent="ghost" size="small" data-panel-toggle @click="askTheBook"
          v-tooltip.bottom="`Ask the book about ${obj.name}`">
          <Icon name="Chat" :size="14" /> Ask the book
        </UiButton>
        <UiButton intent="ghost" size="small" @click="modal = 'images'"><Icon name="Image" :size="14" /> Images</UiButton>
        <router-link :to="`/objects/${obj.id}/events`" custom v-slot="{ navigate }">
          <UiButton intent="ghost" size="small" @click="navigate"><Icon name="Calendar" :size="14" /> Events</UiButton>
        </router-link>
        <UiButton intent="ghost" size="small" @click="modal = 'groups'"><Icon name="GroupIcon" :size="14" /> Groups</UiButton>
        <UiButton intent="ghost" size="small" @click="deleteObject">Delete</UiButton>
        <UiButton intent="primary" size="small" @click="addObject"><Icon name="Plus" :size="14" /> New object</UiButton>
        <StatusSelect :model-value="obj.status || ''" @update:model-value="(v) => update('status', v)" />
      </div>
    </header>
    <div class="pane-card">
      <div style="padding:24px 28px 40px;display:flex;flex-direction:column;gap:14px;flex:1;min-height:0">
        <p class="entity-desc">
          An <strong>object</strong> is a significant prop — a weapon, a letter, a relic, a
          vehicle. File one when the thing carries weight in the plot or recurs across scenes;
          throwaway items don't need an entry. Objects feed the <strong>Relations</strong>
          graph and AI features that draw on story-world context.
        </p>
        <UiInput fluid placeholder="Kind"
          :model-value="obj.kind" @update:model-value="update('kind', $event)" />
        <TagEditor
          :model-value="obj.tags || []"
          :pool="tagPool"
          :curated="project.tagVocabularies.objects"
          @update:model-value="(v) => update('tags', v)" />
        <label class="chip" style="cursor:pointer;gap:6px;align-self:flex-start"
          v-tooltip.bottom="'Hides this entity from any AI feature that pulls in story-world context.'">
          <UiCheckbox :model-value="!!obj.excludeFromAi" @update:model-value="(v) => update('excludeFromAi', v)" />
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
    <ImagesModal v-if="modal === 'images'" kind="objects" :entity-id="obj.id" :entity-name="obj.name" @close="modal = null" />
    <GroupsModal v-if="modal === 'groups'" :entity-id="obj.id" :entity-name="obj.name" entity-kind="object" @close="modal = null" />
  </template>

  <!-- ── id in URL but object not found ───────────────────────── -->
  <template v-else>
    <header class="pane-header entity-pane-header">
      <div class="pane-title">
        <Breadcrumb :segments="[{ label: 'Object', to: '/objects' }]" />
        <h1 class="pane-h1">Object not found</h1>
      </div>
      <div class="pane-actions">
        <UiButton intent="primary" size="small" @click="addObject"><Icon name="Plus" :size="14" /> New object</UiButton>
      </div>
    </header>
    <div class="pane-card" style="display:grid;place-items:center;padding:60px">
      <div class="t-muted" style="text-align:center">
        This object no longer exists.<br />
        <UiButton intent="ghost" style="margin-top:14px" @click="router.push('/objects')">Back to objects</UiButton>
      </div>
    </div>
  </template>

  <EntitySweepModal v-if="sweepOpen"
    @close="sweepOpen = false"
    @committed="sweepOpen = false" />
</template>

