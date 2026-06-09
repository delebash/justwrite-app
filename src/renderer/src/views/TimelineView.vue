<script setup>
// Project-wide timeline — a read-only, chronological summary of every
// event across all entities (characters, locations, objects, groups, and
// the Setting). Styled like the per-entity events timeline. Each event
// links to its editor; the owning entity ("location") shows underneath
// and links to that entity. Editing/deleting happens on the entity pages.

import { computed } from "vue";
import { useRouter } from "vue-router";
import { useProjectStore } from "../stores/project.js";
import { EVENTS_KIND_META } from "../services/eventsKind.js";
import PaneHeader from "../components/PaneHeader.vue";
import Icon from "../components/Icon.vue";

const project = useProjectStore();
const router = useRouter();

const KIND_ICON = { character: "Users", location: "Pin", object: "Cube", group: "GroupIcon", setting: "Building" };

// Every entity kind that can hold events, flattened to a list of owners.
const owners = computed(() => {
  const list = [
    ...project.characters.map((e) => ({ kind: "character", id: e.id, name: e.name })),
    ...project.locations.map((e) => ({ kind: "location", id: e.id, name: e.name })),
    ...project.objects.map((e) => ({ kind: "object", id: e.id, name: e.name })),
    ...project.groups.map((e) => ({ kind: "group", id: e.id, name: e.name })),
  ];
  const setting = project.architecture?.setting;
  if (setting) list.push({ kind: "setting", id: "setting", name: setting.title || "Setting" });
  return list;
});

const allEvents = computed(() => {
  const out = [];
  for (const o of owners.value) {
    for (const ev of project.eventsFor(o.id)) {
      out.push({ ...ev, ownerKind: o.kind, ownerId: o.id, ownerName: o.name });
    }
  }
  return out.sort((a, b) => {
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

function ownerLabel(kind) { return EVENTS_KIND_META[kind]?.label || kind; }
function goEvent(ev) { router.push(EVENTS_KIND_META[ev.ownerKind].editUrl(ev.ownerId, ev.id)); }
function goOwner(ev) { router.push(EVENTS_KIND_META[ev.ownerKind].detailUrl(ev.ownerId)); }
</script>

<template>
  <PaneHeader :eyebrow="$t('panes.timeline.eyebrow')" :title="$t('panes.timeline.title')" help-key="plot-and-time#the-timeline-view-your-worlds-history" />
  <div class="pane-card">
    <div class="scrollarea events-pane">
      <div class="events-content">
        <p class="tl-desc">
          The <strong>Timeline</strong> is a merged, read-only view of every event across every
          character, location, object, group, and the world Setting — sorted chronologically. Click
          any event title to edit it; click the entity badge on the right to jump to that entity's
          page. You add events from each entity's <strong>Events</strong> button; the Timeline
          collects them automatically.
        </p>

        <section v-if="allEvents.length === 0" class="events-empty">
          <div style="font-size:14px;color:var(--ink);margin-bottom:6px">No events yet.</div>
          <div style="font-size:12.5px;max-width:400px">Events from characters, locations, objects, groups, and the Setting all gather here in chronological order. Add them via each entity's Events button.</div>
        </section>

        <section v-else class="timeline">
          <article v-for="ev in allEvents" :key="`${ev.ownerId}:${ev.id}`" class="timeline-row">
            <div class="timeline-when tl-when-click" role="button" tabindex="0"
              :aria-label="`Open ${ev.title || 'event'}`"
              v-tooltip.bottom="`Open ${ev.title || 'event'}`"
              @click="goEvent(ev)"
              @keydown.enter.prevent="goEvent(ev)"
              @keydown.space.prevent="goEvent(ev)">
              <span class="when-weekday">{{ formatWhen(ev.when).weekday }}</span>
              <span class="when-date">{{ formatWhen(ev.when).date }}</span>
              <span class="when-time">{{ formatWhen(ev.when).time }}</span>
            </div>
            <div class="timeline-spine" aria-hidden="true">
              <span class="timeline-dot" />
            </div>
            <div class="timeline-card">
              <button type="button" class="timeline-card-title tl-link" @click="goEvent(ev)">
                {{ ev.title || "Untitled event" }}
              </button>
              <div v-if="ev.note" class="timeline-card-note">{{ ev.note }}</div>
              <button type="button" class="tl-owner" @click="goOwner(ev)">
                <Icon :name="KIND_ICON[ev.ownerKind] || 'Star'" :size="11" />
                {{ ownerLabel(ev.ownerKind) }} · {{ ev.ownerName }}
              </button>
            </div>
          </article>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Shared events-timeline styles (.events-*, .timeline-*) live in the
   global stylesheet. Only the read-only link affordances are local. */

/* Read-only links — date/time and title jump to the event, owner line to
   the entity. */
.tl-when-click { cursor: pointer; }
.tl-when-click:hover .when-date { color: var(--accent); }
.tl-link {
  appearance: none; background: none; border: 0; padding: 0;
  cursor: pointer; text-align: left;
  display: block;
}
.tl-link:hover { text-decoration: underline; }
.tl-owner {
  appearance: none; background: none; border: 0; padding: 0;
  cursor: pointer; text-align: left;
  margin-top: 10px;
  display: inline-flex; align-items: center; gap: 5px;
  font-size: 12px; font-weight: 500;
  color: var(--muted);
}
.tl-owner:hover { color: var(--accent); }
.tl-owner svg { opacity: 0.8; }

.tl-desc {
  font-size: 14px; line-height: 1.55; color: var(--muted);
  margin: 0 0 18px;
}
.tl-desc strong { color: var(--ink-2); font-weight: 600; }
</style>
