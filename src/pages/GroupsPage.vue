<script setup>
import { computed, ref, watch } from "vue";
import { useProjectStore } from "../stores/project.js";
import { useUiStore } from "../stores/ui.js";
import { useRouter } from "vue-router";
import { Icon, pageFill } from "@delebash/ui";
import { UiButton } from "@delebash/ui";
import { UiInput } from "@delebash/ui";
import { UiTag } from "@delebash/ui";
import EntityIndex from "../components/EntityIndex.vue";
import { UiCheckbox } from "@delebash/ui";
import { UiMenuItem } from "@delebash/ui";
import DescribeBox from "../components/DescribeBox.vue";
import DraftMenu from "../components/DraftMenu.vue";
import NameIdeas from "../components/NameIdeas.vue";
import SheetDraftModal from "../components/SheetDraftModal.vue";
import { isThinSheet } from "../services/storyWorldSheet.js";
import { sheetNameIdeasRequest } from "../services/analysis/sheetDraft.js";
import ImagesModal from "../components/ImagesModal.vue";
import RichEditor from "../components/RichEditor.vue";
import { EDITOR_TOOLBAR_SLIM } from "../services/editorToolbars.js";
import StatusSelect from "../components/StatusSelect.vue";
import MentionRefList from "../components/MentionRefList.vue";
import StoryWorldSheet from "../components/StoryWorldSheet.vue";
import { PaneHeader } from "@delebash/ui";
import { UiColorPicker } from "@delebash/ui";
import { PRESET_COLORS } from "@renderer/services/categoricalColors.js";
import { bookIndexOn } from "../services/rag/vectorStore.js";
import { useSelectNewName } from "../composables/useSelectNewName.js";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

const props = defineProps({ id: { type: String, default: "" } });
const project = useProjectStore();
const ui = useUiStore();
const router = useRouter();

const g = computed(() => props.id ? project.groupById(props.id) : null);

// AI drafting (2026-10-16, the AI drafting spec §9.1): the describe box (open while every sheet
// field is empty), Draft with AI ▾ → From a description, the review window; Name ideas at the name.
const describeText = ref("");
const describeBox = ref(null);
const draftFrom = ref(null); // the description being drafted from; null while no window is open
watch(() => g.value?.id, () => { describeText.value = ""; draftFrom.value = null; });
const modal = ref(null);
const KIND_ICON = { character: "Users", location: "Pin", object: "Cube", strand: "Strands" };
const KIND_HEADING_KEYS = { character: "nav.characters", location: "nav.locations", object: "nav.objects", strand: "common.narrativeStrands" };
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
  return kinds.map((kind) => ({ kind, label: KIND_HEADING_KEYS[kind] ? t(KIND_HEADING_KEYS[kind]) : kind, members: byKind.get(kind) }));
});

function update(k, v) { project.updateGroup(g.value.id, { [k]: v }); }
// "+ New" lands here with ?new=1: the header's name is selected, ready to type over.
const header = ref(null);
useSelectNewName(header);

function addGroup() {
  const id = project.addGroup(); ui.select("groups", id); router.push(`/groups/${id}?new=1`);
}
function askTheBook() {
  if (!g.value) return;
  ui.openChatPanelFor({
    mode: "book",
    question: t("groups.askAbout", { name: g.value.name }),
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

const statusOptions = computed(() =>
  project.statusesShown.map((s) => ({ value: s.id, label: s.label })),
);

// Declarative facets for the shared EntityIndex — the filtering, the chip markup
// and the clear-all now live there (components/EntityIndex.vue), not in a private
// copy per view.
const facets = computed(() => [
  { key: "status", label: t("common.status"), options: statusOptions.value },
]);

const columns = computed(() => [
  { accessorKey: "name",    header: t("common.name"),    sortable: true,  headerStyle: "min-width: 200px" },
  { accessorKey: "members", header: t("groups.colMembers"), sortable: true,  headerStyle: "min-width: 100px; text-align: center" },
  { accessorKey: "status",  header: t("common.status"),  sortable: true,  headerStyle: "min-width: 120px" },
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
  if (id) { ui.select("groups", id); router.push(`/groups/${id}`); }
}
</script>

<template>
  <q-page :style-fn="pageFill" class="main">
    <!-- ── List mode (no id in URL) ─────────────────────────────── -->
    <template v-if="!g && !id">
      <PaneHeader :eyebrow="$t('panes.groups.eyebrow')" :title="$t('nav.groups')" help-key="story-bible#groups">
        <UiButton :label="$t('groups.newGroup2')" intent="primary" size="small" @click="addGroup">
          <template #icon><Icon name="Plus" :size="14" /></template>
        </UiButton>
      </PaneHeader>

      <!-- Empty state -->
      <div v-if="project.groups.length === 0" class="pane-card" style="display:grid;place-items:center;padding:60px">
        <div class="t-muted" style="text-align:center;max-width:420px">
          <div style="font-size:14px;color:var(--ink);margin-bottom:6px">{{ $t("groups.emptyTitle") }}</div>
          <div style="font-size:12.5px;margin-bottom:14px">{{ $t("groups.emptyBody") }}</div>
          <UiButton intent="primary" @click="addGroup"><Icon name="Plus" :size="14" /> {{ $t("groups.createFirst") }}</UiButton>
        </div>
      </div>

      <EntityIndex v-else
        :rows="rows"
        :columns="columns"
        :facets="facets"
        :search-fields="['name']"
        :search-placeholder="t('groups.searchPlaceholder')"
        :empty-text="t('groups.searchEmpty')"
        @row-click="onRowClick">
        <template #intro>
          <i18n-t keypath="groups.introList" tag="p" class="entity-desc" style="margin: 0 0 18px" scope="global">
            <template #groupTerm><strong>{{ $t("groups.groupTerm") }}</strong></template>
            <template #groupsButton><strong>{{ $t("nav.groups") }}</strong></template>
            <template #relations><strong>{{ $t("panes.relations.title") }}</strong></template>
          </i18n-t>
        </template>

        <template #name="{ row }">
          <div class="entity-cell-inline">
            <span v-if="row.color" class="gr-color-dot" :style="{ background: row.color }"></span>
            <span class="entity-cell-title-text">{{ row.name }}</span>
          </div>
        </template>

        <template #members="{ row }">
          <span class="gr-member-count">{{ (row.members || []).length }}</span>
        </template>

        <template #status="{ row }">
          <UiTag v-if="row.status" :value="statusLabel(row.status)" :intent="statusSeverity(row.status)" />
          <span v-else class="entity-status-empty">—</span>
        </template>
      </EntityIndex>
    </template>

    <!-- ── Detail mode (id present, group found) ─────────────────── -->
    <template v-else-if="g">
      <PaneHeader ref="header" :crumbs="[{ label: $t('events.kinds.group'), to: '/groups' }]"
        editable :title="g.name" :placeholder="$t('groups.namePlaceholder')"
        @update:title="(v) => update('name', v)">
        <template #after-title>
          <NameIdeas :key="g.id" :meta="{ kind: 'name-ideas', entityId: g.id }"
            :request="(round) => sheetNameIdeasRequest({ project, kind: 'group', entityId: g.id, ...round })"
            @pick="(name) => update('name', name)" />
        </template>
        <UiButton v-if="bookIndexOn" intent="ghost" size="small" data-panel-toggle @click="askTheBook"
          v-tooltip.bottom="$t('common.askTheBookAbout', { title: g.name })">
          <Icon name="Chat" :size="14" /> {{ $t("sidebar.nav.askTheBook") }}
        </UiButton>
        <DraftMenu :title="$t('sheetDraft.menuTooltip')">
          <UiMenuItem class="lu-mmi" @select="describeBox?.start()">{{ $t("characters.draft.fromDescription") }}</UiMenuItem>
        </DraftMenu>
        <UiButton intent="ghost" size="small" @click="modal = 'images'"><Icon name="Image" :size="14" /> {{ $t("common.images") }}</UiButton>
        <router-link :to="`/groups/${g.id}/events`" custom v-slot="{ navigate }">
          <UiButton intent="ghost" size="small" @click="navigate"><Icon name="Calendar" :size="14" /> {{ $t("common.events") }}</UiButton>
        </router-link>
        <UiButton intent="ghost" size="small" @click="deleteGroup">{{ $t("common.delete") }}</UiButton>
        <UiButton intent="primary" size="small" @click="addGroup"><Icon name="Plus" :size="14" /> {{ $t("groups.newGroup2") }}</UiButton>
        <StatusSelect :model-value="g.status || ''" @update:model-value="(v) => update('status', v)" />
      </PaneHeader>
      <div class="pane-card">
        <!-- One scroller for the page (2026-10-16, with the sheet): the description editor sizes to
             its text above a minimum, as Architecture's does, instead of sharing the card's height
             with the area below it — which left the sheet a strip, and on a phone let the wrapped
             toolbar spill over it. The scroller holds a plain column — a column that is itself the
             scroller shrinks its fields instead of scrolling. -->
        <div class="scrollarea" style="flex:1;min-height:0">
        <div style="padding:24px 28px 40px;display:flex;flex-direction:column;gap:14px">
          <i18n-t keypath="groups.introDetail" tag="p" class="entity-desc" scope="global">
            <template #groupTerm><strong>{{ $t("groups.groupTerm") }}</strong></template>
            <template #groupsButton><strong>{{ $t("nav.groups") }}</strong></template>
            <template #relations><strong>{{ $t("panes.relations.title") }}</strong></template>
          </i18n-t>
          <DescribeBox ref="describeBox" :key="g.id" v-model="describeText" :thin="isThinSheet('group', g)"
            :label="$t('groups.draft.describeLabel')" :hint="$t('groups.draft.describeHint')"
            :placeholder="$t('groups.draft.describePlaceholder')" :collapsed-label="$t('groups.draft.describeCollapsed')"
            @draft="(text) => draftFrom = text" />
          <RichEditor
            :model-value="g.blurb || ''"
            :placeholder="$t('groups.blurbPlaceholder')"
            variant="inline"
            :toolbar="EDITOR_TOOLBAR_SLIM"
            :min-height="160"
            @change="(html) => update('blurb', html)"
          />
          <div>
          <div class="group-color-picker">
            <span class="t-eyebrow" style="font-size:10px;color:var(--muted)">{{ $t("groups.colorLabel") }}</span>
            <UiColorPicker :presets="PRESET_COLORS"
              :model-value="g.color"
              :aria-label="$t('groups.colorAriaLabel')"
              @update:model-value="update('color', $event)" />
            <label class="chip" style="cursor:pointer;gap:6px;margin-left:auto"
              v-tooltip.bottom="$t('common.excludeFromAiTooltip')">
              <UiCheckbox :model-value="!!g.excludeFromAi" @update:model-value="(v) => update('excludeFromAi', v)" />
              {{ $t("common.excludeFromAi") }}
            </label>
          </div>
          <StoryWorldSheet :key="g.id" kind="group" :entity="g" @update="update" />
          <div style="margin-top:24px">
            <div class="t-eyebrow" style="margin-bottom:10px">{{ $t("groups.membersCount", { n: (g.members || []).length }) }}</div>
            <p class="t-muted" style="font-size:12px;margin:0 0 10px">{{ $t("groups.membersHint") }}</p>
            <div v-if="(g.members || []).length === 0" class="t-muted" style="font-size:12.5px;text-align:center;padding:24px 0;background:var(--surface-2);border-radius:8px">{{ $t("groups.noMembers") }}</div>
            <div v-for="grp in memberGroups" :key="grp.kind" class="member-group">
              <div class="t-eyebrow member-group-head">{{ grp.label }} ({{ grp.members.length }})</div>
              <div class="member-grid">
                <div v-for="(m, mi) in grp.members" :key="`${m.kind}-${m.id}-${mi}`"
                  class="card tight" style="display:flex;align-items:center;gap:10px;padding:12px">
                  <UiButton intent="ghost" size="small" class="member-open" :title="t('common.openItem', { name: m.name })" @click="goMember(m)">
                    <template #icon><Icon :name="KIND_ICON[m.kind] || 'Star'" :size="15" /></template>
                    {{ m.name }}
                  </UiButton>
                  <UiButton intent="ghost" size="small" v-tooltip.bottom="t('groups.removeMember')" @click="project.removeGroupMember(g.id, m.kind, m.id)">×</UiButton>
                </div>
              </div>
            </div>
          </div>

          <div style="margin-top:24px">
            <div class="t-eyebrow" style="margin-bottom:10px">{{ $t("common.mentionedInProse") }}</div>
            <MentionRefList :entity-id="g.id" />
          </div>
          </div>
        </div>
        </div>
      </div>
      <ImagesModal v-if="modal === 'images'" kind="groups" :entity-id="g.id" :entity-name="g.name" @close="modal = null" />
      <SheetDraftModal v-if="draftFrom" kind="group" :entity-id="g.id" :description="draftFrom" @close="draftFrom = null" />
    </template>

    <!-- ── id in URL but group not found ─────────────────────────── -->
    <template v-else>
      <PaneHeader :crumbs="[{ label: $t('events.kinds.group'), to: '/groups' }]" :title="$t('groups.notFound')">
        <UiButton intent="primary" size="small" @click="addGroup"><Icon name="Plus" :size="14" /> {{ $t("groups.newGroup2") }}</UiButton>
      </PaneHeader>
      <div class="pane-card" style="display:grid;place-items:center;padding:60px">
        <div class="t-muted" style="text-align:center">
          {{ $t("groups.notFoundBody") }}<br />
          <UiButton intent="ghost" style="margin-top:14px" @click="router.push('/groups')">{{ $t("groups.backToGroups") }}</UiButton>
        </div>
      </div>
    </template>
  </q-page>
</template>

<style scoped>
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

/* List view: shared shape = global .entity-*; only the color dot +
   member count stay local */
.gr-color-dot { width: 10px; height: 10px; border-radius: 50%; flex: none; }
.gr-member-count { font-family: var(--font-mono); font-size: 13px; color: var(--ink-2); display: block; text-align: center; }
</style>
