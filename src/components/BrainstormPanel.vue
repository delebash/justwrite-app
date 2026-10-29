<script setup>
// Brainstorm where it's used (2026-10-28; the decision is in docs/dev/TASKS.md, the AI drafting
// section's seventh round): Brainstorm's own controls for one category at the place it fills — the
// seed prompt (optional here: without words, the page and the book steer), Generate (nothing runs
// on open), the ideas with 👍 and More like these, and each idea's button (`pickLabel`: Use, Add as
// beat, Write this) that hands it back (`pick`) to be put in place. In a popup at a name or a title
// (BrainstormPopup.vue) and in a window on the Plot board and in the editor (BrainstormModal.vue).
// Precedent: the Brainstorm page — its seed field (BrainstormSeed.vue), its rounds (useBrainstorm)
// and its list (BrainstormResults.vue).
//
// `request({ seed, liked, seen })` composes a round (Name ideas: characterDraft.js nameIdeasRequest,
// sheetDraft.js sheetNameIdeasRequest; Title ideas: titleIdeas.js; a strand's and the cursor's plot
// ideas: planningDraft.js); `meta` names its runs in the AI tasks store; `taskLabel` is the run's
// name in the AI tasks panel.
import { ref } from "vue";
import { AiTaskStrip, UiBanner, UiButton } from "@delebash/ui";
import { useBrainstorm } from "../composables/useBrainstorm.js";
import BrainstormResults from "./BrainstormResults.vue";
import BrainstormSeed from "./BrainstormSeed.vue";

const props = defineProps({
  category: { type: String, required: true },
  request: { type: Function, required: true },
  meta: { type: [Object, Function], required: true },
  taskLabel: { type: String, required: true },
  pickLabel: { type: String, required: true },
  // a picked idea's button reads this, disabled, where the panel stays open (the Plot board's "Added")
  pickedLabel: { type: String, default: "" },
});
const emit = defineEmits(["pick"]);

const seed = ref("");
// set once Generate is clicked: a round that brings back nothing new says so
const asked = ref(false);
const { results, error, myTask, running, generate, moreLikeThese, toggleLike } = useBrainstorm({
  request: (round) => props.request({ ...round, seed: seed.value }),
  meta: () => (typeof props.meta === "function" ? props.meta() : props.meta),
  label: () => props.taskLabel,
});
// a window around it can't close mid-run (BrainstormModal.vue, as IdeaListModal)
defineExpose({ running });
</script>

<template>
  <div class="bp">
    <BrainstormSeed v-model="seed" :category="category" :rows="4" :disabled="running" :hint="$t('brainstorm.seedHintHere')" />
    <div class="bp-actions">
      <UiButton intent="primary" :label="$t('brainstorm.generate')" :loading="running" :disabled="running"
        @click="asked = true; generate()" />
    </div>
    <AiTaskStrip :task="myTask" />
    <UiBanner v-if="error">{{ error }}</UiBanner>
    <p v-else-if="asked && !running && !results.length" class="bp-empty">{{ $t("plotBoard.ai.empty") }}</p>
    <BrainstormResults v-if="results.length" :items="results" :running="running" :pick-label="pickLabel"
      :picked-label="pickedLabel" @like="toggleLike" @pick="(text) => emit('pick', text)" @more="moreLikeThese" />
  </div>
</template>

<style scoped>
.bp { display: flex; flex-direction: column; gap: 12px; }
.bp-actions { display: flex; gap: 8px; }
.bp-empty { margin: 0; font-size: 13px; color: var(--muted); }
</style>
