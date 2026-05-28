<script setup>
import { computed, ref } from "vue";
import { useProjectStore } from "../stores/project.js";
import { useUiStore } from "../stores/ui.js";
import { useRouter } from "vue-router";
import Icon from "../components/Icon.vue";
import ImagesModal from "../components/ImagesModal.vue";
import GroupsModal from "../components/GroupsModal.vue";
import SceneRefList from "../components/SceneRefList.vue";
import { promptDialog, confirmDialog } from "../services/dialog.js";

const props = defineProps({ id: { type: String, default: "" } });
const project = useProjectStore();
const ui = useUiStore();
const router = useRouter();
const obj = computed(() => project.objectById(props.id || ui.selections.objects) || project.objects[0]);
const modal = ref(null);

function update(k, v) { project.updateObject(obj.value.id, { [k]: v }); }
async function addObject() {
  const name = await promptDialog({
    title: "New object",
    label: "Object name",
    placeholder: "e.g. Idris's pocket watch",
    confirmLabel: "Create object",
  });
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
    </div>
  </header>
  <div class="col-detail scrollarea">
    <div style="padding:24px 28px 40px;max-width:980px">
      <input class="input" placeholder="Kind"
        :value="obj.kind" @input="update('kind', $event.target.value)" />
      <textarea class="input" rows="5" style="margin-top:14px;font-family:var(--font-serif);font-size:15px;line-height:1.55"
        placeholder="Description"
        :value="obj.note" @input="update('note', $event.target.value)" />

      <div style="margin-top:22px">
        <div class="t-eyebrow" style="margin-bottom:10px">Appears in scenes</div>
        <SceneRefList field="objects" :entity-id="obj.id"
          empty-text="No scenes feature this object yet. Open a scene → Links → Objects to add one." />
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
