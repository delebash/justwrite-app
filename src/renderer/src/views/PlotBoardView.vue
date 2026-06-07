<script setup>
import { computed, ref, onMounted, onUnmounted, nextTick } from "vue";
import { useRouter } from "vue-router";
import { useProjectStore } from "../stores/project.js";
import { useUiStore } from "../stores/ui.js";
import { PLOT_TEMPLATES, TEMPLATE_ORDER, applyTemplate } from "../services/plotTemplates.js";
import { promptDialog, confirmDialog } from "../services/dialog.js";
import PaneHeader from "../components/PaneHeader.vue";
import Icon from "../components/Icon.vue";
import JwButton from "@renderer/components/ui/JwButton.vue";

const project = useProjectStore();
const ui = useUiStore();
const router = useRouter();

// ── Computed data ────────────────────────────────────────────────────
const strands = computed(() => project.strands);
const chapters = computed(() => project.allChapters);

// ── Template dropdown ────────────────────────────────────────────────
const templateMenuOpen = ref(false);
const templateBtnRef = ref(null);
const templateMenuRef = ref(null);

function openTemplateMenu() {
  templateMenuOpen.value = !templateMenuOpen.value;
}

function closeTemplateMenu() {
  templateMenuOpen.value = false;
}

function onDocMousedown(e) {
  if (!templateMenuOpen.value) return;
  const btn = templateBtnRef.value;
  const menu = templateMenuRef.value;
  if (btn && btn.contains(e.target)) return;
  if (menu && menu.contains(e.target)) return;
  closeTemplateMenu();
}

onMounted(() => document.addEventListener("mousedown", onDocMousedown));
onUnmounted(() => document.removeEventListener("mousedown", onDocMousedown));

// Safety-net dragend at the document level. The native `dragend` only
// fires on the dragged element — if a reactive update removes that
// element mid-drag, the local @dragend never runs and the dragging
// refs stay dirty, then the next drop fires with stale context. A
// document-level listener catches every drag completion regardless.
function onDocDragEnd() {
  if (dragging.value || dragOverKey.value) {
    dragging.value = null;
    dragOverKey.value = null;
  }
  if (draggingStrandId.value || strandDropTarget.value) {
    draggingStrandId.value = null;
    strandDropTarget.value = null;
  }
}
onMounted(() => document.addEventListener("dragend", onDocDragEnd));
onUnmounted(() => document.removeEventListener("dragend", onDocDragEnd));

async function handleApplyTemplate(templateId) {
  closeTemplateMenu();
  const tpl = PLOT_TEMPLATES[templateId];
  if (!tpl) return;
  const strandId = applyTemplate(project, templateId);
  if (!strandId) return;
  ui.showToast({ message: `Applied "${tpl.label}" — ${tpl.beats.length} beats added.` });
  await nextTick();
  const el = document.querySelector(`[data-strand-id="${strandId}"]`);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

// ── New strand ───────────────────────────────────────────────────────
async function handleNewStrand() {
  const result = await promptDialog({
    title: "New strand",
    label: "Strand name",
    placeholder: "e.g. Romance subplot",
    confirmLabel: "Create",
  });
  if (!result) return;
  const name = typeof result === "string" ? result : result.name || result;
  if (!name || !name.trim()) return;
  project.addStrand({ name: name.trim() });
}

// ── Strand name inline edit ──────────────────────────────────────────
function onStrandNameBlur(strand, e) {
  const val = e.target.value.trim();
  if (val && val !== strand.name) {
    project.updateStrand(strand.id, { name: val });
  } else {
    // Reset to stored name if blank
    e.target.value = strand.name;
  }
}

function onStrandNameKeydown(e) {
  if (e.key === "Enter") { e.preventDefault(); e.target.blur(); }
  if (e.key === "Escape") { e.target.blur(); }
}

async function handleRemoveStrand(strand) {
  const yes = await confirmDialog({
    title: "Delete strand?",
    message: `Delete "${strand.name}" and all its beats? You can restore it from Trash.`,
    confirmLabel: "Delete",
    danger: true,
  });
  if (yes) project.removeStrand(strand.id);
}

// ── Beat actions ─────────────────────────────────────────────────────
async function handleAddBeat(strandId, chapterId) {
  // chapterId may be null (Unassigned column)
  const result = await promptDialog({
    title: "New beat",
    label: "Beat label",
    placeholder: "e.g. Midpoint revelation",
    confirmLabel: "Add",
  });
  if (!result) return;
  const label = typeof result === "string" ? result : result.label || result;
  if (!label || !label.trim()) return;
  project.addStrandBeat(strandId, { label: label.trim(), note: "", chapterId, sceneId: null });
}

async function handleEditBeat(strandId, beat, e) {
  e.stopPropagation(); // don't trigger cell add
  // Build a scene picker when the beat is assigned to a chapter so the
  // user can pin the beat to a specific scene. Unassigned beats skip
  // the picker — there are no scenes to choose from.
  // `note` is intentionally optional (most beats are just a label); the
  // dialog's canSubmit gate would otherwise disable Save when the beat
  // has no note. Label stays required.
  const fields = [
    { key: "label", label: "Label", defaultValue: beat.label },
    { key: "note",  label: "Note",  defaultValue: beat.note || "", optional: true },
  ];
  const scenes = beat.chapterId ? project.scenesFor(beat.chapterId) : [];
  if (scenes.length) {
    fields.push({
      key: "sceneId",
      label: "Scene",
      type: "select",
      defaultValue: beat.sceneId || "",
      options: [
        { value: "", label: "Any scene" },
        ...scenes.map((s, i) => ({ value: s.id, label: s.title || `Scene ${i + 1}` })),
      ],
    });
  }
  const result = await promptDialog({ title: "Edit beat", fields, confirmLabel: "Save" });
  if (!result) return;
  const patch = {};
  if (typeof result === "object") {
    if (result.label !== undefined) patch.label = result.label;
    if (result.note  !== undefined) patch.note  = result.note;
    if ("sceneId" in result) patch.sceneId = result.sceneId || null;
  }
  if (Object.keys(patch).length) project.updateStrandBeat(strandId, beat.id, patch);
}

// Keyboard activation: Enter and Space trigger the cell/card's click
// handler. This makes the board navigable without a mouse and gives the
// Reka UI Dialog focus-restore mechanism a real focusable target to
// return to when an Add/Edit Beat dialog closes.
function onCellKey(e, action, enabled) {
  if (!enabled) return;
  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); action(); }
}
function onCardKey(e, strandId, beat) {
  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleEditBeat(strandId, beat, e); }
}

async function handleRemoveBeat(strandId, beat, e) {
  e.stopPropagation();
  project.removeStrandBeat(strandId, beat.id);
  // Beats live in the global undo history (no Trash entry), so a quick
  // toast pointing at ⌘Z is enough — confirmDialog would be over-friction
  // for a one-line item the user can recover instantly.
  ui.showToast({ message: `Removed beat "${beat.label || 'untitled'}".` });
}

// ── Drag and drop ────────────────────────────────────────────────────
const dragging = ref(null);   // { strandId, beatId, currentChapterId }
const dragOverKey = ref(null); // "${strandId}:${chapterId|'none'}"

// Separate ref so strand-reorder drag doesn't get confused with the
// beat drag-drop already wired above. Position is "above" | "below" so
// the drop indicator can hint where the row will land.
const draggingStrandId = ref(null);
const strandDropTarget = ref(null); // { id, position }

function onStrandDragStart(e, strandId) {
  draggingStrandId.value = strandId;
  e.dataTransfer.effectAllowed = "move";
  // Empty payload — just signal so cross-element handlers know it's a
  // strand move, not a beat move.
  e.dataTransfer.setData("application/x-strand", strandId);
}
function onStrandDragEnd() {
  draggingStrandId.value = null;
  strandDropTarget.value = null;
}
function onStrandDragOver(e, strandId) {
  if (!draggingStrandId.value) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  // Choose above/below based on which half of the row the cursor's in.
  const rect = e.currentTarget.getBoundingClientRect();
  const position = (e.clientY - rect.top) < rect.height / 2 ? "above" : "below";
  strandDropTarget.value = { id: strandId, position };
}
function onStrandDragLeave(strandId) {
  if (strandDropTarget.value?.id === strandId) strandDropTarget.value = null;
}
function onStrandDrop(e, strandId) {
  if (!draggingStrandId.value) return;
  e.preventDefault();
  const src = draggingStrandId.value;
  const target = strandDropTarget.value || { id: strandId, position: "below" };
  draggingStrandId.value = null;
  strandDropTarget.value = null;
  if (src === target.id) return;
  // Compute the new ordering. Pull `src` out of its current slot, then
  // insert it above/below `target.id`.
  const ids = strands.value.map((s) => s.id).filter((id) => id !== src);
  const targetIdx = ids.indexOf(target.id);
  if (targetIdx < 0) return;
  const insertAt = target.position === "above" ? targetIdx : targetIdx + 1;
  ids.splice(insertAt, 0, src);
  project.reorderStrands(ids);
}

function onDragStart(e, strandId, beat) {
  dragging.value = { strandId, beatId: beat.id, currentChapterId: beat.chapterId };
  e.dataTransfer.effectAllowed = "move";
}

function onDragEnd() {
  dragging.value = null;
  dragOverKey.value = null;
}

function cellKey(strandId, chapterId) {
  return `${strandId}:${chapterId ?? "none"}`;
}

function onDragOver(e, strandId, chapterId) {
  // While a strand row is being dragged, every beat cell the cursor
  // passes over should advance the STRAND drop indicator — otherwise
  // the indicator only updates on the sticky label cell and a drop on
  // any beat cell would land on whatever row was last hovered.
  if (draggingStrandId.value) { onStrandDragOver(e, strandId); return; }
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  dragOverKey.value = cellKey(strandId, chapterId);
}

function onDragLeave(strandId, chapterId) {
  if (dragOverKey.value === cellKey(strandId, chapterId)) {
    dragOverKey.value = null;
  }
}

function onDrop(e, targetStrandId, targetChapterId) {
  // Same delegation as dragover — if the user drops while strand-
  // dragging anywhere in the row, complete the strand move.
  if (draggingStrandId.value) { onStrandDrop(e, targetStrandId); return; }
  e.preventDefault();
  dragOverKey.value = null;
  const drag = dragging.value;
  dragging.value = null;
  if (!drag) return;

  const { strandId: srcStrandId, beatId, currentChapterId } = drag;

  // Nothing changed
  if (srcStrandId === targetStrandId && currentChapterId === targetChapterId) return;

  // Whenever the beat's chapter changes, any stored sceneId is now
  // dangling (scenes belong to chapters). Clear it so the next edit
  // starts from "Any scene" rather than pointing at a foreign scene.
  const chapterChanged = currentChapterId !== targetChapterId;
  const patch = { chapterId: targetChapterId, ...(chapterChanged ? { sceneId: null } : {}) };

  if (srcStrandId !== targetStrandId) {
    // Cross-strand move via moveBeat — preserves the beat id so any
    // downstream reference (e.g. future linking from chapters back to
    // beats) survives the drag. Single history entry, one undo reverts.
    const ok = project.moveBeat(srcStrandId, targetStrandId, beatId, patch);
    if (!ok) return;
  } else {
    project.updateStrandBeat(srcStrandId, beatId, patch);
  }

  ui.showToast({ message: "Beat moved." });
}

// ── Helpers ──────────────────────────────────────────────────────────
function beatCount(strand) {
  return (strand.beats || []).length;
}

// Memoize the strand×chapter bucketing so a single reactive update
// doesn't re-filter every strand's beat list O(rows × cols × calls-per-cell)
// times — template bindings reach beatsInCell 4× per cell (class,
// tabindex, role, aria-label).
const beatsByCell = computed(() => {
  const map = new Map();
  for (const strand of strands.value) {
    for (const b of strand.beats || []) {
      const key = `${strand.id}:${b.chapterId == null ? "none" : b.chapterId}`;
      const list = map.get(key);
      if (list) list.push(b); else map.set(key, [b]);
    }
  }
  return map;
});
function beatsInCell(strand, chapterId) {
  // chapterId === null → Unassigned column
  return beatsByCell.value.get(`${strand.id}:${chapterId ?? "none"}`) || [];
}

// "Scene 2" / scene-title badge shown on beat cards when sceneId is
// set. Returns null when there's no scene pin or the referenced scene
// no longer exists (e.g. user deleted the scene after pinning).
function sceneBadge(beat) {
  if (!beat.chapterId || !beat.sceneId) return null;
  const scenes = project.scenesFor(beat.chapterId);
  const idx = scenes.findIndex((s) => s.id === beat.sceneId);
  if (idx < 0) return null;
  return scenes[idx].title || `Scene ${idx + 1}`;
}
</script>

<template>
  <PaneHeader :eyebrow="$t('panes.plotBoard.eyebrow')" :title="$t('panes.plotBoard.title')" help-key="plot-and-time" />

  <div class="pane-card">

    <!-- ── Empty state ─────────────────────────────────────────── -->
    <template v-if="strands.length === 0">
      <div class="empty-state">
        <div class="empty-icon">
          <Icon name="Strands" :size="36" />
        </div>
        <p class="empty-heading">No narrative strands yet.</p>
        <p class="empty-sub">Start from a proven plot structure, or build your own from scratch.</p>
        <div class="empty-actions">
          <!-- Template dropdown in empty state -->
          <div class="dropdown-wrap" style="position:relative">
            <JwButton intent="primary" ref="templateBtnRef" @click="openTemplateMenu">
              <Icon name="Sparkle" :size="14" />
              Apply a template
              <Icon name="ChevDown" :size="13" />
            </JwButton>
            <div v-if="templateMenuOpen" ref="templateMenuRef" class="template-menu">
              <button
                v-for="id in TEMPLATE_ORDER"
                :key="id"
                class="tmpl-item"
                @click="handleApplyTemplate(id)"
              >
                <span class="tmpl-label">{{ PLOT_TEMPLATES[id].label }}</span>
                <span class="tmpl-blurb">{{ PLOT_TEMPLATES[id].blurb }}</span>
              </button>
            </div>
          </div>
          <JwButton intent="secondary" @click="handleNewStrand">
            <Icon name="Plus" :size="14" />
            Start blank
          </JwButton>
        </div>
      </div>
    </template>

    <!-- ── Board ──────────────────────────────────────────────── -->
    <template v-else>
      <p class="pb-desc">
        The <strong>Plot board</strong> is a two-axis grid: narrative strands across the rows,
        chapters across the columns. Each beat sits at its strand × chapter intersection. Drag
        beats around, click an empty cell to add one, and <strong>Apply template</strong> lays a
        standard structural framework (Three-Act, Save the Cat, Hero's Journey, Story Circle)
        over your outline.
      </p>

      <!-- Toolbar -->
      <div class="toolbar">
        <div style="position:relative">
          <JwButton intent="secondary" ref="templateBtnRef" @click="openTemplateMenu">
            <Icon name="Sparkle" :size="14" />
            Apply template
            <Icon name="ChevDown" :size="13" />
          </JwButton>
          <div v-if="templateMenuOpen" ref="templateMenuRef" class="template-menu">
            <button
              v-for="id in TEMPLATE_ORDER"
              :key="id"
              class="tmpl-item"
              @click="handleApplyTemplate(id)"
            >
              <span class="tmpl-label">{{ PLOT_TEMPLATES[id].label }}</span>
              <span class="tmpl-blurb">{{ PLOT_TEMPLATES[id].blurb }}</span>
            </button>
          </div>
        </div>
        <JwButton intent="primary" @click="handleNewStrand">
          <Icon name="Plus" :size="14" />
          New strand
        </JwButton>
      </div>

      <!-- Board scroll container -->
      <div class="board-scroll">
        <div
          class="board-grid"
          :style="`--col-count: ${chapters.length}`"
        >
          <!-- ── Sticky header row ─────────────────────────── -->
          <!-- Corner cell -->
          <div class="col-header corner-cell"></div>
          <!-- Unassigned header -->
          <div class="col-header unassigned-header">
            <span class="col-label">Unassigned</span>
          </div>
          <!-- Chapter headers -->
          <router-link
            v-for="ch in chapters"
            :key="ch.id"
            :to="`/chapters/${ch.id}`"
            class="col-header ch-header"
            v-tooltip.bottom="ch.title"
          >
            <span class="col-label">Ch {{ ch.num }}</span>
          </router-link>

          <!-- ── Strand rows ───────────────────────────────── -->
          <template v-for="strand in strands" :key="strand.id">
            <!-- Sticky strand label cell -->
            <div class="strand-label-cell"
              :data-strand-id="strand.id"
              :class="{
                'strand-row-dragging': draggingStrandId === strand.id,
                'strand-drop-above':   strandDropTarget?.id === strand.id && strandDropTarget?.position === 'above',
                'strand-drop-below':   strandDropTarget?.id === strand.id && strandDropTarget?.position === 'below',
              }"
              @dragover="onStrandDragOver($event, strand.id)"
              @dragleave="onStrandDragLeave(strand.id)"
              @drop="onStrandDrop($event, strand.id)"
            >
              <div class="strand-name-row">
                <span
                  class="strand-drag-handle"
                  draggable="true"
                  v-tooltip.bottom="'Drag to reorder'"
                  @dragstart="onStrandDragStart($event, strand.id)"
                  @dragend="onStrandDragEnd"
                >
                  <Icon name="DragHandle" :size="12" />
                </span>
                <span
                  class="strand-color-swatch"
                  :style="`background:${strand.color || 'var(--accent)'}`"
                />
                <input
                  class="strand-name"
                  spellcheck="false"
                  :value="strand.name"
                  @blur="onStrandNameBlur(strand, $event)"
                  @keydown="onStrandNameKeydown"
                />
                <JwButton
                  intent="ghost"
                  size="small"
                  class="strand-trash-btn"
                  :aria-label="`Delete strand ${strand.name}`"
                  v-tooltip.bottom="'Delete this strand and all its beats'"
                  @click="handleRemoveStrand(strand)"
                >
                  <Icon name="Trash" :size="13" />
                </JwButton>
              </div>
              <span class="strand-beat-count">{{ beatCount(strand) }} beat{{ beatCount(strand) === 1 ? "" : "s" }}</span>
            </div>

            <!-- Unassigned cell -->
            <div
              class="beat-cell"
              :class="{
                'drag-over': dragOverKey === cellKey(strand.id, null),
                'cell-empty': beatsInCell(strand, null).length === 0,
              }"
              :tabindex="beatsInCell(strand, null).length === 0 ? 0 : -1"
              :role="beatsInCell(strand, null).length === 0 ? 'button' : undefined"
              :aria-label="beatsInCell(strand, null).length === 0 ? 'Add beat (unassigned)' : undefined"
              @click="beatsInCell(strand, null).length === 0 && handleAddBeat(strand.id, null)"
              @keydown="onCellKey($event, () => handleAddBeat(strand.id, null), beatsInCell(strand, null).length === 0)"
              @dragover="onDragOver($event, strand.id, null)"
              @dragleave="onDragLeave(strand.id, null)"
              @drop="onDrop($event, strand.id, null)"
            >
              <div
                v-for="beat in beatsInCell(strand, null)"
                :key="beat.id"
                class="beat-card"
                tabindex="0"
                role="button"
                :aria-label="`Edit beat: ${beat.label}`"
                :style="`border-left-color:${strand.color || 'var(--accent)'}`"
                draggable="true"
                v-tooltip.bottom="beat.note || beat.label"
                @dragstart="onDragStart($event, strand.id, beat)"
                @dragend="onDragEnd"
                @click.stop="handleEditBeat(strand.id, beat, $event)"
                @keydown="onCardKey($event, strand.id, beat)"
              >
                <span class="beat-label">{{ beat.label }}</span>
                <span v-if="sceneBadge(beat)" class="beat-scene" :title="`Pinned to ${sceneBadge(beat)}`">{{ sceneBadge(beat) }}</span>
                <JwButton
                  intent="ghost"
                  size="small"
                  class="beat-del-btn"
                  aria-label="Remove beat"
                  v-tooltip.bottom="'Remove this beat from the strand'"
                  @click="handleRemoveBeat(strand.id, beat, $event)"
                >
                  <Icon name="Close" :size="10" />
                </JwButton>
              </div>
              <button
                v-if="beatsInCell(strand, null).length > 0"
                class="cell-add-btn"
                aria-label="Add beat to unassigned column"
                v-tooltip.bottom="'Add beat here'"
                @click.stop="handleAddBeat(strand.id, null)"
              >
                <Icon name="Plus" :size="11" />
              </button>
            </div>

            <!-- Per-chapter cells -->
            <div
              v-for="ch in chapters"
              :key="ch.id"
              class="beat-cell"
              :class="{
                'drag-over': dragOverKey === cellKey(strand.id, ch.id),
                'cell-empty': beatsInCell(strand, ch.id).length === 0,
              }"
              :tabindex="beatsInCell(strand, ch.id).length === 0 ? 0 : -1"
              :role="beatsInCell(strand, ch.id).length === 0 ? 'button' : undefined"
              :aria-label="beatsInCell(strand, ch.id).length === 0 ? `Add beat in chapter ${ch.num}` : undefined"
              @click="beatsInCell(strand, ch.id).length === 0 && handleAddBeat(strand.id, ch.id)"
              @keydown="onCellKey($event, () => handleAddBeat(strand.id, ch.id), beatsInCell(strand, ch.id).length === 0)"
              @dragover="onDragOver($event, strand.id, ch.id)"
              @dragleave="onDragLeave(strand.id, ch.id)"
              @drop="onDrop($event, strand.id, ch.id)"
            >
              <div
                v-for="beat in beatsInCell(strand, ch.id)"
                :key="beat.id"
                class="beat-card"
                tabindex="0"
                role="button"
                :aria-label="`Edit beat: ${beat.label}`"
                :style="`border-left-color:${strand.color || 'var(--accent)'}`"
                draggable="true"
                v-tooltip.bottom="beat.note || beat.label"
                @dragstart="onDragStart($event, strand.id, beat)"
                @dragend="onDragEnd"
                @click.stop="handleEditBeat(strand.id, beat, $event)"
                @keydown="onCardKey($event, strand.id, beat)"
              >
                <span class="beat-label">{{ beat.label }}</span>
                <span v-if="sceneBadge(beat)" class="beat-scene" :title="`Pinned to ${sceneBadge(beat)}`">{{ sceneBadge(beat) }}</span>
                <JwButton
                  intent="ghost"
                  size="small"
                  class="beat-del-btn"
                  aria-label="Remove beat"
                  v-tooltip.bottom="'Remove this beat from the strand'"
                  @click="handleRemoveBeat(strand.id, beat, $event)"
                >
                  <Icon name="Close" :size="10" />
                </JwButton>
              </div>
              <button
                v-if="beatsInCell(strand, ch.id).length > 0"
                class="cell-add-btn"
                :aria-label="`Add beat to Chapter ${ch.num}`"
                v-tooltip.bottom="'Add beat here'"
                @click.stop="handleAddBeat(strand.id, ch.id)"
              >
                <Icon name="Plus" :size="11" />
              </button>
            </div>
          </template>
        </div>
      </div>
    </template>

  </div>
</template>

<style scoped>
/* ── Page descriptor ─────────────────────────────────────────────── */
.pb-desc {
  font-size: 14px; line-height: 1.55; color: var(--muted);
  margin: 0 0 18px;
  padding: 16px 16px 0;
}
.pb-desc strong { color: var(--ink-2); font-weight: 600; }

/* ── Toolbar ──────────────────────────────────────────────────────── */
.toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 16px 10px;
  border-bottom: 1px solid var(--border-soft);
}
.toolbar > *:last-child { margin-left: auto; }

/* ── Template dropdown menu ──────────────────────────────────────── */
.template-menu {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 200;
  min-width: 280px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: 0 8px 28px -4px rgba(0,0,0,.18);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.tmpl-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 14px;
  border: 0;
  background: transparent;
  text-align: left;
  cursor: pointer;
  border-bottom: 1px solid var(--border-soft);
  transition: background .12s;
}
.tmpl-item:last-child { border-bottom: 0; }
.tmpl-item:hover { background: var(--surface-2); }

.tmpl-label {
  font-size: 13px;
  font-family: var(--font-ui);
  color: var(--ink);
  font-weight: 500;
}
.tmpl-blurb {
  font-size: 11px;
  color: var(--muted);
  line-height: 1.4;
  white-space: normal;
}

/* ── Empty state ─────────────────────────────────────────────────── */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 72px 32px;
  text-align: center;
  gap: 10px;
}
.empty-icon { color: var(--muted); margin-bottom: 4px; }
.empty-heading {
  font-family: var(--font-serif);
  font-size: 18px;
  font-weight: 500;
  color: var(--ink);
  margin: 0;
}
.empty-sub {
  font-size: 13px;
  color: var(--muted);
  max-width: 360px;
  line-height: 1.5;
  margin: 0;
}
.empty-actions {
  display: flex;
  gap: 10px;
  margin-top: 8px;
  position: relative;
}

/* ── Board scroll container ──────────────────────────────────────── */
.board-scroll {
  overflow: auto;
  flex: 1;
  min-height: 0;
}

/* ── Board grid ──────────────────────────────────────────────────── */
/*
  Column layout:
    [0] sticky strand label  200px
    [1] Unassigned            140px
    [2..N+1] chapters         110px each
*/
.board-grid {
  display: grid;
  grid-template-columns: 200px 140px repeat(var(--col-count, 0), 110px);
  /* rows: auto-sized for header + each strand */
  min-width: max-content;
}

/* ── Column headers (sticky top row) ─────────────────────────────── */
.col-header {
  position: sticky;
  top: 0;
  z-index: 10;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  padding: 8px 10px 7px;
  display: flex;
  align-items: flex-end;
}

.corner-cell {
  z-index: 20; /* above both sticky axes */
  left: 0;
  border-right: 1px solid var(--border-soft);
}

.unassigned-header {
  border-right: 1px solid var(--border-soft);
}

.ch-header {
  cursor: pointer;
  text-decoration: none;
  color: inherit;
  transition: background .12s;
}
.ch-header:hover { background: var(--surface-2); }

.col-label {
  font-family: var(--font-mono);
  font-size: 10.5px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ── Strand label cell (sticky left column) ──────────────────────── */
.strand-label-cell {
  position: sticky;
  left: 0;
  z-index: 5;
  background: var(--surface);
  border-right: 1px solid var(--border-soft);
  border-bottom: 1px solid var(--border-soft);
  padding: 10px 10px 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-height: 56px;
}
.strand-row-dragging { opacity: 0.4; }
.strand-drop-above { box-shadow: inset 0 2px 0 0 var(--accent); }
.strand-drop-below { box-shadow: inset 0 -2px 0 0 var(--accent); }
.strand-drag-handle {
  display: inline-flex;
  align-items: center; justify-content: center;
  width: 14px; height: 14px;
  color: var(--muted);
  cursor: grab;
  opacity: 0;
  transition: opacity .15s;
}
.strand-drag-handle:active { cursor: grabbing; }
.strand-label-cell:hover .strand-drag-handle { opacity: 1; }

.strand-name-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.strand-color-swatch {
  flex-shrink: 0;
  width: 10px;
  height: 10px;
  border-radius: 3px;
}

.strand-name {
  flex: 1;
  min-width: 0;
  font-family: var(--font-serif);
  font-size: 13px;
  font-weight: 500;
  color: var(--ink);
  appearance: none;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 3px;
  padding: 1px 3px;
  cursor: text;
  outline: none;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  width: 0; /* flex:1 drives actual width */
}
.strand-name:hover { border-color: var(--border-soft); }
.strand-name:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
  background: var(--surface);
  white-space: normal;
  overflow: visible;
  text-overflow: clip;
}

.strand-trash-btn {
  flex-shrink: 0;
  opacity: 0;
  transition: opacity .15s;
}
.strand-label-cell:hover .strand-trash-btn { opacity: 1; }
.strand-trash-btn:hover { color: var(--danger-ink); }

.strand-beat-count {
  font-family: var(--font-mono);
  font-size: 10.5px;
  color: var(--muted);
  padding-left: 16px;
}

/* ── Beat cells ──────────────────────────────────────────────────── */
.beat-cell {
  border-bottom: 1px solid var(--border-soft);
  border-right: 1px solid var(--border-soft);
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-height: 56px;
  transition: background .12s, outline .1s;
  position: relative;
}

.beat-cell.cell-empty {
  cursor: pointer;
  position: relative;
}
.beat-cell.cell-empty:hover {
  background: var(--surface-2);
}
/* Faint "+ Add beat" hint on hover so the click-affordance is
   discoverable without putting permanent chrome in every empty cell. */
.beat-cell.cell-empty::before {
  content: "+ beat";
  position: absolute; inset: 0;
  display: flex; align-items: center; justify-content: center;
  font-family: var(--font-mono); font-size: 10px;
  letter-spacing: 0.06em; text-transform: uppercase;
  color: var(--muted);
  opacity: 0;
  pointer-events: none;
  transition: opacity .15s;
}
.beat-cell.cell-empty:hover::before { opacity: 0.7; }

.beat-cell.drag-over {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
  background: color-mix(in oklab, var(--accent) 12%, transparent);
}
/* Keyboard focus rings — :focus-visible only, so mouse-clicking a cell
   doesn't leave a permanent ring behind. Matches the accent-soft pattern
   used elsewhere in the app (inputs, JwButton, JwSelect). */
.beat-cell:focus { outline: none; }
.beat-cell:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px var(--accent-soft);
  border-radius: 4px;
}

/* ── Beat cards ──────────────────────────────────────────────────── */
.beat-card {
  display: flex;
  align-items: flex-start;
  gap: 4px;
  border-radius: 6px;
  padding: 6px 8px;
  background: var(--surface-2);
  border: 1px solid var(--border-soft);
  border-left: 6px solid var(--accent); /* color overridden inline */
  font-size: 11.5px;
  line-height: 1.3;
  cursor: grab;
  transition: background .12s, box-shadow .12s;
  min-width: 0;
}
.beat-card:focus { outline: none; }
.beat-card:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px var(--accent-soft);
}
.beat-card:hover {
  background: var(--surface-3);
  box-shadow: 0 1px 4px -1px rgba(0,0,0,.12);
}
.beat-card:active { cursor: grabbing; }

.beat-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ink);
}
.beat-scene {
  flex-shrink: 0;
  font-family: var(--font-mono);
  font-size: 9.5px; letter-spacing: 0.04em;
  padding: 1px 5px; border-radius: 999px;
  background: var(--surface); color: var(--muted);
  border: 1px solid var(--border-soft);
  max-width: 80px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

.beat-del-btn {
  flex-shrink: 0;
  opacity: 0;
  transition: opacity .12s;
}
.beat-card:hover .beat-del-btn { opacity: 1; }
.beat-del-btn:hover { color: var(--danger-ink); }

/* ── Add-beat button shown inside a populated cell ───────────────── */
.cell-add-btn {
  align-self: flex-start;
  opacity: 0;
  border: 1px dashed var(--border);
  background: transparent;
  color: var(--muted);
  border-radius: 5px;
  padding: 2px 6px;
  cursor: pointer;
  font-size: 11px;
  display: flex;
  align-items: center;
  gap: 3px;
  transition: opacity .15s, background .12s;
}
.beat-cell:hover .cell-add-btn { opacity: 1; }
.cell-add-btn:hover { background: var(--surface-2); color: var(--ink-2); border-color: var(--border); }
</style>
