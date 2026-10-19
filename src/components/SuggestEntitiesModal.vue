<script setup>
// Suggest characters / Suggest locations (the AI drafting spec §3.4) — in Entity sweep's shape
// since 2026-10-11 (the third round): ask (what the writer is looking for, optional) → run (the
// shared AiTaskStrip carries THE Cancel; the window can't close mid-run, so leaving the page can't
// lose the answer) → review (EntityReviewModal with the proposals, as EntitySweepModal hands off
// its aggregate). Was SuggestCharactersModal.vue; one window for both kinds since 2026-10-16,
// when the Locations list gained Suggest locations… (the plan 2026-10-15, Task S5).
import { computed, onBeforeUnmount, ref } from "vue";
import { useSurfaceTask, AiTaskStrip, AppModal, Icon, UiBanner, UiButton, UiTextarea } from "@delebash/ui";
import { useProjectStore } from "../stores/project.js";
import { suggestCharacters } from "../services/analysis/characterDraft.js";
import { suggestLocations } from "../services/analysis/sheetDraft.js";
import EntityReviewModal from "./EntityReviewModal.vue";
import AiFeatureChip from "./AiFeatureChip.vue";

const props = defineProps({
  // "character" · "location"
  kind: { type: String, required: true },
});
const emit = defineEmits(["close", "committed"]);

// Per kind: the call, its task's meta kind, its words (the catalog's <ns>.suggest.*), and how its
// answer becomes the review list's proposals. Invented characters have no aliases yet; the review
// list's rows carry the field.
const KINDS = {
  character: {
    run: suggestCharacters, task: "suggest-characters", ns: "characters",
    proposals: (list) => ({ characters: list.map((c) => ({ ...c, aliases: [] })), locations: [], objects: [] }),
  },
  location: {
    run: suggestLocations, task: "suggest-locations", ns: "locations",
    proposals: (list) => ({ characters: [], locations: list, objects: [] }),
  },
};
const k = computed(() => KINDS[props.kind]);
// eslint-disable-next-line i18next/no-literal-string -- builds a key, not a word
const key = (name) => `${k.value.ns}.suggest.${name}`;

const project = useProjectStore();
const myTask = useSurfaceTask("brainstorm", () => ({ kind: k.value.task }));
const running = computed(() => !!myTask.value);

const lookingFor = ref("");
const error = ref("");
const proposals = ref(null); // { characters, locations, objects } once the model answers

// The task entry carries its own controller, so the strip's Cancel stops the call; ours stops it
// if the window goes away mid-run.
let abort = null;
async function suggest() {
  if (running.value) return;
  error.value = "";
  abort = new AbortController();
  try {
    const list = await k.value.run({ project, lookingFor: lookingFor.value.trim(), signal: abort.signal });
    proposals.value = k.value.proposals(list);
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
    :eyebrow="$t(key('eyebrow'))" :desc="$t(key('desc'))"
    :empty-message="$t(key('empty'))"
    @close="emit('close')" @committed="(payload) => emit('committed', payload)" />

  <!-- ── ASK + RUN ── -->
  <AppModal v-else :lede="$t(key('intro'))" :title="$t(key('title'))" :closable="!running" @close="emit('close')">
    <template #header-extra>
      <AiFeatureChip feature="brainstorm" :label="$t('brainstorm.title')" editable />
    </template>

    <label class="sc-field">
      <span class="t-eyebrow">{{ $t("characters.suggest.lookingForLabel") }}</span>
      <UiTextarea class="sc-input" auto-resize :rows="3" v-model="lookingFor"
        :placeholder="$t(key('lookingForPlaceholder'))" :disabled="running" />
    </label>

    <UiBanner v-if="error">{{ error }}</UiBanner>

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
.sc-field { display: flex; flex-direction: column; gap: 6px; }
.sc-input { width: 60ch; max-width: 100%; }
</style>
