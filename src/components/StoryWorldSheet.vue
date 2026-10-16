<script setup>
// The location, object and group sheets (the AI drafting spec §9.1; 2026-10-16): the kind's
// fields from services/storyWorldSheet.js, each a SheetSection that starts folded while empty —
// the character sheet's rule, so a new entry isn't a wall of empty boxes. The page keys this on
// the entity's id, so switching entries re-folds to match the new one's fields.
import { UiTextarea } from "@delebash/llm-ui";
import SheetSection from "./SheetSection.vue";
import { sheetFieldLabelKeys, sheetFields, sheetValue } from "../services/storyWorldSheet.js";

const props = defineProps({
  // "location" · "object" · "group"
  kind: { type: String, required: true },
  entity: { type: Object, required: true },
});
const emit = defineEmits(["update"]);
</script>

<template>
  <div class="sws">
    <SheetSection v-for="k in sheetFields(props.kind)" :key="k"
      :title="$t(sheetFieldLabelKeys(props.kind, k).label)"
      :hint="$t(sheetFieldLabelKeys(props.kind, k).hint)"
      :count="sheetValue(props.entity, k).trim() ? 1 : 0" :chip="false">
      <UiTextarea class="sws-input" auto-resize :rows="2"
        :aria-label="$t(sheetFieldLabelKeys(props.kind, k).label)"
        :model-value="sheetValue(props.entity, k)" @update:model-value="emit('update', k, $event)" />
    </SheetSection>
  </div>
</template>

<style scoped>
/* A prose field: ~60ch, never the page's width (the layout rule). */
.sws-input { width: 60ch; max-width: 100%; }
</style>
