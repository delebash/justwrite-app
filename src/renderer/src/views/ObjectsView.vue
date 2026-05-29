<script setup>
import { computed, ref } from "vue";
import { useProjectStore } from "../stores/project.js";
import { useUiStore } from "../stores/ui.js";
import { useRouter } from "vue-router";
import Icon from "../components/Icon.vue";
import ImagesModal from "../components/ImagesModal.vue";
import RichEditor from "../components/RichEditor.vue";
import StatusSelect from "../components/StatusSelect.vue";
import GroupsModal from "../components/GroupsModal.vue";
import SceneRefList from "../components/SceneRefList.vue";
import MentionRefList from "../components/MentionRefList.vue";
import { promptDialog, confirmDialog } from "../services/dialog.js";
import { NEW_ENTITY_META } from "../services/entityMeta.js";

const props = defineProps({ id: { type: String, default: "" } });
const project = useProjectStore();
const ui = useUiStore();
const router = useRouter();
const obj = computed(() => project.objectById(props.id || ui.selections.objects) || project.objects[0]);
const modal = ref(null);

function update(k, v) { project.updateObject(obj.value.id, { [k]: v }); }
async function addObject() {
  const name = await promptDialog(NEW_ENTITY_META.objects);
  if (!name) return;
  const id = project.addObject({ name }); ui.select("objects", id); router.push(`/objects/${id}`);
}
async function deleteObject() {
  const yes = await confirmDialog({
    title: `Delete "${obj.value.name}"?`,
    confirmLabel: "Delete",
    danger: true,
  });
  if (!yes) return;
  project.removeObject(obj.value.id);
  const next = project.objects[0];
  if (next) { ui.select("objects", next.id); router.push(`/objects/${next.id}`); } else router.push("/");
}
</script>

<template>
  <header class="pane-header object-pane-header">
    <div class="pane-title">
      <span class="pane-eyebrow">Object</span>
      <input class="object-name"
        :value="obj.name"
        placeholder="Object name"
        @input="update('name', $event.target.value)" />
    </div>
    <div class="pane-actions">
      <button class="btn ghost" @click="modal = 'images'"><Icon name="Image" :size="14" /> Images</button>
      <router-link :to="`/objects/${obj.id}/events`" custom v-slot="{ navigate }">
        <button class="btn ghost" @click="navigate"><Icon name="Calendar" :size="14" /> Events</button>
      </router-link>
      <button class="btn ghost" @click="modal = 'groups'"><Icon name="GroupIcon" :size="14" /> Groups</button>
      <button class="btn ghost" @click="deleteObject">Delete</button>
      <button class="btn primary" @click="addObject"><Icon name="Plus" :size="14" /> New object</button>
      <StatusSelect :model-value="obj.status || ''" @update:model-value="(v) => update('status', v)" />
    </div>
  </header>
  <div class="pane-card">
    <div style="padding:24px 28px 40px;display:flex;flex-direction:column;gap:14px;flex:1;min-height:0">
      <input class="input" placeholder="Kind"
        :value="obj.kind" @input="update('kind', $event.target.value)" />
      <RichEditor
        :model-value="obj.note || ''"
        placeholder="Description"
        variant="inline"
        :toolbar="['bold', 'italic', 'underline', 'strike', 'h1', 'h2', 'h3', 'quote', 'list', 'orderedList', 'taskList', 'sceneBreak', 'align', 'highlight', 'link', 'image', 'table', 'find', 'undo', 'redo']"
        :fill="true"
        @change="(html) => update('note', html)"
      />
      <div style="flex:1;min-height:0;overflow-y:auto">
        <div style="margin-top:22px">
          <div class="t-eyebrow" style="margin-bottom:10px">Appears in scenes</div>
          <SceneRefList field="objects" :entity-id="obj.id"
            empty-text="No scenes feature this object yet. Open a scene → Links → Objects to add one." />
        </div>

        <div style="margin-top:22px">
          <div class="t-eyebrow" style="margin-bottom:10px">Mentioned in prose</div>
          <MentionRefList :entity-id="obj.id" />
        </div>
      </div>
    </div>
  </div>
  <ImagesModal v-if="modal === 'images'" :entity-id="obj.id" :entity-name="obj.name" @close="modal = null" />
  <GroupsModal v-if="modal === 'groups'" :entity-id="obj.id" :entity-name="obj.name" entity-kind="object" @close="modal = null" />
</template>

<style scoped>
.object-pane-header .pane-title { gap: 2px; }
.object-name {
  appearance: none;
  font-family: var(--font-serif);
  font-size: 20px; font-weight: 600;
  letter-spacing: -0.015em;
  color: var(--ink);
  border: 1px solid transparent;
  background: transparent;
  border-radius: 6px;
  padding: 2px 6px;
  margin-left: -6px;
  outline: none;
  min-width: 0;
}
.object-name:hover { border-color: var(--border-soft); }
.object-name:focus { border-color: var(--accent); background: var(--surface); box-shadow: 0 0 0 3px var(--accent-soft); }
</style>
