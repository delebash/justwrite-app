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
  // When true (default), Esc and PrimeVue's built-in X button dismiss the
  // modal. When false, neither does — used by AI-in-flight modals so an
  // accidental Esc/X can't tear down the host while LLM calls are still
  // running (they hold the host's AbortSignal and would otherwise keep
  // burning tokens against an unmounted component). The modal's own
  // Cancel button stays the canonical "stop this" path either way.
  //
  // Note: backdrop click is ALWAYS locked, regardless of this prop —
  // dismissing by clicking off a modal is hostile UX, especially for
  // anything that holds in-progress work. Modals close via explicit
  // affordances only: Esc, X, Cancel, Save/Done.
  closable:  { type: Boolean, default: true },
});
const emit = defineEmits(["close"]);

// Dialog is visibility-driven; parents are mount-driven (v-if + @close). Hold
// our own visible flag, start open, and translate a close back into the emit
// the parents already listen for.
//
// IMPORTANT: defer the close emit so PrimeVue's Dialog has time to complete
// its leave transition + tear down its modal mask. Emitting synchronously
// makes the parent v-if-remove the Dialog mid-transition, which orphans the
// modal-mask to <body> as an invisible click-eater. PrimeVue's @hide event
// would be the ideal hook but it fires inconsistently on mount in some
// versions; a flat 250ms timeout is robust regardless.
const TRANSITION_MS = 250;
const visible = ref(true);
let pending = null;
watch(visible, (v, prev) => {
  if (!v && prev) {
    if (pending) clearTimeout(pending);
    pending = setTimeout(() => { pending = null; emit("close"); }, TRANSITION_MS);
  }
});
function close() { visible.value = false; }
// Exposed so consumers can call appModal?.close() from their footer buttons
// instead of emit('close')-ing directly (which would bypass the transition
// and re-trigger the orphaned-mask bug).
defineExpose({ close });
</script>

<template>
  <Dialog
    v-model:visible="visible"
    modal
    :dismissableMask="false"
    :closable="closable"
    :closeOnEscape="closable"
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
