<script setup>
import { computed } from "vue";
import { useProjectStore } from "../stores/project.js";
import { useUiStore } from "../stores/ui.js";
import RichEditor from "../components/RichEditor.vue";

const props = defineProps({ id: { type: String, default: "" } });
const project = useProjectStore();
const ui = useUiStore();

// Architecture is a fixed map of four documents (premise / fabula /
// setting / global notes). Show one at a time, like Groups/Plotlines.
const docIds = computed(() => Object.keys(project.architecture));
const doc = computed(() => {
  const id = props.id || ui.selections.architecture || docIds.value[0];
  return project.architecture[id] || project.architecture[docIds.value[0]];
});

function update(k, v) { project.updateArchitecture(doc.value.id, { [k]: v }); }
</script>

<template>
  <header class="pane-header arch-pane-header">
    <div class="pane-title">
      <span class="pane-eyebrow">Architecture document</span>
      <input v-if="doc" class="input arch-title"
        :value="doc.title" @input="update('title', $event.target.value)" />
    </div>
  </header>

  <div v-if="doc" class="col-detail scrollarea">
    <div class="arch-wrap">
      <textarea class="input arch-blurb" rows="2"
        placeholder="Blurb"
        :value="doc.blurb" @input="update('blurb', $event.target.value)" />

      <RichEditor
        :model-value="doc.body"
        placeholder="Write the document…"
        variant="inline"
        :toolbar="['bold', 'italic', 'h2', 'quote', 'list', 'undo', 'redo']"
        :min-height="280"
        @change="(html) => update('body', html)"
      />
    </div>
  </div>
</template>

<style scoped>
.arch-wrap {
  padding: 22px 26px 40px;
  max-width: 760px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.arch-pane-header .pane-title { gap: 4px; }
.arch-pane-header .arch-title {
  border: 0;
  background: transparent;
  padding: 0;
  height: auto;
}
.arch-title {
  font-family: var(--font-serif);
  font-size: 22px;
  font-weight: 600;
  border: 0;
  background: transparent;
  padding: 0;
}
.arch-blurb {
  font-family: var(--font-serif);
  font-style: italic;
  color: var(--ink-2);
  font-size: 14px;
}
</style>
