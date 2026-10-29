<script setup>
// Brainstorm in a window (2026-10-28, Brainstorm where it's used): the Brainstorm panel
// (BrainstormPanel.vue) for the plot categories where a menu opens them — a Plot board strand's
// next beats and plot twists (Add as beat), the editor's at the cursor (Write this). The page puts
// the picked idea in place and closes the window; it can't close mid-run. The header's chip is the
// routed model, as on the Brainstorm page.
// Precedent: IdeaListModal.vue (the editor's idea window before 2026-10-28) — the kit's AppModal, the
// chip in the header, no closing mid-run.
import { computed, ref } from "vue";
import { AppModal } from "@delebash/ui";
import AiFeatureChip from "./AiFeatureChip.vue";
import BrainstormPanel from "./BrainstormPanel.vue";

defineProps({
  eyebrow: { type: String, default: "" },
  title: { type: String, default: "" },
  lede: { type: String, default: "" },
  category: { type: String, required: true },
  request: { type: Function, required: true },
  meta: { type: [Object, Function], required: true },
  taskLabel: { type: String, required: true },
  pickLabel: { type: String, required: true },
});
const emit = defineEmits(["pick", "close"]);

const panel = ref(null);
const running = computed(() => !!panel.value?.running);
</script>

<template>
  <AppModal :eyebrow="eyebrow" :title="title" :lede="lede" :closable="!running" @close="emit('close')">
    <template #header-extra>
      <AiFeatureChip feature="brainstorm" :label="$t('brainstorm.title')" editable />
    </template>
    <BrainstormPanel ref="panel" :category="category" :request="request" :meta="meta" :task-label="taskLabel"
      :pick-label="pickLabel" @pick="(text) => emit('pick', text)" />
  </AppModal>
</template>
