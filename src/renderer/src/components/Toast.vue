<script setup>
import { useUiStore } from "../stores/ui.js";
const ui = useUiStore();

function trigger() {
  const a = ui.toast?.action;
  if (!a) return;
  a.fn();
  ui.dismissToast();
}
</script>

<template>
  <Transition name="toast">
    <div v-if="ui.toast" class="toast" role="status">
      <span class="toast-msg">{{ ui.toast.message }}</span>
      <button v-if="ui.toast.action" class="toast-action" @click="trigger">
        {{ ui.toast.action.label }}
      </button>
      <button class="toast-close" @click="ui.dismissToast" aria-label="Dismiss">×</button>
    </div>
  </Transition>
</template>

<style scoped>
.toast {
  position: fixed; bottom: 24px; left: 50%;
  transform: translateX(-50%);
  background: var(--ink); color: var(--surface);
  border-radius: 10px;
  padding: 6px 6px 6px 16px;
  display: flex; align-items: center; gap: 12px;
  font-size: 13px;
  box-shadow: var(--shadow-2);
  z-index: 200;
  min-width: 280px; max-width: 480px;
}
.toast-msg { flex: 1; }
.toast-action {
  appearance: none;
  background: var(--accent); color: var(--on-accent);
  border: 0;
  padding: 5px 12px;
  border-radius: 6px;
  font: inherit;
  font-weight: 600;
  font-size: 12px;
  cursor: default;
}
.toast-action:hover { filter: brightness(1.1); }
.toast-close {
  appearance: none;
  background: transparent;
  color: color-mix(in oklch, var(--surface) 70%, transparent);
  border: 0;
  width: 26px; height: 26px;
  border-radius: 6px;
  font-size: 16px;
  cursor: default;
}
.toast-close:hover { background: color-mix(in oklch, var(--surface) 12%, transparent); color: var(--surface); }

.toast-enter-active, .toast-leave-active { transition: opacity .2s ease, transform .2s ease; }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translateX(-50%) translateY(12px); }
</style>
