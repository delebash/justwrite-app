<script setup>
// Brainstorm's seed prompt (2026-10-28, moved out of BrainstormPage.vue when Brainstorm went to where
// it's used): its label, a box with the category's example, and the line under it. The Brainstorm
// page's (its seed is required there) and the Brainstorm panel's at a page (BrainstormPanel.vue —
// optional: without words, the page and the book steer).
import { UiTextarea } from "@delebash/ui";

defineProps({
  category: { type: String, required: true },
  hint: { type: String, default: "" },
  rows: { type: Number, default: 3 },
  disabled: { type: Boolean, default: false },
});
const seed = defineModel({ type: String, default: "" });
</script>

<template>
  <div class="bs-seed">
    <label class="bs-seed-label">{{ $t("brainstorm.seedLabel") }}</label>
    <UiTextarea v-model="seed" width="prose" :rows="rows" :disabled="disabled"
      :aria-label="$t('brainstorm.seedLabel')"
      :placeholder="$t(`brainstorm.categories.${category}.placeholder`)" />
    <p v-if="hint" class="bs-seed-hint">{{ hint }}</p>
  </div>
</template>

<style scoped>
.bs-seed { display: flex; flex-direction: column; gap: 4px; }
.bs-seed-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--muted);
}
.bs-seed-hint {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--muted);
  line-height: 1.5;
}
</style>
