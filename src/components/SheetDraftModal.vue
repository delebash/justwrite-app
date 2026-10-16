<script setup>
// The review window for a location's, object's or group's sheet drafted from the writer's
// description (the AI drafting spec §9.1; the plan 2026-10-15, Task S5; 2026-10-16): the shared
// review window (DraftReviewModal.vue) with the sheet's draft and apply — each proposal beside the
// field's value, empty ones ticked; Apply is one undo step (sheetDraft.js applySheetDrafts → the
// store's applySheetDraft).
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { useProjectStore } from "../stores/project.js";
import { draftRows } from "../services/analysis/characterProfile.js";
import { applySheetDrafts, draftSheet, sheetDraftDefs, STORY_WORLD_FEATURE } from "../services/analysis/sheetDraft.js";
import { STORY_WORLD_SHEETS } from "../services/storyWorldSheet.js";
import DraftReviewModal from "./DraftReviewModal.vue";

const props = defineProps({
  // "location" · "object" · "group"
  kind: { type: String, required: true },
  entityId: { type: String, required: true },
  description: { type: String, default: "" },
});
const emit = defineEmits(["close"]);

const { t } = useI18n({ useScope: "global" });
const project = useProjectStore();
const entity = computed(() => (project[STORY_WORLD_SHEETS[props.kind].plural] || []).find((x) => x.id === props.entityId));

async function run(signal) {
  const r = await draftSheet({ project, kind: props.kind, entityId: props.entityId, description: props.description, signal });
  return draftRows(sheetDraftDefs(props.kind, entity.value, t), r.fields);
}
function apply(picked) {
  applySheetDrafts(project, props.kind, props.entityId, picked);
}
</script>

<template>
  <DraftReviewModal :eyebrow="$t('characters.draft.fromDescription')" :title="entity?.name || ''"
    :lede="$t('sheetDraft.desc')" :feature="STORY_WORLD_FEATURE" :chip-label="$t('sheetDraft.chipLabel')"
    :task-meta="{ entityId }" :loading-text="$t('sheetDraft.drafting', { name: entity?.name || '' })"
    :run="run" :apply="apply" @close="emit('close')" />
</template>
