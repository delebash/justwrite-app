<script setup>
// Reusable model dropdown with refresh button. Was previously copy-pasted
// 4 times across SpeakerLabView (Studio, Inline-tag, Stage 1, Stage 2);
// the quant-badge work made the duplication painful enough to extract.
//
// Renders an enriched model list. Two source paths handled in
// `OpenAICompatClient.enrichedModels()`:
//   - LM Studio native API (/api/v0/models) — gives explicit
//     `quantization`, `state` ("loaded" / "not-loaded"), `type` fields per
//     model. We show the quant directly and tag unloaded models.
//   - OpenAI-spec /v1/models fallback (Ollama / OpenAI cloud / others) —
//     returns only id strings; we try to parse a quant suffix from the id
//     itself (handles Ollama tags like "qwen3:14b-q4_K_M" and LM Studio
//     GGUF filenames). Cloud models with no quant render plain.
//
// Plus a leading "(provider default — <name> · <quant>)" entry that picks
// whatever chatModel the user configured in Settings.

import { computed, onMounted, watch } from "vue";
import { useAiStore } from "../stores/ai.js";
import { useModelList } from "../composables/useModelList.js";
import { parseQuant, entryLabel } from "../services/modelMeta.js";
import Icon from "./Icon.vue";

const props = defineProps({
  modelValue: { type: String, default: "" },
  providerId: { type: String, default: "" },
});
const emit = defineEmits(["update:modelValue"]);

const ai = useAiStore();
const { modelsFor, refreshModels } = useModelList();

onMounted(() => { if (props.providerId) refreshModels(props.providerId); });
watch(() => props.providerId, (id) => { if (id) refreshModels(id); });

const models = computed(() => modelsFor(props.providerId));
const defaultLabel = computed(() => {
  const m = ai.providerById(props.providerId)?.chatModel;
  if (!m) return "(provider default)";
  const q = parseQuant(m);
  return q ? `(provider default — ${m} · ${q})` : `(provider default — ${m})`;
});
</script>

<template>
  <select
    class="input sm"
    :value="modelValue"
    @change="emit('update:modelValue', $event.target.value)"
  >
    <option value="">{{ defaultLabel }}</option>
    <option v-for="m in models" :key="m.id" :value="m.id">{{ entryLabel(m) }}</option>
  </select>
  <button class="icon-btn" @click="refreshModels(providerId)" v-tooltip.bottom="'Refresh model list'">
    <Icon name="Refresh" :size="12" />
  </button>
</template>
