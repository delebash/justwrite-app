<script setup>
// Suggest characters (the AI drafting spec §3.4) — in Entity sweep's shape since 2026-10-11 (the
// third round): ask (what the writer is looking for, optional) → run (the shared AiTaskStrip
// carries THE Cancel; the window can't close mid-run, so leaving the page can't lose the answer)
// → review (EntityReviewModal with the proposals, as EntitySweepModal hands off its aggregate).
import { computed, onBeforeUnmount, ref } from "vue";
import { QBanner } from "quasar";
import { useAiTasksStore, AiTaskStrip, AppModal, Icon, UiButton, UiTextarea } from "@delebash/llm-ui";
import { useProjectStore } from "../stores/project.js";
import { suggestCharacters } from "../services/analysis/characterDraft.js";
import EntityReviewModal from "./EntityReviewModal.vue";
import AiFeatureChip from "./AiFeatureChip.vue";

const emit = defineEmits(["close", "committed"]);

const project = useProjectStore();
const aiTasks = useAiTasksStore();
const myTask = computed(() => aiTasks.runningTasks.find(
  (task) => task.feature === "brainstorm" && task.meta?.kind === "suggest-characters"));
const running = computed(() => !!myTask.value);

const lookingFor = ref("");
const error = ref("");
const proposals = ref(null); // { characters, locations: [], objects: [] } once the model answers

// The task entry carries its own controller, so the strip's Cancel stops the call; ours stops it
// if the window goes away mid-run.
let abort = null;
async function suggest() {
  if (running.value) return;
  error.value = "";
  abort = new AbortController();
  try {
    const list = await suggestCharacters({ project, lookingFor: lookingFor.value.trim(), signal: abort.signal });
    // Invented characters have no aliases yet; the review list's rows carry the field.
    proposals.value = { characters: list.map((c) => ({ ...c, aliases: [] })), locations: [], objects: [] };
  } catch (e) {
    const msg = e?.message || String(e);
    if (!/abort|cancel/i.test(msg)) error.value = msg;
  }
}
onBeforeUnmount(() => abort?.abort());
</script>

<template>
  <!-- ── REVIEW — the same list Entity sweep hands its proposals to ── -->
  <EntityReviewModal v-if="proposals" :proposals="proposals" :show-aliases="false"
    :eyebrow="$t('characters.suggest.eyebrow')" :desc="$t('characters.suggest.desc')"
    :empty-message="$t('characters.suggest.empty')"
    @close="emit('close')" @committed="(payload) => emit('committed', payload)" />

  <!-- ── ASK + RUN ── -->
  <AppModal v-else :title="$t('characters.suggest.title')" :closable="!running" @close="emit('close')">
    <template #header-extra>
      <AiFeatureChip feature="brainstorm" :label="$t('brainstorm.title')" editable />
    </template>

    <p class="sc-intro">{{ $t("characters.suggest.intro") }}</p>

    <label class="sc-field">
      <span class="t-eyebrow">{{ $t("characters.suggest.lookingForLabel") }}</span>
      <UiTextarea class="sc-input" auto-resize :rows="3" v-model="lookingFor"
        :placeholder="$t('characters.suggest.lookingForPlaceholder')" :disabled="running" />
    </label>

    <QBanner v-if="error" dense rounded class="sc-error">
      <template #avatar><Icon name="Alert" :size="13" /></template>
      {{ error }}
    </QBanner>

    <AiTaskStrip :task="myTask" />

    <!-- No footer while it runs: the strip above renders THE Cancel (Entity sweep's rule). -->
    <template v-if="!running" #footer>
      <span style="flex:1"></span>
      <UiButton intent="ghost" @click="emit('close')">{{ $t("common.cancel") }}</UiButton>
      <UiButton intent="primary" @click="suggest">
        <Icon name="Sparkle" :size="13" /> {{ $t("characters.suggest.confirm") }}
      </UiButton>
    </template>
  </AppModal>
</template>

<style scoped>
.sc-intro { font-size: 12px; line-height: 1.55; color: var(--muted); margin: 0 0 12px; }
.sc-field { display: flex; flex-direction: column; gap: 6px; }
.sc-input { width: 60ch; max-width: 100%; }
.sc-error {
  margin-top: 10px;
  background: color-mix(in oklab, var(--danger-ink, #b91c1c) 12%, transparent);
  color: var(--danger-ink, #b91c1c); font-size: 12.5px;
}
</style>
