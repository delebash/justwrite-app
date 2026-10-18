<script setup>
// Name ideas at a name box (the AI drafting spec §3.3; plan Task 10, 2026-10-11) — ✨ beside a
// page's name opens Brainstorm's list for it, in Quasar's QPopupProxy: a menu on the desktop, a
// dialog on a phone (https://quasar.dev/vue-components/popup-proxy). The first opening asks for a
// list; the rounds, thumbs-up and More like these are Brainstorm's own (useBrainstorm,
// BrainstormResults); a click on an idea emits `pick` and closes.
//
// `request({ liked, seen })` composes a round (a character's: characterDraft.js
// nameIdeasRequest); `meta` names its runs in the AI tasks store. While it is open the page
// behind takes no pointer, as with the kit's menus (useModalPopup), so a click outside only
// closes it.
// Precedent: the Brainstorm page (the list) and the kit's UiMenu (a popup on Quasar's).
import { ref } from "vue";
import { QPopupProxy } from "quasar";
import { AiTaskStrip, Icon, UiBanner, UiButton, useModalPopup } from "@delebash/ui";
import { useBrainstorm } from "../composables/useBrainstorm.js";
import BrainstormResults from "./BrainstormResults.vue";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

const props = defineProps({
  request: { type: Function, required: true },
  meta: { type: Object, required: true },
});
const emit = defineEmits(["pick"]);

const open = ref(false);
useModalPopup(open);
const { results, error, myTask, running, generate, moreLikeThese, toggleLike } = useBrainstorm({
  request: (round) => props.request(round),
  meta: () => props.meta,
  label: t("brainstorm.nameIdeas"),
});

function onShow() {
  if (!results.value.length && !running.value) generate();
}
function pick(text) {
  emit("pick", text);
  open.value = false;
}
</script>

<template>
  <UiButton intent="secondary" size="icon" class="name-ideas" :aria-label="$t('brainstorm.nameIdeas')"
    v-tooltip.bottom="$t('brainstorm.nameIdeas')">
    <Icon name="Sparkle" :size="14" />
    <QPopupProxy v-model="open" style="pointer-events: auto" anchor="bottom left" self="top left" :offset="[0, 4]"
      :transition-duration="0"
      @before-show="onShow">
      <div class="ni-panel">
        <div class="ni-head">
          <span class="t-eyebrow">{{ $t("brainstorm.nameIdeas") }}</span>
          <UiButton intent="ghost" size="small" :disabled="running" @click="generate">{{ $t("brainstorm.generate") }}</UiButton>
        </div>
        <AiTaskStrip :task="myTask" />
        <UiBanner v-if="error">{{ error }}</UiBanner>
        <BrainstormResults v-if="results.length" :items="results" :running="running" pickable
          @like="toggleLike" @pick="pick" @more="moreLikeThese" />
      </div>
    </QPopupProxy>
  </UiButton>
</template>

<style scoped>
.ni-panel {
  display: flex; flex-direction: column; gap: 10px;
  width: max-content; min-width: 280px; max-width: min(400px, calc(100vw - 32px));
  max-height: 70vh; overflow-y: auto;
  padding: 12px;
  background: var(--surface);
  border-radius: var(--radius, 10px);
}
.ni-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
</style>
