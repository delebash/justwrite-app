<script setup>
import { computed, ref } from "vue";
import { useProjectStore } from "../stores/project.js";
import Icon from "./Icon.vue";
import AppModal from "./AppModal.vue";
import JwButton from "@renderer/components/ui/JwButton.vue";
import JwInput from "@renderer/components/ui/JwInput.vue";
import JwTextarea from "@renderer/components/ui/JwTextarea.vue";

const props = defineProps({
  entityId: { type: String, required: true },
  entityName: { type: String, default: "Item" },
});
const emit = defineEmits(["close"]);
const project = useProjectStore();
const events = computed(() => project.eventsFor(props.entityId));
const draftWhen = ref(""), draftTitle = ref(""), draftNote = ref("");

function addEvent() {
  if (!draftTitle.value.trim()) return;
  project.addEvent(props.entityId, { when: draftWhen.value, title: draftTitle.value, note: draftNote.value });
  draftWhen.value = ""; draftTitle.value = ""; draftNote.value = "";
}
</script>

<template>
  <AppModal eyebrow="Events" :title="entityName" @close="emit('close')">
    <div class="event-form">
      <JwInput class="input" v-model="draftWhen" placeholder="When (e.g. Ch. 7, age 9)" />
      <JwInput class="input" v-model="draftTitle" placeholder="Event title" @keydown.enter="addEvent" />
      <JwTextarea class="input" v-model="draftNote" placeholder="Notes (optional)" :rows="2" />
      <JwButton intent="primary" :disabled="!draftTitle.trim()" @click="addEvent">
        <Icon name="Plus" :size="12" /> Add event
      </JwButton>
    </div>
    <div v-if="events.length === 0" class="t-muted" style="font-size:12.5px;text-align:center;padding:24px 0">
      No events yet.
    </div>
    <div v-else style="display:flex;flex-direction:column;gap:10px">
      <div v-for="ev in events" :key="ev.id"
        style="display:grid;grid-template-columns:120px 1fr auto;gap:10px;align-items:flex-start;padding:10px;border:1px solid var(--border);border-radius:8px;background:var(--surface-2)">
        <JwInput class="input" :value="ev.when" placeholder="—"
          @input="project.updateEvent(entityId, ev.id, { when: $event.target.value })" />
        <div style="display:flex;flex-direction:column;gap:6px">
          <JwInput class="input" :value="ev.title"
            @input="project.updateEvent(entityId, ev.id, { title: $event.target.value })" />
          <JwTextarea class="input" :value="ev.note" :rows="2" placeholder="Notes…"
            @input="project.updateEvent(entityId, ev.id, { note: $event.target.value })" />
        </div>
        <JwButton intent="ghost" size="small" aria-label="Remove event" v-tooltip.bottom="'Remove event'" @click="project.removeEvent(entityId, ev.id)">×</JwButton>
      </div>
    </div>
  </AppModal>
</template>

<style>
.event-form { display: grid; gap: 6px; margin-bottom: 18px; padding-bottom: 18px; border-bottom: 1px solid var(--border-soft); }
</style>
