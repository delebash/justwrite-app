<script setup>
import { computed, ref, watch, nextTick } from "vue";
import { useI18n } from "vue-i18n";
import { useProjectStore } from "../stores/project.js";
import { useUiStore } from "../stores/ui.js";
import { useRoute, useRouter } from "vue-router";
import Avatar from "../components/Avatar.vue";
import { Icon } from "@delebash/llm-ui";
import { UiInput } from "@delebash/llm-ui";
import { UiTextarea } from "@delebash/llm-ui";
import { UiCheckbox } from "@delebash/llm-ui";
import { UiNumber } from "@delebash/llm-ui";
import { UiButton } from "@delebash/llm-ui";
import { UiSelect } from "@delebash/llm-ui";
import { UiTag } from "@delebash/llm-ui";
import { UiTable } from "@delebash/llm-ui";
import ImagesModal from "../components/ImagesModal.vue";
import EntitySweepModal from "../components/EntitySweepModal.vue";
import CharacterAuditModal from "../components/CharacterAuditModal.vue";
import RelationshipArcModal from "../components/RelationshipArcModal.vue";
import StatusSelect from "../components/StatusSelect.vue";
import GroupsModal from "../components/GroupsModal.vue";
import CharacterProfileFillModal from "../components/CharacterProfileFillModal.vue";
import CharacterBatchFillModal from "../components/CharacterBatchFillModal.vue";
import CharacterSheetSection from "../components/CharacterSheetSection.vue";
import TagEditor from "../components/TagEditor.vue";
import SceneRefList from "../components/SceneRefList.vue";
import MentionRefList from "../components/MentionRefList.vue";
import { Breadcrumb } from "@delebash/llm-ui";
import { HelpTrigger } from "@delebash/llm-ui";
import { confirmDialog } from "@delebash/llm-ui";
import PaneHeader from "../components/PaneHeader.vue";
import { saveImage } from "../services/imageStore.js";

const props = defineProps({ id: { type: String, default: "" } });
const { t } = useI18n({ useScope: "global" });
const project = useProjectStore();
const ui = useUiStore();
const router = useRouter();
const route = useRoute();
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

// Copy lives in the catalog, keyed by the DATA MODEL — `characters.fields.<extras
// group>.<field key>.{label,hint}` — so these descriptor arrays stay pure data
// (no locale text to freeze at module load) and the template resolves the words
// with $t. Every (group, key) pair is unique across these and the eight v3 field
// arrays below, which is what lets one flat tree serve them all.
const MOTIVATIONS = [
  { k: "want",  color: "var(--trait-want-ink)",  bg: "var(--trait-want-bg)" },
  { k: "need",  color: "var(--trait-need-ink)",  bg: "var(--trait-need-bg)" },
  { k: "lie",   color: "var(--trait-lie-ink)",   bg: "var(--trait-lie-bg)" },
  { k: "truth", color: "var(--trait-truth-ink)", bg: "var(--trait-truth-bg)" },
];
const ARC_STEPS = [{ k: "start" }, { k: "midpoint" }, { k: "end" }];
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
    question: `Tell me about ${ch.value.name}`,
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
function countExtras(pairs) {
  return pairs.filter(([g, k]) => String((g === "_top" ? extras.value?.[k] : extras.value?.[g]?.[k]) || "").trim()).length;
}

// v3 field descriptors — plain fields grouped by section. Rendered as a
// labeled .ch-field (UiInput for single-line facts, UiTextarea for anything
// sentence-shaped). Label + hint come from `characters.fields.<group>.<k>` in
// the catalog (see the note above MOTIVATIONS), so what lives here is only the
// shape: which extras group owns the field, its key, and how to render it.
// The existing colored Motivation grid, Arc card, Voice grid, and Backstory
// keep their bespoke rendering; these are the NEW v3 fields that join them.
const IDENTITY_FIELDS = [
  { group: "identity", k: "classOrigin", type: "input" },
  { group: "identity", k: "education", type: "input" },
];
const CORE_ENGINE_FIELDS = [
  { group: "motivation", k: "fear", type: "textarea" },
  { group: "motivation", k: "lieOrigin", type: "textarea" },
  { group: "motivation", k: "contradiction", type: "textarea" },
  { group: "motivation", k: "values", type: "input" },
  { group: "motivation", k: "heuristic", type: "input" },
  { group: "motivation", k: "stakes", type: "textarea" },
];
const VOICE_FIELDS = [
  { group: "voice", k: "register", type: "input" },
  { group: "voice", k: "rhythm", type: "input" },
  { group: "voice", k: "forbidden", type: "input" },
  { group: "voice", k: "subtext", type: "input" },
  { group: "voice", k: "humor", type: "input" },
  { group: "voice", k: "languages", type: "input" },
  { group: "voice", k: "sampleAngry", type: "textarea" },
  { group: "voice", k: "sampleLying", type: "textarea" },
];
const PRESENCE_FIELDS = [
  { group: "presence", k: "physicality", type: "textarea" },
  { group: "presence", k: "presentation", type: "textarea" },
  { group: "presence", k: "stressTells", type: "textarea" },
];
const FUNCTION_FIELDS = [
  { group: "function", k: "theme", type: "textarea" },
  { group: "function", k: "protagonistRelation", type: "input" },
  { group: "function", k: "selfImage", type: "textarea" },
  { group: "function", k: "persona", type: "textarea" },
  { group: "function", k: "privateTruth", type: "textarea" },
  { group: "function", k: "buttons", type: "textarea" },
  { group: "function", k: "allegiances", type: "textarea" },
  { group: "function", k: "escalation", type: "input" },
  { group: "function", k: "cornered", type: "textarea" },
];
const CAPABILITY_FIELDS = [
  { group: "capabilities", k: "abilities", type: "textarea" },
  { group: "capabilities", k: "costs", type: "textarea" },
  { group: "capabilities", k: "limits", type: "textarea" },
  { group: "capabilities", k: "conditions", type: "input" },
  { group: "capabilities", k: "whoKnows", type: "input" },
];
const CONTINUITY_FIELDS = [
  { group: "continuity", k: "physicalConstants", type: "textarea" },
  { group: "continuity", k: "health", type: "textarea" },
  { group: "continuity", k: "timelineAnchors", type: "input" },
  { group: "continuity", k: "knows", type: "textarea" },
  { group: "continuity", k: "doesntKnow", type: "textarea" },
  { group: "continuity", k: "believesWrongly", type: "textarea" },
  { group: "continuity", k: "secrets", type: "textarea" },
  { group: "continuity", k: "possessions", type: "textarea" },
];
const DEPTH_FIELDS = [
  { group: "depth", k: "regrets", type: "textarea" },
  { group: "depth", k: "family", type: "textarea" },
  { group: "depth", k: "skills", type: "textarea" },
  { group: "depth", k: "routines", type: "input" },
  { group: "depth", k: "appearance", type: "textarea" },
  { group: "depth", k: "tastes", type: "input" },
];

// Per-section filled-field counts — drive the header count chip + initial open
// state. Include the bespoke fields (motivation/arc/voice/backstory) so the
// count reflects the whole section, not just the new plain rows.
const identityCount = computed(() => countExtras([
  ["identity", "classOrigin"], ["identity", "education"],
  ["motivation", "want"], ["motivation", "need"], ["motivation", "lie"], ["motivation", "truth"],
  ...CORE_ENGINE_FIELDS.map((f) => [f.group, f.k]),
]));
const arcCount = computed(() => countExtras([["arc", "start"], ["arc", "midpoint"], ["arc", "end"]]));
const voiceCount = computed(() => countExtras([
  ["voice", "accent"], ["voice", "vocabulary"], ["voice", "tic"], ["voice", "sample"],
  ...VOICE_FIELDS.map((f) => [f.group, f.k]),
  ...PRESENCE_FIELDS.map((f) => [f.group, f.k]),
]));
const functionCount = computed(() => countExtras(FUNCTION_FIELDS.map((f) => [f.group, f.k])));
const capabilitiesCount = computed(() => countExtras(CAPABILITY_FIELDS.map((f) => [f.group, f.k])));
const continuityCount = computed(() => countExtras(CONTINUITY_FIELDS.map((f) => [f.group, f.k])));
const depthCount = computed(() => countExtras([["_top", "backstory"], ...DEPTH_FIELDS.map((f) => [f.group, f.k])]));

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

const globalQuery = ref("");
const selectedStatus = ref(null);
const selectedMain = ref(null);   // null = All, true = Yes, false = No
const selectedGender = ref(null);
const selectedLifeStatus = ref(null);
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
  selectedMain.value = null;
  selectedGender.value = null;
  selectedLifeStatus.value = null;
  selectedTags.value = new Set();
}

const statusOptions = computed(() =>
  project.statuses.map((s) => ({ value: s.id, label: s.label })),
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

const filteredRows = computed(() => {
  const rs = rows.value;
  if (selectedStatus.value === null && selectedMain.value === null && selectedGender.value === null && selectedLifeStatus.value === null && selectedTags.value.size === 0) return rs;
  return rs.filter((r) => {
    if (selectedStatus.value !== null && r.status !== selectedStatus.value) return false;
    if (selectedMain.value !== null && !!r.main !== selectedMain.value) return false;
    if (selectedGender.value !== null && r.gender !== selectedGender.value) return false;
    if (selectedLifeStatus.value !== null && (r.lifeStatus || "") !== selectedLifeStatus.value) return false;
    if (selectedTags.value.size > 0) {
      const rt = r.tags || [];
      if (!rt.some((t) => selectedTags.value.has(t))) return false;
    }
    return true;
  });
});

const hasActiveFacets = computed(() =>
  selectedStatus.value !== null || selectedMain.value !== null || selectedGender.value !== null || selectedLifeStatus.value !== null || selectedTags.value.size > 0,
);

const allLifeStatuses = computed(() => {
  const set = new Set();
  for (const c of project.characters) if (c.lifeStatus) set.add(c.lifeStatus);
  return LIFE_STATUS_OPTIONS.value.filter((o) => o.value && set.has(o.value));
});

// computed() for the same reason as LIFE_STATUS_OPTIONS: a module-const header
// row would freeze the column names in the boot language.
const columns = computed(() => [
  { accessorKey: "name",     header: t("characters.columns.name"),     sortable: true, headerStyle: "min-width: 200px" },
  { accessorKey: "role",     header: t("characters.columns.role"),     sortable: true, headerStyle: "min-width: 140px" },
  { accessorKey: "gender",   header: t("characters.columns.gender"),   sortable: true, headerStyle: "min-width: 100px" },
  { accessorKey: "pronouns", header: t("characters.columns.pronouns"), sortable: true, headerStyle: "min-width: 110px" },
  { accessorKey: "tags",     header: t("characters.columns.tags"),     sortable: false, headerStyle: "min-width: 140px", enableGlobalFilter: true },
  { accessorKey: "status",   header: t("characters.columns.status"),   sortable: true, headerStyle: "min-width: 110px" },
  { accessorKey: "main",     header: t("characters.columns.main"),     sortable: true, headerStyle: "min-width: 70px" },
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

    <div v-else class="pane-card">
      <div class="scrollarea" style="padding:18px 22px 40px">
        <!-- i18n-t + named slots (the user's ruling, 2026-07-26: "i18n-t with slots, no
             html in messages"). The sentence stays ONE translatable unit — the emphasis
             is markup supplied by the template, not by the message. -->
        <i18n-t keypath="characters.intro" tag="p" class="entity-desc ch-desc" scope="global">
          <template #character><strong>{{ $t("characters.introTerms.character") }}</strong></template>
          <template #relations><strong>{{ $t("sidebar.nav.relations") }}</strong></template>
          <template #castPresence><strong>{{ $t("characters.introTerms.castPresence") }}</strong></template>
        </i18n-t>
        <!-- Toolbar -->
        <div class="entity-toolbar">
          <span class="entity-search">
            <Icon name="Search" :size="13" class="entity-search-icon" />
            <UiInput
              :value="globalQuery"
              :placeholder="$t('characters.list.searchPlaceholder')"
              @input="onGlobalInput"
              class="entity-search-input"
            />
          </span>
          <UiButton v-if="globalQuery || hasActiveFacets" :label="$t('common.clearFilters')" intent="ghost" size="small" @click="clearAllFilters" />
          <span class="entity-count">{{ $t("common.countOf", { shown: filteredRows.length, total: rows.length }) }}</span>
        </div>

        <!-- Facets -->
        <div class="entity-facets" v-if="statusOptions.length || allTags.length">
          <div v-if="statusOptions.length" class="entity-facet">
            <span class="entity-facet-label">{{ $t("characters.facets.status") }}</span>
            <button class="entity-chip" :class="{ active: selectedStatus === null }" @click="selectedStatus = null">{{ $t("common.all") }}</button>
            <button v-for="s in statusOptions" :key="s.value"
              class="entity-chip" :class="{ active: selectedStatus === s.value }"
              @click="selectedStatus = selectedStatus === s.value ? null : s.value">
              {{ s.label }}
            </button>
          </div>
          <div class="entity-facet">
            <span class="entity-facet-label">{{ $t("characters.facets.main") }}</span>
            <button class="entity-chip" :class="{ active: selectedMain === null }" @click="selectedMain = null">{{ $t("common.all") }}</button>
            <button class="entity-chip" :class="{ active: selectedMain === true }" @click="selectedMain = selectedMain === true ? null : true">{{ $t("common.yes") }}</button>
            <button class="entity-chip" :class="{ active: selectedMain === false }" @click="selectedMain = selectedMain === false ? null : false">{{ $t("common.no") }}</button>
          </div>
          <div v-if="allGenders.length" class="entity-facet">
            <span class="entity-facet-label">{{ $t("characters.facets.gender") }}</span>
            <button class="entity-chip" :class="{ active: selectedGender === null }" @click="selectedGender = null">{{ $t("common.all") }}</button>
            <button v-for="g in allGenders" :key="g"
              class="entity-chip" :class="{ active: selectedGender === g }"
              @click="selectedGender = selectedGender === g ? null : g">
              {{ g }}
            </button>
          </div>
          <div v-if="allLifeStatuses.length" class="entity-facet">
            <span class="entity-facet-label">{{ $t("characters.facets.lifeStatus") }}</span>
            <button class="entity-chip" :class="{ active: selectedLifeStatus === null }" @click="selectedLifeStatus = null">{{ $t("common.all") }}</button>
            <button v-for="o in allLifeStatuses" :key="o.value"
              class="entity-chip" :class="{ active: selectedLifeStatus === o.value }"
              @click="selectedLifeStatus = selectedLifeStatus === o.value ? null : o.value">
              {{ o.label }}
            </button>
          </div>
          <div v-if="allTags.length" class="entity-facet">
            <span class="entity-facet-label">{{ $t("characters.facets.tags") }}</span>
            <!-- `v-for="t in allTags"` SHADOWS the setup `t` — anything inside this
                 loop must use $t, never the destructured t (build:vite won't catch it). -->
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
          :global-filter-fields="['name', 'role', 'gender', 'pronouns', 'aliases', 'oneLiner', 'tags']"
          :pagination="{ pageSize: 20, pageSizeOptions: [10, 20, 50, 100] }"
          class="entity-table"
          @row-click="onRowClick"
        >
          <template #empty>
            <div class="entity-empty">{{ $t("characters.list.noMatches") }}</div>
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
        </UiTable>
      </div>
    </div>
  </template>

  <!-- ── Detail mode (id present, character found) ────────────── -->
  <template v-else-if="ch">
    <header class="pane-header entity-pane-header">
      <div class="pane-title">
        <Breadcrumb :segments="[{ label: ch.main ? $t('characters.detail.mainCharacter') : $t('characters.detail.secondaryCharacter'), to: '/characters' }]" />
        <input class="entity-name" ref="nameInput"
          :value="ch.name"
          :placeholder="$t('characters.detail.namePlaceholder')"
          @input="updateField('name', $event.target.value)" />
      </div>
      <div class="pane-actions">
        <UiButton intent="ghost" size="small" data-panel-toggle @click="talkToCharacter"
          v-tooltip.bottom="$t('characters.detail.talkToTooltip', { name: ch.name })">
          <Icon name="Sparkle" :size="14" /> {{ $t("characters.detail.talkTo", { name: ch.name?.split(/\s+/)[0] || $t("characters.detail.talkToFallback") }) }}
        </UiButton>
        <UiButton intent="ghost" size="small" data-panel-toggle @click="askTheBook"
          v-tooltip.bottom="$t('characters.detail.askTheBookTooltip', { name: ch.name })">
          <Icon name="Chat" :size="14" /> {{ $t("sidebar.nav.askTheBook") }}
        </UiButton>
        <UiButton intent="ghost" size="small" @click="modal = 'profileFill'"
          v-tooltip.bottom="$t('characters.detail.fillFromBookTooltip', { name: ch.name })">
          <Icon name="Book" :size="14" /> {{ $t("characters.header.fillFromBook") }}
        </UiButton>
        <UiButton intent="ghost" size="small" @click="modal = 'images'"><Icon name="Image" :size="14" /> {{ $t("characters.detail.images") }}</UiButton>
        <router-link :to="`/characters/${ch.id}/events`" custom v-slot="{ navigate }">
          <UiButton intent="ghost" size="small" @click="navigate"><Icon name="Calendar" :size="14" /> {{ $t("characters.detail.events") }}</UiButton>
        </router-link>
        <UiButton intent="ghost" size="small" @click="modal = 'groups'"><Icon name="GroupIcon" :size="14" /> {{ $t("nav.groups") }}</UiButton>
        <UiButton intent="ghost" size="small" @click="deleteCharacter">{{ $t("common.delete") }}</UiButton>
        <UiButton intent="primary" size="small" @click="addCharacter"><Icon name="Plus" :size="14" /> {{ $t("characters.header.newCharacter") }}</UiButton>
        <StatusSelect :model-value="ch.status || ''" @update:model-value="(v) => updateField('status', v)" />
        <HelpTrigger slug="character-sheet" :label="$t('characters.detail.helpLabel')" />
      </div>
    </header>

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
        <CharacterSheetSection :key="`identity-${ch.id}`"
          :title="$t('characters.sections.identity.title')"
          :hint="$t('characters.sections.identity.hint')"
          :count="identityCount">
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
        </CharacterSheetSection>

        <CharacterSheetSection :key="`arc-${ch.id}`"
          :title="$t('characters.sections.arc.title')"
          :hint="$t('characters.sections.arc.hint')"
          :count="arcCount">
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
        </CharacterSheetSection>

        <CharacterSheetSection :key="`voice-${ch.id}`"
          :title="$t('characters.sections.voice.title')"
          :hint="$t('characters.sections.voice.hint')"
          :count="voiceCount">
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
        </CharacterSheetSection>

        <CharacterSheetSection :key="`function-${ch.id}`"
          :title="$t('characters.sections.function.title')"
          :hint="$t('characters.sections.function.hint')"
          :count="functionCount">
          <div class="ch-fieldset">
            <div v-for="f in FUNCTION_FIELDS" :key="f.k" class="ch-field">
              <span class="ch-field-label">{{ $t(`characters.fields.${f.group}.${f.k}.label`) }}<span class="ch-field-hint">{{ $t(`characters.fields.${f.group}.${f.k}.hint`) }}</span></span>
              <UiTextarea v-if="f.type === 'textarea'" auto-resize :rows="2" :model-value="extraVal(f.group, f.k)" @update:model-value="updateExtrasGroup(f.group, f.k, $event)" />
              <UiInput v-else :model-value="extraVal(f.group, f.k)" @update:model-value="updateExtrasGroup(f.group, f.k, $event)" />
            </div>
          </div>
        </CharacterSheetSection>

        <CharacterSheetSection :key="`capabilities-${ch.id}`"
          :title="$t('characters.sections.capabilities.title')"
          :hint="$t('characters.sections.capabilities.hint')"
          :count="capabilitiesCount">
          <div class="ch-fieldset">
            <div v-for="f in CAPABILITY_FIELDS" :key="f.k" class="ch-field">
              <span class="ch-field-label">{{ $t(`characters.fields.${f.group}.${f.k}.label`) }}<span class="ch-field-hint">{{ $t(`characters.fields.${f.group}.${f.k}.hint`) }}</span></span>
              <UiTextarea v-if="f.type === 'textarea'" auto-resize :rows="2" :model-value="extraVal(f.group, f.k)" @update:model-value="updateExtrasGroup(f.group, f.k, $event)" />
              <UiInput v-else :model-value="extraVal(f.group, f.k)" @update:model-value="updateExtrasGroup(f.group, f.k, $event)" />
            </div>
          </div>
        </CharacterSheetSection>

        <CharacterSheetSection :key="`continuity-${ch.id}`"
          :title="$t('characters.sections.continuity.title')"
          :hint="$t('characters.sections.continuity.hint')"
          :count="continuityCount">
          <div class="ch-fieldset">
            <div v-for="f in CONTINUITY_FIELDS" :key="f.k" class="ch-field">
              <span class="ch-field-label">{{ $t(`characters.fields.${f.group}.${f.k}.label`) }}<span class="ch-field-hint">{{ $t(`characters.fields.${f.group}.${f.k}.hint`) }}</span></span>
              <UiTextarea v-if="f.type === 'textarea'" auto-resize :rows="2" :model-value="extraVal(f.group, f.k)" @update:model-value="updateExtrasGroup(f.group, f.k, $event)" />
              <UiInput v-else :model-value="extraVal(f.group, f.k)" @update:model-value="updateExtrasGroup(f.group, f.k, $event)" />
            </div>
          </div>
        </CharacterSheetSection>

        <CharacterSheetSection :key="`depth-${ch.id}`"
          :title="$t('characters.sections.depth.title')"
          :hint="$t('characters.sections.depth.hint')"
          :count="depthCount">
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
        </CharacterSheetSection>

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
    <CharacterProfileFillModal v-if="modal === 'profileFill'" :character-id="ch.id" @close="modal = null" />
  </template>

  <!-- ── id in URL but character not found (deleted / bad link) ── -->
  <template v-else>
    <header class="pane-header entity-pane-header">
      <div class="pane-title">
        <Breadcrumb :segments="[{ label: $t('characters.notFound.breadcrumb'), to: '/characters' }]" />
        <h1 class="pane-h1">{{ $t("characters.notFound.title") }}</h1>
      </div>
      <div class="pane-actions">
        <UiButton intent="primary" size="small" @click="addCharacter"><Icon name="Plus" :size="14" /> {{ $t("characters.header.newCharacter") }}</UiButton>
      </div>
    </header>
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

  <CharacterBatchFillModal v-if="batchFillOpen"
    :pre-checked-ids="batchFillIds"
    @close="batchFillOpen = false; batchFillIds = null" />
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

/* ── The canonical character-sheet field: label on top, optional muted
      hint next to the label, control below. Shared by the hero row and
      every v3 section so the whole page reads as one form. ─────────── */
.ch-field { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.ch-field-label {
  font-size: 11px; font-weight: 600; color: var(--ink-2);
  display: flex; gap: 7px; align-items: baseline; flex-wrap: wrap;
  line-height: 1.35;
}
.ch-field-hint { font-weight: 400; color: var(--muted); font-size: 11px; }
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
