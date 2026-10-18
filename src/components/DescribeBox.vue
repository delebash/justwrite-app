<script setup>
// The describe box (the AI drafting spec §3.1, §9.3) — open while the page is thin, otherwise one
// line that opens it. The writer describes the entry; Draft emits `draft` with the text and the
// page opens its review window. Moved out of CharactersPage.vue 2026-10-16, when the location,
// object and group pages gained it (the plan 2026-10-15, Task S5). The page owns the text
// (v-model), so a later draft — a character's section — can reuse it, and keys this box on the
// entry's id, so a new entry starts closed. `start()` opens it and focuses the field (the
// header's Draft with AI → From a description).
// Precedent: the character page's own box, as it stood.
import { computed, nextTick, ref } from "vue";
import { Icon, UiButton, UiTextarea } from "@delebash/ui";

const props = defineProps({
  modelValue: { type: String, default: "" },
  // The page's thin rule (characterSheet.js isThinCharacter / storyWorldSheet.js isThinSheet).
  thin: { type: Boolean, default: false },
  label: { type: String, required: true },
  hint: { type: String, default: "" },
  placeholder: { type: String, default: "" },
  // The closed line's button, e.g. "Describe this character…".
  collapsedLabel: { type: String, required: true },
});
const emit = defineEmits(["update:modelValue", "draft"]);

const opened = ref(false);
const root = ref(null);
const show = computed(() => props.thin || opened.value);

function start() {
  opened.value = true;
  nextTick(() => root.value?.querySelector("textarea")?.focus());
}
function draft() {
  const text = props.modelValue.trim();
  if (!text) return start();
  emit("draft", text);
}
defineExpose({ start });
</script>

<template>
  <div ref="root" class="describe-box">
    <div v-if="show" class="ch-field">
      <span class="ch-field-label">{{ label }}
        <span v-if="hint" class="ch-field-hint">{{ hint }}</span>
      </span>
      <div class="describe-row">
        <UiTextarea class="describe-input" auto-resize :rows="2"
          :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)"
          :placeholder="placeholder" />
        <UiButton intent="primary" :disabled="!modelValue.trim()" @click="draft">
          <Icon name="Sparkle" :size="13" /> {{ $t("characters.draft.draft") }}
        </UiButton>
      </div>
    </div>
    <UiButton v-else intent="secondary" size="small" @click="start">
      <Icon name="Sparkle" :size="12" /> {{ collapsedLabel }}
    </UiButton>
  </div>
</template>

<style scoped>
/* A prose field (~60ch) with its Draft button beside it, aligned to the input (the layout rule);
   one line when closed. */
.describe-box { margin: 16px 0 4px; }
.describe-row { display: flex; gap: 10px; align-items: flex-start; flex-wrap: wrap; }
.describe-input { flex: 0 1 60ch; min-width: 0; }
</style>
