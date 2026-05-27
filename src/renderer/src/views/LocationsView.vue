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
  <PaneHeader eyebrow="Location" :title="loc.name">
    <button class="btn ghost" @click="modal = 'images'"><Icon name="Image" :size="14" /> Images</button>
    <button class="btn ghost" @click="modal = 'events'"><Icon name="Calendar" :size="14" /> Events</button>
    <button class="btn ghost" @click="modal = 'groups'"><Icon name="GroupIcon" :size="14" /> Groups</button>
    <button class="btn ghost" @click="deleteLocation">Delete</button>
    <button class="btn primary" @click="addLocation"><Icon name="Plus" :size="14" /> New location</button>
  </PaneHeader>
  <div class="col-detail scrollarea">
    <div style="padding:24px 28px 40px;max-width:980px">
      <div style="display:flex;gap:22px;align-items:flex-start">
        <div style="width:96px;height:96px;border-radius:16px;background:oklch(var(--tile-bg-l) var(--tile-bg-c) 120);color:oklch(var(--tile-ink-l) var(--tile-ink-c) 120);display:grid;place-items:center;flex-shrink:0">
          <Icon name="Pin" :size="28" />
        </div>
        <div style="flex:1">
          <input class="input" style="font-size:18px;font-weight:600;font-family:var(--font-serif);margin-bottom:6px"
            :value="loc.name" @input="update('name', $event.target.value)" />
          <input class="input" placeholder="Kind"
            :value="loc.kind" @input="update('kind', $event.target.value)" />
          <textarea class="input" rows="5" style="margin-top:14px;font-family:var(--font-serif);font-size:15px;line-height:1.55"
            placeholder="Description"
            :value="loc.note" @input="update('note', $event.target.value)" />
        </div>
      </div>
    </div>
  </div>
  <ImagesModal v-if="modal === 'images'" :entity-id="loc.id" :entity-name="loc.name" @close="modal = null" />
  <EventsModal v-if="modal === 'events'" :entity-id="loc.id" :entity-name="loc.name" @close="modal = null" />
  <GroupsModal v-if="modal === 'groups'" :entity-id="loc.id" :entity-name="loc.name" entity-kind="location" @close="modal = null" />
</template>
