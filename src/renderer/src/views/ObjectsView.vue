<script setup>
import { computed, ref, watch, nextTick } from "vue";
import { useProjectStore } from "../stores/project.js";
import { useUiStore } from "../stores/ui.js";
import { useRoute, useRouter } from "vue-router";
import { Icon } from "@delebash/llm-ui";
import { UiInput } from "@delebash/llm-ui";
import { UiButton } from "@delebash/llm-ui";
import { UiTag } from "@delebash/llm-ui";
import EntityIndex from "../components/EntityIndex.vue";
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

// Declarative facets for the shared EntityIndex — the filtering, the chip markup
// and the clear-all now live there (components/EntityIndex.vue), not in a private
// copy per view. `match` is only needed where the test isn't `row[key] === value`.
const facets = computed(() => [
  { key: "kind", label: "Kind", options: allKinds.value.map((k) => ({ value: k, label: k })) },
  { key: "status", label: "Status", options: statusOptions.value },
  {
    key: "tags", label: "Tags", multi: true,
    options: allTags.value.map((t) => ({ value: t, label: t })),
    match: (row, tag) => (row.tags || []).includes(tag),
  },
]);

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

    <EntityIndex v-else
      :rows="rows"
      :columns="columns"
      :facets="facets"
      :search-fields="['name', 'tags']"
      search-placeholder="Search objects…"
      empty-text="No objects match your search."
      @row-click="onRowClick">
      <template #intro>
        <p class="entity-desc" style="margin: 0 0 18px">
          An <strong>object</strong> is a significant prop — a weapon, a letter, a relic, a
          vehicle. File one when the thing carries weight in the plot or recurs across scenes;
          throwaway items don't need an entry. Objects feed the <strong>Relations</strong>
          graph and AI features that draw on story-world context.
        </p>
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
    </EntityIndex>
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
          <Icon name="Chat" :size="14" /> {{ $t("sidebar.nav.askTheBook") }}
        </UiButton>
        <UiButton intent="ghost" size="small" @click="modal = 'images'"><Icon name="Image" :size="14" /> Images</UiButton>
        <router-link :to="`/objects/${obj.id}/events`" custom v-slot="{ navigate }">
          <UiButton intent="ghost" size="small" @click="navigate"><Icon name="Calendar" :size="14" /> Events</UiButton>
        </router-link>
        <UiButton intent="ghost" size="small" @click="modal = 'groups'"><Icon name="GroupIcon" :size="14" /> Groups</UiButton>
        <UiButton intent="ghost" size="small" @click="deleteObject">{{ $t("common.delete") }}</UiButton>
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

