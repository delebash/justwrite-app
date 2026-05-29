<script setup>
import { computed } from "vue";
import { useRouter } from "vue-router";
import { useProjectStore } from "../stores/project.js";
import { useUiStore } from "../stores/ui.js";
import RichEditor from "../components/RichEditor.vue";
import Icon from "../components/Icon.vue";
import StatusSelect from "../components/StatusSelect.vue";

const props = defineProps({ id: { type: String, default: "" } });
const project = useProjectStore();
const ui = useUiStore();
const router = useRouter();

// Architecture is a fixed map of four documents (premise / fabula /
// setting / global notes). Show one at a time, like Groups/Strands.
const docIds = computed(() => Object.keys(project.architecture));
const doc = computed(() => {
  const id = props.id || ui.selections.architecture || docIds.value[0];
  return project.architecture[id] || project.architecture[docIds.value[0]];
});

function update(k, v) { project.updateArchitecture(doc.value.id, { [k]: v }); }
function openEvents() { router.push("/architecture/setting/events"); }
</script>

<template>
  <header class="pane-header arch-pane-header">
    <div class="pane-title">
      <span class="pane-eyebrow">Architecture document</span>
      <input v-if="doc" class="input arch-title"
        :value="doc.title" @input="update('title', $event.target.value)" />
    </div>
    <div v-if="doc" class="pane-actions">
      <button v-if="doc.id === 'setting'" class="btn ghost sm" @click="openEvents"><Icon name="Calendar" :size="14" /> Events</button>
      <StatusSelect :model-value="doc.status || ''" @update:model-value="(v) => update('status', v)" />
    </div>
  </header>

  <div v-if="doc" class="pane-card">
    <div class="arch-wrap scrollarea">
      <textarea class="input arch-blurb" rows="2"
        placeholder="Blurb"
        :value="doc.blurb" @input="update('blurb', $event.target.value)" />

      <RichEditor
        :model-value="doc.body"
        placeholder="Write the document…"
        variant="inline"
        :toolbar="['bold', 'italic', 'underline', 'strike', 'h1', 'h2', 'h3', 'quote', 'list', 'orderedList', 'taskList', 'sceneBreak', 'align', 'highlight', 'link', 'image', 'table', 'find', 'undo', 'redo']"
        :min-height="280"
        @change="(html) => update('body', html)"
      />
    </div>
  </div>

</template>

<style scoped>
.arch-wrap {
  flex: 1;
  min-height: 0;
  padding: 22px 26px 40px;
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
