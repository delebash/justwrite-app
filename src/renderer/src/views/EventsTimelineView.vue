<script setup>
import { computed } from "vue";
import { useRouter } from "vue-router";
import { useProjectStore } from "../stores/project.js";
import { EVENTS_KIND_META } from "../services/eventsKind.js";
import Icon from "../components/Icon.vue";
import Breadcrumb from "../components/Breadcrumb.vue";

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
]);

const events = computed(() => project.eventsFor(props.entityId));
const sortedEvents = computed(() => {
  const list = [...events.value];
  return list.sort((a, b) => {
    const ta = parseTs(a.when);
    const tb = parseTs(b.when);
    if (ta === null && tb === null) return 0;
    if (ta === null) return 1;
    if (tb === null) return -1;
    return ta - tb;
  });
});

function parseTs(when) {
  if (!when) return null;
  const t = new Date(when).getTime();
  return Number.isFinite(t) ? t : null;
}
function formatWhen(when) {
  if (!when) return { weekday: "", date: "—", time: "" };
  const d = new Date(when);
  if (Number.isNaN(d.getTime())) return { weekday: "", date: when, time: "" };
  return {
    weekday: d.toLocaleDateString(undefined, { weekday: "long" }),
    date:    d.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" }),
    time:    d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }),
  };
}

function remove(eventId) { project.removeEvent(props.entityId, eventId); }
function goEdit(eventId) { router.push(meta.value.editUrl(props.entityId, eventId)); }
function goBack()        { router.push(meta.value.detailUrl(props.entityId)); }
function goAdd()         { router.push(meta.value.newUrl(props.entityId)); }
</script>

<template>
  <header class="pane-header">
    <div class="pane-title">
      <Breadcrumb :segments="crumbs" />
      <h1 class="pane-h1">Events</h1>
    </div>
    <div class="pane-actions">
      <button class="btn ghost sm" @click="goBack">
        <Icon name="ChevRight" :size="12" style="transform:rotate(180deg)" />
        Back to {{ meta?.label }}
      </button>
      <button class="btn primary" @click="goAdd">
        <Icon name="Plus" :size="13" /> Add event
      </button>
    </div>
  </header>

  <div class="pane-card">
  <div class="scrollarea events-pane">
    <div class="events-content">
      <p class="events-subtitle">Events for {{ name }}</p>

      <section v-if="sortedEvents.length === 0" class="events-empty">
        No events yet. Click <strong>Add event</strong> to start the timeline.
      </section>

      <section v-else class="timeline">
        <article v-for="ev in sortedEvents" :key="ev.id" class="timeline-row">
          <div class="timeline-when">
            <span class="when-weekday">{{ formatWhen(ev.when).weekday }}</span>
            <span class="when-date">{{ formatWhen(ev.when).date }}</span>
            <span class="when-time">{{ formatWhen(ev.when).time }}</span>
          </div>
          <div class="timeline-spine" aria-hidden="true">
            <span class="timeline-dot" />
          </div>
          <div class="timeline-card">
            <div class="timeline-card-title">{{ ev.title || "Untitled event" }}</div>
            <div v-if="ev.note" class="timeline-card-note">{{ ev.note }}</div>
            <div class="timeline-card-actions">
              <button class="btn ghost sm" @click="goEdit(ev.id)">edit</button>
              <button class="btn ghost sm" @click="remove(ev.id)">delete</button>
            </div>
          </div>
        </article>
      </section>
    </div>
  </div>
  </div>
</template>

<style scoped>
/* Shared events-timeline styles (.events-*, .timeline-*) live in the
   global stylesheet. Only the edit/delete action buttons are local. */
.timeline-card-actions {
  margin-top: 8px;
  display: flex;
  gap: 6px;
}
.timeline-card-actions .btn {
  padding: 2px 8px;
  font-size: 11.5px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--ink-2);
  border-radius: 4px;
}
.timeline-card-actions .btn:hover {
  background: var(--surface-2);
  color: var(--ink);
  border-color: var(--border-strong);
}
</style>
