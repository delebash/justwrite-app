<script setup>
import { computed, ref, onMounted, onBeforeUnmount } from "vue";
import { useProjectStore } from "../stores/project.js";
import { useStudioStore } from "../stores/studio.js";
import { useUiStore } from "../stores/ui.js";
import { useRouter } from "vue-router";
import PaneHeader from "../components/PaneHeader.vue";
import Icon from "../components/Icon.vue";
import RichEditor from "../components/RichEditor.vue";
import SceneLinks from "../components/SceneLinks.vue";
import { promptDialog, confirmDialog } from "../services/dialog.js";

const props = defineProps({
  id: { type: String, default: "" },
  sceneId: { type: String, default: "" },
});
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
const linksOpen = ref(false);
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

// Sidebar links a scene via `/chapters/<chId>/<sceneId>`. When the
// sceneId path param is present, we show the scene editor; otherwise
// the pane shows a chapter overview (no scene strip / RichEditor).
const activeScene = computed(() => {
  if (!props.sceneId) return null;
  return scenes.value.find((s) => s.id === props.sceneId) || null;
});
const activeSceneIdx = computed(() =>
  activeScene.value ? scenes.value.findIndex((s) => s.id === activeScene.value.id) : -1);
const prevScene = computed(() => activeSceneIdx.value > 0 ? scenes.value[activeSceneIdx.value - 1] : null);
const nextScene = computed(() => activeSceneIdx.value >= 0 && activeSceneIdx.value < scenes.value.length - 1 ? scenes.value[activeSceneIdx.value + 1] : null);

function goToScene(sceneId) {
  if (!ch.value || !sceneId) return;
  router.push(`/chapters/${ch.value.id}/${sceneId}`);
}
function openScene(chapterId, sceneId) {
  if (!chapterId || !sceneId) return;
  ui.select("chapters", chapterId);
  router.push(`/chapters/${chapterId}/${sceneId}`);
  mode.value = "edit";
}
function addSceneHere() {
  if (!ch.value) return;
  const id = project.addScene(ch.value.id, {});
  if (id) goToScene(id);
}

function onSceneBodyChange(sceneId, html) {
  if (!ch.value) return;
  project.setSceneBody(ch.value.id, sceneId, html);
}
function onSceneTitleInput(sceneId, title) {
  if (!ch.value) return;
  project.setSceneTitle(ch.value.id, sceneId, title);
}
async function removeScene(scene) {
  if (!ch.value || !scene) return;
  if (scenes.value.length <= 1) return;
  const yes = await confirmDialog({
    title: scene.title ? `Delete scene "${scene.title}"?` : "Delete this scene?",
    message: "The scene's prose will be discarded. The chapter keeps its other scenes.",
    confirmLabel: "Delete scene",
    danger: true,
  });
  if (!yes) return;
  // After delete, move to the next remaining scene (or the previous if
  // we just deleted the last one).
  const fallback = nextScene.value || prevScene.value;
  project.removeScene(ch.value.id, scene.id);
  if (fallback) goToScene(fallback.id);
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
async function addChapterToPart(partId) {
  const title = await promptDialog({
    title: "New chapter",
    label: "Chapter title",
    placeholder: "e.g. The first crossing",
    confirmLabel: "Create chapter",
  });
  if (!title) return;
  const id = project.addChapter({ title, partId });
  if (id) { ui.select("chapters", id); router.push(`/chapters/${id}`); mode.value = "outline"; }
}
async function addSceneToChapter(chapterId) {
  const values = await promptDialog({
    title: "New scene",
    confirmLabel: "Add scene",
    fields: [{
      key: "title",
      label: "Scene title",
      placeholder: "Leave blank for an untitled scene",
      optional: true,
    }],
  });
  if (!values) return;
  const t = (values.title || "").trim();
  const id = project.addScene(chapterId, t ? { title: t } : {});
  ui.expanded = { ...ui.expanded, [`chapter:${chapterId}`]: true };
  // Stay in outline mode so the user sees the new scene appear in place.
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
  <div v-if="ch && mode === 'outline'" class="scrollarea outline-pane">
    <div class="outline-tree">
      <section v-for="(part, pi) in project.parts" :key="part.id" class="ol-part">
        <div class="ol-part-row">
          <span class="ol-part-eyebrow">Part {{ pi + 1 }}</span>
          <input class="ol-part-title"
            :value="part.title"
            placeholder="Untitled part"
            @input="updatePartTitle(part.id, $event.target.value)" />
          <div class="ol-row-actions">
            <button class="btn ghost icon sm"
              :disabled="pi === 0"
              title="Move part up"
              @click="movePart(part.id, -1)">
              <Icon name="ChevRight" :size="12" style="transform:rotate(-90deg)" />
            </button>
            <button class="btn ghost icon sm"
              :disabled="pi === project.parts.length - 1"
              title="Move part down"
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

        <div class="ol-chapter-list">
          <div v-for="c in part.chapters" :key="c.id" class="ol-chapter">
            <div class="ol-chapter-row" :class="{ current: c.id === ch.id }"
              @click="goToEdit(c.id)">
              <span class="status-dot" :class="c.status" />
              <span class="ol-chapter-num">{{ c.num }}</span>
              <input class="ol-chapter-title"
                :value="c.title"
                placeholder="Untitled chapter"
                @click.stop
                @input="updateTitle(c.id, $event.target.value)" />
              <span class="ol-chapter-meta">
                {{ c.scenes }} scene{{ c.scenes === 1 ? '' : 's' }} · {{ c.words.toLocaleString() }} words
              </span>
              <div class="ol-row-actions">
                <label v-if="project.parts.length > 1" class="ol-move-to" @click.stop>
                  <select class="ol-move-select"
                    :value="part.id"
                    @click.stop
                    @change="moveChapterPart(c.id, $event.target.value)">
                    <option v-for="p in project.parts" :key="p.id" :value="p.id">Move to: {{ p.title }}</option>
                  </select>
                </label>
              </div>
            </div>

            <div class="ol-scene-list">
              <div v-for="(scn, si) in project.scenesFor(c.id)" :key="scn.id"
                class="ol-scene-row"
                @click="openScene(c.id, scn.id)">
                <span class="ol-scene-bullet">{{ c.num }}.{{ si + 1 }}</span>
                <input class="ol-scene-title"
                  :value="scn.title"
                  :placeholder="`Scene ${si + 1}`"
                  @click.stop
                  @input="project.setSceneTitle(c.id, scn.id, $event.target.value)" />
              </div>
              <button class="ol-add ol-add-scene" @click="addSceneToChapter(c.id)">
                <Icon name="Plus" :size="11" /> Add scene
              </button>
            </div>
          </div>
          <button class="ol-add ol-add-chapter" @click="addChapterToPart(part.id)">
            <Icon name="Plus" :size="11" /> Add chapter
          </button>
        </div>
      </section>
      <button class="btn ghost ol-add-part" @click="addPart">
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
      <span style="margin-left:auto;font-size:11.5px;color:var(--muted)">
        <b class="t-num" style="color:var(--ink-2)">{{ ch.words.toLocaleString() }}</b> words · {{ scenes.length }} scene{{ scenes.length === 1 ? "" : "s" }}
      </span>
    </div>

    <!-- Single-scene editor: which scene shows is driven by the route
         hash (#scene-<id>), set by the sidebar's scene list. -->
    <div v-if="activeScene" class="scene-strip">
      <button class="btn ghost sm"
        :disabled="!prevScene"
        :title="prevScene ? `Scene ${activeSceneIdx} — ${prevScene.title || 'Untitled'}` : 'Already the first scene'"
        @click="prevScene && goToScene(prevScene.id)">
        <Icon name="ChevRight" :size="12" style="transform:rotate(180deg)" /> Prev scene
      </button>
      <span class="scene-pill">Scene {{ activeSceneIdx + 1 }} of {{ scenes.length }}</span>
      <button class="btn ghost sm"
        :disabled="!nextScene"
        :title="nextScene ? `Scene ${activeSceneIdx + 2} — ${nextScene.title || 'Untitled'}` : 'Already the last scene'"
        @click="nextScene && goToScene(nextScene.id)">
        Next scene <Icon name="ChevRight" :size="12" />
      </button>
      <input class="scene-title-input"
        :value="activeScene.title"
        :placeholder="`Scene ${activeSceneIdx + 1} title (optional)`"
        @input="onSceneTitleInput(activeScene.id, $event.target.value)" />
      <div class="scene-strip-actions">
        <button class="btn scene-links-btn" title="Links — POV, characters, locations, objects, strands"
          @click="linksOpen = true">
          <Icon name="Network" :size="13" /> Links
        </button>
        <button class="btn ghost icon sm"
          :disabled="scenes.length <= 1"
          :title="scenes.length <= 1 ? 'A chapter needs at least one scene' : 'Delete scene'"
          @click="removeScene(activeScene)">
          <Icon name="Trash" :size="12" />
        </button>
      </div>
    </div>

    <SceneLinks v-if="linksOpen && activeScene"
      :chapter-id="ch.id"
      :scene-id="activeScene.id"
      @close="linksOpen = false" />

    <div class="scrollarea" style="flex:1">
      <RichEditor v-if="activeScene"
        :key="activeScene.id"
        :model-value="activeScene.body"
        :placeholder="`Write scene ${activeSceneIdx + 1}…`"
        @change="(html) => onSceneBodyChange(activeScene.id, html)" />

      <!-- Chapter overview: shown when no scene is picked yet. Lists
           every scene as a clickable card so the user can drop into one. -->
      <div v-else class="chapter-overview">
        <h2 class="chapter-overview-title">{{ ch.title }}</h2>
        <p class="chapter-overview-hint">
          {{ scenes.length
              ? "Pick a scene below (or from the sidebar) to start writing."
              : "This chapter has no scenes yet. Add one to start writing." }}
        </p>
        <div v-if="scenes.length" class="chapter-overview-scenes">
          <button v-for="(scn, sIdx) in scenes" :key="scn.id"
            class="overview-scene-card"
            @click="goToScene(scn.id)">
            <span class="overview-scene-num">Scene {{ sIdx + 1 }}</span>
            <span class="overview-scene-title">{{ scn.title || `Untitled scene` }}</span>
            <span class="overview-scene-snippet">{{ snippetFor(ch.id) && sIdx === 0 ? snippetFor(ch.id) : '' }}</span>
          </button>
        </div>
        <button class="overview-add-scene" @click="addSceneHere">
          <Icon name="Plus" :size="13" /> {{ scenes.length ? "Add another scene" : "Add first scene" }}
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

/* ── Outline (tree) ────────────────────────────────────────── */
.outline-pane {
  flex: 1;
  padding: 22px 28px 60px;
  background: var(--surface);
}
.outline-tree {
  max-width: 860px;
  margin: 0 auto;
}

/* Part — level 0 */
.ol-part { margin-bottom: 28px; }
.ol-part-row {
  display: flex; align-items: center; gap: 10px;
  padding: 4px 6px 8px;
  border-bottom: 1px solid var(--border);
  margin-bottom: 6px;
}
.ol-part-eyebrow {
  font-size: 10px; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.1em;
  color: var(--muted);
  flex-shrink: 0;
}
.ol-part-title {
  flex: 1; min-width: 0;
  appearance: none;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 6px;
  padding: 4px 8px;
  margin-left: -4px;
  font-family: var(--font-serif);
  font-weight: 600; font-size: 19px;
  letter-spacing: -0.01em;
  color: var(--ink);
  outline: none;
}
.ol-part-title:hover { border-color: var(--border-soft); }
.ol-part-title:focus { border-color: var(--accent); background: var(--surface-2); box-shadow: 0 0 0 2px var(--accent-soft); }

/* Chapter list — level 1, indented under part */
.ol-chapter-list {
  display: flex; flex-direction: column;
  gap: 2px;
  padding-left: 22px;
  border-left: 1px solid var(--border-soft);
  margin-left: 6px;
}
.ol-chapter { display: flex; flex-direction: column; }
.ol-chapter-row {
  display: grid;
  grid-template-columns: auto auto 1fr auto auto;
  align-items: center;
  gap: 10px;
  padding: 6px 8px;
  border-radius: 6px;
  cursor: pointer;
  transition: background .12s ease;
}
.ol-chapter-row:hover { background: var(--surface-2); }
.ol-chapter-row.current { background: var(--accent-soft); }
.ol-chapter-num {
  font-variant-numeric: tabular-nums;
  font-family: var(--font-serif); font-style: italic;
  color: var(--muted); font-size: 13px;
  width: 22px; text-align: right;
}
.ol-chapter-title {
  min-width: 0;
  appearance: none;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 5px;
  padding: 3px 6px;
  font-family: var(--font-serif);
  font-size: 15px; font-weight: 600;
  letter-spacing: -0.005em;
  color: var(--ink);
  outline: none;
}
.ol-chapter-title:hover { border-color: var(--border-soft); }
.ol-chapter-title:focus { border-color: var(--accent); background: var(--surface); box-shadow: 0 0 0 2px var(--accent-soft); }
.ol-chapter-meta {
  font-size: 11px;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.ol-row-actions {
  display: flex; align-items: center; gap: 4px;
  opacity: 0.4;
  transition: opacity .1s ease;
}
.ol-part-row:hover .ol-row-actions,
.ol-chapter-row:hover .ol-row-actions { opacity: 1; }
.ol-row-actions .btn:disabled { opacity: 0.3; cursor: not-allowed; }

/* Move-to chapter→part dropdown */
.ol-move-to { display: inline-flex; align-items: center; }
.ol-move-select {
  appearance: none;
  border: 1px solid var(--border);
  background: var(--surface);
  border-radius: 5px;
  padding: 2px 6px;
  font: inherit;
  font-size: 11px;
  color: var(--ink-2);
  max-width: 200px;
}
.ol-move-select:hover { border-color: var(--border-strong); color: var(--ink); }
.ol-move-select:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-soft); }

/* Scene list — level 2, indented under chapter */
.ol-scene-list {
  display: flex; flex-direction: column;
  gap: 1px;
  padding-left: 22px;
  border-left: 1px dashed var(--border-soft);
  margin-left: 18px;
  margin-bottom: 6px;
}
.ol-scene-row {
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: center;
  gap: 10px;
  padding: 4px 8px;
  border-radius: 5px;
  cursor: pointer;
  transition: background .12s ease;
}
.ol-scene-row:hover { background: var(--surface-2); }
.ol-scene-bullet {
  font-variant-numeric: tabular-nums;
  font-family: var(--font-mono);
  color: var(--subtle);
  font-size: 10.5px;
  width: 28px;
  text-align: right;
}
.ol-scene-title {
  min-width: 0;
  appearance: none;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 4px;
  padding: 2px 6px;
  font-family: var(--font-serif);
  font-style: italic;
  font-size: 13px;
  color: var(--ink-2);
  outline: none;
}
.ol-scene-title:hover { border-color: var(--border-soft); color: var(--ink); }
.ol-scene-title:focus { border-color: var(--accent); background: var(--surface); color: var(--ink); box-shadow: 0 0 0 2px var(--accent-soft); font-style: normal; }
.ol-scene-title::placeholder { color: var(--subtle); }

/* "+ Add" buttons at each level (scene / chapter / part) */
.ol-add {
  display: inline-flex; align-items: center; gap: 5px;
  border: 0;
  background: transparent;
  color: var(--muted);
  font: inherit;
  font-size: 11.5px;
  font-weight: 500;
  padding: 4px 8px;
  border-radius: 5px;
  cursor: pointer;
  text-align: left;
}
.ol-add:hover { color: var(--accent); background: var(--accent-soft); }
.ol-add-scene { margin: 2px 0 4px; }
.ol-add-chapter { margin-top: 4px; align-self: flex-start; }
.ol-add-part {
  display: flex; align-items: center; gap: 6px;
  margin-top: 10px;
  padding: 10px 14px;
  width: 100%;
  justify-content: center;
  border: 1.5px dashed var(--border-strong);
  background: transparent;
  color: var(--muted);
  font-size: 12.5px;
  font-weight: 500;
  border-radius: 10px;
  cursor: pointer;
}
.ol-add-part:hover { background: var(--surface-2); color: var(--ink); border-color: var(--accent); }

/* ── Scene strip (Edit mode) ──────────────────────────────── */
/* Thin top bar above the editor with prev/next nav, current scene
   pill, inline title, and per-scene actions. Only one scene's prose
   shows below at a time — driven by the route's #scene-<id> hash. */
.scene-strip {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 22px;
  border-bottom: 1px solid var(--border);
  background: var(--surface-2);
  flex-wrap: wrap;
}
.scene-pill {
  display: inline-flex; align-items: center;
  padding: 2px 10px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 999px;
  font-size: 10.5px; font-weight: 600;
  text-transform: uppercase; letter-spacing: 0.08em;
  color: var(--muted);
  flex-shrink: 0;
}
.scene-title-input {
  flex: 1; min-width: 160px;
  appearance: none;
  border: 1px solid transparent;
  background: transparent;
  border-radius: 6px;
  padding: 4px 8px;
  font-family: var(--font-serif);
  font-size: 15px;
  font-weight: 600;
  color: var(--ink);
  letter-spacing: -0.01em;
  outline: none;
}
.scene-title-input:hover { border-color: var(--border-soft); }
.scene-title-input:focus {
  border-color: var(--accent);
  background: var(--surface);
  box-shadow: 0 0 0 2px var(--accent-soft);
}
.scene-title-input::placeholder {
  color: var(--muted);
  font-weight: 400;
  font-style: italic;
}
.scene-strip-actions {
  display: flex; align-items: center; gap: 8px;
  flex-shrink: 0;
}
.scene-strip-actions .btn:disabled { opacity: 0.3; cursor: not-allowed; }

/* "Links" button — stands out from the muted scene-strip controls. */
.scene-links-btn {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 6px 12px;
  background: var(--accent);
  color: var(--on-accent);
  border: 1px solid var(--accent);
  border-radius: 7px;
  font-size: 12.5px;
  font-weight: 600;
  letter-spacing: 0.01em;
  cursor: pointer;
  box-shadow: 0 1px 0 rgba(0,0,0,0.06), 0 0 0 0 var(--accent-soft);
  transition: background .12s ease, box-shadow .12s ease, transform .08s ease;
}
.scene-links-btn:hover {
  background: color-mix(in oklab, var(--accent), black 8%);
  box-shadow: 0 1px 0 rgba(0,0,0,0.06), 0 0 0 3px var(--accent-soft);
}
.scene-links-btn:active { transform: translateY(1px); }

/* ── Chapter overview (no scene picked yet) ───────────────── */
.chapter-overview {
  padding: 32px 28px 60px;
  max-width: 720px;
  margin: 0 auto;
}
.chapter-overview-title {
  font-family: var(--font-serif);
  font-size: 28px; font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--ink);
  margin: 0 0 8px;
}
.chapter-overview-hint {
  font-size: 13.5px; color: var(--ink-2);
  margin: 0 0 28px;
  line-height: 1.55;
}
.chapter-overview-scenes {
  display: flex; flex-direction: column;
  gap: 10px;
  margin-bottom: 16px;
}
.overview-scene-card {
  appearance: none; border: 1px solid var(--border);
  background: var(--surface);
  border-radius: 10px;
  padding: 14px 18px;
  display: grid;
  grid-template-columns: auto 1fr;
  column-gap: 14px;
  row-gap: 4px;
  text-align: left;
  cursor: pointer;
  transition: border-color .12s ease, box-shadow .12s ease, transform .08s ease;
}
.overview-scene-card:hover {
  border-color: var(--accent);
  box-shadow: var(--shadow-1), 0 0 0 3px var(--accent-soft);
}
.overview-scene-card:active { transform: translateY(1px); }
.overview-scene-num {
  font-size: 10px; font-weight: 600;
  text-transform: uppercase; letter-spacing: 0.08em;
  color: var(--muted);
  align-self: center;
  padding: 2px 8px;
  background: var(--surface-2);
  border-radius: 999px;
  flex-shrink: 0;
}
.overview-scene-title {
  font-family: var(--font-serif);
  font-size: 16px; font-weight: 600;
  color: var(--ink);
}
.overview-scene-snippet {
  grid-column: 2;
  font-size: 13px;
  color: var(--ink-2);
  font-style: italic;
  line-height: 1.5;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.overview-add-scene {
  appearance: none; border: 1.5px dashed var(--border-strong);
  background: transparent;
  border-radius: 10px;
  padding: 12px 16px;
  width: 100%;
  display: flex; align-items: center; justify-content: center; gap: 6px;
  font: inherit;
  font-size: 13px; font-weight: 500;
  color: var(--muted);
  cursor: pointer;
  transition: background .12s ease, color .12s ease, border-color .12s ease;
}
.overview-add-scene:hover {
  background: var(--surface-2);
  color: var(--ink);
  border-color: var(--accent);
}

.speakers-chip {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 1px 6px;
  background: var(--accent-soft);
  color: var(--accent-ink);
  border-radius: 4px;
  font-size: 10.5px;
  font-weight: 500;
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
