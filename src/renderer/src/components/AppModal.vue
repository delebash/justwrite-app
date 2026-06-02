<script setup>
// Shared modal wrapper — now a thin skin over PrimeVue's <Dialog> so every
// modal inherits one focus trap, ESC/mask handling, and transition. The
// public API is unchanged from the hand-rolled version, so the ~10 consumers
// need no edits: parents still render this with `v-if + @close` and the same
// eyebrow / title / wide / noPadding props + header / footer / default slots.
//
// Chrome (header border-bottom, footer border-top, content scroll, width)
// lives in tokens.css under `.app-modal`, keyed off the class passed below.
//
// Slots:
//   default — body content (scrollable)
//   header  — replaces the default eyebrow/title block (close button stays)
//   footer  — optional sticky footer for action buttons
//
// Props: eyebrow / title — default header content. wide — widens for
//   diff/compare views. noPadding — drops content inset (chat, lists).
//
// Emits: close (fires on backdrop click, Esc, or the Dialog's X button)

import { ref, watch } from "vue";
import Dialog from "primevue/dialog";

const props = defineProps({
  eyebrow:   { type: String, default: "" },
  title:     { type: String, default: "" },
  wide:      { type: Boolean, default: false },
  noPadding: { type: Boolean, default: false },
});
const emit = defineEmits(["close"]);

// Dialog is visibility-driven; parents are mount-driven (v-if + @close). Hold
// our own visible flag, start open, and translate a close back into the emit
// the parents already listen for.
const visible = ref(true);
watch(visible, (v) => { if (!v) emit("close"); });
</script>

<template>
  <Dialog
    v-model:visible="visible"
    modal
    dismissableMask
    :draggable="false"
    class="app-modal"
    :class="{ 'app-modal--wide': wide, 'app-modal--flush': noPadding }"
  >
    <template #header>
      <slot name="header">
        <div class="app-modal-titleblock">
          <div v-if="eyebrow" class="t-eyebrow">{{ eyebrow }}</div>
          <div v-if="title" class="modal-title">{{ title }}</div>
        </div>
      </slot>
    </template>

    <slot />

    <template v-if="$slots.footer" #footer>
      <slot name="footer" />
    </template>
  </Dialog>
</template>
