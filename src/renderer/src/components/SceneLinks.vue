<script setup>
// Per-scene "Links" panel (modeled on bibisco's scene tags). Lets the
// writer associate a scene with POV, characters, locations, objects,
// a date, and strands. Everything is persisted onto the scene record
// via the existing updateScene store action.

import { computed } from "vue";
import { useProjectStore } from "../stores/project.js";
import { promptDialog } from "../services/dialog.js";
import Icon from "./Icon.vue";

const props = defineProps({
  chapterId: { type: String, required: true },
  sceneId:   { type: String, required: true },
});
const emit = defineEmits(["close"]);

const project = useProjectStore();

const scene = computed(() => {
  const list = project.scenesFor(props.chapterId);
  return list.find((s) => s.id === props.sceneId) || null;
});

const POV_OPTIONS = [
  { value: "first",            label: "First person" },
  { value: "secondary-first",  label: "Secondary first person" },
  { value: "limited-third",    label: "Limited third person" },
  { value: "omniscient-third", label: "Omniscient third person" },
  { value: "objective-third",  label: "Objective third person" },
  { value: "second",           label: "Second person" },
];

function update(patch) {
  if (!scene.value) return;
  project.updateScene(props.chapterId, props.sceneId, patch);
}

// ── POV (single-select) ──────────────────────────────────
function setPov(value) {
  update({ pov: scene.value.pov === value ? null : value });
}

// ── Multi-select helpers for entities ────────────────────
function getList(field) {
  return Array.isArray(scene.value?.[field]) ? scene.value[field] : [];
}
function toggle(field, id) {
  const current = getList(field);
  const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
  update({ [field]: next });
}

// ── Inline entity creation ───────────────────────────────
async function newCharacter(main) {
  const name = await promptDialog({
    title: main ? "New main character" : "New secondary character",
    label: "Character name",
    placeholder: "e.g. Mira Halden",
    confirmLabel: "Create",
  });
  if (!name) return;
  const id = project.addCharacter({ name, main: !!main });
  toggle("characters", id);
}
async function newLocation() {
  const name = await promptDialog({
    title: "New location",
    label: "Location name",
    placeholder: "e.g. Brackish Cove",
    confirmLabel: "Create",
  });
  if (!name) return;
  const id = project.addLocation({ name });
  toggle("locations", id);
}
async function newObject() {
  const name = await promptDialog({
    title: "New object",
    label: "Object name",
    placeholder: "e.g. The Ledger",
    confirmLabel: "Create",
  });
  if (!name) return;
  const id = project.addObject({ name });
  toggle("objects", id);
}
async function newStrand() {
  const name = await promptDialog({
    title: "New narrative strand",
    label: "Narrative strand name",
    placeholder: "e.g. The Map Plot",
    confirmLabel: "Create",
  });
  if (!name) return;
  const id = project.addPlotline({ name });
  toggle("plotlines", id);
}

const mainCharacters      = computed(() => project.characters.filter((c) => c.main));
const secondaryCharacters = computed(() => project.characters.filter((c) => !c.main));

function onBackdrop(e) {
  if (e.target === e.currentTarget) emit("close");
}
</script>

<template>
  <div class="links-overlay" @mousedown="onBackdrop">
    <div class="links-panel">
      <header class="links-head">
        <h2>Links</h2>
        <button class="btn ghost icon" title="Close" @click="emit('close')">×</button>
      </header>

      <div class="links-body scrollarea">
        <!-- POV -->
        <section class="links-section">
          <div class="links-section-label">From which point of view is the scene narrated?</div>
          <div class="links-row">
            <button v-for="opt in POV_OPTIONS" :key="opt.value"
              type="button"
              class="link-chip"
              :class="{ active: scene?.pov === opt.value }"
              @click="setPov(opt.value)">
              {{ opt.label }}
            </button>
          </div>
        </section>

        <!-- Characters -->
        <section class="links-section">
          <div class="links-section-label">Which characters appear in this scene?</div>
          <div class="links-row">
            <button v-for="c in mainCharacters" :key="c.id"
              type="button"
              class="link-chip"
              :class="{ active: getList('characters').includes(c.id) }"
              @click="toggle('characters', c.id)">
              {{ c.name }}
            </button>
            <button v-for="c in secondaryCharacters" :key="c.id"
              type="button"
              class="link-chip"
              :class="{ active: getList('characters').includes(c.id) }"
              @click="toggle('characters', c.id)">
              {{ c.name }}
            </button>
            <button type="button" class="link-chip link-chip-new" @click="newCharacter(true)">
              new main character
            </button>
            <button type="button" class="link-chip link-chip-new" @click="newCharacter(false)">
              new secondary character
            </button>
          </div>
        </section>

        <!-- Locations -->
        <section class="links-section">
          <div class="links-section-label">Where is this scene located?</div>
          <div class="links-row">
            <button v-for="l in project.locations" :key="l.id"
              type="button"
              class="link-chip"
              :class="{ active: getList('locations').includes(l.id) }"
              @click="toggle('locations', l.id)">
              {{ l.name }}<span v-if="l.kind" class="link-chip-sub"> ({{ l.kind }})</span>
            </button>
            <button type="button" class="link-chip link-chip-new" @click="newLocation">
              new location
            </button>
          </div>
        </section>

        <!-- Objects -->
        <section class="links-section">
          <div class="links-section-label">Objects</div>
          <div class="links-row">
            <button v-for="o in project.objects" :key="o.id"
              type="button"
              class="link-chip"
              :class="{ active: getList('objects').includes(o.id) }"
              @click="toggle('objects', o.id)">
              {{ o.name }}
            </button>
            <button type="button" class="link-chip link-chip-new" @click="newObject">
              new object
            </button>
          </div>
        </section>

        <!-- When -->
        <section class="links-section">
          <div class="links-section-label">When does this scene take place?</div>
          <div class="links-row links-row-when">
            <input type="text" class="link-when-input"
              :value="scene?.when || ''"
              placeholder="e.g. Tuesday morning · 1843 · the harbour year"
              @input="update({ when: $event.target.value })" />
            <div class="link-when-cal">
              <button type="button" class="link-chip"
                :class="{ active: (scene?.calendarKind || 'gregorian') === 'gregorian' }"
                @click="update({ calendarKind: 'gregorian' })">
                gregorian calendar
              </button>
              <button type="button" class="link-chip"
                :class="{ active: scene?.calendarKind === 'alternative' }"
                @click="update({ calendarKind: 'alternative' })">
                alternative calendar
              </button>
            </div>
          </div>
        </section>

        <!-- Strands -->
        <section class="links-section">
          <div class="links-section-label">To which narrative strand does this scene belong?</div>
          <div class="links-row">
            <button v-for="s in project.plotlines" :key="s.id"
              type="button"
              class="link-chip"
              :class="{ active: getList('plotlines').includes(s.id) }"
              @click="toggle('plotlines', s.id)">
              {{ s.name }}
            </button>
            <button type="button" class="link-chip link-chip-new" @click="newStrand">
              new narrative strand
            </button>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.links-overlay {
  position: fixed; inset: 0;
  background: rgba(0, 0, 0, 0.45);
  z-index: 200;
  display: grid; place-items: center;
  padding: 24px;
}
.links-panel {
  background: var(--surface);
  border: 1px solid var(--border-strong);
  border-radius: 12px;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.25);
  width: 100%;
  max-width: 920px;
  max-height: calc(100vh - 48px);
  display: flex; flex-direction: column;
  min-height: 0;
}
.links-head {
  display: flex; align-items: center;
  padding: 16px 22px;
  border-bottom: 1px solid var(--border);
}
.links-head h2 {
  flex: 1;
  margin: 0;
  font-family: var(--font-serif);
  font-size: 24px; font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--ink);
}
.links-body {
  flex: 1; min-height: 0;
  padding: 18px 22px 32px;
  display: flex; flex-direction: column;
  gap: 22px;
}

.links-section {
  display: flex; flex-direction: column;
  gap: 10px;
  border-left: 3px solid var(--border);
  padding-left: 16px;
}
.links-section-label {
  font-size: 13.5px;
  font-style: italic;
  color: var(--ink-2);
  font-family: var(--font-serif);
}
.links-row {
  display: flex; flex-wrap: wrap; gap: 8px;
  padding-left: 60px;
}

.link-chip {
  appearance: none;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 6px 12px;
  font: inherit;
  font-size: 12.5px;
  color: var(--ink-2);
  cursor: pointer;
  transition: background .12s ease, border-color .12s ease, color .12s ease;
}
.link-chip:hover {
  background: var(--surface-3);
  border-color: var(--border-strong);
  color: var(--ink);
}
.link-chip.active {
  background: var(--accent-soft);
  border-color: var(--accent);
  color: var(--accent-ink);
  font-weight: 500;
}
.link-chip-sub {
  color: var(--muted);
  font-size: 11px;
}
.link-chip-new {
  background: var(--surface);
  border-style: dashed;
  color: var(--accent);
  border-color: var(--accent-line, var(--border-strong));
}
.link-chip-new:hover {
  background: var(--accent-soft);
  color: var(--accent-ink);
}

.links-row-when {
  align-items: center;
  gap: 18px;
}
.link-when-input {
  appearance: none;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 8px 12px;
  font: inherit;
  font-size: 13px;
  color: var(--ink);
  min-width: 280px;
  flex: 1;
  outline: none;
}
.link-when-input:focus { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-soft); }
.link-when-cal { display: inline-flex; gap: 6px; flex-shrink: 0; }
</style>
