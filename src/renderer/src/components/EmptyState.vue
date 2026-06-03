<script setup>
// Centered placeholder for "nothing here yet" surfaces — icon + title +
// body text + optional primary action. Used inside cards, modal bodies,
// and full-pane empty states.
//
// Slots:
//   actions — optional custom action area; replaces the default button.
//
// Props:
//   icon       — name from Icon.vue (defaults to "Sparkle")
//   iconSize   — px (default 22)
//   title      — bold serif heading
//   message    — body text below the title
//   actionLabel — text for the primary action button (omit if no action)
//
// Emits: "action" when the default action button is clicked.

import Icon from "./Icon.vue";
import JwButton from "@renderer/components/ui/JwButton.vue";

defineProps({
  icon:       { type: String, default: "Sparkle" },
  iconSize:   { type: [Number, String], default: 22 },
  title:      { type: String, default: "" },
  message:    { type: String, default: "" },
  actionLabel: { type: String, default: "" },
  compact:    { type: Boolean, default: false },
});
const emit = defineEmits(["action"]);
</script>

<template>
  <div class="empty-state" :class="{ 'empty-state--compact': compact }">
    <Icon :name="icon" :size="iconSize" class="empty-state-icon" />
    <h3 v-if="title" class="empty-state-title">{{ title }}</h3>
    <p v-if="message" class="empty-state-message">{{ message }}</p>
    <slot name="actions">
      <JwButton v-if="actionLabel" intent="primary" @click="emit('action')">
        {{ actionLabel }}
      </JwButton>
    </slot>
  </div>
</template>

<style scoped>
.empty-state {
  display: flex; flex-direction: column; align-items: center; gap: 8px;
  padding: 32px 16px; text-align: center;
  background: var(--surface-2); border-radius: 10px;
}
.empty-state--compact { padding: 18px 12px; }
.empty-state-icon { color: var(--muted); }
.empty-state-title {
  font-family: var(--font-serif); font-size: 16px; font-weight: 600; margin: 0;
}
.empty-state-message {
  color: var(--muted); font-size: 12.5px; line-height: 1.5;
  margin: 0 0 6px; max-width: 30em;
}
</style>
