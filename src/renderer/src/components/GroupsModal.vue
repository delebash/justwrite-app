<script setup>
import { computed } from "vue";
import { useProjectStore } from "../stores/project.js";
import { promptDialog, confirmDialog } from "../services/dialog.js";
import Icon from "./Icon.vue";
import AppModal from "./AppModal.vue";

const props = defineProps({
  entityId: { type: String, required: true },
  entityName: { type: String, default: "Item" },
  entityKind: { type: String, default: "character" },
});
const emit = defineEmits(["close"]);
const project = useProjectStore();
const groups = computed(() => project.groups);
const inGroup = (g) => (g.members || []).some((m) => m.kind === props.entityKind && m.id === props.entityId);

function toggle(group) {
  if (inGroup(group)) project.removeGroupMember(group.id, props.entityKind, props.entityId);
  else project.addGroupMember(group.id, { kind: props.entityKind, id: props.entityId, name: props.entityName });
}

// Create a group and drop the current item straight into it — that's the
// whole reason you'd reach for "New group" from this popup.
async function createGroup() {
  const name = await promptDialog({
    title: "New group",
    label: "Group name",
    placeholder: "e.g. The Cartographers' Guild",
    confirmLabel: "Create group",
  });
  if (!name) return;
  const id = project.addGroup({ name });
  project.addGroupMember(id, { kind: props.entityKind, id: props.entityId, name: props.entityName });
}

async function deleteGroup(group) {
  const yes = await confirmDialog({
    title: `Delete "${group.name}"?`,
    message: "This removes the group from the whole project, not just this item.",
    confirmLabel: "Delete group",
    danger: true,
  });
  if (!yes) return;
  project.removeGroup(group.id);
}
</script>

<template>
  <AppModal eyebrow="Groups" :title="entityName" @close="emit('close')">
    <p class="t-muted" style="font-size:12px;margin:0 0 12px">
      Toggle {{ entityName }} in or out of any group.
    </p>
    <div v-if="groups.length === 0" class="t-muted" style="font-size:12.5px;text-align:center;padding:18px 0">
      No groups yet — create one below.
    </div>
    <div v-else style="display:flex;flex-direction:column;gap:6px">
      <div v-for="g in groups" :key="g.id"
        class="group-row" :class="{ active: inGroup(g) }">
        <button class="group-toggle" @click="toggle(g)">
          <span style="width:10px;height:10px;border-radius:50%" :style="{ background: g.color }" />
          <span style="font-weight:500;font-size:13px">{{ g.name }}</span>
          <span class="t-muted" style="font-size:11px">{{ (g.members || []).length }} members</span>
          <Icon :name="inGroup(g) ? 'Check' : 'Plus'" :size="13" />
        </button>
        <button class="group-del" v-tooltip.bottom="'Delete group'" @click="deleteGroup(g)">
          <Icon name="Trash" :size="13" />
        </button>
      </div>
    </div>
    <button class="group-new" @click="createGroup">
      <Icon name="Plus" :size="13" /> New group
    </button>
  </AppModal>
</template>

<style>
.group-row { display: flex; align-items: center; gap: 6px; }
.group-toggle { flex: 1; min-width: 0; display: grid; grid-template-columns: auto 1fr auto auto; gap: 10px; align-items: center; border: 1px solid var(--border); background: var(--surface); border-radius: 8px; padding: 10px 12px; text-align: left; }
.group-toggle:hover { background: var(--surface-3); }
.group-row.active .group-toggle { border-color: var(--accent); background: var(--accent-soft); color: var(--accent-ink); }
.group-row.active .group-toggle:hover { background: var(--accent-soft); }
.group-del { flex-shrink: 0; width: 36px; align-self: stretch; display: grid; place-items: center; border: 1px solid var(--border); background: var(--surface); border-radius: 8px; color: var(--muted); }
.group-del:hover { color: var(--danger-ink, #c0392b); background: var(--surface-3); border-color: var(--border-strong); }
.group-new { display: flex; align-items: center; justify-content: center; gap: 6px; width: 100%; margin-top: 12px; padding: 9px 12px; border: 1.5px dashed var(--border-strong); background: var(--surface-2); border-radius: 8px; color: var(--ink-2); font-size: 12.5px; font-weight: 500; }
.group-new:hover { background: var(--surface-3); color: var(--ink); }
</style>
