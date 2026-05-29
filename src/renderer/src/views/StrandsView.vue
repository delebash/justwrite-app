<script setup>
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { useProjectStore } from "../stores/project.js";
import { useUiStore } from "../stores/ui.js";
import PaneHeader from "../components/PaneHeader.vue";
import Icon from "../components/Icon.vue";
import RichEditor from "../components/RichEditor.vue";
import StatusSelect from "../components/StatusSelect.vue";
import SceneRefList from "../components/SceneRefList.vue";
import GroupsModal from "../components/GroupsModal.vue";
import { promptDialog, confirmDialog } from "../services/dialog.js";
import { NEW_ENTITY_META } from "../services/entityMeta.js";

const props = defineProps({ id: { type: String, default: "" } });
const project = useProjectStore();
const ui = useUiStore();
const router = useRouter();
const modal = ref(null);

// Show one strand at a time — selected from the route param, falling
// back to the sidebar selection, then the first strand.
const s = computed(() =>
  project.strandById(props.id || ui.selections.strands) || project.strands[0]);

const BEAT_PRESETS = [
  "Inciting", "First turn", "Midpoint",
  "Crisis", "Climax", "Resolution",
  "Setup", "Reveal", "Setback", "Refusal",
];

// Scenes whose Links → Strands selection includes this strand.
// Each row also carries its parent chapter so we can label/navigate.
const scenesInStrand = computed(() => {
  if (!s.value) return [];
  const out = [];
  for (const ch of project.allChapters) {
    const list = project.scenesFor(ch.id);
    list.forEach((scn, idx) => {
      if ((scn.strands || []).includes(s.value.id)) {
        out.push({
          sceneId: scn.id,
          sceneTitle: scn.title || `Scene ${idx + 1}`,
          sceneIdx: idx + 1,
          chapterId: ch.id,
          chapterTitle: ch.title,
          chapterNum: ch.num,
          chapterStatus: ch.status,
        });
      }
    });
  }
  return out;
});

function chapterById(id) { return project.chapterById(id); }
function update(k, v) { project.updateStrand(s.value.id, { [k]: v }); }
function updateBeat(beatId, k, v) { project.updateStrandBeat(s.value.id, beatId, { [k]: v }); }
function removeBeat(beatId) { project.removeStrandBeat(s.value.id, beatId); }

// Each scene picker option encodes both chapter and scene in one string
// ("chapterId::sceneId") so a flat <select> can drive both fields at once.
const sceneOptions = computed(() => {
  const out = [];
  for (const c of project.allChapters) {
    const scenes = project.scenesFor(c.id);
    if (!scenes.length) continue;
    scenes.forEach((scn, i) => {
      out.push({
        value: `${c.id}::${scn.id}`,
        label: `Ch. ${c.num} · Scene ${i + 1}${scn.title ? ` — ${scn.title}` : ""}`,
      });
    });
  }
  return out;
});
function sceneRefLabel(b) {
  const ch = chapterById(b.chapterId);
  if (!ch) return "(no chapter)";
  const scenes = project.scenesFor(b.chapterId);
  const idx = scenes.findIndex((s) => s.id === b.sceneId);
  if (idx < 0) return `Ch. ${ch.num} · ${ch.title}`;
  const scn = scenes[idx];
  return `Ch. ${ch.num} · Scene ${idx + 1}${scn.title ? ` — ${scn.title}` : ""}`;
}
function beatRefValue(b) {
  return b.chapterId && b.sceneId ? `${b.chapterId}::${b.sceneId}` : "";
}
function setBeatRef(beatId, encoded) {
  if (!encoded) {
    project.updateStrandBeat(s.value.id, beatId, { chapterId: null, sceneId: null });
    return;
  }
  const [chapterId, sceneId] = encoded.split("::");
  project.updateStrandBeat(s.value.id, beatId, { chapterId, sceneId });
}
function goBeat(b) {
  if (!b.chapterId) return;
  ui.select("chapters", b.chapterId);
  router.push(b.sceneId ? `/chapters/${b.chapterId}/${b.sceneId}` : `/chapters/${b.chapterId}`);
}

async function addStrand() {
  const name = await promptDialog(NEW_ENTITY_META.strands);
  if (!name) return;
  const id = project.addStrand({ name });
  ui.select("strands", id);
  router.push(`/strands/${id}`);
}

async function deleteStrand() {
  const used = scenesInStrand.value.length;
  const message = used
    ? `${used} scene${used === 1 ? " is" : "s are"} linked to this narrative strand. They'll lose the link (other narrative strand links on those scenes are kept).`
    : null;
  const yes = await confirmDialog({
    title: `Delete narrative strand "${s.value.name}"?`,
    message,
    confirmLabel: "Delete narrative strand",
    danger: true,
  });
  if (!yes) return;
  const removedId = s.value.id;
  project.removeStrand(removedId);
  const next = project.strands[0];
  if (next) { ui.select("strands", next.id); router.push(`/strands/${next.id}`); }
  else router.push("/strands");
}

async function addBeat() {
  const opts = sceneOptions.value;
  const values = await promptDialog({
    title: `New beat — ${s.value.name}`,
    confirmLabel: "Add beat",
    fields: [
      {
        key: "label",
        label: "Beat",
        placeholder: "e.g. Inciting, Midpoint, Climax",
      },
      {
        key: "ref",
        label: "Scene",
        type: "select",
        defaultValue: opts[0]?.value || "",
        options: opts,
      },
      {
        key: "note",
        label: "Note (optional)",
        placeholder: "What happens at this beat?",
        optional: true,
      },
    ],
  });
  if (!values) return;
  const [chapterId, sceneId] = (values.ref || "").split("::");
  project.addStrandBeat(s.value.id, {
    label: values.label,
    chapterId: chapterId || null,
    sceneId: sceneId || null,
    note: values.note || "",
  });
}

// Sort beats by (chapter order, scene index) so the list reads
// top-to-bottom in story order, finer-grained than chapter alone.
const sortedBeats = computed(() => {
  if (!s.value) return [];
  const chOrder = new Map(project.allChapters.map((c, i) => [c.id, i]));
  const sceneIdx = (b) => {
    if (!b.chapterId || !b.sceneId) return Number.POSITIVE_INFINITY;
    const list = project.scenesFor(b.chapterId);
    const i = list.findIndex((s) => s.id === b.sceneId);
    return i < 0 ? Number.POSITIVE_INFINITY : i;
  };
  return [...(s.value.beats || [])].sort((a, b) => {
    const ai = chOrder.has(a.chapterId) ? chOrder.get(a.chapterId) : Number.POSITIVE_INFINITY;
    const bi = chOrder.has(b.chapterId) ? chOrder.get(b.chapterId) : Number.POSITIVE_INFINITY;
    if (ai !== bi) return ai - bi;
    return sceneIdx(a) - sceneIdx(b);
  });
});
</script>

<template>
  <header class="pane-header strand-pane-header">
    <div class="pane-title">
      <span class="pane-eyebrow">Narrative strand</span>
      <input v-if="s" class="strand-name"
        :value="s.name"
        placeholder="Narrative strand name"
        @input="update('name', $event.target.value)" />
      <h1 v-else class="pane-h1">Narrative strands</h1>
    </div>
    <div class="pane-actions">
      <button v-if="s" class="btn ghost sm" @click="modal = 'groups'"><Icon name="GroupIcon" :size="14" /> Groups</button>
      <button v-if="s" class="btn ghost sm" @click="deleteStrand">Delete</button>
      <button class="btn primary sm" @click="addStrand"><Icon name="Plus" :size="14" /> New narrative strand</button>
      <StatusSelect v-if="s" :model-value="s.status || ''" @update:model-value="(v) => update('status', v)" />
    </div>
  </header>

  <div v-if="!s" class="pane-card">
    <div class="strand-empty scrollarea">
      No narrative strands yet. Click <strong>New narrative strand</strong> to add one.
    </div>
  </div>

  <div v-else class="pane-card">
    <div class="strand-body">
          <textarea class="strand-blurb"
            :value="s.blurb || ''"
            placeholder="What is this narrative strand about? (One or two sentences)"
            rows="2"
            @input="update('blurb', $event.target.value)" />

          <div class="strand-meta-row">
            <span class="strand-count">
              {{ scenesInStrand.length }} scene{{ scenesInStrand.length === 1 ? "" : "s" }}
            </span>
          </div>

          <RichEditor
            :model-value="s.body || ''"
            placeholder="Write the narrative strand in detail — synopsis, character arcs, beats in prose, anything you want to remember…"
            variant="inline"
            :toolbar="['bold', 'italic', 'underline', 'strike', 'h1', 'h2', 'h3', 'quote', 'list', 'orderedList', 'taskList', 'sceneBreak', 'align', 'highlight', 'link', 'image', 'table', 'find', 'undo', 'redo']"
            :fill="true"
            @change="(html) => update('body', html)"
          />

          <div class="strand-below">
          <!-- Beats — turning points pinned to chapters -->
          <div class="beats-section">
            <div class="beats-head">
              <span class="beats-title">Beats</span>
              <button class="btn ghost sm" @click="addBeat">
                <Icon name="Plus" :size="11" /> Add beat
              </button>
            </div>

            <div v-if="(s.beats || []).length === 0" class="beats-empty">
              No beats yet. Add Inciting / Midpoint / Climax-style turning points so you can see where this narrative strand pays off.
            </div>
            <div v-else class="beats-list">
              <div v-for="b in sortedBeats" :key="b.id" class="beat-row">
                <button class="beat-chapter"
                  :class="{ missing: !chapterById(b.chapterId) }"
                  @click="goBeat(b)">
                  <span v-if="chapterById(b.chapterId)" class="status-dot" :class="chapterById(b.chapterId).status" />
                  <span class="beat-chapter-text">{{ sceneRefLabel(b) }}</span>
                </button>
                <div class="beat-body">
                  <input class="beat-label"
                    :value="b.label"
                    placeholder="Beat label (e.g. Midpoint)"
                    list="beat-presets"
                    @input="updateBeat(b.id, 'label', $event.target.value)" />
                  <input class="beat-note"
                    :value="b.note || ''"
                    placeholder="Note (optional)"
                    @input="updateBeat(b.id, 'note', $event.target.value)" />
                </div>
                <select class="beat-rechapter"
                  :value="beatRefValue(b)"
                  :title="'Reassign to a different scene'"
                  @change="setBeatRef(b.id, $event.target.value)">
                  <option value="">(no scene)</option>
                  <option v-for="opt in sceneOptions" :key="opt.value" :value="opt.value">
                    {{ opt.label }}
                  </option>
                </select>
                <button class="btn ghost icon beat-delete" title="Remove beat" @click="removeBeat(b.id)">
                  <Icon name="Trash" :size="12" />
                </button>
              </div>
            </div>
          </div>

          <!-- Scenes linked to this strand (via the scene Links page) -->
          <div style="margin-top:22px">
            <div class="t-eyebrow" style="margin-bottom:10px">Appears in scenes</div>
            <SceneRefList field="strands" :entity-id="s.id"
              empty-text="No scenes linked to this narrative strand yet. Open a scene → Links → Narrative strands to add one." />
          </div>
          </div>
        </div>

    <!-- Shared datalist of preset beat labels for autocomplete on every input. -->
    <datalist id="beat-presets">
      <option v-for="preset in BEAT_PRESETS" :key="preset" :value="preset" />
    </datalist>
  </div>

  <GroupsModal v-if="s && modal === 'groups'"
    :entity-id="s.id" :entity-name="s.name" entity-kind="strand"
    @close="modal = null" />
</template>

<style scoped>
.strand-empty {
  padding: 60px 20px;
  text-align: center;
  color: var(--muted);
  font-style: italic;
  font-size: 13.5px;
}

.strand-body {
  flex: 1; min-width: 0; min-height: 0;
  display: flex; flex-direction: column; gap: 12px;
  padding: 22px 26px 40px;
}
/* The editor and the content below it split the card's remaining height;
   each scrolls on its own so neither pushes the other off-screen. */
.strand-below {
  flex: 1; min-height: 0;
  overflow-y: auto;
}

.strand-head {
  display: flex; align-items: flex-start; gap: 14px;
}

.strand-pane-header .pane-title { gap: 2px; }
.strand-name {
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
.strand-name:hover { border-color: var(--border-soft); }
.strand-name:focus { border-color: var(--accent); background: var(--surface); box-shadow: 0 0 0 3px var(--accent-soft); }

.strand-blurb {
  appearance: none;
  width: 100%;
  resize: vertical;
  min-height: 44px;
  border: 1px solid transparent;
  background: transparent;
  border-radius: 6px;
  padding: 6px 8px;
  margin-left: -8px;
  font: inherit;
  font-size: 14px;
  line-height: 1.55;
  font-family: var(--font-serif);
  color: var(--ink-2);
  font-style: italic;
  outline: none;
}
.strand-blurb:hover { border-color: var(--border-soft); }
.strand-blurb:focus { border-color: var(--accent); background: var(--surface); box-shadow: 0 0 0 3px var(--accent-soft); }
.strand-blurb::placeholder { color: var(--muted); }

.strand-meta-row {
  display: flex; align-items: center; gap: 14px;
}
.strand-count { margin-left: auto; font-size: 11.5px; color: var(--muted); }

.beats-section {
  border-top: 1px dashed var(--border-soft);
  padding-top: 12px;
  margin-top: 4px;
}
.beats-head {
  display: flex; align-items: center; gap: 8px;
  margin-bottom: 6px;
}
.beats-title {
  font-size: 10.5px; font-weight: 600;
  text-transform: uppercase; letter-spacing: 0.08em;
  color: var(--muted);
}
.beats-empty {
  font-size: 12px;
  color: var(--muted);
  font-style: italic;
  padding: 4px 0;
}
.beats-list {
  display: flex; flex-direction: column;
  gap: 6px;
}
.beat-row {
  display: grid;
  grid-template-columns: 180px 1fr auto auto;
  gap: 8px; align-items: center;
  padding: 6px 8px;
  background: var(--surface-2);
  border: 1px solid var(--border-soft);
  border-radius: 8px;
}
.beat-chapter {
  appearance: none; border: 0; background: transparent;
  display: inline-flex; align-items: center; gap: 5px;
  padding: 3px 6px;
  border-radius: 5px;
  font: inherit;
  font-size: 11.5px;
  color: var(--ink-2);
  cursor: default;
  text-align: left;
  overflow: hidden;
}
.beat-chapter:hover { background: var(--surface-3); color: var(--ink); }
.beat-chapter.missing { color: var(--muted); font-style: italic; cursor: not-allowed; }
.beat-chapter-text {
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.beat-body {
  display: flex; flex-direction: column; gap: 3px;
  min-width: 0;
}
.beat-label, .beat-note {
  appearance: none;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 5px;
  padding: 2px 6px;
  font: inherit;
  outline: none;
  width: 100%;
}
.beat-label {
  font-weight: 600;
  font-size: 12.5px;
  color: var(--ink);
}
.beat-note {
  font-size: 11.5px;
  color: var(--ink-2);
  font-style: italic;
}
.beat-label:hover, .beat-note:hover { border-color: var(--border-soft); }
.beat-label:focus, .beat-note:focus { border-color: var(--accent); background: var(--surface); box-shadow: 0 0 0 2px var(--accent-soft); }
.beat-label::placeholder, .beat-note::placeholder { color: var(--muted); }

.beat-rechapter {
  appearance: none;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 5px;
  padding: 2px 6px;
  font: inherit;
  font-size: 11px;
  color: var(--muted);
  max-width: 28px;
  text-indent: -9999px;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'%3E%3Cpath d='M5 8h14M5 16h14'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: center;
  background-size: 14px 14px;
  cursor: default;
}
.beat-rechapter:hover { background-color: var(--surface-3); }
.beat-rechapter option { text-indent: 0; color: var(--ink); }

.beat-delete { color: var(--muted); width: 24px; height: 24px; padding: 4px; }
.beat-delete:hover { color: var(--danger, #c0392b); background: var(--surface-3); }

.strand-chapters {
  display: flex; flex-wrap: wrap; gap: 5px; align-items: center;
  padding-top: 8px;
  border-top: 1px dashed var(--border-soft);
}
.strand-chapters-label {
  font-size: 10.5px; font-weight: 600;
  text-transform: uppercase; letter-spacing: 0.08em;
  color: var(--muted);
  margin-right: 4px;
}
.strand-chap {
  appearance: none; border: 1px solid var(--border);
  background: var(--surface-2);
  border-radius: 6px;
  padding: 3px 8px;
  display: inline-flex; align-items: center; gap: 5px;
  font: inherit;
  font-size: 11.5px;
  color: var(--ink-2);
  max-width: 240px;
  cursor: default;
}
.strand-chap:hover { background: var(--surface-3); color: var(--ink); border-color: var(--border-strong); }
.strand-chap-num {
  font-variant-numeric: tabular-nums;
  color: var(--muted);
}
.strand-chap-title {
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

.strand-chapters-empty {
  font-size: 11.5px;
  color: var(--muted);
  font-style: italic;
  padding-top: 8px;
  border-top: 1px dashed var(--border-soft);
}
</style>
