<script setup>
import { computed, ref, watch } from "vue";
import { useProjectStore } from "../stores/project.js";
import { useStatusDisplay } from "../composables/useStatusDisplay.js";
import { useRouter } from "vue-router";
import { Icon, pageFill } from "@delebash/ui";
import { UiInput } from "@delebash/ui";
import { UiButton } from "@delebash/ui";
import { UiTag } from "@delebash/ui";
import { UiCheckbox } from "@delebash/ui";
import { UiMenuItem } from "@delebash/ui";
import DescribeBox from "../components/DescribeBox.vue";
import DraftMenu from "../components/DraftMenu.vue";
import BrainstormPopup from "../components/BrainstormPopup.vue";
import SheetDraftModal from "../components/SheetDraftModal.vue";
import { isThinSheet } from "../services/storyWorldSheet.js";
import { NAME_CATEGORY, sheetNameIdeasRequest } from "../services/analysis/sheetDraft.js";
import EntityIndex from "../components/EntityIndex.vue";
import ImagesModal from "../components/ImagesModal.vue";
import EntitySweepModal from "../components/EntitySweepModal.vue";
import SuggestEntitiesModal from "../components/SuggestEntitiesModal.vue";
import RichEditor from "../components/RichEditor.vue";
import { EDITOR_TOOLBAR_DOC } from "../services/editorToolbars.js";
import StatusSelect from "../components/StatusSelect.vue";
import GroupsModal from "../components/GroupsModal.vue";
import TagEditor from "../components/TagEditor.vue";
import SceneRefList from "../components/SceneRefList.vue";
import StoryWorldSheet from "../components/StoryWorldSheet.vue";
import MentionRefList from "../components/MentionRefList.vue";
import { PaneHeader } from "@delebash/ui";
import { bookIndexOn } from "../services/rag/vectorStore.js";
import { useSelectNewName } from "../composables/useSelectNewName.js";
import { kindsIn, tagPoolOf, tagsIn, useEntityPage } from "../composables/useEntityPage.js";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

const props = defineProps({ id: { type: String, default: "" } });
const project = useProjectStore();
const { statusLabel, statusSeverity } = useStatusDisplay();
const { open, openFirst, onRowClick, statusOptions, askBook } = useEntityPage("locations");
const router = useRouter();
const sweepOpen = ref(false);
const suggestOpen = ref(false);

// When id is present → detail mode. When absent → list mode.
const loc = computed(() => props.id ? project.locationById(props.id) : null);

// AI drafting (2026-10-16, the AI drafting spec §9.1): the describe box (open while every sheet
// field is empty), Draft with AI ▾ → From a description, the review window; Name ideas at the name.
const describeText = ref("");
const describeBox = ref(null);
const draftFrom = ref(null); // the description being drafted from; null while no window is open
watch(() => loc.value?.id, () => { describeText.value = ""; draftFrom.value = null; });
const modal = ref(null);

function update(k, v) { project.updateLocation(loc.value.id, { [k]: v }); }

const tagPool = computed(() => tagPoolOf(project.locations));

// "+ New" lands here with ?new=1: the header's name is selected, ready to type over.
const header = ref(null);
useSelectNewName(header);

function addLocation() {
  open(project.addLocation(), { isNew: true });
}
function askTheBook() {
  if (!loc.value) return;
  askBook(t("common.tellMeAbout", { name: loc.value.name }), `ask:location:${loc.value.id}`);
}
function deleteLocation() {
  project.removeLocation(loc.value.id);
  openFirst(project.locations);
}

// ── List mode: table + facets ────────────────────────────────────────
const rows = computed(() => project.locations);

// Kind options derived from in-use kind values only.
const allKinds = computed(() => kindsIn(project.locations));
const allTags = computed(() => tagsIn(project.locations));

// Declarative facets for the shared EntityIndex — the filtering, the chip markup
// and the clear-all now live there (components/EntityIndex.vue), not in a private
// copy per view. `match` is only needed where the test isn't `row[key] === value`.
const facets = computed(() => [
  { key: "kind", label: t("common.kind"), options: allKinds.value.map((k) => ({ value: k, label: k })) },
  { key: "status", label: t("common.status"), options: statusOptions.value },
  {
    key: "tags", label: t("common.tags"), multi: true,
    options: allTags.value.map((t) => ({ value: t, label: t })),
    match: (row, tag) => (row.tags || []).includes(tag),
  },
]);

const columns = computed(() => [
  { accessorKey: "name",   header: t("common.name"),   sortable: true,  headerStyle: "min-width: 200px" },
  { accessorKey: "kind",   header: t("common.kind"),   sortable: true,  headerStyle: "min-width: 140px" },
  { accessorKey: "tags",   header: t("common.tags"),   sortable: false, headerStyle: "min-width: 160px", enableGlobalFilter: true },
  { accessorKey: "status", header: t("common.status"), sortable: true,  headerStyle: "min-width: 120px" },
]);
</script>

<template>
  <q-page :style-fn="pageFill" class="main">
    <!-- ── List mode (no id in URL) ─────────────────────────────── -->
    <template v-if="!loc && !id">
      <PaneHeader :eyebrow="$t('panes.locations.eyebrow')" :title="$t('nav.locations')" help-key="story-bible#locations">
        <UiButton intent="ghost" size="small" @click="sweepOpen = true" v-tooltip.bottom="$t('common.entitySweepTooltip')">
          <Icon name="Sparkle" :size="13" /> {{ $t("common.entitySweep") }}
        </UiButton>
        <UiButton intent="ghost" size="small" @click="suggestOpen = true" v-tooltip.bottom="$t('locations.suggest.tooltip')">
          <Icon name="Sparkle" :size="13" /> {{ $t("locations.suggest.button") }}
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
        :search-placeholder="t('locations.searchPlaceholder')"
        :empty-text="t('locations.searchEmpty')"
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
      <PaneHeader ref="header" :crumbs="[{ label: $t('events.kinds.location'), to: '/locations' }]"
        editable :title="loc.name" :placeholder="$t('locations.namePlaceholder')"
        @update:title="(v) => update('name', v)">
        <template #after-title>
          <BrainstormPopup :key="loc.id" :category="NAME_CATEGORY.location" :label="$t('brainstorm.nameIdeas')"
            :meta="{ kind: 'name-ideas', entityId: loc.id }"
            :request="(round) => sheetNameIdeasRequest({ project, kind: 'location', entityId: loc.id, ...round })"
            @pick="(name) => update('name', name)" />
        </template>
        <UiButton v-if="bookIndexOn" intent="ghost" size="small" data-panel-toggle @click="askTheBook"
          v-tooltip.bottom="$t('common.askTheBookAbout', { title: loc.name })">
          <Icon name="Chat" :size="14" /> {{ $t("sidebar.nav.askTheBook") }}
        </UiButton>
        <DraftMenu :title="$t('sheetDraft.menuTooltip')">
          <UiMenuItem class="lu-mmi" @select="describeBox?.start()">{{ $t("characters.draft.fromDescription") }}</UiMenuItem>
        </DraftMenu>
        <UiButton intent="ghost" size="small" @click="modal = 'images'"><Icon name="Image" :size="14" /> {{ $t("common.images") }}</UiButton>
        <router-link :to="`/locations/${loc.id}/events`" custom v-slot="{ navigate }">
          <UiButton intent="ghost" size="small" @click="navigate"><Icon name="Calendar" :size="14" /> {{ $t("common.events") }}</UiButton>
        </router-link>
        <UiButton intent="ghost" size="small" @click="modal = 'groups'"><Icon name="GroupIcon" :size="14" /> {{ $t("nav.groups") }}</UiButton>
        <UiButton intent="ghost" size="small" @click="deleteLocation">{{ $t("common.delete") }}</UiButton>
        <UiButton intent="primary" size="small" @click="addLocation"><Icon name="Plus" :size="14" /> {{ $t("locations.newLocation") }}</UiButton>
        <StatusSelect :model-value="loc.status || ''" @update:model-value="(v) => update('status', v)" />
      </PaneHeader>
      <div class="pane-card">
        <!-- One scroller for the page (2026-10-16, with the sheet): the description editor sizes to
             its text above a minimum, as Architecture's does, instead of sharing the card's height
             with the area below it — which left the sheet a strip, and on a phone let the wrapped
             toolbar spill over it. The scroller holds a plain column — a column that is itself the
             scroller shrinks its fields instead of scrolling. -->
        <div class="scrollarea" style="flex:1;min-height:0">
        <div style="padding:24px 28px 40px;display:flex;flex-direction:column;gap:14px">
          <p class="entity-desc">
            {{ $t("locations.intro", { locationTerm: $t("locations.locationTerm"), relations: $t("panes.relations.title") }) }}
          </p>
          <DescribeBox ref="describeBox" :key="loc.id" v-model="describeText" :thin="isThinSheet('location', loc)"
            :label="$t('locations.draft.describeLabel')" :hint="$t('locations.draft.describeHint')"
            :placeholder="$t('locations.draft.describePlaceholder')" :collapsed-label="$t('locations.draft.describeCollapsed')"
            @draft="(text) => draftFrom = text" />
          <UiInput fluid :placeholder="$t('locations.kindPlaceholder')"
            :model-value="loc.kind" @update:model-value="update('kind', $event)" />
          <TagEditor
            :model-value="loc.tags || []"
            :pool="tagPool"
            :curated="project.tagVocabularies.locations"
            @update:model-value="(v) => update('tags', v)" />
          <label class="chip" style="cursor:pointer;gap:6px;align-self:flex-start"
            v-tooltip.bottom="$t('common.excludeFromAiTooltip')">
            <UiCheckbox :aria-label="$t('common.excludeFromAi')" :model-value="!!loc.excludeFromAi" @update:model-value="(v) => update('excludeFromAi', v)" />
            {{ $t("common.excludeFromAi") }}
          </label>
          <RichEditor
            :model-value="loc.note || ''"
            :placeholder="$t('common.description')"
            variant="inline"
            :toolbar="EDITOR_TOOLBAR_DOC"
            :min-height="160"
            @change="(html) => update('note', html)"
          />
          <div>
            <StoryWorldSheet :key="loc.id" kind="location" :entity="loc" @update="update" />
            <div style="margin-top:22px">
              <div class="t-eyebrow" style="margin-bottom:10px">{{ $t("common.appearsInScenes") }}</div>
              <SceneRefList field="locations" :entity-id="loc.id"
                :empty-text="t('locations.noScenes')" />
            </div>

            <div style="margin-top:22px">
              <div class="t-eyebrow" style="margin-bottom:10px">{{ $t("common.mentionedInProse") }}</div>
              <MentionRefList :entity-id="loc.id" />
            </div>
          </div>
        </div>
        </div>
      </div>
      <ImagesModal v-if="modal === 'images'" kind="locations" :entity-id="loc.id" :entity-name="loc.name" @close="modal = null" />
      <GroupsModal v-if="modal === 'groups'" :entity-id="loc.id" :entity-name="loc.name" entity-kind="location" @close="modal = null" />
      <SheetDraftModal v-if="draftFrom" kind="location" :entity-id="loc.id" :description="draftFrom" @close="draftFrom = null" />
    </template>

    <!-- ── id in URL but location not found ─────────────────────── -->
    <template v-else>
      <PaneHeader :crumbs="[{ label: $t('events.kinds.location'), to: '/locations' }]" :title="$t('locations.notFound')">
        <UiButton intent="primary" size="small" @click="addLocation"><Icon name="Plus" :size="14" /> {{ $t("locations.newLocation") }}</UiButton>
      </PaneHeader>
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
    <SuggestEntitiesModal v-if="suggestOpen" kind="location" @close="suggestOpen = false" />
  </q-page>
</template>

