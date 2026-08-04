<script setup>
import { computed, ref, watch, nextTick } from "vue";
import { useProjectStore } from "../stores/project.js";
import { useUiStore } from "../stores/ui.js";
import { useRoute, useRouter } from "vue-router";
import { Icon } from "@delebash/llm-ui";
import { UiInput } from "@delebash/llm-ui";
import { UiButton } from "@delebash/llm-ui";
import { UiTag } from "@delebash/llm-ui";
import { UiCheckbox } from "@delebash/llm-ui";
import EntityIndex from "../components/EntityIndex.vue";
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
import { PaneHeader } from "@delebash/llm-ui";

const props = defineProps({ id: { type: String, default: "" } });
const project = useProjectStore();
const ui = useUiStore();
const router = useRouter();
const route = useRoute();
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

function addLocation() {
  const id = project.addLocation(); ui.select("locations", id); router.push(`/locations/${id}?new=1`);
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
  if (id) { ui.select("locations", id); router.push(`/locations/${id}`); }
}
</script>

<template>
  <!-- ── List mode (no id in URL) ─────────────────────────────── -->
  <template v-if="!loc && !id">
    <PaneHeader :eyebrow="$t('panes.locations.eyebrow')" :title="$t('nav.locations')" help-key="story-bible#locations">
      <UiButton intent="ghost" size="small" @click="sweepOpen = true" v-tooltip.bottom="$t('common.entitySweepTooltip')">
        <Icon name="Sparkle" :size="13" /> {{ $t("common.entitySweep") }}
      </UiButton>
      <UiButton :label="$t('locations.newLocation')" intent="primary" size="small" @click="addLocation">
        <template #icon><Icon name="Plus" :size="14" /></template>
      </UiButton>
    </PaneHeader>

    <!-- Empty state -->
    <div v-if="project.locations.length === 0" class="pane-card" style="display:grid;place-items:center;padding:60px">
      <div class="t-muted" style="text-align:center;max-width:420px">
        <div style="font-size:14px;color:var(--ink);margin-bottom:6px">{{ $t("locations.emptyTitle") }}</div>
        <div style="font-size:12.5px;margin-bottom:14px">{{ $t("locations.emptyBody") }}</div>
        <UiButton intent="primary" @click="addLocation"><Icon name="Plus" :size="14" /> {{ $t("locations.createFirst") }}</UiButton>
      </div>
    </div>

    <EntityIndex v-else
      :rows="rows"
      :columns="columns"
      :facets="facets"
      :search-fields="['name', 'tags']"
      search-placeholder="Search locations…"
      empty-text="No locations match your search."
      @row-click="onRowClick">
      <template #intro>
        <p class="entity-desc" style="margin: 0 0 18px">
          {{ $t("locations.intro", { locationTerm: $t("locations.locationTerm"), relations: $t("panes.relations.title") }) }}
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

  <!-- ── Detail mode (id present, location found) ─────────────── -->
  <template v-else-if="loc">
    <header class="pane-header entity-pane-header">
      <div class="pane-title">
        <Breadcrumb :segments="[{ label: 'Location', to: '/locations' }]" />
        <input class="entity-name" ref="nameInput"
          :value="loc.name"
          :placeholder="$t('locations.namePlaceholder')"
          @input="update('name', $event.target.value)" />
      </div>
      <div class="pane-actions">
        <UiButton intent="ghost" size="small" data-panel-toggle @click="askTheBook"
          v-tooltip.bottom="$t('common.askTheBookAbout', { title: loc.name })">
          <Icon name="Chat" :size="14" /> {{ $t("sidebar.nav.askTheBook") }}
        </UiButton>
        <UiButton intent="ghost" size="small" @click="modal = 'images'"><Icon name="Image" :size="14" /> {{ $t("common.images") }}</UiButton>
        <router-link :to="`/locations/${loc.id}/events`" custom v-slot="{ navigate }">
          <UiButton intent="ghost" size="small" @click="navigate"><Icon name="Calendar" :size="14" /> {{ $t("common.events") }}</UiButton>
        </router-link>
        <UiButton intent="ghost" size="small" @click="modal = 'groups'"><Icon name="GroupIcon" :size="14" /> {{ $t("nav.groups") }}</UiButton>
        <UiButton intent="ghost" size="small" @click="deleteLocation">{{ $t("common.delete") }}</UiButton>
        <UiButton intent="primary" size="small" @click="addLocation"><Icon name="Plus" :size="14" /> {{ $t("locations.newLocation") }}</UiButton>
        <StatusSelect :model-value="loc.status || ''" @update:model-value="(v) => update('status', v)" />
      </div>
    </header>
    <div class="pane-card">
      <div style="padding:24px 28px 40px;display:flex;flex-direction:column;gap:14px;flex:1;min-height:0">
        <p class="entity-desc">
          {{ $t("locations.intro", { locationTerm: $t("locations.locationTerm"), relations: $t("panes.relations.title") }) }}
        </p>
        <UiInput fluid :placeholder="$t('locations.kindPlaceholder')"
          :model-value="loc.kind" @update:model-value="update('kind', $event)" />
        <TagEditor
          :model-value="loc.tags || []"
          :pool="tagPool"
          :curated="project.tagVocabularies.locations"
          @update:model-value="(v) => update('tags', v)" />
        <label class="chip" style="cursor:pointer;gap:6px;align-self:flex-start"
          v-tooltip.bottom="$t('common.excludeFromAiTooltip')">
          <UiCheckbox :model-value="!!loc.excludeFromAi" @update:model-value="(v) => update('excludeFromAi', v)" />
          {{ $t("common.excludeFromAi") }}
        </label>
        <RichEditor
          :model-value="loc.note || ''"
          :placeholder="$t('common.description')"
          variant="inline"
          :toolbar="EDITOR_TOOLBAR_DOC"
          :fill="true"
          @change="(html) => update('note', html)"
        />
        <div style="flex:1;min-height:0;overflow-y:auto">
          <div style="margin-top:22px">
            <div class="t-eyebrow" style="margin-bottom:10px">{{ $t("common.appearsInScenes") }}</div>
            <SceneRefList field="locations" :entity-id="loc.id"
              empty-text="No scenes set in this location yet. Open a scene → Links → Locations to add one." />
          </div>

          <div style="margin-top:22px">
            <div class="t-eyebrow" style="margin-bottom:10px">{{ $t("common.mentionedInProse") }}</div>
            <MentionRefList :entity-id="loc.id" />
          </div>
        </div>
      </div>
    </div>
    <ImagesModal v-if="modal === 'images'" kind="locations" :entity-id="loc.id" :entity-name="loc.name" @close="modal = null" />
    <GroupsModal v-if="modal === 'groups'" :entity-id="loc.id" :entity-name="loc.name" entity-kind="location" @close="modal = null" />
  </template>

  <!-- ── id in URL but location not found ─────────────────────── -->
  <template v-else>
    <header class="pane-header entity-pane-header">
      <div class="pane-title">
        <Breadcrumb :segments="[{ label: 'Location', to: '/locations' }]" />
        <h1 class="pane-h1">{{ $t("locations.notFound") }}</h1>
      </div>
      <div class="pane-actions">
        <UiButton intent="primary" size="small" @click="addLocation"><Icon name="Plus" :size="14" /> {{ $t("locations.newLocation") }}</UiButton>
      </div>
    </header>
    <div class="pane-card" style="display:grid;place-items:center;padding:60px">
      <div class="t-muted" style="text-align:center">
        {{ $t("locations.notFoundBody") }}<br />
        <UiButton intent="ghost" style="margin-top:14px" @click="router.push('/locations')">{{ $t("locations.backToLocations") }}</UiButton>
      </div>
    </div>
  </template>

  <EntitySweepModal v-if="sweepOpen"
    @close="sweepOpen = false"
    @committed="sweepOpen = false" />
</template>

