<script setup>
import { computed } from "vue";
import { useRouter } from "vue-router";
import { useProjectStore } from "../stores/project.js";
import { EVENTS_KIND_META } from "../services/eventsKind.js";
import Icon from "../components/Icon.vue";

const props = defineProps({
  kind:     { type: String, required: true },
  entityId: { type: String, required: true },
});

const project = useProjectStore();
const router  = useRouter();

const meta   = computed(() => EVENTS_KIND_META[props.kind]);
const entity = computed(() => meta.value?.getEntity(project, props.entityId));
const name   = computed(() => meta.value?.entityName(entity.value));

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
      <span class="pane-eyebrow">{{ meta?.label }} · {{ name }}</span>
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
.events-pane { flex: 1; }
.events-content {
  max-width: 1100px;
  padding: 18px 26px 60px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.events-subtitle {
  font-family: var(--font-serif);
  font-style: italic;
  font-size: 13.5px;
  color: var(--ink-2);
  border-left: 3px solid var(--border);
  padding: 4px 0 4px 12px;
  margin: 0;
}

.events-empty {
  padding: 40px 24px;
  text-align: center;
  font-size: 13px;
  color: var(--muted);
  font-style: italic;
  background: var(--surface-2);
  border: 1px dashed var(--border-strong);
  border-radius: 10px;
  line-height: 1.55;
}

.timeline {
  display: flex;
  flex-direction: column;
  gap: 36px;
  padding: 24px 0 12px;
}
.timeline-row {
  display: grid;
  grid-template-columns: minmax(220px, 1fr) 24px minmax(280px, 2fr);
  align-items: center;
  gap: 0;
}

.timeline-when {
  display: flex;
  align-items: baseline;
  gap: 8px;
  justify-content: flex-end;
  padding-right: 18px;
  font-family: var(--font-serif);
  flex-wrap: wrap;
}
.when-weekday { font-size: 14px; color: var(--muted); }
.when-date {
  font-family: var(--font-mono);
  font-size: 22px;
  font-weight: 500;
  color: var(--ink);
  letter-spacing: -0.01em;
}
.when-time { font-family: var(--font-mono); font-size: 13.5px; color: var(--muted); }

.timeline-spine {
  position: relative;
  align-self: stretch;
  display: flex;
  justify-content: center;
}
.timeline-spine::before {
  content: "";
  position: absolute;
  top: -36px;
  bottom: -36px;
  width: 1px;
  background: var(--border);
}
.timeline-row:first-child .timeline-spine::before { top: 0; }
.timeline-row:last-child .timeline-spine::before  { bottom: 50%; }
.timeline-dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--accent);
  border: 2px solid var(--surface);
  box-shadow: 0 0 0 1px var(--accent);
  z-index: 1;
}

.timeline-card {
  position: relative;
  margin-left: 18px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 14px 16px 12px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
}
.timeline-card::before {
  content: "";
  position: absolute;
  top: 18px;
  left: -8px;
  width: 8px; height: 16px;
  background: var(--surface);
  border-left: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  transform: rotate(45deg) translate(2px, -2px);
  transform-origin: 0 100%;
  border-radius: 0 0 0 3px;
}
.timeline-card-title {
  font-family: var(--font-serif);
  font-size: 14.5px;
  font-weight: 600;
  color: var(--accent);
  letter-spacing: -0.005em;
}
.timeline-card-note {
  margin-top: 6px;
  font-size: 13px;
  color: var(--ink-2);
  line-height: 1.55;
  white-space: pre-wrap;
}
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
