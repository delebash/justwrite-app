<script setup>
// The review window for a location's, object's or group's sheet drafted from the writer's
// description (the AI drafting spec §9.1; the plan 2026-10-15, Task S5; 2026-10-16) — the
// character draft window's shape (CharacterDraftModal.vue) on the same review list
// (DraftReviewList.vue): each proposal beside the current value, empty fields ticked, nothing
// saved until Apply, which is one undo step (sheetDraft.js applySheetDrafts → the store's
// applySheetDraft). Progress and Cancel ride the shared AiTaskStrip.
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useProjectStore } from "../stores/project.js";
import { useAiTasksStore, AiTaskStrip, AppModal, Icon, UiButton, UiBanner } from "@delebash/llm-ui";
import { draftRows } from "../services/analysis/characterProfile.js";
import { applySheetDrafts, draftSheet, STORY_WORLD_FEATURE } from "../services/analysis/sheetDraft.js";
import { STORY_WORLD_SHEETS, sheetFieldDefs } from "../services/storyWorldSheet.js";
import AiFeatureChip from "./AiFeatureChip.vue";
import DraftReviewList from "./DraftReviewList.vue";

const props = defineProps({
  // "location" · "object" · "group"
  kind: { type: String, required: true },
  entityId: { type: String, required: true },
  description: { type: String, default: "" },
});
const emit = defineEmits(["close"]);

const { t } = useI18n({ useScope: "global" });
const project = useProjectStore();
const aiTasks = useAiTasksStore();
const myTask = computed(() => aiTasks.runningTasks.find(
  (task) => task.feature === STORY_WORLD_FEATURE && task.meta?.entityId === props.entityId));
const running = computed(() => !!myTask.value);

const entity = computed(() => (project[STORY_WORLD_SHEETS[props.kind].plural] || []).find((x) => x.id === props.entityId));

const loading = ref(true);
const error = ref("");
const rows = ref([]);
let abort = null;

async function run() {
  loading.value = true;
  error.value = "";
  rows.value = [];
  try {
    abort = new AbortController();
    const r = await draftSheet({ project, kind: props.kind, entityId: props.entityId, description: props.description, signal: abort.signal });
    rows.value = draftRows(sheetFieldDefs(props.kind, entity.value, t), r.fields);
    if (!rows.value.length) error.value = t("characterDraft.nothingDrafted");
  } catch (e) {
    const msg = e?.message || String(e);
    if (!/abort|cancel/i.test(msg)) error.value = msg;
  } finally {
    loading.value = false;
  }
}
onMounted(run);

const acceptCount = computed(() => rows.value.filter((r) => r.accept).length);
function apply() {
  const picked = rows.value.filter((r) => r.accept);
  if (!picked.length) return;
  applySheetDrafts(project, props.kind, props.entityId, picked);
  emit("close");
}
function onClose() {
  abort?.abort();
  emit("close");
}
</script>

<template>
  <AppModal :lede="$t('sheetDraft.desc')" :eyebrow="$t('characters.draft.fromDescription')" :title="entity?.name || ''"
    :closable="!running" @close="onClose">
    <template #header-extra>
      <AiFeatureChip :feature="STORY_WORLD_FEATURE" :label="$t('sheetDraft.chipLabel')" editable />
    </template>

    <AiTaskStrip :task="myTask" />
    <UiBanner v-if="error">{{ error }}</UiBanner>
    <div v-if="loading" class="sd-empty">{{ $t("sheetDraft.drafting", { name: entity?.name || "" }) }}</div>
    <DraftReviewList v-else :rows="rows" />

    <template #footer>
      <span style="flex:1"></span>
      <UiButton intent="ghost" @click="onClose">{{ rows.length ? $t("common.cancel") : $t("common.close") }}</UiButton>
      <UiButton v-if="rows.length" intent="primary" :disabled="!acceptCount" @click="apply">
        <Icon name="Check" :size="13" /> {{ $t("characterProfile.applyAction", { n: acceptCount }, acceptCount) }}
      </UiButton>
    </template>
  </AppModal>
</template>

<style scoped>
.sd-empty {
  padding: 26px 18px; text-align: center;
  background: var(--surface-2); border-radius: 10px;
  font-size: 13px; color: var(--ink-2); line-height: 1.55;
}
</style>
