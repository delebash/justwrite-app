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
import { profileFromBook } from "../services/analysis/characterProfile.js";
import AiFeatureChip from "./AiFeatureChip.vue";

const props = defineProps({
  characterId: { type: String, required: true },
});
const emit = defineEmits(["close"]);

const project = useProjectStore();
const aiTasks = useAiTasksStore();
const myTask = computed(() => aiTasks.runningTasks.find((t) => t.feature === "characterProfile"));

const ch = computed(() => (project.characters || []).find((c) => c.id === props.characterId));
const extras = computed(() => project.characterExtras?.[props.characterId] || {});

const loading = ref(true);
const noScenes = ref(false);
const error = ref("");
const rows = ref([]); // [{ key, label, current, proposed, accept }]
const sceneCount = ref(0);

// The character page's own field map — labels match the form exactly.
// Identity facts (role/gender/pronouns/age) live on the character record;
// everything else lives in extras.
function fieldDefs() {
  const c = ch.value || {};
  const x = extras.value || {};
  return [
    { key: "identity.role",       label: "Role",              current: c.role || "" },
    { key: "identity.gender",     label: "Gender",            current: c.gender || "" },
    { key: "identity.pronouns",   label: "Pronouns",          current: c.pronouns || "" },
    { key: "identity.age",        label: "Age",               current: c.age != null ? String(c.age) : "" },
    { key: "oneLiner",            label: "Description",       current: c.oneLiner || "" },
    { key: "motivation.want",     label: "Wants",             current: x.motivation?.want || "" },
    { key: "motivation.need",     label: "Needs",             current: x.motivation?.need || "" },
    { key: "motivation.lie",      label: "Lie they believe",  current: x.motivation?.lie || "" },
    { key: "motivation.truth",    label: "Truth they meet",   current: x.motivation?.truth || "" },
    { key: "motivation.fear",          label: "Core fear",             current: x.motivation?.fear || "" },
    { key: "motivation.contradiction", label: "Central contradiction", current: x.motivation?.contradiction || "" },
    { key: "motivation.stakes",        label: "Stakes",                current: x.motivation?.stakes || "" },
    { key: "arc.start",           label: "Arc — Beginning",   current: x.arc?.start || "" },
    { key: "arc.midpoint",        label: "Arc — Midpoint",    current: x.arc?.midpoint || "" },
    { key: "arc.end",             label: "Arc — End",         current: x.arc?.end || "" },
    { key: "continuity.physicalConstants", label: "Physical constants", current: x.continuity?.physicalConstants || "" },
    { key: "backstory",           label: "Backstory",         current: x.backstory || "" },
  ];
}

function proposedFor(fields, key) {
  const [a, b] = key.split(".");
  return b ? fields[a]?.[b] || "" : fields[a] || "";
}

let abort = null;
async function run() {
  loading.value = true;
  noScenes.value = false;
  error.value = "";
  rows.value = [];
  try {
    abort = new AbortController();
    const r = await profileFromBook({ project, characterId: props.characterId, signal: abort.signal });
    if (!r) {
      noScenes.value = true;
      return;
    }
    sceneCount.value = r.sceneCount;
    rows.value = fieldDefs()
      .map((d) => {
        const proposed = proposedFor(r.fields, d.key);
        return { ...d, proposed, accept: !!proposed && !d.current };
      })
      .filter((d) => d.proposed); // fields the model left "" have nothing to review
    if (!rows.value.length) error.value = "The model couldn't ground any profile fields in these scenes.";
  } catch (e) {
    const msg = e?.message || String(e);
    if (!/abort|cancel/i.test(msg)) error.value = msg;
  } finally {
    loading.value = false;
  }
}
onMounted(run);

// The strip's Cancel kills the task entry; mirror it onto our controller.
const running = computed(() => !!myTask.value);
watch(running, (isRunning, was) => {
  if (was && !isRunning && loading.value) abort?.abort();
});

const acceptCount = computed(() => rows.value.filter((r) => r.accept).length);

function apply() {
  const picked = rows.value.filter((r) => r.accept);
  if (!picked.length) return;
  const charPatch = {};       // role/gender/pronouns/age/oneLiner live on the record
  const motivation = {};
  const arc = {};
  const continuity = {};
  let extrasPatch = null;
  for (const r of picked) {
    const v = String(r.proposed ?? "").trim();
    if (r.key === "oneLiner") charPatch.oneLiner = v;
    else if (r.key === "identity.role") charPatch.role = v;
    else if (r.key === "identity.gender") charPatch.gender = v;
    else if (r.key === "identity.pronouns") charPatch.pronouns = v;
    else if (r.key === "identity.age") { const n = parseInt(v, 10); charPatch.age = Number.isFinite(n) ? n : null; }
    else if (r.key === "backstory") extrasPatch = { ...(extrasPatch || {}), backstory: v };
    else if (r.key.startsWith("motivation.")) motivation[r.key.split(".")[1]] = v;
    else if (r.key.startsWith("arc.")) arc[r.key.split(".")[1]] = v;
    else if (r.key.startsWith("continuity.")) continuity[r.key.split(".")[1]] = v;
  }
  if (Object.keys(charPatch).length) project.updateCharacter(props.characterId, charPatch);
  if (Object.keys(motivation).length) {
    extrasPatch = { ...(extrasPatch || {}), motivation: { ...(extras.value.motivation || {}), ...motivation } };
  }
  if (Object.keys(arc).length) {
    extrasPatch = { ...(extrasPatch || {}), arc: { ...(extras.value.arc || {}), ...arc } };
  }
  if (Object.keys(continuity).length) {
    extrasPatch = { ...(extrasPatch || {}), continuity: { ...(extras.value.continuity || {}), ...continuity } };
  }
  if (extrasPatch) project.setCharacterExtras(props.characterId, extrasPatch);
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
      Drafts this character's profile from the scenes that feature them — grounded in your prose,
      nothing invented. Tick the fields you want, edit them inline, then apply. Fields you've
      already written are unticked by default so nothing overwrites your work without you.
    </p>

    <AiTaskStrip :task="myTask" />

    <div v-if="error" class="cpf-error"><Icon name="Alert" :size="13" /> {{ error }}</div>

    <div v-if="noScenes" class="cpf-empty">
      No scenes feature {{ ch?.name || "this character" }} yet, so there's no prose to draft from.
      Link them to scenes (or run the entity sweep with scene linking) first.
    </div>

    <div v-else-if="loading" class="cpf-empty">Reading {{ ch?.name || "the character" }}'s scenes…</div>

    <div v-else class="cpf-rows">
      <div v-for="r in rows" :key="r.key" class="cpf-row" :class="{ dropped: !r.accept }">
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
    </div>

    <template #footer>
      <span class="t-muted" v-if="rows.length">{{ acceptCount }} of {{ rows.length }} fields selected</span>
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
