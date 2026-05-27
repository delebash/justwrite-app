<script setup>
import { computed, ref } from "vue";
import { useProjectStore } from "../stores/project.js";
import { useUiStore } from "../stores/ui.js";
import { useRouter } from "vue-router";
import Icon from "../components/Icon.vue";
import ImagesModal from "../components/ImagesModal.vue";
import EventsModal from "../components/EventsModal.vue";
import { promptDialog, confirmDialog } from "../services/dialog.js";

const props = defineProps({ id: { type: String, default: "" } });
const project = useProjectStore();
const ui = useUiStore();
const router = useRouter();
const g = computed(() => project.groupById(props.id || ui.selections.groups) || project.groups[0]);
const modal = ref(null);
const KIND_ICON = { character: "Users", location: "Pin", object: "Cube", plotline: "Plotlines" };

// Same family of oklch hues used in PlotlinesView, so colors picked
// across these two surfaces sit nicely next to each other in the UI.
const COLOR_PALETTE = [
  "oklch(0.65 0.13 25)",   "oklch(0.65 0.13 5)",    "oklch(0.65 0.13 330)",
  "oklch(0.65 0.13 290)",  "oklch(0.65 0.13 250)",  "oklch(0.65 0.13 210)",
  "oklch(0.65 0.13 170)",  "oklch(0.65 0.13 130)",  "oklch(0.65 0.13 95)",
  "oklch(0.7 0.13 55)",
];

function update(k, v) { project.updateGroup(g.value.id, { [k]: v }); }
async function addGroup() {
  const name = await promptDialog({
    title: "New group",
    label: "Group name",
    placeholder: "e.g. The Cartographers' Guild",
    confirmLabel: "Create group",
  });
  if (!name) return;
  const id = project.addGroup({ name }); ui.select("groups", id); router.push(`/groups/${id}`);
}
async function deleteGroup() {
  const yes = await confirmDialog({
    title: `Delete "${g.value.name}"?`,
    confirmLabel: "Delete",
    danger: true,
  });
  if (!yes) return;
  project.removeGroup(g.value.id);
  const next = project.groups[0];
  if (next) { ui.select("groups", next.id); router.push(`/groups/${next.id}`); } else router.push("/");
}
</script>

<template>
  <header class="pane-header group-pane-header">
    <div class="pane-title">
      <span class="pane-eyebrow">Group</span>
      <input v-if="g" class="group-name"
        :value="g.name"
        placeholder="Group name"
        @input="update('name', $event.target.value)" />
      <h1 v-else class="pane-h1">Groups</h1>
    </div>
    <div class="pane-actions">
      <button class="btn ghost" @click="modal = 'images'"><Icon name="Image" :size="14" /> Images</button>
      <button class="btn ghost" @click="modal = 'events'"><Icon name="Calendar" :size="14" /> Events</button>
      <button class="btn ghost" @click="deleteGroup">Delete</button>
      <button class="btn primary" @click="addGroup"><Icon name="Plus" :size="14" /> New group</button>
    </div>
  </header>
  <div class="col-detail scrollarea">
    <div style="padding:24px 28px 40px;max-width:980px">
      <textarea class="input" rows="3" style="font-family:var(--font-serif);font-style:italic"
        placeholder="Blurb"
        :value="g.blurb" @input="update('blurb', $event.target.value)" />
      <div class="group-swatches">
        <span class="t-eyebrow" style="font-size:10px;color:var(--muted)">Color</span>
        <button v-for="color in COLOR_PALETTE" :key="color"
          type="button"
          class="group-swatch"
          :class="{ active: color === g.color }"
          :style="`background:${color}`"
          :title="`Use ${color}`"
          @click="update('color', color)" />
      </div>
      <div style="margin-top:24px">
        <div class="t-eyebrow" style="margin-bottom:10px">Members ({{ (g.members || []).length }})</div>
        <p class="t-muted" style="font-size:12px;margin:0 0 10px">Use a character/location/object's "Groups" button to add it here.</p>
        <div v-if="(g.members || []).length === 0" class="t-muted" style="font-size:12.5px;text-align:center;padding:24px 0;background:var(--surface-2);border-radius:8px">No members yet.</div>
        <div v-else style="display:grid;grid-template-columns:repeat(auto-fill, minmax(200px, 1fr));gap:10px">
          <div v-for="m in g.members" :key="`${m.kind}-${m.id}`"
            class="card tight" style="display:flex;align-items:center;gap:10px;padding:12px">
            <span style="width:32px;height:32px;border-radius:7px;background:var(--surface-3);color:var(--muted);display:grid;place-items:center">
              <Icon :name="KIND_ICON[m.kind] || 'Star'" :size="15" />
            </span>
            <span style="flex:1;min-width:0">
              <div style="font-weight:500;font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ m.name }}</div>
              <div class="t-muted" style="font-size:10.5px">{{ m.kind }}</div>
            </span>
            <button class="btn ghost sm" @click="project.removeGroupMember(g.id, m.id)">×</button>
          </div>
        </div>
      </div>
    </div>
  </div>
  <ImagesModal v-if="modal === 'images'" :entity-id="g.id" :entity-name="g.name" @close="modal = null" />
  <EventsModal v-if="modal === 'events'" :entity-id="g.id" :entity-name="g.name" @close="modal = null" />
</template>

<style scoped>
.group-pane-header .pane-title { gap: 2px; }
.group-name {
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
.group-name:hover { border-color: var(--border-soft); }
.group-name:focus { border-color: var(--accent); background: var(--surface); box-shadow: 0 0 0 3px var(--accent-soft); }

.group-swatches {
  display: flex; align-items: center; gap: 6px;
  margin-top: 10px;
  flex-wrap: wrap;
}
.group-swatches .t-eyebrow { margin-right: 4px; }
.group-swatch {
  appearance: none; border: 0;
  width: 20px; height: 20px;
  border-radius: 5px;
  cursor: default;
  box-shadow: inset 0 0 0 1px rgba(0,0,0,0.08);
  transition: transform .08s ease;
}
.group-swatch:hover { transform: scale(1.1); }
.group-swatch.active {
  box-shadow: inset 0 0 0 1px rgba(0,0,0,0.08), 0 0 0 2px var(--surface), 0 0 0 4px var(--accent);
}
</style>
