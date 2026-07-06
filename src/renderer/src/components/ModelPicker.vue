<script setup>
// Reusable model dropdown with refresh button. Was previously copy-pasted
// 4 times across SpeakerLabView (Studio, Inline-tag, Stage 1, Stage 2);
// the quant-badge work made the duplication painful enough to extract.
//
// Entries come from the shared per-provider cache (composables/useModelList.js),
// which hits the shared `/v1/llm-providers/{id}/models` endpoint — the server-side
// registry adapter holds the key and makes the provider call. The endpoint returns
// plain model ids, so a quant badge renders only when a quant suffix can be parsed
// from the id itself (services/modelMeta.js `parseQuant` — handles Ollama tags like
// "qwen3:14b-q4_K_M" and GGUF filenames). Cloud models with no quant render plain.
//
// Plus a leading "(provider default — <name> · <quant>)" entry that picks
// whatever chatModel the user configured in Settings.

import { computed, onMounted, watch } from "vue";
import { useAiStore } from "../stores/ai.js";
import { useModelList } from "../composables/useModelList.js";
import { parseQuant, entryLabel } from "../services/modelMeta.js";
import { Icon } from "@delebash/llm-ui";

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
  const m = ai.providerById(props.providerId)?.defaultModel;
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
  <button class="icon-btn" aria-label="Refresh model list" @click="refreshModels(providerId)" v-tooltip.bottom="'Refresh model list'">
    <Icon name="Refresh" :size="12" />
  </button>
</template>
