<script setup>
import { computed, ref, onMounted, onBeforeUnmount } from "vue";
import { useProjectStore } from "../stores/project.js";
import { useStudioStore } from "../stores/studio.js";
import { useUiStore } from "../stores/ui.js";
import { useRouter } from "vue-router";
import PaneHeader from "../components/PaneHeader.vue";
import Icon from "../components/Icon.vue";
import RichEditor from "../components/RichEditor.vue";
import PlotlinePicker from "../components/PlotlinePicker.vue";
import { promptDialog, confirmDialog } from "../services/dialog.js";

const props = defineProps({ id: { type: String, default: "" } });
const project = useProjectStore();
const studio = useStudioStore();
const ui = useUiStore();
const router = useRouter();

// chapterId → [{ id, name }] of characters detected in the script.
const speakersByChapter = computed(() => {
  const map = studio.speakersByChapter;
  const out = {};
  for (const [chapterId, set] of Object.entries(map)) {
    out[chapterId] = [...set]
      .map((id) => project.characterById(id))
      .filter(Boolean)
      .map((c) => ({ id: c.id, name: c.name }));
  }
  return out;
});

const mode = ref("edit"); // "edit" | "outline" | "read"
const MODES = [
  { id: "edit",    label: "Edit",    icon: "Quote" },
  { id: "outline", label: "Outline", icon: "List" },
  { id: "read",    label: "Read",    icon: "Eye" },
];

const selectedId = computed(() => props.id || ui.selections.chapters || project.allChapters[0]?.id);
const ch = computed(() => project.chapterById(selectedId.value) || project.allChapters[0]);
const idx = computed(() => project.allChapters.findIndex((c) => c.id === ch.value?.id));
const prev = computed(() => idx.value > 0 ? project.allChapters[idx.value - 1] : null);
const next = computed(() => idx.value < project.allChapters.length - 1 ? project.allChapters[idx.value + 1] : null);

// Scenes for the active chapter. The store recomputes chapter.words
// automatically on each scene body change, so the header counter stays
// live without any local debounce here — the editor's @change handler
// just forwards to the store.
const scenes = computed(() => ch.value ? project.scenesFor(ch.value.id) : []);

function onSceneBodyChange(sceneId, html) {
  if (!ch.value) return;
  project.setSceneBody(ch.value.id, sceneId, html);
}
function onSceneTitleInput(sceneId, title) {
  if (!ch.value) return;
  project.setSceneTitle(ch.value.id, sceneId, title);
}
function addScene() {
  if (!ch.value) return;
  project.addScene(ch.value.id, {});
}
async function removeScene(scene) {
  if (!ch.value) return;
  if (scenes.value.length <= 1) return;
  const yes = await confirmDialog({
    title: scene.title ? `Delete scene "${scene.title}"?` : "Delete this scene?",
    message: "The scene's prose will be discarded. The chapter keeps its other scenes.",
    confirmLabel: "Delete scene",
    danger: true,
  });
  if (!yes) return;
  project.removeScene(ch.value.id, scene.id);
}
function moveScene(sceneId, dir) {
  if (!ch.value) return;
  project.moveScene(ch.value.id, sceneId, dir);
}

// ── Scene drag-and-drop reorder ─────────────────────────────────────
// Direction-based positioning: hovering ANY non-self scene drops the
// dragged scene to the *other side* of the target — because that's the
// only side that actually moves it. Hovering a scene below the dragged
// one → "after target" (move down past it); hovering a scene above →
// "before target" (move up past it). This eliminates the no-op cases
// you'd otherwise hit dropping in B's top half while A was already
// directly above B.
const sceneDrag = ref(null);
const sceneDrop = ref(null);
function onSceneDragStart(sceneId, e) {
  sceneDrag.value = { id: sceneId };
  e.dataTransfer.effectAllowed = "move";
  try { e.dataTransfer.setData("text/plain", sceneId); } catch {}
}
function onSceneDragOver(sceneId, e) {
  const d = sceneDrag.value;
  if (!d || d.id === sceneId) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  const draggedIdx = scenes.value.findIndex((s) => s.id === d.id);
  const targetIdx  = scenes.value.findIndex((s) => s.id === sceneId);
  if (draggedIdx < 0 || targetIdx < 0) return;
  const position = draggedIdx < targetIdx ? "after" : "before";
  if (sceneDrop.value?.id !== sceneId || sceneDrop.value?.position !== position) {
    sceneDrop.value = { id: sceneId, position };
  }
}
function onSceneDrop(targetId) {
  const d = sceneDrag.value, t = sceneDrop.value;
  sceneDrag.value = null; sceneDrop.value = null;
  if (!ch.value || !d || d.id === targetId) return;
  const original = scenes.value.map((s) => s.id);
  const ids = original.filter((id) => id !== d.id);
  let idx = ids.indexOf(targetId);
  if (idx < 0) idx = ids.length;
  if (t?.position === "after") idx += 1;
  ids.splice(idx, 0, d.id);
  // Skip the IPC roundtrip / history entry if the drop didn't actually
  // change the order (e.g. "before B" while A is already right before B).
  if (ids.length === original.length && ids.every((id, i) => id === original[i])) return;
  project.reorderScenes(ch.value.id, ids);
}
function onSceneDragEnd() {
  sceneDrag.value = null;
  sceneDrop.value = null;
}
// Always light up the hovered scene as a drop target — gives instant
// feedback the moment the OS cursor changes to "drop allowed". The
// position bar (drop-before / drop-after) then shows where the dragged
// scene would land. No-op drops are caught at drop time, not by hiding
// the indicator, so the visual stays consistent with the cursor state.
function sceneDropClass(sceneId) {
  if (!sceneDrop.value || sceneDrop.value.id !== sceneId) return null;
  return `scene-drop-target drop-${sceneDrop.value.position}`;
}

// ── CRUD ─────────────────────────────────────────────────────────────
async function addChapter() {
  const title = await promptDialog({
    title: "New chapter",
    label: "Chapter title",
    placeholder: "e.g. The Cartographer",
    confirmLabel: "Create chapter",
  });
  if (!title) return;
  const id = project.addChapter({ title });
  ui.select("chapters", id);
  router.push(`/chapters/${id}`);
  mode.value = "edit";
}
async function deleteChapter() {
  if (!ch.value) return;
  const yes = await confirmDialog({
    title: `Delete "${ch.value.title}"?`,
    message: "This can't be undone.",
    confirmLabel: "Delete",
    danger: true,
  });
  if (!yes) return;
  project.removeChapter(ch.value.id);
  const fallback = project.allChapters[0];
  if (fallback) { ui.select("chapters", fallback.id); router.push(`/chapters/${fallback.id}`); }
  else router.push("/");
}
function updateTitle(id, v) { project.setChapterTitle(id, v); }
function updateStatus(v) { project.setChapterStatus(ch.value.id, v); }

const STATUS_OPTIONS = ["todo", "draft", "revise", "done"];
const STATUS_LABEL = { todo: "To do", draft: "Draft", revise: "Revise", done: "Done" };

// ── Parts ───────────────────────────────────────────────────────────
function updatePartTitle(id, v) { project.updatePart(id, { title: v }); }
function moveChapterPart(chapterId, partId) { project.moveChapterToPart(chapterId, partId); }
function movePart(id, dir) { project.movePart(id, dir); }
function toggleChapterPlotline(chapterId, plotlineId) { project.toggleChapterPlotline(chapterId, plotlineId); }

async function addPart() {
  const title = await promptDialog({
    title: "New part",
    label: "Part title",
    placeholder: `e.g. Part ${project.parts.length + 1} — The Reckoning`,
    confirmLabel: "Create part",
  });
  if (!title) return;
  project.addPart({ title });
}

async function deletePart(part) {
  if (project.parts.length <= 1) return;  // Refuse to leave the project partless.
  const count = part.chapters.length;
  const neighborIdx = project.parts.findIndex((p) => p.id === part.id);
  const neighbor = neighborIdx > 0 ? project.parts[neighborIdx - 1] : project.parts[neighborIdx + 1];
  const message = count
    ? `Its ${count} chapter${count === 1 ? "" : "s"} will move to "${neighbor.title}".`
    : "This part has no chapters.";
  const yes = await confirmDialog({
    title: `Delete "${part.title}"?`,
    message,
    confirmLabel: "Delete part",
    danger: true,
  });
  if (!yes) return;
  project.removePart(part.id);
}

// ── Outline snippet extraction ──────────────────────────────────────
function snippetFor(chapterId) {
  const html = project.chapterBody[chapterId] || "";
  if (!html) return "";
  const div = document.createElement("div");
  div.innerHTML = html;
  // First non-empty <p> that isn't a scene marker.
  const ps = div.querySelectorAll("p");
  for (const p of ps) {
    if (p.classList.contains("scene-mark")) continue;
    const t = p.textContent.trim();
    if (t) return t.length > 220 ? t.slice(0, 220).trim() + "…" : t;
  }
  return "";
}
function goToEdit(id) {
  ui.select("chapters", id);
  router.push(`/chapters/${id}`);
  mode.value = "edit";
}

// ── Read mode navigation ────────────────────────────────────────────
function goPrev() {
  if (!prev.value) return;
  ui.select("chapters", prev.value.id);
  router.push(`/chapters/${prev.value.id}`);
}
function goNext() {
  if (!next.value) return;
  ui.select("chapters", next.value.id);
  router.push(`/chapters/${next.value.id}`);
}
function onKey(e) {
  if (mode.value !== "read") return;
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
  if (e.key === "ArrowLeft")  { e.preventDefault(); goPrev(); }
  if (e.key === "ArrowRight") { e.preventDefault(); goNext(); }
  if (e.key === "Escape")     { e.preventDefault(); mode.value = "edit"; }
}
onMounted(() => window.addEventListener("keydown", onKey));
onBeforeUnmount(() => window.removeEventListener("keydown", onKey));
</script>

<template>
  <!-- ── Header (varies by mode) ─────────────────────────────── -->
  <PaneHeader v-if="ch"
    :eyebrow="mode === 'outline' ? 'Manuscript' : ch.partTitle"
    :title="mode === 'outline' ? 'Outline' : `Chapter ${ch.num} · ${ch.title}`">

    <div class="seg-toggle">
      <button v-for="m in MODES" :key="m.id"
        :class="{ active: mode === m.id }"
        @click="mode = m.id" :title="m.label">
        <Icon :name="m.icon" :size="13" />
        <span>{{ m.label }}</span>
      </button>
    </div>

    <template v-if="mode === 'edit'">
      <router-link v-if="prev" :to="`/chapters/${prev.id}`" custom v-slot="{ navigate }">
        <button class="btn ghost sm" @click="navigate" :title="`Ch. ${prev.num} — ${prev.title}`">
          <Icon name="ChevRight" :size="12" style="transform:rotate(180deg)" /> Prev
        </button>
      </router-link>
      <router-link v-if="next" :to="`/chapters/${next.id}`" custom v-slot="{ navigate }">
        <button class="btn ghost sm" @click="navigate" :title="`Ch. ${next.num} — ${next.title}`">
          Next <Icon name="ChevRight" :size="12" />
        </button>
      </router-link>
      <button class="btn ghost" @click="deleteChapter">Delete</button>
    </template>
    <button class="btn primary" @click="addChapter"><Icon name="Plus" :size="14" /> New chapter</button>
  </PaneHeader>
  <PaneHeader v-else eyebrow="Manuscript" title="No chapters">
    <button class="btn primary" @click="addChapter"><Icon name="Plus" :size="14" /> New chapter</button>
  </PaneHeader>

  <!-- ── OUTLINE MODE ─────────────────────────────────────────── -->
  <div v-if="ch && mode === 'outline'" class="scrollarea" style="flex:1;padding:22px 28px 60px;background:var(--surface)">
    <div style="max-width:820px;margin:0 auto">
      <section v-for="(part, pi) in project.parts" :key="part.id" class="outline-section">
        <div class="outline-part-row">
          <input class="outline-part-input"
            :value="part.title"
            placeholder="Part title"
            @input="updatePartTitle(part.id, $event.target.value)" />
          <div class="outline-part-actions">
            <button class="btn ghost icon sm"
              :disabled="pi === 0"
              :title="pi === 0 ? 'Already the first part' : 'Move part up'"
              @click="movePart(part.id, -1)">
              <Icon name="ChevRight" :size="12" style="transform:rotate(-90deg)" />
            </button>
            <button class="btn ghost icon sm"
              :disabled="pi === project.parts.length - 1"
              :title="pi === project.parts.length - 1 ? 'Already the last part' : 'Move part down'"
              @click="movePart(part.id, 1)">
              <Icon name="ChevRight" :size="12" style="transform:rotate(90deg)" />
            </button>
            <button class="btn ghost icon sm"
              :disabled="project.parts.length <= 1"
              :title="project.parts.length <= 1 ? 'Project needs at least one part' : 'Delete part'"
              @click="deletePart(part)">
              <Icon name="Trash" :size="12" />
            </button>
          </div>
        </div>
        <div class="outline-list">
          <div v-for="c in part.chapters" :key="c.id"
            class="outline-row" :class="{ current: c.id === ch.id }"
            @click="goToEdit(c.id)">
            <span class="status-dot" :class="c.status" style="margin-top:8px" />
            <span class="outline-num">{{ c.num }}</span>
            <div style="flex:1;min-width:0">
              <input class="outline-ttl"
                :value="c.title"
                @click.stop
                @input="updateTitle(c.id, $event.target.value)" />
              <div class="outline-meta">
                <PlotlinePicker
                  :model-value="c.plotlines || []"
                  @toggle="(pid) => toggleChapterPlotline(c.id, pid)" />
                <span class="t-muted" style="font-size:11px">{{ STATUS_LABEL[c.status] }} · {{ c.scenes }} scene{{ c.scenes === 1 ? '' : 's' }}</span>
                <span v-if="speakersByChapter[c.id]?.length" class="speakers-chip"
                  :title="speakersByChapter[c.id].map(s => s.name).join(', ')">
                  <Icon name="Comment" :size="10" />
                  {{ speakersByChapter[c.id].length }} speaker{{ speakersByChapter[c.id].length === 1 ? "" : "s" }}
                </span>
                <label v-if="project.parts.length > 1" class="outline-move" @click.stop>
                  <span class="t-muted" style="font-size:11px">Move to</span>
                  <select class="outline-move-select"
                    :value="part.id"
                    @click.stop
                    @change="moveChapterPart(c.id, $event.target.value)">
                    <option v-for="p in project.parts" :key="p.id" :value="p.id">{{ p.title }}</option>
                  </select>
                </label>
              </div>
              <p v-if="snippetFor(c.id)" class="outline-snip">{{ snippetFor(c.id) }}</p>
              <p v-else class="outline-snip empty">No prose yet</p>
            </div>
            <div class="outline-words">
              <b class="t-num">{{ c.words.toLocaleString() }}</b>
              <div class="t-muted" style="font-size:10.5px">words</div>
            </div>
          </div>
          <div v-if="!part.chapters.length" class="outline-empty-part">
            No chapters in this part yet.
          </div>
        </div>
      </section>
      <button class="btn ghost outline-add-part" @click="addPart">
        <Icon name="Plus" :size="13" /> New part
      </button>
    </div>
  </div>

  <!-- ── READ MODE ────────────────────────────────────────────── -->
  <div v-else-if="ch && mode === 'read'" class="read-mode">
    <div class="manuscript scrollarea">
      <article class="manuscript-inner read-content" v-html="project.chapterBody[ch.id] || `<h1>${ch.title}</h1><p><em>Empty chapter.</em></p>`" />
      <nav class="read-nav">
        <button v-if="prev" class="read-nav-btn" @click="goPrev">
          <Icon name="ChevRight" :size="14" style="transform:rotate(180deg)" />
          <div>
            <div class="read-nav-eyebrow">Previous</div>
            <div class="read-nav-title">Ch. {{ prev.num }} · {{ prev.title }}</div>
          </div>
        </button>
        <span v-else />
        <button v-if="next" class="read-nav-btn align-end" @click="goNext">
          <div>
            <div class="read-nav-eyebrow">Next</div>
            <div class="read-nav-title">Ch. {{ next.num }} · {{ next.title }}</div>
          </div>
          <Icon name="ChevRight" :size="14" />
        </button>
        <span v-else />
      </nav>
      <p class="read-hint">← / → to navigate · Esc to edit</p>
    </div>
  </div>

  <!-- ── EDIT MODE (default) ──────────────────────────────────── -->
  <div v-else-if="ch" class="pane-body">
    <div style="padding:10px 22px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:12px;flex-wrap:wrap">
      <input class="input" style="max-width:360px;font-family:var(--font-serif);font-weight:600"
        :value="ch.title" @input="updateTitle(ch.id, $event.target.value)" />
      <select class="input" style="max-width:120px" :value="ch.status" @change="updateStatus($event.target.value)">
        <option v-for="s in STATUS_OPTIONS" :key="s" :value="s">{{ STATUS_LABEL[s] }}</option>
      </select>
      <PlotlinePicker
        :model-value="ch.plotlines || []"
        @toggle="(pid) => toggleChapterPlotline(ch.id, pid)" />
      <span style="margin-left:auto;font-size:11.5px;color:var(--muted)">
        <b class="t-num" style="color:var(--ink-2)">{{ ch.words.toLocaleString() }}</b> words · {{ scenes.length }} scene{{ scenes.length === 1 ? "" : "s" }}
      </span>
    </div>

    <div class="scrollarea" style="flex:1">
      <div class="scene-stack">
        <div v-for="(scene, sIdx) in scenes" :key="scene.id"
          class="scene-block"
          :class="[sceneDropClass(scene.id), { 'scene-dragging': sceneDrag?.id === scene.id }]">
          <div class="scene-head"
            draggable="true"
            :title="'Drag to reorder this scene'"
            @dragstart="onSceneDragStart(scene.id, $event)"
            @dragend="onSceneDragEnd">
            <Icon name="DragHandle" :size="12" class="scene-grab" />
            <span class="scene-num">Scene {{ sIdx + 1 }}</span>
            <input class="scene-title"
              :value="scene.title"
              :placeholder="`Scene ${sIdx + 1} title (optional)`"
              draggable="false"
              @dragstart.stop.prevent
              @mousedown.stop
              @input="onSceneTitleInput(scene.id, $event.target.value)" />
            <div class="scene-actions">
              <button class="btn ghost icon sm"
                :disabled="sIdx === 0"
                :title="sIdx === 0 ? 'Already the first scene' : 'Move scene up'"
                @click="moveScene(scene.id, -1)">
                <Icon name="ChevRight" :size="12" style="transform:rotate(-90deg)" />
              </button>
              <button class="btn ghost icon sm"
                :disabled="sIdx === scenes.length - 1"
                :title="sIdx === scenes.length - 1 ? 'Already the last scene' : 'Move scene down'"
                @click="moveScene(scene.id, 1)">
                <Icon name="ChevRight" :size="12" style="transform:rotate(90deg)" />
              </button>
              <button class="btn ghost icon sm"
                :disabled="scenes.length <= 1"
                :title="scenes.length <= 1 ? 'A chapter needs at least one scene' : 'Delete scene'"
                @click="removeScene(scene)">
                <Icon name="Trash" :size="12" />
              </button>
            </div>
          </div>
          <RichEditor
            :model-value="scene.body"
            :placeholder="`Write scene ${sIdx + 1}…`"
            @change="(html) => onSceneBodyChange(scene.id, html)" />
          <!-- Drop overlay: only rendered while ANOTHER scene is being
               dragged, so it doesn't interfere with normal editing. It
               sits above TipTap's editor area (which would otherwise eat
               dragover/drop for its own internal drag handling) and turns
               the whole scene block into a drop target. -->
          <div v-if="sceneDrag && sceneDrag.id !== scene.id"
            class="scene-drop-overlay"
            @dragover="onSceneDragOver(scene.id, $event)"
            @drop="onSceneDrop(scene.id)" />
        </div>
        <button class="btn ghost scene-add" @click="addScene">
          <Icon name="Plus" :size="13" /> New scene
        </button>
      </div>
    </div>

    <div style="display:flex;align-items:center;gap:16px;padding:8px 22px;border-top:1px solid var(--border);background:var(--surface-2);font-size:11.5px;color:var(--muted)">
      <span><b class="t-num" style="color:var(--ink)">{{ ch.words.toLocaleString() }}</b> words</span>
      <span style="margin-left:auto">Autosaves to local storage</span>
    </div>
  </div>

  <div v-else class="scrollarea" style="flex:1;display:grid;place-items:center;padding:60px">
    <div class="t-muted" style="text-align:center">
      No chapters yet.<br />
      <button class="btn primary" style="margin-top:14px" @click="addChapter"><Icon name="Plus" :size="14" /> Create your first chapter</button>
    </div>
  </div>
</template>

<style scoped>
.seg-toggle {
  display: inline-flex;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 2px;
  gap: 2px;
}
.seg-toggle button {
  appearance: none; border: 0; background: transparent;
  display: inline-flex; align-items: center; gap: 5px;
  padding: 4px 10px; border-radius: 6px;
  font-size: 11.5px; font-weight: 500;
  color: var(--ink-2);
}
.seg-toggle button:hover { background: var(--surface-3); color: var(--ink); }
.seg-toggle button.active { background: var(--surface); color: var(--ink); box-shadow: var(--shadow-1), 0 0 0 1px var(--border); }

/* ── Outline ───────────────────────────────────────────────── */
.outline-section { margin-bottom: 36px; }
.outline-part {
  font-family: var(--font-serif);
  font-weight: 600; font-size: 18px;
  letter-spacing: -0.01em;
  margin: 0 0 14px;
  color: var(--ink);
  padding-bottom: 10px;
  border-bottom: 1px solid var(--border-soft);
}
.outline-part-row {
  display: flex; align-items: center; gap: 8px;
  margin: 0 0 14px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--border-soft);
}
.outline-part-input {
  flex: 1; min-width: 0;
  appearance: none;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 6px;
  padding: 4px 8px;
  margin-left: -8px;  /* keep optical left-edge alignment with chapter rows */
  font-family: var(--font-serif);
  font-weight: 600; font-size: 18px;
  letter-spacing: -0.01em;
  color: var(--ink);
}
.outline-part-input:hover { border-color: var(--border-soft); }
.outline-part-input:focus { border-color: var(--accent); background: var(--surface); outline: none; box-shadow: 0 0 0 3px var(--accent-soft); }
.outline-part-actions {
  display: flex; align-items: center; gap: 2px;
  opacity: 0.35;
  transition: opacity 0.1s ease;
}
.outline-part-row:hover .outline-part-actions,
.outline-part-input:focus + .outline-part-actions { opacity: 1; }
.outline-part-actions .btn:disabled { opacity: 0.3; cursor: not-allowed; }

.outline-add-part {
  display: flex; align-items: center; gap: 6px;
  margin-top: 8px;
  padding: 10px 14px;
  width: 100%;
  justify-content: center;
  border: 1.5px dashed var(--border-strong);
  background: transparent;
  color: var(--muted);
  font-size: 12.5px;
  font-weight: 500;
}
.outline-add-part:hover { background: var(--surface-2); color: var(--ink); }

/* ── Scene stack (Edit mode) ──────────────────────────────── */
/* The stack fills the chapter pane width — no centering cap, just
   breathing-room padding from the edges. Each scene's prose column
   stays readable via the .manuscript-inner cap inherited from tokens. */
.scene-stack {
  display: flex; flex-direction: column;
  gap: 20px;
  padding: 22px 28px 80px;
  width: 100%;
}

.scene-block {
  display: flex; flex-direction: column;
  position: relative;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 14px;
  overflow: hidden;
  box-shadow: var(--shadow-1);
  transition: border-color .15s ease, box-shadow .15s ease, transform .15s ease, opacity .15s ease;
}
.scene-block.scene-dragging { opacity: 0.4; }
/* Target highlight — fires the instant the cursor enters this scene's
   overlay (in lockstep with the OS "drop allowed" cursor). The position
   bar (drop-before / drop-after) is layered on top to show *where* the
   dragged scene will land. */
.scene-block.scene-drop-target {
  border-color: var(--accent);
  box-shadow: var(--shadow-1), 0 0 0 3px var(--accent-soft);
}
.scene-block.drop-before::before,
.scene-block.drop-after::after {
  content: ""; position: absolute; left: 0; right: 0;
  height: 3px; background: var(--accent);
  pointer-events: none;
  z-index: 12;
}
.scene-block.drop-before::before { top: 0; }
.scene-block.drop-after::after  { bottom: 0; }

/* Transparent drop catcher that floats above the editor while a scene
   drag is in progress. Without this, TipTap's editor view swallows
   dragover events over the prose area and only the (small) scene-head
   strip and the editor's bottom padding ever receive drops. */
.scene-drop-overlay {
  position: absolute;
  inset: 0;
  z-index: 10;
  background: transparent;
  cursor: grabbing;
}
.scene-block:hover { border-color: var(--border-strong); }
.scene-block:focus-within {
  border-color: var(--accent);
  box-shadow: var(--shadow-1), 0 0 0 3px var(--accent-soft);
}
/* Accent stripe down the left edge of the focused scene, matching the
   plotline-card pattern so the editor feels consistent. */
.scene-block::before {
  content: "";
  position: absolute; left: 0; top: 0; bottom: 0;
  width: 3px;
  background: transparent;
  transition: background .15s ease;
}
.scene-block:focus-within::before { background: var(--accent); }

.scene-head {
  display: flex; align-items: center; gap: 12px;
  padding: 12px 18px;
  background: var(--surface-2);
  border-bottom: 1px solid var(--border-soft);
  cursor: grab;
  user-select: none;
}
.scene-head:active { cursor: grabbing; }
.scene-grab {
  color: var(--subtle);
  opacity: 0;
  transition: opacity .12s ease;
  flex-shrink: 0;
}
.scene-block:hover .scene-grab,
.scene-block:focus-within .scene-grab { opacity: 0.7; }
.scene-num {
  display: inline-flex; align-items: center;
  padding: 2px 8px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 999px;
  font-size: 10px; font-weight: 600;
  text-transform: uppercase; letter-spacing: 0.08em;
  color: var(--muted);
  flex-shrink: 0;
}
.scene-block:focus-within .scene-num {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--on-accent);
}
.scene-title {
  flex: 1; min-width: 0;
  appearance: none;
  border: 1px solid transparent;
  background: transparent;
  border-radius: 6px;
  padding: 4px 8px;
  margin-left: -8px;
  font-family: var(--font-serif);
  font-size: 16px;
  font-weight: 600;
  color: var(--ink);
  letter-spacing: -0.01em;
  outline: none;
}
.scene-title:hover { border-color: var(--border-soft); }
.scene-title:focus {
  border-color: var(--accent);
  background: var(--surface);
  box-shadow: 0 0 0 2px var(--accent-soft);
}
.scene-title::placeholder {
  color: var(--muted);
  font-weight: 400;
  font-style: italic;
}
.scene-actions {
  display: flex; align-items: center; gap: 2px;
  opacity: 0;
  transition: opacity 0.12s ease;
  flex-shrink: 0;
}
.scene-block:hover .scene-actions,
.scene-block:focus-within .scene-actions { opacity: 1; }
.scene-actions .btn:disabled { opacity: 0.3; cursor: not-allowed; }

/* The RichEditor inside a scene defaults to its `manuscript` variant
   (paper background, internal scroll, 760px centered column).
   Re-host it inside the scene block:
     - drop its internal scroll so the outer .scrollarea handles it
     - drop the paper gradient (the scene card supplies the surface)
     - keep the readable prose column via .manuscript-inner's max-width
       but tighten the vertical padding so the editor doesn't look
       overstuffed at the top of every scene. */
.scene-block :deep(.manuscript) {
  flex: none;
  overflow: visible;
  background: transparent;
  padding: 0;
}
.scene-block :deep(.manuscript-inner) {
  padding: 28px 44px 36px;
  max-width: 720px;
}
.scene-block :deep(.editor-toolbar) {
  border-radius: 0;
  border-left: 0;
  border-right: 0;
  border-top: 0;
  background: var(--surface);
}

.scene-add {
  display: flex; align-items: center; gap: 6px;
  margin-top: 4px;
  padding: 14px 16px;
  width: 100%;
  justify-content: center;
  border: 1.5px dashed var(--border-strong);
  border-radius: 12px;
  background: transparent;
  color: var(--muted);
  font-size: 13px;
  font-weight: 500;
  letter-spacing: -0.005em;
  transition: background .12s ease, color .12s ease, border-color .12s ease;
}
.scene-add:hover {
  background: var(--surface-2);
  color: var(--ink);
  border-color: var(--accent);
}

.outline-move {
  display: inline-flex; align-items: center; gap: 4px;
  margin-left: auto;
}
.outline-move-select {
  appearance: none;
  border: 1px solid var(--border);
  background: var(--surface);
  border-radius: 5px;
  padding: 2px 6px;
  font: inherit;
  font-size: 11px;
  color: var(--ink-2);
  max-width: 180px;
}
.outline-move-select:hover { border-color: var(--border-strong); color: var(--ink); }
.outline-move-select:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-soft); }


.outline-empty-part {
  font-size: 12px; font-style: italic; color: var(--muted);
  padding: 14px 16px;
  border: 1px dashed var(--border-soft);
  border-radius: 10px;
  text-align: center;
}

.outline-list { display: flex; flex-direction: column; gap: 6px; }

.outline-row {
  display: grid;
  grid-template-columns: auto auto 1fr auto;
  gap: 14px;
  padding: 14px 16px;
  background: var(--surface);
  border: 1px solid var(--border-soft);
  border-radius: 10px;
  cursor: default;
  transition: background .1s ease, border-color .1s ease;
}
.outline-row:hover { background: var(--surface-2); border-color: var(--border); }
.outline-row.current { background: var(--accent-soft); border-color: var(--accent-line); }

.outline-num {
  font-family: var(--font-serif); font-style: italic;
  font-variant-numeric: tabular-nums;
  color: var(--muted);
  font-size: 18px;
  width: 28px; text-align: right;
  padding-top: 2px;
}

.outline-ttl {
  font-family: var(--font-serif);
  font-size: 16px; font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--ink);
  border: 0; background: transparent; padding: 0;
  width: 100%;
  outline: none;
}
.outline-ttl:focus { background: var(--surface); padding: 2px 6px; border-radius: 4px; }

.outline-meta {
  display: flex; gap: 10px; align-items: center;
  flex-wrap: wrap;
  margin-top: 4px; margin-bottom: 8px;
}

.outline-snip {
  margin: 0;
  font-family: var(--font-serif);
  font-size: 13.5px; line-height: 1.55;
  color: var(--ink-2);
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
  overflow: hidden;
}
.outline-snip.empty { color: var(--subtle); font-style: italic; }

.speakers-chip {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 1px 6px;
  background: var(--accent-soft);
  color: var(--accent-ink);
  border-radius: 4px;
  font-size: 10.5px;
  font-weight: 500;
}

.outline-words {
  text-align: right;
  align-self: center;
  min-width: 60px;
}

/* ── Read mode ─────────────────────────────────────────────── */
.read-mode {
  flex: 1; min-height: 0;
  display: flex; flex-direction: column;
  background:
    radial-gradient(800px 600px at 50% 0%, oklch(0.99 0.005 85), transparent 60%),
    var(--paper);
}
html[data-theme="dark"] .read-mode {
  background:
    radial-gradient(800px 600px at 50% 0%, oklch(0.28 0.008 80), transparent 60%),
    var(--paper);
}
.read-content {
  max-width: 680px;
  font-size: 19px;
  line-height: 1.85;
  padding-bottom: 60px;
}
.read-content :deep(h1) {
  font-size: 32px;
  margin-bottom: 30px;
}
.read-nav {
  max-width: 680px;
  margin: 24px auto 0;
  padding: 24px 0 12px;
  border-top: 1px solid var(--border-soft);
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
.read-nav-btn {
  appearance: none;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 12px 14px;
  display: flex; align-items: center; gap: 10px;
  text-align: left;
  color: var(--ink);
}
.read-nav-btn:hover { background: var(--surface-2); border-color: var(--border-strong); }
.read-nav-btn.align-end { justify-content: flex-end; text-align: right; }
.read-nav-eyebrow { font-size: 10.5px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); }
.read-nav-title { font-family: var(--font-serif); font-size: 14px; font-weight: 600; margin-top: 2px; }
.read-hint {
  max-width: 680px;
  margin: 4px auto 30px;
  text-align: center;
  font-size: 11px;
  color: var(--subtle);
  font-family: var(--font-mono);
}
</style>
