<script setup>
// AiFeatureChip — JustWrite's STORE BINDING for the kit's presentational
// LuFeatureChip (C5). Same name + props as the pre-C5 component so its ~20
// consumers stay untouched. ALL chip/popover/backdrop GUI lives in the kit;
// this file only maps the ai store's resolution + pin state onto the kit's
// props/events (through useFeaturePin — the same binding ChatPanel's inline
// picker uses) and supplies the manage-routing foot link.
//
// Two states only:
//   - Inherit default → no feature pin; the chip shows the global default.
//   - Pinned → the chip shows (and edits) the feature's own provider+model.
// Writes go through ai.setFeaturePin — the same backing store Settings edits.

import { toRef } from "vue";
import { LuFeatureChip } from "@delebash/llm-ui";
import { useFeaturePin } from "../composables/useFeaturePin.js";

const props = defineProps({
  feature: { type: String, required: true },
  label:   { type: String, default: "" },
  compact: { type: Boolean, default: false },
});

const {
  resolvedProvider, resolvedModel,
  pinnedProviderId, pinnedModel, isPinned,
  providerOptions, modelOptions,
  setProvider, setModel, refresh,
} = useFeaturePin(toRef(props, "feature"));
</script>

<template>
  <LuFeatureChip
    :feature="feature"
    :label="label"
    :compact="compact"
    :resolved-provider-name="resolvedProvider?.name || '—'"
    :resolved-model="resolvedModel"
    :pinned="isPinned"
    :pinned-provider-id="pinnedProviderId"
    :pinned-model="pinnedModel"
    :provider-options="providerOptions"
    :model-options="modelOptions"
    @select-provider="setProvider"
    @select-model="setModel"
    @refresh="refresh">
    <template #foot="{ close }">
      Changes update the <b>{{ label || feature }}</b> routing everywhere this
      feature runs. <router-link to="/ai" @click="close()">Manage all routing in Settings →</router-link>
    </template>
  </LuFeatureChip>
</template>
