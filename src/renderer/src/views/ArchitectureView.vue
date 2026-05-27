<script setup>
import { computed } from "vue";
import { useProjectStore } from "../stores/project.js";
import { useUiStore } from "../stores/ui.js";
import PaneHeader from "../components/PaneHeader.vue";
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
  <PaneHeader eyebrow="Architecture" :title="doc?.title || 'Architecture'" />

  <div v-if="doc" class="col-detail scrollarea">
    <div class="arch-wrap">
      <div class="arch-head">
        <div class="arch-mark">{{ doc.title[0] }}</div>
        <div style="flex:1;min-width:0">
          <div class="t-eyebrow">Architecture document</div>
          <input class="input arch-title"
            :value="doc.title" @input="update('title', $event.target.value)" />
        </div>
      </div>

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
.arch-head {
  display: flex;
  align-items: center;
  gap: 12px;
}
.arch-mark {
  width: 38px; height: 38px;
  border-radius: 10px;
  background: var(--accent-soft);
  color: var(--accent-ink);
  display: grid; place-items: center;
  font-family: var(--font-serif);
  font-style: italic;
  font-weight: 600;
  font-size: 18px;
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
