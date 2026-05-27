<script setup>
import { computed } from "vue";
import { useRouter } from "vue-router";
import { useProjectStore } from "../stores/project.js";
import { useUiStore } from "../stores/ui.js";
import PaneHeader from "../components/PaneHeader.vue";
import Icon from "../components/Icon.vue";
import { promptDialog, confirmDialog } from "../services/dialog.js";

const props = defineProps({ id: { type: String, default: "" } });
const project = useProjectStore();
const ui = useUiStore();
const router = useRouter();

// Show one plotline at a time — selected from the route param, falling
// back to the sidebar selection, then the first plotline.
const s = computed(() =>
  project.plotlineById(props.id || ui.selections.plotlines) || project.plotlines[0]);

// Preset palette — same lightness/chroma family the seed plotlines use,
// so picked colors blend with the existing ones.
const COLOR_PALETTE = [
  "oklch(0.82 0.08 75)",   "oklch(0.78 0.07 25)",   "oklch(0.78 0.07 5)",
  "oklch(0.78 0.07 330)",  "oklch(0.74 0.07 270)",  "oklch(0.78 0.07 240)",
  "oklch(0.78 0.06 200)",  "oklch(0.80 0.08 170)",  "oklch(0.78 0.06 120)",
  "oklch(0.82 0.10 95)",
];

const STATUS_OPTIONS = [
  { value: "open",      label: "Open",      hint: "Active throughline" },
  { value: "resolved",  label: "Resolved",  hint: "Paid off in the manuscript" },
  { value: "abandoned", label: "Abandoned", hint: "Cut from the story" },
];

const BEAT_PRESETS = [
  "Inciting", "First turn", "Midpoint",
  "Crisis", "Climax", "Resolution",
  "Setup", "Reveal", "Setback", "Refusal",
];

const chaptersInPlotline = computed(() => {
  if (!s.value) return [];
  return project.allChapters.filter((c) => (c.plotlines || []).includes(s.value.id));
});

function chapterById(id) { return project.chapterById(id); }
function update(k, v) { project.updatePlotline(s.value.id, { [k]: v }); }
function updateBeat(beatId, k, v) { project.updatePlotlineBeat(s.value.id, beatId, { [k]: v }); }
function removeBeat(beatId) { project.removePlotlineBeat(s.value.id, beatId); }
function goChapter(id) { ui.select("chapters", id); router.push(`/chapters/${id}`); }

async function addPlotline() {
  const name = await promptDialog({
    title: "New plotline",
    label: "Plotline name",
    placeholder: "e.g. The Map Plot",
    confirmLabel: "Create plotline",
  });
  if (!name) return;
  const id = project.addPlotline({ name });
  ui.select("plotlines", id);
  router.push(`/plotlines/${id}`);
}

async function deletePlotline() {
  const used = chaptersInPlotline.value.length;
  const message = used
    ? `${used} chapter${used === 1 ? " is" : "s are"} tagged with this plotline. They'll lose the tag (other plotline tags on those chapters are kept).`
    : null;
  const yes = await confirmDialog({
    title: `Delete plotline "${s.value.name}"?`,
    message,
    confirmLabel: "Delete plotline",
    danger: true,
  });
  if (!yes) return;
  const removedId = s.value.id;
  project.removePlotline(removedId);
  const next = project.plotlines[0];
  if (next) { ui.select("plotlines", next.id); router.push(`/plotlines/${next.id}`); }
  else router.push("/plotlines");
}

async function addBeat() {
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
        key: "chapterId",
        label: "Chapter",
        type: "select",
        defaultValue: project.allChapters[0]?.id || "",
        options: project.allChapters.map((c) => ({
          value: c.id,
          label: `Ch. ${c.num} · ${c.title}`,
        })),
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
  project.addPlotlineBeat(s.value.id, {
    label: values.label,
    chapterId: values.chapterId || null,
    note: values.note || "",
  });
}

// Sort beats by their chapter's order in the manuscript so the list
// reads top-to-bottom in story order.
const sortedBeats = computed(() => {
  if (!s.value) return [];
  const order = new Map(project.allChapters.map((c, i) => [c.id, i]));
  return [...(s.value.beats || [])].sort((a, b) => {
    const ai = order.has(a.chapterId) ? order.get(a.chapterId) : Number.POSITIVE_INFINITY;
    const bi = order.has(b.chapterId) ? order.get(b.chapterId) : Number.POSITIVE_INFINITY;
    return ai - bi;
  });
});
</script>

<template>
  <PaneHeader eyebrow="Plotline" :title="s?.name || 'Plotlines'">
    <button v-if="s" class="btn ghost" @click="deletePlotline">Delete</button>
    <button class="btn primary" @click="addPlotline"><Icon name="Plus" :size="14" /> New plotline</button>
  </PaneHeader>

  <div v-if="!s" class="col-detail scrollarea">
    <div class="plotline-empty">
      No plotlines yet. Click <strong>New plotline</strong> to add one.
    </div>
  </div>

  <div v-else class="col-detail scrollarea">
    <div class="plotline-wrap">
      <div class="plotline-card">
        <div class="plotline-stripe" :style="`background:${s.color}`" />
        <div class="plotline-body">
          <div class="plotline-head">
            <input class="plotline-name"
              :value="s.name"
              placeholder="Plotline name"
              @input="update('name', $event.target.value)" />
            <div class="status-seg" role="radiogroup">
              <button v-for="opt in STATUS_OPTIONS" :key="opt.value"
                type="button"
                class="status-seg-btn"
                :class="[`status-${opt.value}`, { active: (s.status || 'open') === opt.value }]"
                :title="opt.hint"
                @click="update('status', opt.value)">
                {{ opt.label }}
              </button>
            </div>
          </div>

          <textarea class="plotline-blurb"
            :value="s.blurb || ''"
            placeholder="What is this plotline about? (One or two sentences)"
            rows="2"
            @input="update('blurb', $event.target.value)" />

          <div class="plotline-meta-row">
            <div class="plotline-swatches">
              <span class="swatches-label">Color</span>
              <button v-for="color in COLOR_PALETTE" :key="color"
                type="button"
                class="plotline-swatch"
                :class="{ active: color === s.color }"
                :style="`background:${color}`"
                :title="`Use ${color}`"
                @click="update('color', color)" />
            </div>
            <span class="plotline-count">
              {{ chaptersInPlotline.length }} chapter{{ chaptersInPlotline.length === 1 ? "" : "s" }}
            </span>
          </div>

          <!-- Beats — turning points pinned to chapters -->
          <div class="beats-section">
            <div class="beats-head">
              <span class="beats-title">Beats</span>
              <button class="btn ghost sm" @click="addBeat">
                <Icon name="Plus" :size="11" /> Add beat
              </button>
            </div>

            <div v-if="(s.beats || []).length === 0" class="beats-empty">
              No beats yet. Add Inciting / Midpoint / Climax-style turning points so you can see where this plotline pays off.
            </div>
            <div v-else class="beats-list">
              <div v-for="b in sortedBeats" :key="b.id" class="beat-row">
                <button class="beat-chapter"
                  :class="{ missing: !chapterById(b.chapterId) }"
                  @click="b.chapterId && goChapter(b.chapterId)">
                  <span v-if="chapterById(b.chapterId)" class="status-dot" :class="chapterById(b.chapterId).status" />
                  <span class="beat-chapter-text">
                    <template v-if="chapterById(b.chapterId)">
                      Ch. {{ chapterById(b.chapterId).num }} · {{ chapterById(b.chapterId).title }}
                    </template>
                    <template v-else>(no chapter)</template>
                  </span>
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
                  :value="b.chapterId || ''"
                  :title="'Reassign to a different chapter'"
                  @change="updateBeat(b.id, 'chapterId', $event.target.value || null)">
                  <option value="">(no chapter)</option>
                  <option v-for="c in project.allChapters" :key="c.id" :value="c.id">
                    Ch. {{ c.num }} · {{ c.title }}
                  </option>
                </select>
                <button class="btn ghost icon beat-delete" title="Remove beat" @click="removeBeat(b.id)">
                  <Icon name="Trash" :size="12" />
                </button>
              </div>
            </div>
          </div>

          <!-- Chapters using this plotline -->
          <div v-if="chaptersInPlotline.length" class="plotline-chapters">
            <span class="plotline-chapters-label">In:</span>
            <button v-for="c in chaptersInPlotline" :key="c.id"
              class="plotline-chap" @click="goChapter(c.id)" :title="c.title">
              <span class="status-dot" :class="c.status" />
              <span class="plotline-chap-num">{{ c.num }}</span>
              <span class="plotline-chap-title">{{ c.title }}</span>
            </button>
          </div>
          <div v-else class="plotline-chapters-empty">
            Not tagged on any chapters yet.
          </div>
        </div>
      </div>
    </div>

    <!-- Shared datalist of preset beat labels for autocomplete on every input. -->
    <datalist id="beat-presets">
      <option v-for="preset in BEAT_PRESETS" :key="preset" :value="preset" />
    </datalist>
  </div>
</template>

<style scoped>
.plotline-wrap {
  padding: 22px;
  max-width: 980px;
  width: 100%;
}

.plotline-empty {
  padding: 60px 20px;
  text-align: center;
  color: var(--muted);
  font-style: italic;
  font-size: 13.5px;
}

.plotline-card {
  display: flex; align-items: stretch; gap: 0;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: var(--shadow-1);
  overflow: hidden;
}
.plotline-stripe { width: 6px; align-self: stretch; flex-shrink: 0; }
.plotline-body {
  flex: 1; min-width: 0;
  display: flex; flex-direction: column; gap: 12px;
  padding: 18px 20px 18px 22px;
}

.plotline-head {
  display: flex; align-items: flex-start; gap: 14px;
}
.plotline-name {
  flex: 1; min-width: 0;
  appearance: none;
  font-family: var(--font-serif);
  font-size: 22px; font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--ink);
  border: 1px solid transparent;
  background: transparent;
  border-radius: 6px;
  padding: 4px 8px;
  margin-left: -8px;
  outline: none;
}
.plotline-name:hover { border-color: var(--border-soft); }
.plotline-name:focus { border-color: var(--accent); background: var(--surface); box-shadow: 0 0 0 3px var(--accent-soft); }

.status-seg {
  display: inline-flex;
  border: 1px solid var(--border);
  border-radius: 7px;
  padding: 2px;
  background: var(--surface-2);
  flex-shrink: 0;
}
.status-seg-btn {
  appearance: none; border: 0; background: transparent;
  padding: 4px 10px;
  font: inherit;
  font-size: 11.5px; font-weight: 500;
  color: var(--ink-2);
  border-radius: 5px;
  cursor: default;
}
.status-seg-btn:hover { background: var(--surface-3); color: var(--ink); }
.status-seg-btn.active.status-open { background: var(--accent); color: var(--on-accent); }
.status-seg-btn.active.status-resolved { background: var(--status-done, #6aa84f); color: #fff; }
.status-seg-btn.active.status-abandoned { background: var(--surface-3); color: var(--muted); text-decoration: line-through; }

.plotline-blurb {
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
.plotline-blurb:hover { border-color: var(--border-soft); }
.plotline-blurb:focus { border-color: var(--accent); background: var(--surface); box-shadow: 0 0 0 3px var(--accent-soft); }
.plotline-blurb::placeholder { color: var(--muted); }

.plotline-meta-row {
  display: flex; align-items: center; gap: 14px;
}
.plotline-swatches {
  display: flex; align-items: center; gap: 6px;
}
.swatches-label {
  font-size: 10px; font-weight: 600;
  text-transform: uppercase; letter-spacing: 0.08em;
  color: var(--muted);
  margin-right: 4px;
}
.plotline-swatch {
  appearance: none; border: 0;
  width: 18px; height: 18px;
  border-radius: 5px;
  cursor: default;
  box-shadow: inset 0 0 0 1px rgba(0,0,0,0.08);
  transition: transform .08s ease;
}
.plotline-swatch:hover { transform: scale(1.12); }
.plotline-swatch.active {
  box-shadow: inset 0 0 0 1px rgba(0,0,0,0.08), 0 0 0 2px var(--surface), 0 0 0 3px var(--accent);
}
.plotline-count { margin-left: auto; font-size: 11.5px; color: var(--muted); }

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

.plotline-chapters {
  display: flex; flex-wrap: wrap; gap: 5px; align-items: center;
  padding-top: 8px;
  border-top: 1px dashed var(--border-soft);
}
.plotline-chapters-label {
  font-size: 10.5px; font-weight: 600;
  text-transform: uppercase; letter-spacing: 0.08em;
  color: var(--muted);
  margin-right: 4px;
}
.plotline-chap {
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
.plotline-chap:hover { background: var(--surface-3); color: var(--ink); border-color: var(--border-strong); }
.plotline-chap-num {
  font-variant-numeric: tabular-nums;
  color: var(--muted);
}
.plotline-chap-title {
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

.plotline-chapters-empty {
  font-size: 11.5px;
  color: var(--muted);
  font-style: italic;
  padding-top: 8px;
  border-top: 1px dashed var(--border-soft);
}
</style>
