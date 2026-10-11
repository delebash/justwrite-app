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

import { computed, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useProjectStore } from "../stores/project.js";
import { useAiTasksStore, AiTaskStrip, AppModal, Icon, UiButton, UiCheckbox, UiTextarea, UiBanner } from "@delebash/llm-ui";
import {
  profileFromBook, voiceFromBook,
  profileFieldDefs, voiceFieldDefs, draftRows, applyProfileDrafts,
} from "../services/analysis/characterProfile.js";
import { draftSection, profileFromDescription, voiceFromDescription } from "../services/analysis/characterDraft.js";
import { sectionFieldDefs } from "../services/characterSheet.js";
import AiFeatureChip from "./AiFeatureChip.vue";

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

// [{ section, rows }] in insertion order, for the grouped review list.
const groupedRows = computed(() => {
  const out = [];
  for (const r of rows.value) {
    const g = out[out.length - 1];
    if (g && g.section === r.section) g.rows.push(r);
    else out.push({ section: r.section, rows: [r] });
  }
  return out;
});

// The strip's Cancel kills the task entry; mirror it onto our controller.
const running = computed(() => !!myTask.value);
watch(running, (isRunning, was) => {
  if (was && !isRunning && loading.value) abort?.abort();
});

const acceptCount = computed(() => rows.value.filter((r) => r.accept).length);
// All / None over every proposed field (mirrors the sweep + entity-review
// modals' select-all affordance).
function setAll(on) { for (const r of rows.value) r.accept = on; }

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

    <div v-else class="cpf-rows">
      <div v-if="rows.length" class="cpf-selectbar">
        <span class="t-muted">{{ $t("common.selectedOf", { selected: acceptCount, total: rows.length }) }}</span>
        <span class="cpf-spacer" />
        <UiButton intent="ghost" size="small" @click="setAll(true)">{{ $t("common.all") }}</UiButton>
        <UiButton intent="ghost" size="small" @click="setAll(false)">{{ $t("common.none") }}</UiButton>
      </div>
      <div v-if="voiceNotice" class="cpf-notice">{{ voiceNotice }}</div>
      <template v-for="g in groupedRows" :key="g.section">
        <div class="cpf-section">{{ g.section }}</div>
        <div v-for="r in g.rows" :key="r.key" class="cpf-row" :class="{ dropped: !r.accept }">
          <UiCheckbox v-model="r.accept" class="cpf-check" />
          <div class="cpf-fields">
            <div class="cpf-label">
              {{ r.label }}
              <span v-if="r.current" class="cpf-overwrite">{{ $t("characterProfile.overwriteWarning") }}</span>
            </div>
            <div v-if="r.current" class="cpf-current">{{ r.current }}</div>
            <UiTextarea fluid auto-resize :rows="2" v-model="r.proposed" :disabled="!r.accept" />
          </div>
        </div>
      </template>
    </div>

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
.cpf-rows { display: flex; flex-direction: column; gap: 8px; }
.cpf-selectbar { display: flex; align-items: center; gap: 8px; padding: 0 2px 2px; }
.cpf-spacer { flex: 1; }
.cpf-section {
  font-family: var(--font-mono); font-size: 10px;
  letter-spacing: 0.16em; text-transform: uppercase; color: var(--muted);
  margin: 6px 0 0; display: flex; align-items: center; gap: 10px;
}
.cpf-section::after { content: ""; flex: 1; height: 1px; background: var(--border-soft); }
.cpf-notice {
  padding: 8px 12px; border-radius: 6px; font-size: 12px; line-height: 1.5;
  background: var(--surface-2); color: var(--ink-2);
}
.cpf-row {
  display: grid; grid-template-columns: auto 1fr; gap: 12px;
  padding: 10px 12px;
  border: 1px solid var(--border-soft); border-radius: 8px;
  background: var(--surface);
  transition: opacity .15s, background .15s;
}
.cpf-row.dropped { opacity: 0.55; background: var(--surface-2); }
.cpf-check { display: flex; align-items: flex-start; padding-top: 4px; cursor: pointer; }
.cpf-fields { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.cpf-label {
  font-family: var(--font-mono); font-size: 10.5px;
  letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted);
  display: flex; align-items: center; gap: 8px;
}
.cpf-overwrite {
  font-family: var(--font-ui); text-transform: none; letter-spacing: 0;
  font-size: 11px; color: var(--danger-ink, #b91c1c);
}
.cpf-current {
  font-size: 12px; color: var(--muted); line-height: 1.5;
  padding: 6px 9px; border-radius: 6px; background: var(--surface-2);
  white-space: pre-wrap;
}
</style>
