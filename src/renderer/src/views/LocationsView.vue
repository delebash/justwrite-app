<script setup>
import { computed, ref } from "vue";
import { useProjectStore } from "../stores/project.js";
import { useUiStore } from "../stores/ui.js";
import { useRouter } from "vue-router";
import Icon from "../components/Icon.vue";
import ImagesModal from "../components/ImagesModal.vue";
import EventsModal from "../components/EventsModal.vue";
import GroupsModal from "../components/GroupsModal.vue";
import SceneRefList from "../components/SceneRefList.vue";
import { promptDialog, confirmDialog } from "../services/dialog.js";

const props = defineProps({ id: { type: String, default: "" } });
const project = useProjectStore();
const ui = useUiStore();
const router = useRouter();
const loc = computed(() => project.locationById(props.id || ui.selections.locations) || project.locations[0]);
const modal = ref(null);

function update(k, v) { project.updateLocation(loc.value.id, { [k]: v }); }
async function addLocation() {
  const name = await promptDialog({
    title: "New location",
    label: "Location name",
    placeholder: "e.g. Brackish Cove",
    confirmLabel: "Create location",
  });
  if (!name) return;
  const id = project.addLocation({ name }); ui.select("locations", id); router.push(`/locations/${id}`);
}
async function deleteLocation() {
  const yes = await confirmDialog({
    title: `Delete "${loc.value.name}"?`,
    confirmLabel: "Delete",
    danger: true,
  });
  if (!yes) return;
  project.removeLocation(loc.value.id);
  const next = project.locations[0];
  if (next) { ui.select("locations", next.id); router.push(`/locations/${next.id}`); } else router.push("/");
}
</script>

<template>
  <header class="pane-header location-pane-header">
    <div class="pane-title">
      <span class="pane-eyebrow">Location</span>
      <input class="location-name"
        :value="loc.name"
        placeholder="Location name"
        @input="update('name', $event.target.value)" />
    </div>
    <div class="pane-actions">
      <button class="btn ghost" @click="modal = 'images'"><Icon name="Image" :size="14" /> Images</button>
      <button class="btn ghost" @click="modal = 'events'"><Icon name="Calendar" :size="14" /> Events</button>
      <button class="btn ghost" @click="modal = 'groups'"><Icon name="GroupIcon" :size="14" /> Groups</button>
      <button class="btn ghost" @click="deleteLocation">Delete</button>
      <button class="btn primary" @click="addLocation"><Icon name="Plus" :size="14" /> New location</button>
    </div>
  </header>
  <div class="col-detail scrollarea">
    <div style="padding:24px 28px 40px;max-width:980px">
      <input class="input" placeholder="Kind"
        :value="loc.kind" @input="update('kind', $event.target.value)" />
      <textarea class="input" rows="5" style="margin-top:14px;font-family:var(--font-serif);font-size:15px;line-height:1.55"
        placeholder="Description"
        :value="loc.note" @input="update('note', $event.target.value)" />

      <div style="margin-top:22px">
        <div class="t-eyebrow" style="margin-bottom:10px">Appears in scenes</div>
        <SceneRefList field="locations" :entity-id="loc.id"
          empty-text="No scenes set in this location yet. Open a scene → Links → Locations to add one." />
      </div>
    </div>
  </div>
  <ImagesModal v-if="modal === 'images'" :entity-id="loc.id" :entity-name="loc.name" @close="modal = null" />
  <EventsModal v-if="modal === 'events'" :entity-id="loc.id" :entity-name="loc.name" @close="modal = null" />
  <GroupsModal v-if="modal === 'groups'" :entity-id="loc.id" :entity-name="loc.name" entity-kind="location" @close="modal = null" />
</template>

<style scoped>
.location-pane-header .pane-title { gap: 2px; }
.location-name {
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
.location-name:hover { border-color: var(--border-soft); }
.location-name:focus { border-color: var(--accent); background: var(--surface); box-shadow: 0 0 0 3px var(--accent-soft); }
</style>
