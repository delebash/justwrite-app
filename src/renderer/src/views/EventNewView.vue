<script setup>
import { computed, ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useProjectStore } from "../stores/project.js";
import { EVENTS_KIND_META } from "../services/eventsKind.js";
import Icon from "../components/Icon.vue";
import Breadcrumb from "../components/Breadcrumb.vue";
import DateTimePicker from "../components/DateTimePicker.vue";

const props = defineProps({
  kind:     { type: String, required: true },
  entityId: { type: String, required: true },
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

const whenStr  = ref("");
const titleStr = ref("");
const noteStr  = ref("");
const titleRef = ref(null);

onMounted(() => { titleRef.value?.focus?.(); });

function cancel() { router.push(meta.value.eventsUrl(props.entityId)); }
function save() {
  const title = titleStr.value.trim();
  if (!title) return;
  project.addEvent(props.entityId, {
    when: whenStr.value.trim(),
    title,
    note: noteStr.value.trim(),
  });
  router.push(meta.value.eventsUrl(props.entityId));
}
</script>

<template>
  <header class="pane-header">
    <div class="pane-title">
      <Breadcrumb :segments="crumbs" />
      <h1 class="pane-h1">New event</h1>
    </div>
    <div class="pane-actions">
      <button class="btn ghost" @click="cancel">Cancel</button>
      <button class="btn primary" :disabled="!titleStr.trim()" @click="save">
        <Icon name="Plus" :size="13" /> Add event
      </button>
    </div>
  </header>

  <div class="pane-card">
  <div class="scrollarea event-new-pane">
    <form class="event-new-form" @submit.prevent="save">
      <div class="field">
        <span class="field-label">When</span>
        <DateTimePicker v-model="whenStr" />
      </div>

      <label class="field">
        <span class="field-label">Title</span>
        <input class="input" ref="titleRef" v-model="titleStr" placeholder="What happened?" />
      </label>

      <label class="field">
        <span class="field-label">Notes</span>
        <textarea class="input" v-model="noteStr" rows="6"
          placeholder="Optional — anything you want to remember about this event."></textarea>
      </label>
    </form>
  </div>
  </div>
</template>

<style scoped>
.event-new-pane { flex: 1; }
.event-new-form {
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
</style>
