<script setup>
// Toast host — now a skin over PrimeVue's <Toast>. Mounted once in App.vue.
// On setup it grabs the live ToastService (only reachable here, in component
// context) and hands it to the toast bridge so ui.showToast() can fire from
// anywhere. The #message slot renders the message + the optional inline
// action button (e.g. soft-delete's "Undo"); PrimeVue draws the close button.

import PvToast from "primevue/toast";
import { useToast } from "primevue/usetoast";
import { bindToastService } from "../services/toastBridge.js";

bindToastService(useToast());

function runAction(message) {
  message.action?.fn?.();
  // useToast().remove dismisses this specific message.
  useToast().remove(message);
}
</script>

<template>
  <PvToast position="bottom-center" group="app" class="jw-toast">
    <template #message="{ message }">
      <div class="jw-toast-content">
        <span class="jw-toast-msg">{{ message.summary }}</span>
        <button
          v-if="message.action"
          class="jw-toast-action"
          @click="runAction(message)"
        >
          {{ message.action.label }}
        </button>
      </div>
    </template>
  </PvToast>
</template>

<style scoped>
.jw-toast-content {
  display: flex; align-items: center; gap: 12px;
  font-size: 13px;
}
.jw-toast-msg { flex: 1; }
.jw-toast-action {
  appearance: none;
  background: var(--accent); color: var(--on-accent);
  border: 0;
  padding: 5px 12px;
  border-radius: 6px;
  font: inherit;
  font-weight: 600;
  font-size: 12px;
  cursor: pointer;
}
.jw-toast-action:hover { filter: brightness(1.1); }
</style>
