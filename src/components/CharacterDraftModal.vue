<script setup>
// The character draft review window — Fill from book (E, 2026-07-18) and, since 2026-10-11,
// the AI drafting (the AI drafting plan, Task 8). One window, three sources:
//   book        — Fill from book: the profile + voice passes over the scenes featuring the
//                 character (characterProfile.js), grounded in the prose;
//   description — the profile + voice drafted from the writer's description and the book
//                 (characterDraft.js), invented where the description is silent;
//   section     — one sheet section's fields (characterDraft.js draftSection).
// Every proposed field shows NEXT TO its current value — nothing saves until Apply (the
// sweep's nothing-lands-without-confirm rule). A proposal is ticked only when the field is
// EMPTY; overwriting what the writer wrote is always opt-in. Apply is one undo step
// (applyProfileDrafts → the store's applyCharacterDraft).
//
// RULE #1 precedent: EntityReviewModal — UiCheckbox rows, editable proposals,
// footer = count · spacer · Cancel · primary apply. Task progress + cancel
// ride the shared AiTaskStrip (features "characterProfile" / "characterVoice").

import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useProjectStore } from "../stores/project.js";
import { useAiTasksStore, AiTaskStrip, AppModal, Icon, UiButton, UiBanner } from "@delebash/llm-ui";
import {
  profileFromBook, voiceFromBook,
  profileFieldDefs, voiceFieldDefs, draftRows, applyProfileDrafts,
} from "../services/analysis/characterProfile.js";
import { draftSection, profileFromDescription, voiceFromDescription } from "../services/analysis/characterDraft.js";
import { sectionFieldDefs } from "../services/characterSheet.js";
import AiFeatureChip from "./AiFeatureChip.vue";
import DraftReviewList from "./DraftReviewList.vue";

const props = defineProps({
  characterId: { type: String, required: true },
  // "book" (Fill from book) · "description" · "section"
  source: { type: String, default: "book" },
  // The writer's description (source "description"; optional context for "section").
  description: { type: String, default: "" },
  // The sheet section to draft (source "section") — a services/characterSheet.js key.
  sectionKey: { type: String, default: "" },
});
const emit = defineEmits(["close"]);

const { t } = useI18n({ useScope: "global" });
const project = useProjectStore();
const aiTasks = useAiTasksStore();
const myTask = computed(() =>
  aiTasks.runningTasks.find((task) => task.feature === "characterProfile" || task.feature === "characterVoice"));

const ch = computed(() => (project.characters || []).find((c) => c.id === props.characterId));
const extras = computed(() => project.characterExtras?.[props.characterId] || {});
const name = computed(() => ch.value?.name || t("characterProfile.theCharacter"));
const sectionTitle = computed(() => (props.sectionKey ? t(`characters.sections.${props.sectionKey}.title`) : ""));

const eyebrow = computed(() =>
  props.source === "description" ? t("characterDraft.eyebrowDescription")
    : props.source === "section" ? t("characterDraft.eyebrowSection")
      : t("characterProfile.eyebrow"));
const desc = computed(() =>
  props.source === "description" ? t("characterDraft.descDescription")
    : props.source === "section" ? t("characterDraft.descSection", { section: sectionTitle.value })
      : t("characterProfile.desc"));

const loading = ref(true);
const noScenes = ref(false);
const error = ref("");
const rows = ref([]); // [{ key, label, current, proposed, accept, section }]

let abort = null;
// Two passes, one review (WS8): the profile call, then the voice call — each a LEAN JSON
// contract (two small schemas beat one bloated one on local models). Rows carry a `section`
// so the review list groups Profile / Voice; a voice failure is non-fatal (the profile rows
// still show, with a notice). A section draft is one call.
const phase = ref("profile"); // which pass the loading line names
const voiceNotice = ref("");
const toRows = (defs, fields, section) => draftRows(defs, fields).map((row) => ({ ...row, section }));

async function runTwoPasses(profilePass, voicePass) {
  phase.value = "profile";
  const r = await profilePass();
  if (!r) {
    noScenes.value = true;
    return;
  }
  rows.value = toRows(profileFieldDefs(ch.value, extras.value), r.fields, t("characterDraft.groupProfile"));
  phase.value = "voice";
  try {
    const v = await voicePass();
    if (v) rows.value = [...rows.value, ...toRows(voiceFieldDefs(extras.value), v.fields, t("characterDraft.groupVoice"))];
  } catch (e) {
    const msg = e?.message || String(e);
    if (/abort|cancel/i.test(msg)) return;
    voiceNotice.value = t("characterDraft.voiceFailed", { error: msg });
  }
}

async function run() {
  loading.value = true;
  noScenes.value = false;
  error.value = "";
  voiceNotice.value = "";
  rows.value = [];
  try {
    abort = new AbortController();
    const signal = abort.signal;
    const characterId = props.characterId;
    if (props.source === "description") {
      await runTwoPasses(
        () => profileFromDescription({ project, characterId, description: props.description, signal }),
        () => voiceFromDescription({ project, characterId, description: props.description, signal }),
      );
    } else if (props.source === "section") {
      phase.value = "section";
      const r = await draftSection({ project, characterId, sectionKey: props.sectionKey, description: props.description, t, signal });
      rows.value = toRows(sectionFieldDefs(props.sectionKey, extras.value, t), r.fields, sectionTitle.value);
    } else {
      await runTwoPasses(
        () => profileFromBook({ project, characterId, signal }),
        () => voiceFromBook({ project, characterId, signal }),
      );
    }
    if (!rows.value.length && !noScenes.value && !error.value) {
      error.value = props.source === "book" ? t("characterProfile.nothingGrounded") : t("characterDraft.nothingDrafted");
    }
  } catch (e) {
    const msg = e?.message || String(e);
    if (!/abort|cancel/i.test(msg)) error.value = msg;
  } finally {
    loading.value = false;
  }
}
onMounted(run);

// The strip's Cancel aborts the call in flight through the task's own controller (the kit's
// runAiFeature ORs it with ours), and the abort propagates, so a cancelled pass never reaches
// the next. (Until 2026-10-11 a watcher here also aborted ours whenever no task was running
// while loading — which is also the gap between the two passes: the description draft's voice
// pass awaits its route before its task exists, so it was always cancelled before it began.)
const running = computed(() => !!myTask.value);

// The review list (DraftReviewList.vue) ticks and edits the rows in place.
const acceptCount = computed(() => rows.value.filter((r) => r.accept).length);

function apply() {
  const picked = rows.value.filter((r) => r.accept);
  if (!picked.length) return;
  applyProfileDrafts(project, props.characterId, picked);
  emit("close");
}

function onClose() {
  abort?.abort();
  emit("close");
}

// The loading line: which pass is running, named for the source.
const loadingLine = computed(() => {
  if (props.source === "section") return t("characterDraft.draftingSection", { section: sectionTitle.value });
  if (props.source === "description") {
    return phase.value === "voice"
      ? t("characterDraft.draftingVoice", { name: name.value })
      : t("characterDraft.draftingProfile", { name: name.value });
  }
  return phase.value === "voice"
    ? t("characterProfile.listening", { name: name.value })
    : t("characterProfile.reading", { name: name.value });
});
</script>

<template>
  <AppModal :lede="desc" :eyebrow="eyebrow" :title="ch?.name || $t('characterProfile.titleFallback')" :closable="!running" @close="onClose">
    <template #header-extra>
      <AiFeatureChip feature="characterProfile" :label="$t('characterProfile.chipLabel')" editable />
    </template>

    

    <AiTaskStrip :task="myTask" />

    <UiBanner v-if="error">{{ error }}</UiBanner>

    <div v-if="noScenes" class="cpf-empty">
      {{ $t("characterProfile.noScenes", { name: ch?.name || $t("characterProfile.thisCharacter") }) }}
    </div>

    <div v-else-if="loading" class="cpf-empty">{{ loadingLine }}</div>

    <DraftReviewList v-else :rows="rows">
      <template #notice>
        <div v-if="voiceNotice" class="cpf-notice">{{ voiceNotice }}</div>
      </template>
    </DraftReviewList>

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
.cpf-empty {
  padding: 26px 18px; text-align: center;
  background: var(--surface-2); border-radius: 10px;
  font-size: 13px; color: var(--ink-2); line-height: 1.55;
}
.cpf-notice {
  padding: 8px 12px; border-radius: 6px; font-size: 12px; line-height: 1.5;
  background: var(--surface-2); color: var(--ink-2);
}
</style>
