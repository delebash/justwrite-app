<script setup>
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useProjectStore } from "../stores/project.js";
import { useUiStore } from "../stores/ui.js";
import { useRouter } from "vue-router";
import Avatar from "../components/Avatar.vue";
import { Icon, pageFill } from "@delebash/ui";
import { UiInput } from "@delebash/ui";
import { UiTextarea } from "@delebash/ui";
import { UiCheckbox } from "@delebash/ui";
import { UiNumber } from "@delebash/ui";
import { UiButton } from "@delebash/ui";
import { UiSelect } from "@delebash/ui";
import { UiTag } from "@delebash/ui";
import { UiMenuItem } from "@delebash/ui";
import EntityIndex from "../components/EntityIndex.vue";
import ImagesModal from "../components/ImagesModal.vue";
import EntitySweepModal from "../components/EntitySweepModal.vue";
import SuggestEntitiesModal from "../components/SuggestEntitiesModal.vue";
import CharacterAuditModal from "../components/CharacterAuditModal.vue";
import RelationshipArcModal from "../components/RelationshipArcModal.vue";
import StatusSelect from "../components/StatusSelect.vue";
import GroupsModal from "../components/GroupsModal.vue";
import CharacterDraftModal from "../components/CharacterDraftModal.vue";
import CharacterBatchFillModal from "../components/CharacterBatchFillModal.vue";
import SheetSection from "../components/SheetSection.vue";
import BrainstormPopup from "../components/BrainstormPopup.vue";
import DescribeBox from "../components/DescribeBox.vue";
import DraftMenu from "../components/DraftMenu.vue";
import { nameIdeasRequest } from "../services/analysis/characterDraft.js";
import TagEditor from "../components/TagEditor.vue";
import SceneRefList from "../components/SceneRefList.vue";
import MentionRefList from "../components/MentionRefList.vue";
import { confirmDialog } from "@delebash/ui";
import { PaneHeader } from "@delebash/ui";
import {
  ARC_FIELDS, CAPABILITY_FIELDS, CONTINUITY_FIELDS, CORE_ENGINE_FIELDS, DEPTH_FIELDS, FUNCTION_FIELDS,
  IDENTITY_FIELDS, MOTIVATION_CORE, PRESENCE_FIELDS, VOICE_FIELDS, isThinCharacter, sectionCount,
} from "../services/characterSheet.js";
import { saveImage } from "../services/imageStore.js";
import { bookIndexOn } from "../services/rag/vectorStore.js";
import { useSelectNewName } from "../composables/useSelectNewName.js";

const props = defineProps({ id: { type: String, default: "" } });
const { t } = useI18n({ useScope: "global" });
const project = useProjectStore();
const ui = useUiStore();
const router = useRouter();
const sweepOpen = ref(false);
const auditOpen = ref(false);
const relationshipArcOpen = ref(false);
const batchFillOpen = ref(false);
const batchFillIds = ref(null);

// WS-C: after an entity-sweep accept, offer to draft the new characters'
// profiles in one batch (their scene links are already backfilled by the
// review-commit, so the picker rows show scenes > 0).
async function onSweepCommitted(payload) {
  sweepOpen.value = false;
  const ids = payload?.characterIds || [];
  if (!ids.length) return;
  const ok = await confirmDialog({
    title: t("characters.sweepPrompt.title"),
    // One whole sentence per plural form (the singular also swaps "it"/"them"),
    // so a translator is never asked to assemble a sentence from fragments.
    message: t("characters.sweepPrompt.message", { n: ids.length }, ids.length),
    confirmLabel: t("characters.sweepPrompt.confirmLabel"),
    cancelLabel: t("characters.sweepPrompt.cancelLabel"),
  });
  if (ok) { batchFillIds.value = ids; batchFillOpen.value = true; }
}

// When id is present → detail mode. When absent → list mode.
const ch = computed(() => props.id ? project.characterById(props.id) : null);
const extras = computed(() => project.characterExtras[ch.value?.id]);
const modal = ref(null);

// Suggest characters (the AI drafting spec §3.4): its own window, in Entity sweep's shape.
const suggestOpen = ref(false);

// ── AI drafting (2026-10-11, the AI drafting spec §3) ───────────────────
// The review window's run: { source: "book" | "description" | "section", description, sectionKey }.
const draft = ref(null);
function openDraft(source, opts = {}) {
  draft.value = { source, description: "", sectionKey: "", ...opts };
  modal.value = "draft";
}
function closeDraft() { modal.value = null; draft.value = null; }
// The describe box (components/DescribeBox.vue): open while the sheet is thin (no section has a
// filled field — the spec §9.3), else one line that opens it. Its text is kept per character
// while the page lives, so a redraft or a section draft can reuse it.
const describeText = ref("");
const describeBox = ref(null);
watch(() => ch.value?.id, () => { describeText.value = ""; });
function startFromDescription() { describeBox.value?.start(); }
function draftSectionFor(sectionKey) {
  openDraft("section", { sectionKey, description: describeText.value.trim() });
}

// Copy lives in the catalog, keyed by the DATA MODEL — `characters.fields.<extras
// group>.<field key>.{label,hint}` — so these descriptor arrays stay pure data
// (no locale text to freeze at module load) and the template resolves the words
// with $t. Every (group, key) pair is unique across these and the eight v3 field
// arrays below, which is what lets one flat tree serve them all.
const MOTIVATIONS = MOTIVATION_CORE.map((f) => ({ k: f.k, color: `var(--trait-${f.k}-ink)`, bg: `var(--trait-${f.k}-bg)` }));
const ARC_STEPS = ARC_FIELDS.map((f) => ({ k: f.k }));
// computed(), not a module const: a plain array captures the labels at import
// and never re-translates when the language changes (the SettingsView SECTIONS
// precedent). The empty sentinel is a neutral "unset", NOT a repeat of the field
// label (the label above already says "Life status"; "Life status…" here read as
// both redundant and truncated).
const LIFE_STATUS_OPTIONS = computed(() => [
  { value: "",         label: t("characters.lifeStatus.notSet") },
  { value: "alive",    label: t("characters.lifeStatus.alive") },
  { value: "deceased", label: t("characters.lifeStatus.deceased") },
  { value: "missing",  label: t("characters.lifeStatus.missing") },
  { value: "unknown",  label: t("characters.lifeStatus.unknown") },
]);

// "+ New" lands here with ?new=1: the header's name is selected, ready to type over.
const header = ref(null);
useSelectNewName(header);

function addCharacter() {
  const id = project.addCharacter();
  ui.select("characters", id);
  router.push(`/characters/${id}?new=1`);
}
function deleteCharacter() {
  project.removeCharacter(ch.value.id);
  const next = project.characters[0];
  if (next) { ui.select("characters", next.id); router.push(`/characters/${next.id}`); } else router.push("/characters");
}
function updateField(k, v) { project.updateCharacter(ch.value.id, { [k]: v }); }

function talkToCharacter() {
  if (!ch.value?.id) return;
  ui.openChatPanelFor({ mode: "character", characterId: ch.value.id, sourceKey: `talk:${ch.value.id}` });
}
function askTheBook() {
  if (!ch.value) return;
  ui.openChatPanelFor({
    mode: "book",
    question: t("common.tellMeAbout", { name: ch.value.name }),
    sourceKey: `ask:character:${ch.value.id}`,
  });
}

// ── Avatar / image drop ─────────────────────────────────────────────
const characterImages = computed(() => project.imagesFor(ch.value?.id));
const avatarImage = computed(() => {
  const list = characterImages.value;
  return list.length ? list[list.length - 1] : null;
});

const isFileDragging = ref(false);
const dropError = ref(null);
const dropSaving = ref(0);

function eventHasFiles(e) {
  if (!e.dataTransfer) return false;
  for (const t of e.dataTransfer.types || []) {
    if (t === "Files") return true;
  }
  return false;
}
function onAvatarDragEnter(e) {
  if (eventHasFiles(e)) isFileDragging.value = true;
}
function onAvatarDragOver(e) {
  if (!eventHasFiles(e)) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = "copy";
  isFileDragging.value = true;
}
function onAvatarDragLeave(e) {
  if (e.currentTarget.contains(e.relatedTarget)) return;
  isFileDragging.value = false;
}
async function onAvatarDrop(e) {
  e.preventDefault();
  isFileDragging.value = false;
  dropError.value = null;
  const files = Array.from(e.dataTransfer.files || []).filter((f) => f.type.startsWith("image/"));
  if (!files.length) {
    if ((e.dataTransfer.files || []).length) dropError.value = t("characters.detail.onlyImageFiles");
    return;
  }
  for (const f of files) {
    dropSaving.value++;
    try {
      const rec = await saveImage(f);
      project.addImage("characters", ch.value.id, rec);
    } catch (err) {
      dropError.value = err.message || String(err);
    } finally {
      dropSaving.value--;
    }
  }
}
function updateMotivation(k, v) { project.setCharacterExtras(ch.value.id, { motivation: { ...(extras.value?.motivation || {}), [k]: v } }); }
function updateArc(k, v) { project.setCharacterExtras(ch.value.id, { arc: { ...(extras.value?.arc || {}), [k]: v } }); }
function updateVoice(k, v) { project.setCharacterExtras(ch.value.id, { voice: { ...(extras.value?.voice || {}), [k]: v } }); }
function updateBackstory(v) { project.setCharacterExtras(ch.value.id, { backstory: v }); }

// ── v3 sheet: generic extras-group access (the pattern above, one helper) ──
// `group` is the extras top-level key; `_top` reads a top-level string field.
function extraVal(group, k) { return (group === "_top" ? extras.value?.[k] : extras.value?.[group]?.[k]) || ""; }
function updateExtrasGroup(group, k, v) {
  project.setCharacterExtras(ch.value.id, { [group]: { ...(extras.value?.[group] || {}), [k]: v } });
}

// v3 field descriptors — the sheet's sections and fields live in services/characterSheet.js
// (one source with the AI drafting, 2026-10-11); the page renders them. Per-section
// filled-field counts drive each header's count chip + its initial open state.
const identityCount = computed(() => sectionCount(extras.value, "identity"));
const arcCount = computed(() => sectionCount(extras.value, "arc"));
const voiceCount = computed(() => sectionCount(extras.value, "voice"));
const functionCount = computed(() => sectionCount(extras.value, "function"));
const capabilitiesCount = computed(() => sectionCount(extras.value, "capabilities"));
const continuityCount = computed(() => sectionCount(extras.value, "continuity"));
const depthCount = computed(() => sectionCount(extras.value, "depth"));

const tagPool = computed(() => {
  const out = [];
  for (const c of project.characters) for (const t of (c.tags || [])) out.push(t);
  return out;
});
const aliasPool = computed(() => {
  const out = [];
  for (const c of project.characters) for (const a of (c.aliases || [])) out.push(a);
  return out;
});

// ── List mode: table + facets ────────────────────────────────────────
// Each row gets the avatar image record resolved for rendering in the Name cell.
const rows = computed(() =>
  project.characters.map((c) => {
    const images = project.imagesFor(c.id);
    return {
      ...c,
      _avatarImage: images.length ? images[images.length - 1] : null,
    };
  }),
);

const statusOptions = computed(() =>
  project.statusesShown.map((s) => ({ value: s.id, label: s.label })),
);
const allGenders = computed(() => {
  const set = new Set();
  for (const c of project.characters) if (c.gender) set.add(c.gender);
  return [...set].sort();
});
const allTags = computed(() => {
  const set = new Set();
  for (const c of project.characters) for (const t of (c.tags || [])) set.add(t);
  return [...set].sort();
});

// Declarative facets for the shared EntityIndex — the filtering, the chip markup
// and the clear-all live there (components/EntityIndex.vue), not in a private copy
// per view. This is the busiest facet set in the app (five rows, one of them
// boolean, one multi-select), which is why EntityIndex was designed against it.
// NOTE the `main` facet: its values are `true`/`false`, and `false` is a REAL
// selection, not "All" — EntityIndex compares selections with `=== null` for
// exactly this reason.
const facets = computed(() => [
  { key: "status", label: t("characters.facets.status"), options: statusOptions.value },
  {
    key: "main", label: t("characters.facets.main"),
    options: [
      { value: true, label: t("common.yes") },
      { value: false, label: t("common.no") },
    ],
    match: (row, v) => !!row.main === v,
  },
  {
    key: "gender", label: t("characters.facets.gender"),
    options: allGenders.value.map((g) => ({ value: g, label: g })),
  },
  {
    key: "lifeStatus", label: t("characters.facets.lifeStatus"),
    options: allLifeStatuses.value,
    match: (row, v) => (row.lifeStatus || "") === v,
  },
  {
    key: "tags", label: t("characters.facets.tags"), multi: true,
    options: allTags.value.map((tag) => ({ value: tag, label: tag })),
    match: (row, tag) => (row.tags || []).includes(tag),
  },
]);

const allLifeStatuses = computed(() => {
  const set = new Set();
  for (const c of project.characters) if (c.lifeStatus) set.add(c.lifeStatus);
  return LIFE_STATUS_OPTIONS.value.filter((o) => o.value && set.has(o.value));
});

// computed() for the same reason as LIFE_STATUS_OPTIONS: a module-const header
// row would freeze the column names in the boot language.
// No widths: the browser's table layout gives each column what its content needs, the name
// column (its description cut with "…" at 340 px) the most (ruled 2026-10-15 — "narrow columns
// … take only the width they need, and the text column takes the rest"). The hand-set minimums
// they replace added up to a 1080 px table, past the page at a 1280 px window; measured after:
// 922 px at 1280, in English and Spanish.
const columns = computed(() => [
  { accessorKey: "name",     header: t("characters.columns.name"),     sortable: true },
  { accessorKey: "role",     header: t("characters.columns.role"),     sortable: true },
  { accessorKey: "gender",   header: t("characters.columns.gender"),   sortable: true },
  { accessorKey: "pronouns", header: t("characters.columns.pronouns"), sortable: true },
  { accessorKey: "tags",     header: t("characters.columns.tags"),     sortable: false, enableGlobalFilter: true },
  { accessorKey: "status",   header: t("characters.columns.status"),   sortable: true },
  { accessorKey: "main",     header: t("characters.columns.main"),     sortable: true },
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
  if (id) { ui.select("characters", id); router.push(`/characters/${id}`); }
}
</script>

<template>
  <q-page :style-fn="pageFill" class="main">
    <!-- ── List mode (no id in URL) ─────────────────────────────── -->
    <template v-if="!ch && !id">
      <PaneHeader :eyebrow="$t('panes.characters.eyebrow')" :title="$t('nav.characters')" help-key="story-bible#characters">
        <UiButton intent="ghost" size="small" @click="sweepOpen = true" v-tooltip.bottom="$t('characters.header.entitySweepTooltip')">
          <Icon name="Sparkle" :size="13" /> {{ $t("chapters.header.entitySweep") }}
        </UiButton>
        <UiButton intent="ghost" size="small" @click="auditOpen = true" v-tooltip.bottom="$t('characters.header.auditConsistencyTooltip')">
          <Icon name="Users" :size="13" /> {{ $t("characters.header.auditConsistency") }}
        </UiButton>
        <UiButton intent="ghost" size="small" @click="relationshipArcOpen = true" v-tooltip.bottom="$t('characters.header.relationshipArcTooltip')">
          <Icon name="Network" :size="13" /> {{ $t("characters.header.relationshipArc") }}
        </UiButton>
        <UiButton intent="ghost" size="small" @click="suggestOpen = true" v-tooltip.bottom="$t('characters.suggest.tooltip')">
          <Icon name="Sparkle" :size="13" /> {{ $t("characters.suggest.button") }}
        </UiButton>
        <UiButton intent="ghost" size="small" @click="batchFillOpen = true" v-tooltip.bottom="$t('characters.header.fillFromBookTooltip')">
          <Icon name="Book" :size="13" /> {{ $t("characters.header.fillFromBook") }}
        </UiButton>
        <UiButton :label="$t('characters.header.newCharacter')" intent="primary" size="small" @click="addCharacter">
          <template #icon><Icon name="Plus" :size="14" /></template>
        </UiButton>
      </PaneHeader>

      <!-- Empty state -->
      <div v-if="project.characters.length === 0" class="pane-card" style="display:grid;place-items:center;padding:60px">
        <div class="t-muted" style="text-align:center;max-width:420px">
          <div style="font-size:14px;color:var(--ink);margin-bottom:6px">{{ $t("characters.empty.title") }}</div>
          <div style="font-size:12.5px;margin-bottom:14px">{{ $t("characters.empty.message") }}</div>
          <UiButton intent="primary" @click="addCharacter"><Icon name="Plus" :size="14" /> {{ $t("characters.empty.action") }}</UiButton>
        </div>
      </div>

      <EntityIndex v-else
        :rows="rows"
        :columns="columns"
        :facets="facets"
        :search-fields="['name', 'role', 'gender', 'pronouns', 'aliases', 'oneLiner', 'tags']"
        :search-placeholder="$t('characters.list.searchPlaceholder')"
        :empty-text="$t('characters.list.noMatches')"
        @row-click="onRowClick">
        <template #intro>
          <!-- i18n-t + named slots (the user's ruling, 2026-07-26: "i18n-t with slots, no
               html in messages"). The sentence stays ONE translatable unit — the emphasis
               is markup supplied by the template, not by the message. -->
          <i18n-t keypath="characters.intro" tag="p" class="entity-desc ch-desc" scope="global">
            <template #character><strong>{{ $t("characters.introTerms.character") }}</strong></template>
            <template #relations><strong>{{ $t("sidebar.nav.relations") }}</strong></template>
            <template #castPresence><strong>{{ $t("characters.introTerms.castPresence") }}</strong></template>
          </i18n-t>
        </template>

        <template #name="{ row }">
          <div class="ch-cell-name">
            <Avatar :name="row.name" :image="row._avatarImage" :size="28" />
            <div class="ch-cell-name-text">
              <span class="ch-cell-name-main">{{ row.name }}</span>
              <span v-if="row.oneLiner" class="ch-cell-name-sub">{{ row.oneLiner }}</span>
            </div>
          </div>
        </template>

        <template #role="{ row }">
          <span class="entity-cell-sub">{{ row.role || '' }}</span>
        </template>

        <template #gender="{ row }">
          <span class="entity-cell-sub">{{ row.gender || '' }}</span>
        </template>

        <template #pronouns="{ row }">
          <span class="entity-cell-sub">{{ row.pronouns || '' }}</span>
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

        <template #main="{ row }">
          <UiTag v-if="row.main" :value="$t('common.yes')" intent="info" />
          <span v-else class="entity-status-empty">—</span>
        </template>
      </EntityIndex>
    </template>

    <!-- ── Detail mode (id present, character found) ────────────── -->
    <template v-else-if="ch">
      <PaneHeader ref="header" :crumbs="[{ label: ch.main ? $t('characters.detail.mainCharacter') : $t('characters.detail.secondaryCharacter'), to: '/characters' }]"
        editable :title="ch.name" :placeholder="$t('characters.detail.namePlaceholder')"
        @update:title="(v) => updateField('name', v)"
        help-key="character-sheet" :help-label="$t('characters.detail.helpLabel')">
        <template #after-title>
          <BrainstormPopup :key="ch.id" category="character_name" :label="$t('brainstorm.nameIdeas')"
            :meta="{ kind: 'name-ideas', characterId: ch.id }"
            :request="(round) => nameIdeasRequest({ project, characterId: ch.id, ...round })"
            @pick="(name) => updateField('name', name)" />
        </template>
        <UiButton v-if="bookIndexOn" intent="ghost" size="small" data-panel-toggle @click="talkToCharacter"
          v-tooltip.bottom="$t('characters.detail.talkToTooltip', { name: ch.name })">
          <Icon name="Sparkle" :size="14" /> {{ $t("characters.detail.talkTo", { name: ch.name?.split(/\s+/)[0] || $t("characters.detail.talkToFallback") }) }}
        </UiButton>
        <UiButton v-if="bookIndexOn" intent="ghost" size="small" data-panel-toggle @click="askTheBook"
          v-tooltip.bottom="$t('characters.detail.askTheBookTooltip', { name: ch.name })">
          <Icon name="Chat" :size="14" /> {{ $t("sidebar.nav.askTheBook") }}
        </UiButton>
        <DraftMenu :title="$t('characters.draft.menuTooltip')">
          <UiMenuItem class="lu-mmi" @select="startFromDescription">{{ $t("characters.draft.fromDescription") }}</UiMenuItem>
          <UiMenuItem class="lu-mmi" @select="openDraft('book')">{{ $t("characters.header.fillFromBook") }}</UiMenuItem>
        </DraftMenu>
        <UiButton intent="ghost" size="small" @click="modal = 'images'"><Icon name="Image" :size="14" /> {{ $t("characters.detail.images") }}</UiButton>
        <router-link :to="`/characters/${ch.id}/events`" custom v-slot="{ navigate }">
          <UiButton intent="ghost" size="small" @click="navigate"><Icon name="Calendar" :size="14" /> {{ $t("characters.detail.events") }}</UiButton>
        </router-link>
        <UiButton intent="ghost" size="small" @click="modal = 'groups'"><Icon name="GroupIcon" :size="14" /> {{ $t("nav.groups") }}</UiButton>
        <UiButton intent="ghost" size="small" @click="deleteCharacter">{{ $t("common.delete") }}</UiButton>
        <UiButton intent="primary" size="small" @click="addCharacter"><Icon name="Plus" :size="14" /> {{ $t("characters.header.newCharacter") }}</UiButton>
        <StatusSelect :model-value="ch.status || ''" @update:model-value="(v) => updateField('status', v)" />
      </PaneHeader>

      <div class="pane-card">
        <div class="scrollarea" style="padding:24px 28px 40px">
          <!-- i18n-t + named slots (the user's ruling, 2026-07-26: "i18n-t with slots, no
               html in messages"). The sentence stays ONE translatable unit — the emphasis
               is markup supplied by the template, not by the message. -->
          <i18n-t keypath="characters.intro" tag="p" class="entity-desc ch-desc" scope="global">
            <template #character><strong>{{ $t("characters.introTerms.character") }}</strong></template>
            <template #relations><strong>{{ $t("sidebar.nav.relations") }}</strong></template>
            <template #castPresence><strong>{{ $t("characters.introTerms.castPresence") }}</strong></template>
          </i18n-t>
          <div class="character-hero">
            <div
              class="avatar-drop"
              :class="{ 'avatar-drop-hot': isFileDragging, 'avatar-drop-saving': dropSaving > 0 }"
              :title="avatarImage ? $t('characters.detail.avatarDropReplace') : $t('characters.detail.avatarDropSet')"
              @dragenter="onAvatarDragEnter"
              @dragover="onAvatarDragOver"
              @dragleave="onAvatarDragLeave"
              @drop="onAvatarDrop">
              <Avatar :name="ch.name" :image="avatarImage" :size="96" />
              <div v-if="isFileDragging" class="avatar-drop-overlay">
                <Icon name="Image" :size="22" />
                <span>{{ $t("characters.detail.dropImage") }}</span>
              </div>
              <div v-else-if="dropSaving > 0" class="avatar-drop-overlay saving">{{ $t("characters.detail.saving") }}</div>
            </div>
            <div class="character-hero-fields">
              <!-- Labels on top for every hero field (the Voice-grid `t-muted`
                   label idiom, promoted to `.ch-field` so the whole sheet shares
                   one field shape — RULE #1 precedent). Placeholders removed. -->
              <!-- Every control sized by the kit's content-width tokens (the
                   `width` prop → .ui-w-*), never inline pixels. The select is
                   capped wide enough for its longest option so its value never
                   truncates. -->
              <div class="ch-hero-row">
                <div class="ch-field">
                  <span class="ch-field-label">{{ $t("characters.detail.role") }}</span>
                  <UiInput width="id" :model-value="ch.role" @update:model-value="updateField('role', $event)" />
                </div>
                <div class="ch-field">
                  <span class="ch-field-label">{{ $t("characters.detail.gender") }}</span>
                  <UiInput width="token" :model-value="ch.gender" @update:model-value="updateField('gender', $event)" />
                </div>
                <div class="ch-field">
                  <span class="ch-field-label">{{ $t("characters.detail.pronouns") }}</span>
                  <UiInput width="token" :model-value="ch.pronouns" @update:model-value="updateField('pronouns', $event)" />
                </div>
                <div class="ch-field">
                  <span class="ch-field-label">{{ $t("characters.detail.age") }}</span>
                  <UiNumber width="num" :use-grouping="false"
                    :model-value="ch.age ?? null" @update:model-value="updateField('age', $event ?? null)" />
                </div>
                <div class="ch-field">
                  <span class="ch-field-label">{{ $t("characters.detail.lifeStatus") }}</span>
                  <UiSelect width="id"
                    :model-value="ch.lifeStatus || ''"
                    @update:model-value="(v) => updateField('lifeStatus', v)"
                    :options="LIFE_STATUS_OPTIONS"
                    :aria-label="$t('characters.detail.lifeStatus')" />
                </div>
                <label class="chip ch-hero-chip" style="cursor:pointer;gap:6px">
                  <UiCheckbox :model-value="ch.main" @update:model-value="updateField('main', $event)" />
                  {{ $t("characters.detail.mainCharacter") }}
                </label>
                <label class="chip ch-hero-chip" style="cursor:pointer;gap:6px"
                  v-tooltip.bottom="$t('characters.detail.excludeFromAiTooltip')">
                  <UiCheckbox :model-value="!!ch.excludeFromAi" @update:model-value="(v) => updateField('excludeFromAi', v)" />
                  {{ $t("characters.detail.excludeFromAi") }}
                </label>
              </div>
              <div class="ch-field" style="margin-top:14px">
                <span class="ch-field-label">{{ $t("characters.detail.oneLiner") }}
                  <span class="ch-field-hint">{{ $t("characters.detail.oneLinerHint") }}</span>
                </span>
                <UiTextarea rows="2" style="font-family:var(--font-serif);font-style:italic"
                  :model-value="ch.oneLiner" @update:model-value="updateField('oneLiner', $event)" />
              </div>
            </div>
          </div>

          <!-- The describe box (the AI drafting): open while the sheet is thin, else one line. -->
          <DescribeBox ref="describeBox" :key="ch.id" v-model="describeText" :thin="isThinCharacter(extras)"
            :label="$t('characters.draft.describeLabel')" :hint="$t('characters.draft.describeHint')"
            :placeholder="$t('characters.draft.describePlaceholder')"
            :collapsed-label="$t('characters.draft.describeCollapsed')"
            @draft="(text) => openDraft('description', { description: text })" />

          <TagEditor
            :model-value="ch.tags || []"
            :pool="tagPool"
            :curated="project.tagVocabularies.characters"
            @update:model-value="(v) => updateField('tags', v)" />

          <div class="t-eyebrow ch-aliases-label">{{ $t("characters.detail.alsoKnownAs") }}</div>
          <TagEditor
            :model-value="ch.aliases || []"
            :pool="aliasPool"
            @update:model-value="(v) => updateField('aliases', v)" />

          <!-- v3 sectioned sheet. The existing colored Motivation grid, Arc card,
               Voice grid, and Backstory are kept verbatim inside their sections;
               new v3 fields are labeled .ch-field rows. Each section is keyed on
               ch.id so an empty character opens collapsed, a filled one expands. -->
          <SheetSection :key="`identity-${ch.id}`"
            :title="$t('characters.sections.identity.title')"
            :hint="$t('characters.sections.identity.hint')"
            :count="identityCount" draftable @draft="draftSectionFor('identity')">
            <div class="ch-grid-2">
              <div v-for="f in IDENTITY_FIELDS" :key="f.k" class="ch-field">
                <span class="ch-field-label">{{ $t(`characters.fields.${f.group}.${f.k}.label`) }}<span class="ch-field-hint">{{ $t(`characters.fields.${f.group}.${f.k}.hint`) }}</span></span>
                <UiInput :model-value="extraVal(f.group, f.k)" @update:model-value="updateExtrasGroup(f.group, f.k, $event)" />
              </div>
            </div>
            <div class="motivation-grid" style="display:grid;gap:10px;margin-top:16px">
              <div v-for="i in MOTIVATIONS" :key="i.k"
                :style="`padding:14px;border-radius:10px;background:${i.bg};border:1px solid color-mix(in oklab, ${i.color}, white 60%)`">
                <div :style="`font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:${i.color};margin-bottom:2px`">{{ $t(`characters.fields.motivation.${i.k}.label`) }}</div>
                <div class="ch-field-hint" style="margin-bottom:6px">{{ $t(`characters.fields.motivation.${i.k}.hint`) }}</div>
                <UiTextarea rows="2" style="background:transparent;border:0;font-family:var(--font-serif);font-size:14.5px;line-height:1.5"
                  :model-value="extras?.motivation?.[i.k] || ''" @update:model-value="updateMotivation(i.k, $event)" />
              </div>
            </div>
            <div class="ch-fieldset">
              <div v-for="f in CORE_ENGINE_FIELDS" :key="f.k" class="ch-field">
                <span class="ch-field-label">{{ $t(`characters.fields.${f.group}.${f.k}.label`) }}<span class="ch-field-hint">{{ $t(`characters.fields.${f.group}.${f.k}.hint`) }}</span></span>
                <UiTextarea v-if="f.type === 'textarea'" auto-resize :rows="2" :model-value="extraVal(f.group, f.k)" @update:model-value="updateExtrasGroup(f.group, f.k, $event)" />
                <UiInput v-else :model-value="extraVal(f.group, f.k)" @update:model-value="updateExtrasGroup(f.group, f.k, $event)" />
              </div>
            </div>
          </SheetSection>

          <SheetSection :key="`arc-${ch.id}`"
            :title="$t('characters.sections.arc.title')"
            :hint="$t('characters.sections.arc.hint')"
            :count="arcCount" draftable @draft="draftSectionFor('arc')">
            <div class="card tight" style="padding:0;overflow:hidden">
              <div class="arc-grid" style="display:grid">
                <div v-for="(s, i) in ARC_STEPS" :key="s.k"
                  :style="`padding:14px;${i < 2 ? 'border-right:1px solid var(--border);' : ''}`">
                  <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
                    <span :style="`width:18px;height:18px;border-radius:50%;background:${i === 0 ? 'var(--surface-3)' : i === 1 ? 'var(--accent-soft)' : 'var(--accent)'};color:${i === 2 ? 'white' : 'var(--ink-2)'};display:grid;place-items:center;font-family:var(--font-serif);font-style:italic;font-size:11px;font-weight:600`">{{ i + 1 }}</span>
                    <span class="t-eyebrow">{{ $t(`characters.fields.arc.${s.k}.label`) }}</span>
                  </div>
                  <div class="ch-field-hint" style="margin-bottom:6px">{{ $t(`characters.fields.arc.${s.k}.hint`) }}</div>
                  <UiTextarea rows="3" style="background:transparent;border:0;font-family:var(--font-serif);font-size:14px;line-height:1.55"
                    :model-value="extras?.arc?.[s.k] || ''" @update:model-value="updateArc(s.k, $event)" />
                </div>
              </div>
            </div>
          </SheetSection>

          <SheetSection :key="`voice-${ch.id}`"
            :title="$t('characters.sections.voice.title')"
            :hint="$t('characters.sections.voice.hint')"
            :count="voiceCount" draftable @draft="draftSectionFor('voice')">
            <div class="card tight voice-grid" style="padding:16px;gap:10px 18px;font-size:12.5px">
              <div>
                <div class="t-muted">{{ $t("characters.fields.voice.accent.label") }}</div>
                <div class="ch-field-hint" style="margin:2px 0 4px">{{ $t("characters.fields.voice.accent.hint") }}</div>
                <UiInput :model-value="extras?.voice?.accent || ''" @update:model-value="updateVoice('accent', $event)" />
              </div>
              <div>
                <div class="t-muted">{{ $t("characters.fields.voice.vocabulary.label") }}</div>
                <div class="ch-field-hint" style="margin:2px 0 4px">{{ $t("characters.fields.voice.vocabulary.hint") }}</div>
                <UiInput :model-value="extras?.voice?.vocabulary || ''" @update:model-value="updateVoice('vocabulary', $event)" />
              </div>
              <div style="grid-column:1/-1">
                <div class="t-muted">{{ $t("characters.fields.voice.tic.label") }}</div>
                <div class="ch-field-hint" style="margin:2px 0 4px">{{ $t("characters.fields.voice.tic.hint") }}</div>
                <UiInput :model-value="extras?.voice?.tic || ''" @update:model-value="updateVoice('tic', $event)" />
              </div>
              <div style="grid-column:1/-1">
                <div class="t-muted">{{ $t("characters.fields.voice.sample.label") }}</div>
                <div class="ch-field-hint" style="margin:2px 0 4px">{{ $t("characters.fields.voice.sample.hint") }}</div>
                <UiTextarea rows="2" :model-value="extras?.voice?.sample || ''" @update:model-value="updateVoice('sample', $event)" />
              </div>
            </div>
            <div class="ch-fieldset">
              <div v-for="f in VOICE_FIELDS" :key="f.k" class="ch-field">
                <span class="ch-field-label">{{ $t(`characters.fields.${f.group}.${f.k}.label`) }}<span class="ch-field-hint">{{ $t(`characters.fields.${f.group}.${f.k}.hint`) }}</span></span>
                <UiTextarea v-if="f.type === 'textarea'" auto-resize :rows="2" :model-value="extraVal(f.group, f.k)" @update:model-value="updateExtrasGroup(f.group, f.k, $event)" />
                <UiInput v-else :model-value="extraVal(f.group, f.k)" @update:model-value="updateExtrasGroup(f.group, f.k, $event)" />
              </div>
              <div v-for="f in PRESENCE_FIELDS" :key="f.k" class="ch-field">
                <span class="ch-field-label">{{ $t(`characters.fields.${f.group}.${f.k}.label`) }}<span class="ch-field-hint">{{ $t(`characters.fields.${f.group}.${f.k}.hint`) }}</span></span>
                <UiTextarea auto-resize :rows="2" :model-value="extraVal(f.group, f.k)" @update:model-value="updateExtrasGroup(f.group, f.k, $event)" />
              </div>
            </div>
          </SheetSection>

          <SheetSection :key="`function-${ch.id}`"
            :title="$t('characters.sections.function.title')"
            :hint="$t('characters.sections.function.hint')"
            :count="functionCount" draftable @draft="draftSectionFor('function')">
            <div class="ch-fieldset">
              <div v-for="f in FUNCTION_FIELDS" :key="f.k" class="ch-field">
                <span class="ch-field-label">{{ $t(`characters.fields.${f.group}.${f.k}.label`) }}<span class="ch-field-hint">{{ $t(`characters.fields.${f.group}.${f.k}.hint`) }}</span></span>
                <UiTextarea v-if="f.type === 'textarea'" auto-resize :rows="2" :model-value="extraVal(f.group, f.k)" @update:model-value="updateExtrasGroup(f.group, f.k, $event)" />
                <UiInput v-else :model-value="extraVal(f.group, f.k)" @update:model-value="updateExtrasGroup(f.group, f.k, $event)" />
              </div>
            </div>
          </SheetSection>

          <SheetSection :key="`capabilities-${ch.id}`"
            :title="$t('characters.sections.capabilities.title')"
            :hint="$t('characters.sections.capabilities.hint')"
            :count="capabilitiesCount" draftable @draft="draftSectionFor('capabilities')">
            <div class="ch-fieldset">
              <div v-for="f in CAPABILITY_FIELDS" :key="f.k" class="ch-field">
                <span class="ch-field-label">{{ $t(`characters.fields.${f.group}.${f.k}.label`) }}<span class="ch-field-hint">{{ $t(`characters.fields.${f.group}.${f.k}.hint`) }}</span></span>
                <UiTextarea v-if="f.type === 'textarea'" auto-resize :rows="2" :model-value="extraVal(f.group, f.k)" @update:model-value="updateExtrasGroup(f.group, f.k, $event)" />
                <UiInput v-else :model-value="extraVal(f.group, f.k)" @update:model-value="updateExtrasGroup(f.group, f.k, $event)" />
              </div>
            </div>
          </SheetSection>

          <SheetSection :key="`continuity-${ch.id}`"
            :title="$t('characters.sections.continuity.title')"
            :hint="$t('characters.sections.continuity.hint')"
            :count="continuityCount" draftable @draft="draftSectionFor('continuity')">
            <div class="ch-fieldset">
              <div v-for="f in CONTINUITY_FIELDS" :key="f.k" class="ch-field">
                <span class="ch-field-label">{{ $t(`characters.fields.${f.group}.${f.k}.label`) }}<span class="ch-field-hint">{{ $t(`characters.fields.${f.group}.${f.k}.hint`) }}</span></span>
                <UiTextarea v-if="f.type === 'textarea'" auto-resize :rows="2" :model-value="extraVal(f.group, f.k)" @update:model-value="updateExtrasGroup(f.group, f.k, $event)" />
                <UiInput v-else :model-value="extraVal(f.group, f.k)" @update:model-value="updateExtrasGroup(f.group, f.k, $event)" />
              </div>
            </div>
          </SheetSection>

          <SheetSection :key="`depth-${ch.id}`"
            :title="$t('characters.sections.depth.title')"
            :hint="$t('characters.sections.depth.hint')"
            :count="depthCount" draftable @draft="draftSectionFor('depth')">
            <div class="ch-field">
              <span class="ch-field-label">{{ $t("characters.detail.backstory") }}<span class="ch-field-hint">{{ $t("characters.detail.backstoryHint") }}</span></span>
              <UiTextarea rows="5" style="font-family:var(--font-serif);font-size:15px;line-height:1.65"
                :model-value="extras?.backstory || ''" @update:model-value="updateBackstory($event)" />
            </div>
            <div class="ch-fieldset">
              <div v-for="f in DEPTH_FIELDS" :key="f.k" class="ch-field">
                <span class="ch-field-label">{{ $t(`characters.fields.${f.group}.${f.k}.label`) }}<span class="ch-field-hint">{{ $t(`characters.fields.${f.group}.${f.k}.hint`) }}</span></span>
                <UiTextarea v-if="f.type === 'textarea'" auto-resize :rows="2" :model-value="extraVal(f.group, f.k)" @update:model-value="updateExtrasGroup(f.group, f.k, $event)" />
                <UiInput v-else :model-value="extraVal(f.group, f.k)" @update:model-value="updateExtrasGroup(f.group, f.k, $event)" />
              </div>
            </div>
          </SheetSection>

          <div style="margin-top:22px">
            <div class="t-eyebrow" style="margin-bottom:10px">{{ $t("characters.detail.appearsInScenes") }}</div>
            <SceneRefList field="characters" :entity-id="ch.id"
              :empty-text="$t('characters.detail.sceneRefEmpty')" />
          </div>

          <div style="margin-top:22px">
            <div class="t-eyebrow" style="margin-bottom:10px">{{ $t("characters.detail.mentionedInProse") }}</div>
            <MentionRefList :entity-id="ch.id" />
          </div>
        </div>
      </div>

      <ImagesModal v-if="modal === 'images'" kind="characters" :entity-id="ch.id" :entity-name="ch.name" @close="modal = null" />
      <GroupsModal v-if="modal === 'groups'" :entity-id="ch.id" :entity-name="ch.name" entity-kind="character" @close="modal = null" />
      <CharacterDraftModal v-if="modal === 'draft' && draft" :character-id="ch.id"
        :source="draft.source" :description="draft.description" :section-key="draft.sectionKey"
        @close="closeDraft" />
    </template>

    <!-- ── id in URL but character not found (deleted / bad link) ── -->
    <template v-else>
      <PaneHeader :crumbs="[{ label: $t('characters.notFound.breadcrumb'), to: '/characters' }]" :title="$t('characters.notFound.title')">
        <UiButton intent="primary" size="small" @click="addCharacter"><Icon name="Plus" :size="14" /> {{ $t("characters.header.newCharacter") }}</UiButton>
      </PaneHeader>
      <div class="pane-card" style="display:grid;place-items:center;padding:60px">
        <div class="t-muted" style="text-align:center">
          {{ $t("characters.notFound.message") }}<br />
          <UiButton intent="ghost" style="margin-top:14px" @click="router.push('/characters')">{{ $t("characters.notFound.back") }}</UiButton>
        </div>
      </div>
    </template>

    <EntitySweepModal v-if="sweepOpen"
      @close="sweepOpen = false"
      @committed="onSweepCommitted" />

    <CharacterAuditModal v-if="auditOpen"
      @close="auditOpen = false" />

    <RelationshipArcModal v-if="relationshipArcOpen"
      @close="relationshipArcOpen = false" />

    <SuggestEntitiesModal v-if="suggestOpen" kind="character" @close="suggestOpen = false" />
    <CharacterBatchFillModal v-if="batchFillOpen"
      :pre-checked-ids="batchFillIds"
      @close="batchFillOpen = false; batchFillIds = null" />
  </q-page>
</template>

<style scoped>
/* Composes with the global .entity-desc (base margin 0). */
.ch-desc { margin: 0 0 18px; }

.ch-aliases-label { margin: 14px 0 6px; }


.avatar-drop {
  position: relative;
  border-radius: 14px;
  transition: box-shadow .15s ease, transform .15s ease;
}
.avatar-drop-hot {
  box-shadow: 0 0 0 3px var(--accent), 0 0 0 6px var(--accent-soft);
  transform: scale(1.02);
}
.avatar-drop-overlay {
  position: absolute;
  inset: 0;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  gap: 4px;
  background: color-mix(in oklch, var(--accent) 75%, transparent);
  color: var(--on-accent);
  border-radius: 14px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  pointer-events: none;
}
.avatar-drop-overlay.saving {
  background: color-mix(in oklch, var(--surface) 80%, transparent);
  color: var(--ink-2);
  font-style: italic;
  text-transform: none;
  letter-spacing: 0;
  font-weight: 500;
}

.pane-card { container-type: inline-size; container-name: pane; }

.character-hero {
  display: flex;
  gap: 22px;
  align-items: flex-start;
}
.character-hero-fields { flex: 1; min-width: 0; }

/* The canonical field (.ch-field, its label and hint) is in src/css/app.scss since 2026-10-16 —
   the describe box (components/DescribeBox.vue) shares it. */
.ch-hero-row { display: flex; gap: 12px 14px; align-items: flex-end; flex-wrap: wrap; }
.ch-hero-row .ch-field { flex: 0 1 auto; }
.ch-hero-chip { align-self: flex-end; margin-bottom: 4px; }

/* v3 section bodies: a vertical stack of fields, and a 2-up grid for the
   short identity pair. */
.ch-fieldset { display: flex; flex-direction: column; gap: 14px; margin-top: 16px; }
.ch-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 18px; }

.motivation-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.arc-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.voice-grid { display: grid; grid-template-columns: 1fr 1fr; }

@container pane (max-width: 760px) {
  .character-hero { flex-direction: column; align-items: stretch; gap: 14px; }
  .character-hero .avatar-drop { align-self: center; }
  .motivation-grid { grid-template-columns: 1fr; }
  .arc-grid { grid-template-columns: 1fr; }
  .arc-grid > div { border-right: 0 !important; border-bottom: 1px solid var(--border); }
  .arc-grid > div:last-child { border-bottom: 0; }
  .voice-grid { grid-template-columns: 1fr; }
  .ch-grid-2 { grid-template-columns: 1fr; }
}

/* ── List view (shared shape = the global .entity-* family; only the
      avatar name-cell stays local) ─────────────────────────────── */
.ch-cell-name {
  display: flex; align-items: center; gap: 10px; cursor: pointer;
}
.ch-cell-name-text { display: flex; flex-direction: column; gap: 1px; }
.ch-cell-name-main { font-family: var(--font-serif); font-size: 14px; color: var(--ink); }
.ch-cell-name-sub {
  font-size: 12px; color: var(--muted); line-height: 1.4;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  max-width: 340px;
}
</style>
