<script setup>
import { computed, ref, watch, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useProjectStore } from "../stores/project.js";
import { EVENTS_KIND_META } from "../services/eventsKind.js";
import { Icon } from "@delebash/llm-ui";
import Breadcrumb from "../components/Breadcrumb.vue";
import DateTimePicker from "../components/DateTimePicker.vue";
import { UiInput } from "@delebash/llm-ui";
import { UiTextarea } from "@delebash/llm-ui";
import { UiButton } from "@delebash/llm-ui";

const props = defineProps({
  kind:     { type: String, required: true },
  entityId: { type: String, required: true },
  eventId:  { type: String, required: true },
});

const project = useProjectStore();
const router  = useRouter();

const meta   = computed(() => EVENTS_KIND_META[props.kind]);
const entity = computed(() => meta.value?.getEntity(project, props.entityId));
const name   = computed(() => meta.value?.entityName(entity.value));

const crumbs = computed(() => [
  { label: meta.value?.label, to: meta.value?.sectionUrl() },
  { label: name.value, to: meta.value?.detailUrl(props.entityId) },
  { label: "Events", to: meta.value?.eventsUrl(props.entityId) },
]);

const ev = computed(() =>
  project.eventsFor(props.entityId).find((e) => e.id === props.eventId) || null
);

const whenStr  = ref("");
const titleStr = ref("");
const noteStr  = ref("");
const titleRef = ref(null);

watch(ev, (cur) => {
  if (!cur) return;
  whenStr.value  = cur.when || "";
  titleStr.value = cur.title || "";
  noteStr.value  = cur.note || "";
}, { immediate: true });

// Guard the focus call — if the route lands here with a stale eventId
// (e.g. the event was deleted in another tab), `ev` resolves to null
// and the title input isn't rendered. Without the guard, the focus
// silently misses; with it, we just skip until ev shows up (the watch
// below also handles re-focusing when ev arrives later).
onMounted(() => { if (ev.value) titleRef.value?.focus?.(); });

function cancel() { router.push(meta.value.eventsUrl(props.entityId)); }
function save() {
  if (!ev.value) return;
  const title = titleStr.value.trim();
  if (!title) return;
  project.updateEvent(props.entityId, ev.value.id, {
    when:  whenStr.value.trim(),
    title,
    note:  noteStr.value.trim(),
  });
  router.push(meta.value.eventsUrl(props.entityId));
}
</script>

<template>
  <header class="pane-header">
    <div class="pane-title">
      <Breadcrumb :segments="crumbs" />
      <h1 class="pane-h1">Edit event</h1>
    </div>
    <div class="pane-actions">
      <UiButton intent="ghost" @click="cancel">Cancel</UiButton>
      <UiButton intent="primary" :disabled="!titleStr.trim()" @click="save">
        <Icon name="Check" :size="13" /> Save changes
      </UiButton>
    </div>
  </header>

  <div class="pane-card">
  <div class="scrollarea event-edit-pane">
    <div v-if="!ev" class="event-missing">
      That event no longer exists.
      <UiButton intent="secondary" size="small" style="margin-left:8px" @click="cancel">Back to timeline</UiButton>
    </div>
    <form v-else class="event-edit-form" @submit.prevent="save">
      <div class="field">
        <label class="field-label" for="event-edit-when">When</label>
        <DateTimePicker v-model="whenStr" input-id="event-edit-when" />
      </div>

      <label class="field">
        <span class="field-label">Title</span>
        <UiInput fluid ref="titleRef" v-model="titleStr" placeholder="What happened?" />
      </label>

      <label class="field">
        <span class="field-label">Notes</span>
        <UiTextarea fluid v-model="noteStr" rows="6"
          placeholder="Optional — anything you want to remember about this event." />
      </label>
    </form>
  </div>
  </div>
</template>

<style scoped>
.event-edit-pane { flex: 1; }
.event-edit-form {
  max-width: 720px;
  padding: 24px 28px 60px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.field { display: flex; flex-direction: column; gap: 6px; }
.field-label {
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--muted);
}
.event-missing {
  padding: 60px 28px;
  font-size: 13px;
  color: var(--muted);
  font-style: italic;
}
</style>
