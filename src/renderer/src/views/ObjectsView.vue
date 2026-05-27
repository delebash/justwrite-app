<script setup>
import { computed, ref } from "vue";
import { useProjectStore } from "../stores/project.js";
import { useUiStore } from "../stores/ui.js";
import { useRouter } from "vue-router";
import PaneHeader from "../components/PaneHeader.vue";
import Icon from "../components/Icon.vue";
import ImagesModal from "../components/ImagesModal.vue";
import EventsModal from "../components/EventsModal.vue";
import GroupsModal from "../components/GroupsModal.vue";
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
  <PaneHeader eyebrow="Object" :title="obj.name">
    <button class="btn ghost" @click="modal = 'images'"><Icon name="Image" :size="14" /> Images</button>
    <button class="btn ghost" @click="modal = 'events'"><Icon name="Calendar" :size="14" /> Events</button>
    <button class="btn ghost" @click="modal = 'groups'"><Icon name="GroupIcon" :size="14" /> Groups</button>
    <button class="btn ghost" @click="deleteObject">Delete</button>
    <button class="btn primary" @click="addObject"><Icon name="Plus" :size="14" /> New object</button>
  </PaneHeader>
  <div class="col-detail scrollarea">
    <div style="padding:24px 28px 40px;max-width:980px">
      <div style="display:flex;gap:22px;align-items:flex-start">
        <div style="width:96px;height:96px;border-radius:16px;background:oklch(var(--tile-bg-l) var(--tile-bg-c) 270);color:oklch(var(--tile-ink-l) var(--tile-ink-c) 270);display:grid;place-items:center;flex-shrink:0">
          <Icon name="Cube" :size="28" />
        </div>
        <div style="flex:1">
          <input class="input" style="font-size:18px;font-weight:600;font-family:var(--font-serif);margin-bottom:6px"
            :value="obj.name" @input="update('name', $event.target.value)" />
          <input class="input" placeholder="Kind"
            :value="obj.kind" @input="update('kind', $event.target.value)" />
          <textarea class="input" rows="5" style="margin-top:14px;font-family:var(--font-serif);font-size:15px;line-height:1.55"
            placeholder="Description"
            :value="obj.note" @input="update('note', $event.target.value)" />
        </div>
      </div>
    </div>
  </div>
  <ImagesModal v-if="modal === 'images'" :entity-id="obj.id" :entity-name="obj.name" @close="modal = null" />
  <EventsModal v-if="modal === 'events'" :entity-id="obj.id" :entity-name="obj.name" @close="modal = null" />
  <GroupsModal v-if="modal === 'groups'" :entity-id="obj.id" :entity-name="obj.name" entity-kind="object" @close="modal = null" />
</template>
