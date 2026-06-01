<script setup>
// Standardized AI-provider dropdown. Replaces the repeated:
//   <select v-model="x"><option v-for="p in ai.llmProviders">…</option></select>
// that was sprinkled across Settings, Studio, Speaker Lab, and Writer Lab.
//
// Props:
//   modelValue — provider id (or "" for none)
//   kind       — "llm" | "tts" | "embedding". Drives which providers
//                surface; defaults to "llm".
//   size       — "sm" | "md". Matches the existing .input.sm convention.
//   includeEmpty — when true, prepends an empty option labelled with
//                  `emptyLabel`. Useful for "(none)" choices.
//   emptyLabel — label for the empty option.

import { computed } from "vue";
import { useAiStore } from "../stores/ai.js";

const props = defineProps({
  modelValue: { type: String, default: "" },
  kind:       { type: String, default: "llm" },  // "llm" | "tts" | "embedding"
  size:       { type: String, default: "sm" },   // "sm" | "md"
  includeEmpty: { type: Boolean, default: false },
  emptyLabel: { type: String, default: "(none)" },
  disabled:   { type: Boolean, default: false },
});
const emit = defineEmits(["update:modelValue"]);

const ai = useAiStore();

const providers = computed(() => {
  if (props.kind === "tts")       return ai.ttsProviders;
  if (props.kind === "embedding") return ai.embeddingProviders;
  return ai.llmProviders;
});

function onChange(e) {
  emit("update:modelValue", e.target.value);
}
</script>

<template>
  <select
    class="input"
    :class="{ sm: size === 'sm' }"
    :value="modelValue"
    :disabled="disabled"
    @change="onChange"
  >
    <option v-if="includeEmpty" value="">{{ emptyLabel }}</option>
    <option v-for="p in providers" :key="p.id" :value="p.id">{{ p.name || p.id }}</option>
  </select>
</template>
