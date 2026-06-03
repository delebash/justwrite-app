<script setup>
import { computed, ref } from "vue";
import { useProjectStore } from "../stores/project.js";
import { useUiStore } from "../stores/ui.js";
import { useRouter } from "vue-router";
import Icon from "../components/Icon.vue";
import JwInput from "@renderer/components/ui/JwInput.vue";
import JwButton from "@renderer/components/ui/JwButton.vue";
import ImagesModal from "../components/ImagesModal.vue";
import RichEditor from "../components/RichEditor.vue";
import { EDITOR_TOOLBAR_DOC } from "../services/editorToolbars.js";
import StatusSelect from "../components/StatusSelect.vue";
import GroupsModal from "../components/GroupsModal.vue";
import SceneRefList from "../components/SceneRefList.vue";
import MentionRefList from "../components/MentionRefList.vue";
import Breadcrumb from "../components/Breadcrumb.vue";
import { promptDialog, confirmDialog } from "../services/dialog.js";
import { NEW_ENTITY_META } from "../services/entityMeta.js";

const props = defineProps({ id: { type: String, default: "" } });
const project = useProjectStore();
const ui = useUiStore();
const router = useRouter();
const loc = computed(() => project.locationById(props.id || ui.selections.locations) || project.locations[0]);
const modal = ref(null);

function update(k, v) { project.updateLocation(loc.value.id, { [k]: v }); }
async function addLocation() {
  const name = await promptDialog(NEW_ENTITY_META.locations);
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
      <Breadcrumb :segments="[{ label: 'Location', to: '/locations' }]" />
      <input v-if="loc" class="location-name"
        :value="loc.name"
        placeholder="Location name"
        @input="update('name', $event.target.value)" />
      <h1 v-else class="pane-h1">No locations</h1>
    </div>
    <div class="pane-actions">
      <template v-if="loc">
        <JwButton intent="ghost" size="small" @click="modal = 'images'"><Icon name="Image" :size="14" /> Images</JwButton>
        <router-link :to="`/locations/${loc.id}/events`" custom v-slot="{ navigate }">
          <JwButton intent="ghost" size="small" @click="navigate"><Icon name="Calendar" :size="14" /> Events</JwButton>
        </router-link>
        <JwButton intent="ghost" size="small" @click="modal = 'groups'"><Icon name="GroupIcon" :size="14" /> Groups</JwButton>
        <JwButton intent="ghost" size="small" @click="deleteLocation">Delete</JwButton>
      </template>
      <JwButton intent="primary" size="small" @click="addLocation"><Icon name="Plus" :size="14" /> New location</JwButton>
      <StatusSelect v-if="loc" :model-value="loc.status || ''" @update:model-value="(v) => update('status', v)" />
    </div>
  </header>
  <div v-if="loc" class="pane-card">
    <div style="padding:24px 28px 40px;display:flex;flex-direction:column;gap:14px;flex:1;min-height:0">
      <JwInput fluid placeholder="Kind"
        :model-value="loc.kind" @update:model-value="update('kind', $event)" />
      <RichEditor
        :model-value="loc.note || ''"
        placeholder="Description"
        variant="inline"
        :toolbar="EDITOR_TOOLBAR_DOC"
        :fill="true"
        @change="(html) => update('note', html)"
      />
      <div style="flex:1;min-height:0;overflow-y:auto">
        <div style="margin-top:22px">
          <div class="t-eyebrow" style="margin-bottom:10px">Appears in scenes</div>
          <SceneRefList field="locations" :entity-id="loc.id"
            empty-text="No scenes set in this location yet. Open a scene → Links → Locations to add one." />
        </div>

        <div style="margin-top:22px">
          <div class="t-eyebrow" style="margin-bottom:10px">Mentioned in prose</div>
          <MentionRefList :entity-id="loc.id" />
        </div>
      </div>
    </div>
  </div>
  <div v-else class="pane-card" style="display:grid;place-items:center;padding:60px">
    <div class="t-muted" style="text-align:center">
      No locations yet.<br />
      <JwButton intent="primary" style="margin-top:14px" @click="addLocation"><Icon name="Plus" :size="14" /> Create your first location</JwButton>
    </div>
  </div>
  <ImagesModal v-if="loc && modal === 'images'" :entity-id="loc.id" :entity-name="loc.name" @close="modal = null" />
  <GroupsModal v-if="loc && modal === 'groups'" :entity-id="loc.id" :entity-name="loc.name" entity-kind="location" @close="modal = null" />
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
