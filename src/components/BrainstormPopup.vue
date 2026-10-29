<script setup>
// Brainstorm at a name or a title (2026-10-28, out of Name ideas, the AI drafting spec §3.3): a
// labelled button beside the field — "Name ideas", "Title ideas" — opens the Brainstorm panel
// (BrainstormPanel.vue) for that category in Quasar's QPopupProxy: a menu on the desktop, a dialog
// on a phone (https://quasar.dev/vue-components/popup-proxy). Use on an idea emits `pick` — the
// page sets the name or title — and closes. While it is open the page behind takes no pointer, as
// with the kit's menus (useModalPopup), so a click outside only closes it.
// Precedent: the Brainstorm page (the panel's controls) and the kit's UiMenu (a popup on Quasar's).
import { ref } from "vue";
import { QPopupProxy } from "quasar";
import { Icon, UiButton, useModalPopup } from "@delebash/ui";
import BrainstormPanel from "./BrainstormPanel.vue";

defineProps({
  category: { type: String, required: true },
  // the button's words and the run's name: "Name ideas", "Title ideas"
  label: { type: String, required: true },
  request: { type: Function, required: true },
  meta: { type: Object, required: true },
});
const emit = defineEmits(["pick"]);

const open = ref(false);
useModalPopup(open);

function pick(text) {
  emit("pick", text);
  open.value = false;
}
</script>

<template>
  <!-- the words in the slot beside the popup (a `label` prop yields to slot content) -->
  <UiButton intent="secondary" size="small" class="bs-popup-btn">
    <Icon name="Sparkle" :size="13" /> {{ label }}
    <QPopupProxy v-model="open" style="pointer-events: auto" anchor="bottom left" self="top left" :offset="[0, 4]"
      :transition-duration="0">
      <div class="bs-popup">
        <span class="t-eyebrow">{{ label }}</span>
        <BrainstormPanel :category="category" :request="request" :meta="meta" :task-label="label"
          :pick-label="$t('brainstorm.use')" @pick="pick" />
      </div>
    </QPopupProxy>
  </UiButton>
</template>

<style scoped>
.bs-popup {
  display: flex; flex-direction: column; gap: 10px;
  width: min(440px, calc(100vw - 32px));
  max-height: 75vh; overflow-y: auto;
  padding: 12px;
  background: var(--surface);
  border-radius: var(--radius, 10px);
}
</style>
