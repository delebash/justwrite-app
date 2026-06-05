<script setup>
import { computed, ref } from "vue";
import { useProjectStore } from "../stores/project.js";
import { useUiStore } from "../stores/ui.js";
import { useRouter } from "vue-router";
import Icon from "../components/Icon.vue";
import JwButton from "@renderer/components/ui/JwButton.vue";
import ImagesModal from "../components/ImagesModal.vue";
import RichEditor from "../components/RichEditor.vue";
import { EDITOR_TOOLBAR_SLIM } from "../services/editorToolbars.js";
import StatusSelect from "../components/StatusSelect.vue";
import MentionRefList from "../components/MentionRefList.vue";
import Breadcrumb from "../components/Breadcrumb.vue";
import { promptDialog } from "../services/dialog.js";
import { NEW_ENTITY_META } from "../services/entityMeta.js";
import JwColorPicker from "@renderer/components/ui/JwColorPicker.vue";
import JwCheckbox from "@renderer/components/ui/JwCheckbox.vue";

const props = defineProps({ id: { type: String, default: "" } });
const project = useProjectStore();
const ui = useUiStore();
const router = useRouter();
const g = computed(() => project.groupById(props.id || ui.selections.groups) || project.groups[0]);
const modal = ref(null);
const KIND_ICON = { character: "Users", location: "Pin", object: "Cube", strand: "Strands" };
const KIND_HEADING = { character: "Characters", location: "Locations", object: "Objects", strand: "Narrative strands" };
const KIND_ORDER = ["character", "location", "object", "strand"];
const KIND_ROUTE = { character: "characters", location: "locations", object: "objects", strand: "strands" };

function goMember(m) {
  const base = KIND_ROUTE[m.kind];
  if (!base) return;
  ui.select(base, m.id);
  router.push(`/${base}/${m.id}`);
}

const memberGroups = computed(() => {
  const byKind = new Map();
  for (const m of (g.value?.members || [])) {
    if (!byKind.has(m.kind)) byKind.set(m.kind, []);
    byKind.get(m.kind).push(m);
  }
  const kinds = [
    ...KIND_ORDER.filter((k) => byKind.has(k)),
    ...[...byKind.keys()].filter((k) => !KIND_ORDER.includes(k)),
  ];
  return kinds.map((kind) => ({ kind, label: KIND_HEADING[kind] || kind, members: byKind.get(kind) }));
});

function update(k, v) { project.updateGroup(g.value.id, { [k]: v }); }
async function addGroup() {
  const name = await promptDialog(NEW_ENTITY_META.groups);
  if (!name) return;
  const id = project.addGroup({ name }); ui.select("groups", id); router.push(`/groups/${id}`);
}
function deleteGroup() {
  project.removeGroup(g.value.id);
  const next = project.groups[0];
  if (next) { ui.select("groups", next.id); router.push(`/groups/${next.id}`); } else router.push("/");
}
</script>

<template>
  <header class="pane-header group-pane-header">
    <div class="pane-title">
      <Breadcrumb :segments="[{ label: 'Group', to: '/groups' }]" />
      <input v-if="g" class="group-name"
        :value="g.name"
        placeholder="Group name"
        @input="update('name', $event.target.value)" />
      <h1 v-else class="pane-h1">Groups</h1>
    </div>
    <div class="pane-actions">
      <JwButton intent="ghost" size="small" @click="modal = 'images'"><Icon name="Image" :size="14" /> Images</JwButton>
      <router-link :to="`/groups/${g.id}/events`" custom v-slot="{ navigate }">
        <JwButton intent="ghost" size="small" @click="navigate"><Icon name="Calendar" :size="14" /> Events</JwButton>
      </router-link>
      <JwButton intent="ghost" size="small" @click="deleteGroup">Delete</JwButton>
      <JwButton intent="primary" size="small" @click="addGroup"><Icon name="Plus" :size="14" /> New group</JwButton>
      <StatusSelect v-if="g" :model-value="g.status || ''" @update:model-value="(v) => update('status', v)" />
    </div>
  </header>
  <div class="pane-card">
    <div style="padding:24px 28px 40px;display:flex;flex-direction:column;gap:14px;flex:1;min-height:0">
      <p class="gr-desc">
        A <strong>group</strong> is a cluster of characters, locations, objects, or narrative
        strands that belong together — a faction, a family, a crew. Members are added from each
        entity's own <strong>Groups</strong> button; the page below collects everything that's
        been linked here, and shared membership draws edges between members in the
        <strong>Relations</strong> graph.
      </p>
      <RichEditor
        :model-value="g.blurb || ''"
        placeholder="Blurb"
        variant="inline"
        :toolbar="EDITOR_TOOLBAR_SLIM"
        :fill="true"
        @change="(html) => update('blurb', html)"
      />
      <div style="flex:3;min-height:0;overflow-y:auto">
      <div class="group-color-picker">
        <span class="t-eyebrow" style="font-size:10px;color:var(--muted)">Color</span>
        <JwColorPicker
          :model-value="g.color"
          aria-label="Group color"
          @update:model-value="update('color', $event)" />
        <label class="chip" style="cursor:pointer;gap:6px;margin-left:auto"
          v-tooltip.bottom="'Hides this entity from any AI feature that pulls in story-world context.'">
          <JwCheckbox :model-value="!!g.excludeFromAi" @update:model-value="(v) => update('excludeFromAi', v)" />
          Exclude from AI
        </label>
      </div>
      <div style="margin-top:24px">
        <div class="t-eyebrow" style="margin-bottom:10px">Members ({{ (g.members || []).length }})</div>
        <p class="t-muted" style="font-size:12px;margin:0 0 10px">Use characters/location/objects/narrative strands "Groups" button to add it here.</p>
        <div v-if="(g.members || []).length === 0" class="t-muted" style="font-size:12.5px;text-align:center;padding:24px 0;background:var(--surface-2);border-radius:8px">No members yet.</div>
        <div v-for="grp in memberGroups" :key="grp.kind" class="member-group">
          <div class="t-eyebrow member-group-head">{{ grp.label }} ({{ grp.members.length }})</div>
          <div class="member-grid">
            <div v-for="(m, mi) in grp.members" :key="`${m.kind}-${m.id}-${mi}`"
              class="card tight" style="display:flex;align-items:center;gap:10px;padding:12px">
              <JwButton intent="ghost" size="small" class="member-open" :title="`Open ${m.name}`" @click="goMember(m)">
                <template #icon><Icon :name="KIND_ICON[m.kind] || 'Star'" :size="15" /></template>
                {{ m.name }}
              </JwButton>
              <JwButton intent="ghost" size="small" v-tooltip.bottom="'Remove from group'" @click="project.removeGroupMember(g.id, m.kind, m.id)">×</JwButton>
            </div>
          </div>
        </div>
      </div>

      <div style="margin-top:24px">
        <div class="t-eyebrow" style="margin-bottom:10px">Mentioned in prose</div>
        <MentionRefList :entity-id="g.id" />
      </div>
      </div>
    </div>
  </div>
  <ImagesModal v-if="modal === 'images'" :entity-id="g.id" :entity-name="g.name" @close="modal = null" />
</template>

<style scoped>
.gr-desc {
  font-size: 14px; line-height: 1.55; color: var(--muted);
  margin: 0;
}
.gr-desc strong { color: var(--ink-2); font-weight: 600; }

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

.group-color-picker {
  display: flex; align-items: center; gap: 10px;
  margin-top: 10px;
}
.group-color-picker .t-eyebrow { margin-right: 4px; flex-shrink: 0; }

.member-group { margin-top: 18px; }
.member-group-head { margin-bottom: 8px; }
.member-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 10px;
}

/* Member → its detail page. The icon + name form one clickable target;
   the remove (×) button stays separate. */
.member-open {
  appearance: none; background: none; border: 0; padding: 0;
  flex: 1; min-width: 0; cursor: pointer;
  display: flex; align-items: center; gap: 10px;
  text-align: left; font: inherit; color: inherit;
}
.member-icon {
  width: 32px; height: 32px; border-radius: 7px;
  background: var(--surface-3); color: var(--muted);
  display: grid; place-items: center; flex: none;
  transition: background .12s ease, color .12s ease;
}
.member-name {
  flex: 1; min-width: 0;
  font-weight: 500; font-size: 12.5px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.member-open:hover .member-name { color: var(--accent); }
.member-open:hover .member-icon { background: var(--accent-soft); color: var(--accent-ink); }
</style>
