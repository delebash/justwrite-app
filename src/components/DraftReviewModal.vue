<script setup>
// The review window every AI draft of fields lands in (2026-10-16): it runs the draft, shows each
// proposal beside the current value in the shared review list (DraftReviewList.vue — empty fields
// ticked, nothing overwritten unless ticked), and hands the ticked rows to `apply` — nothing saves
// before. Progress and Cancel ride the shared AiTaskStrip; the window can't close mid-run. Its
// users: a location's, object's or group's sheet (SheetDraftModal.vue), a scene's Summary
// (SceneLinks.vue), a plot template's beat notes (PlotBoardPage.vue). The character window
// (CharacterDraftModal.vue) predates it and keeps its own two-pass run.
// RULE #1 precedent: CharacterDraftModal — the same shell, list and footer.
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useAiTasksStore, AiTaskStrip, AppModal, Icon, UiButton, UiBanner } from "@delebash/llm-ui";
import AiFeatureChip from "./AiFeatureChip.vue";
import DraftReviewList from "./DraftReviewList.vue";

const props = defineProps({
  eyebrow: { type: String, default: "" },
  title: { type: String, default: "" },
  lede: { type: String, default: "" },
  // The routed feature (the header's model chip) and the meta its run carries, which picks out
  // this window's task among the running ones.
  feature: { type: String, required: true },
  chipLabel: { type: String, required: true },
  taskMeta: { type: Object, default: () => ({}) },
  loadingText: { type: String, default: "" },
  // What the window says when the draft has no rows.
  emptyText: { type: String, default: "" },
  // The Apply button's catalog key, plural on {n} ("Apply {n} field | Apply {n} fields").
  applyKey: { type: String, default: "characterProfile.applyAction" },
  // async (signal) → the review rows ({ key, label, current, proposed, accept, section? }).
  run: { type: Function, required: true },
  // (ticked rows) → applies them, as one undo step.
  apply: { type: Function, required: true },
});
const emit = defineEmits(["close"]);

const { t } = useI18n({ useScope: "global" });
const aiTasks = useAiTasksStore();
const myTask = computed(() => aiTasks.runningTasks.find((task) => task.feature === props.feature
  && Object.entries(props.taskMeta).every(([k, v]) => task.meta?.[k] === v)));
const running = computed(() => !!myTask.value);

const loading = ref(true);
const error = ref("");
const rows = ref([]);
let abort = null;

async function draft() {
  loading.value = true;
  error.value = "";
  rows.value = [];
  try {
    abort = new AbortController();
    rows.value = await props.run(abort.signal);
    if (!rows.value.length) error.value = props.emptyText || t("characterDraft.nothingDrafted");
  } catch (e) {
    const msg = e?.message || String(e);
    if (!/abort|cancel/i.test(msg)) error.value = msg;
  } finally {
    loading.value = false;
  }
}
onMounted(draft);

const acceptCount = computed(() => rows.value.filter((r) => r.accept).length);
function onApply() {
  const picked = rows.value.filter((r) => r.accept);
  if (!picked.length) return;
  props.apply(picked);
  emit("close");
}
function onClose() {
  abort?.abort();
  emit("close");
}
</script>

<template>
  <AppModal :lede="lede" :eyebrow="eyebrow" :title="title" :closable="!running" @close="onClose">
    <template #header-extra>
      <AiFeatureChip :feature="feature" :label="chipLabel" editable />
    </template>

    <AiTaskStrip :task="myTask" />
    <UiBanner v-if="error">{{ error }}</UiBanner>
    <div v-if="loading" class="drm-empty">{{ loadingText }}</div>
    <DraftReviewList v-else :rows="rows" />

    <template #footer>
      <span style="flex:1"></span>
      <UiButton intent="ghost" @click="onClose">{{ rows.length ? $t("common.cancel") : $t("common.close") }}</UiButton>
      <UiButton v-if="rows.length" intent="primary" :disabled="!acceptCount" @click="onApply">
        <Icon name="Check" :size="13" /> {{ $t(applyKey, { n: acceptCount }, acceptCount) }}
      </UiButton>
    </template>
  </AppModal>
</template>

<style scoped>
.drm-empty {
  padding: 26px 18px; text-align: center;
  background: var(--surface-2); border-radius: 10px;
  font-size: 13px; color: var(--ink-2); line-height: 1.55;
}
</style>
