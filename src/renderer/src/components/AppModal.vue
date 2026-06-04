<script setup>
// Shared modal wrapper — Reka UI Dialog under the hood. ~11 callsites
// mount this with `v-if + @close` and the eyebrow / title / wide /
// noPadding / closable props plus default / header / footer slots.
//
// Reka gives us focus trap, scroll lock, Esc handling, and a11y for free;
// we just style the overlay + content with .app-modal-* rules in tokens.css.
//
// Slots:
//   default — body content (scrollable)
//   header  — replaces the default eyebrow/title block (close button stays)
//   footer  — optional sticky footer for action buttons
//
// Props: eyebrow / title — default header content. wide — widens for
//   diff/compare views. noPadding — drops content inset (chat, lists).
//   closable — when false, Esc and the X button are disabled (used by
//   AI-in-flight modals so an accidental Esc can't tear down the host
//   while LLM calls hold the host's AbortSignal). Backdrop click is
//   ALWAYS locked regardless.
//
// Emits: close (fires after the leave transition finishes)

import { ref, useSlots, watch } from "vue";
import { useI18n } from "vue-i18n";
import {
  DialogRoot,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogTitle,
  DialogClose,
  VisuallyHidden,
} from "reka-ui";
import Icon from "./Icon.vue";

const { t } = useI18n();

const props = defineProps({
  eyebrow:   { type: String, default: "" },
  title:     { type: String, default: "" },
  wide:      { type: Boolean, default: false },
  noPadding: { type: Boolean, default: false },
  closable:  { type: Boolean, default: true },
});
const emit = defineEmits(["close"]);

const slots = useSlots();

// Mount/unmount-driven from consumers (v-if + @close), but internally we
// flip `visible` first so the leave transition can play, then emit `close`
// 250ms later so the parent's v-if remove doesn't mid-tear the overlay.
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
defineExpose({ close });

// Reka's DialogContent fires escape-key-down BEFORE its built-in close
// runs. preventDefault() blocks the close, so we use this to enforce
// `closable: false`. Backdrop dismissal is blocked unconditionally via
// pointer-down-outside / interact-outside.
function onEscape(e) { if (!props.closable) e.preventDefault(); }
function onOutside(e) { e.preventDefault(); }
</script>

<template>
  <DialogRoot v-model:open="visible">
    <DialogPortal>
      <DialogOverlay class="app-modal-overlay" />
      <DialogContent
        class="app-modal"
        :class="{ 'app-modal--wide': wide, 'app-modal--flush': noPadding }"
        @escape-key-down="onEscape"
        @pointer-down-outside="onOutside"
        @interact-outside="onOutside"
      >
        <header class="app-modal-header">
          <slot name="header">
            <DialogTitle as-child>
              <div class="app-modal-titleblock">
                <div v-if="eyebrow" class="t-eyebrow">{{ eyebrow }}</div>
                <div v-if="title" class="modal-title">{{ title }}</div>
              </div>
            </DialogTitle>
          </slot>
          <!-- Reka requires a DialogTitle inside DialogContent for a11y;
               when a #header slot replaces our default, mount a visually-
               hidden one with the title (or a generic fallback). -->
          <VisuallyHidden v-if="slots.header" as-child>
            <DialogTitle>{{ title || "Dialog" }}</DialogTitle>
          </VisuallyHidden>
          <DialogClose
            v-if="closable"
            class="app-modal-close"
            :aria-label="t('dialog.closeLabel')"
          >
            <Icon name="Close" :size="14" />
          </DialogClose>
        </header>

        <div class="app-modal-body">
          <slot />
        </div>

        <footer v-if="slots.footer" class="app-modal-footer">
          <slot name="footer" />
        </footer>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
