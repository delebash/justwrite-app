<script setup>
// Shared modal wrapper — overlay + box + header (eyebrow/title/close)
// + scrollable body + optional sticky footer. Hand-written modals
// duplicated this shell ten times before this component existed.
//
// Slots:
//   default — body content (always scrollable inside .modal-body)
//   header  — replaces the default eyebrow/title/close trio (rare; use props instead)
//   footer  — optional sticky footer for action buttons
//
// Props:
//   eyebrow / title — header content via the default header
//   wide            — boolean, widens the modal for diff/compare views
//   noPadding       — boolean, drops .modal-body's inset for content
//                     that owns its own padding (chat, lists)
//
// Emits: close (fires on backdrop click, Esc, or X-button click)

import { onMounted, onBeforeUnmount } from "vue";
import Icon from "./Icon.vue";

const props = defineProps({
  eyebrow: { type: String, default: "" },
  title:   { type: String, default: "" },
  wide:    { type: Boolean, default: false },
  noPadding: { type: Boolean, default: false },
});
const emit = defineEmits(["close"]);

function close() { emit("close"); }
function onKey(e) { if (e.key === "Escape") close(); }

onMounted(() => document.addEventListener("keydown", onKey));
onBeforeUnmount(() => document.removeEventListener("keydown", onKey));
</script>

<template>
  <div class="modal-overlay" @click.self="close">
    <div class="modal app-modal" :class="{ 'app-modal--wide': wide }" role="dialog" aria-modal="true">
      <header class="modal-head app-modal-head">
        <slot name="header">
          <div class="app-modal-titleblock">
            <div v-if="eyebrow" class="t-eyebrow">{{ eyebrow }}</div>
            <div v-if="title" class="modal-title">{{ title }}</div>
          </div>
        </slot>
        <button class="app-modal-close" @click="close" title="Close (Esc)">
          <Icon name="Close" :size="14" />
        </button>
      </header>
      <div class="modal-body app-modal-body" :class="{ 'app-modal-body--flush': noPadding }">
        <slot />
      </div>
      <footer v-if="$slots.footer" class="app-modal-footer">
        <slot name="footer" />
      </footer>
    </div>
  </div>
</template>

<style scoped>
.app-modal--wide { width: min(960px, 96vw); max-height: 90vh; }
.app-modal-head { gap: 14px; align-items: flex-start; }
.app-modal-titleblock { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.app-modal-close {
  width: 28px; height: 28px; flex-shrink: 0;
  display: grid; place-items: center;
  border: 0; background: transparent;
  color: var(--muted); border-radius: 6px;
  cursor: pointer;
}
.app-modal-close:hover { background: var(--surface-2); color: var(--ink); }
.app-modal-body { flex: 1; min-height: 0; }
.app-modal-body--flush { padding: 0; }
.app-modal-footer {
  display: flex; align-items: center; gap: 10px;
  padding: 12px 22px;
  border-top: 1px solid var(--border);
  background: var(--surface);
}
</style>
