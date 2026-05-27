<script setup>
import { computed } from "vue";
import { useProjectStore } from "../stores/project.js";
import Icon from "./Icon.vue";

const props = defineProps({
  entityId: { type: String, required: true },
  entityName: { type: String, default: "Item" },
  entityKind: { type: String, default: "character" },
});
const emit = defineEmits(["close"]);
const project = useProjectStore();
const groups = computed(() => project.groups);
const inGroup = (g) => (g.members || []).some((m) => m.id === props.entityId);

function toggle(group) {
  if (inGroup(group)) project.removeGroupMember(group.id, props.entityId);
  else project.addGroupMember(group.id, { kind: props.entityKind, id: props.entityId, name: props.entityName });
}
</script>

<template>
  <div class="modal-overlay" @click.self="emit('close')">
    <div class="modal">
      <div class="modal-head">
        <div>
          <div class="t-eyebrow">Groups</div>
          <div class="modal-title">{{ entityName }}</div>
        </div>
        <button class="btn ghost sm" @click="emit('close')">Close</button>
      </div>
      <div class="modal-body">
        <p class="t-muted" style="font-size:12px;margin:0 0 12px">
          Toggle {{ entityName }} in or out of any group.
        </p>
        <div v-if="groups.length === 0" class="t-muted" style="font-size:12.5px;text-align:center;padding:24px 0">
          No groups yet.
        </div>
        <div v-else style="display:flex;flex-direction:column;gap:6px">
          <button v-for="g in groups" :key="g.id"
            class="group-row" :class="{ active: inGroup(g) }" @click="toggle(g)">
            <span style="width:10px;height:10px;border-radius:50%" :style="{ background: g.color }" />
            <span style="font-weight:500;font-size:13px">{{ g.name }}</span>
            <span class="t-muted" style="font-size:11px">{{ (g.members || []).length }} members</span>
            <Icon :name="inGroup(g) ? 'Check' : 'Plus'" :size="13" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style>
.group-row { display: grid; grid-template-columns: auto 1fr auto auto; gap: 10px; align-items: center; border: 1px solid var(--border); background: var(--surface); border-radius: 8px; padding: 10px 12px; text-align: left; }
.group-row.active { border-color: var(--accent); background: var(--accent-soft); color: var(--accent-ink); }
.group-row:hover { background: var(--surface-3); }
.group-row.active:hover { background: var(--accent-soft); }
</style>
