<script setup>
// "Fill from book" review modal (E, 2026-07-18).
//
// Runs the characterProfile action over the scenes featuring this character,
// then shows every proposed field NEXT TO its current value for review —
// nothing saves until Apply (the sweep's nothing-lands-without-confirm rule).
// Default ticks: a proposal is ticked only when the field is currently EMPTY;
// overwriting something the writer wrote is always opt-in.
//
// RULE #1 precedent: EntityReviewModal — UiCheckbox rows, editable proposals,
// footer = count · spacer · Cancel · primary apply. Task progress + cancel
// ride the shared AiTaskStrip (feature "characterProfile").

import { computed, onMounted, ref, watch } from "vue";
import { useProjectStore } from "../stores/project.js";
import { useAiTasksStore, AiTaskStrip, AppModal, Icon, UiButton, UiCheckbox, UiTextarea } from "@delebash/llm-ui";
import {
  profileFromBook, voiceFromBook,
  profileFieldDefs, voiceFieldDefs, draftRows, applyProfileDrafts,
} from "../services/analysis/characterProfile.js";
import AiFeatureChip from "./AiFeatureChip.vue";

const props = defineProps({
  characterId: { type: String, required: true },
});
const emit = defineEmits(["close"]);

const project = useProjectStore();
const aiTasks = useAiTasksStore();
const myTask = computed(() =>
  aiTasks.runningTasks.find((t) => t.feature === "characterProfile" || t.feature === "characterVoice"));

const ch = computed(() => (project.characters || []).find((c) => c.id === props.characterId));
const extras = computed(() => project.characterExtras?.[props.characterId] || {});

const loading = ref(true);
const noScenes = ref(false);
const error = ref("");
const rows = ref([]); // [{ key, label, current, proposed, accept }]
const sceneCount = ref(0);

let abort = null;
// Two passes, one review (WS8): the profile call, then the voice call — each a
// LEAN JSON contract (two small schemas beat one bloated one on local models).
// Rows carry a `section` so the review list groups Profile / Voice; a voice
// failure is non-fatal (the profile rows still show, with a notice).
const phase = ref("profile"); // which pass the loading line names
const voiceNotice = ref("");
async function run() {
  loading.value = true;
  noScenes.value = false;
  error.value = "";
  voiceNotice.value = "";
  rows.value = [];
  try {
    abort = new AbortController();
    phase.value = "profile";
    const r = await profileFromBook({ project, characterId: props.characterId, signal: abort.signal });
    if (!r) {
      noScenes.value = true;
      return;
    }
    sceneCount.value = r.sceneCount;
    const toRows = (defs, fields, section) =>
      draftRows(defs, fields).map((row) => ({ ...row, section }));
    rows.value = toRows(profileFieldDefs(ch.value, extras.value), r.fields, "Profile");

    phase.value = "voice";
    try {
      const v = await voiceFromBook({ project, characterId: props.characterId, signal: abort.signal });
      if (v) rows.value = [...rows.value, ...toRows(voiceFieldDefs(extras.value), v.fields, "Voice")];
    } catch (e) {
      const msg = e?.message || String(e);
      if (/abort|cancel/i.test(msg)) return;
      voiceNotice.value = `The voice pass failed (${msg}) — the profile fields below are unaffected.`;
    }
    if (!rows.value.length) error.value = "The model couldn't ground any profile fields in these scenes.";
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
</script>

<template>
  <AppModal eyebrow="Fill from book" :title="ch?.name || 'Character'" :closable="!running" @close="onClose">
    <template #header-extra>
      <AiFeatureChip feature="characterProfile" label="Character profile" editable />
    </template>

    <p class="cpf-desc">
      Drafts this character's profile — and their voice, from lines they actually speak — out of
      the scenes that feature them. Grounded in your prose, nothing invented. Tick the fields you
      want, edit them inline, then apply. Fields you've already written are unticked by default
      so nothing overwrites your work without you.
    </p>

    <AiTaskStrip :task="myTask" />

    <div v-if="error" class="cpf-error"><Icon name="Alert" :size="13" /> {{ error }}</div>

    <div v-if="noScenes" class="cpf-empty">
      No scenes feature {{ ch?.name || "this character" }} yet, so there's no prose to draft from.
      Link them to scenes (or run the entity sweep with scene linking) first.
    </div>

    <div v-else-if="loading" class="cpf-empty">
      {{ phase === "voice" ? `Listening to ${ch?.name || "the character"}'s dialogue…`
                           : `Reading ${ch?.name || "the character"}'s scenes…` }}
    </div>

    <div v-else class="cpf-rows">
      <div v-if="rows.length" class="cpf-selectbar">
        <span class="t-muted">{{ acceptCount }} of {{ rows.length }} selected</span>
        <span class="cpf-spacer" />
        <UiButton intent="ghost" size="small" @click="setAll(true)">All</UiButton>
        <UiButton intent="ghost" size="small" @click="setAll(false)">None</UiButton>
      </div>
      <div v-if="voiceNotice" class="cpf-notice">{{ voiceNotice }}</div>
      <template v-for="g in groupedRows" :key="g.section">
        <div class="cpf-section">{{ g.section }}</div>
        <div v-for="r in g.rows" :key="r.key" class="cpf-row" :class="{ dropped: !r.accept }">
          <UiCheckbox v-model="r.accept" class="cpf-check" />
          <div class="cpf-fields">
            <div class="cpf-label">
              {{ r.label }}
              <span v-if="r.current" class="cpf-overwrite">replaces what you wrote</span>
            </div>
            <div v-if="r.current" class="cpf-current">{{ r.current }}</div>
            <UiTextarea fluid auto-resize :rows="2" v-model="r.proposed" :disabled="!r.accept" />
          </div>
        </div>
      </template>
    </div>

    <template #footer>
      <span style="flex:1"></span>
      <UiButton intent="ghost" @click="onClose">{{ rows.length ? "Cancel" : "Close" }}</UiButton>
      <UiButton v-if="rows.length" intent="primary" :disabled="!acceptCount" @click="apply">
        <Icon name="Check" :size="13" /> Apply {{ acceptCount }} field{{ acceptCount === 1 ? "" : "s" }}
      </UiButton>
    </template>
  </AppModal>
</template>

<style scoped>
.cpf-desc { font-size: 12px; line-height: 1.55; color: var(--muted); margin: 0 0 12px; }
.cpf-error {
  display: flex; gap: 8px; align-items: center;
  padding: 8px 12px; border-radius: 6px;
  background: color-mix(in oklab, var(--danger-ink, #b91c1c) 12%, transparent);
  color: var(--danger-ink, #b91c1c); font-size: 12.5px;
  margin-bottom: 10px;
}
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
