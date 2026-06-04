<script setup>
import { computed, ref, watch, nextTick, onMounted, onBeforeUnmount } from "vue";
import { useProjectStore } from "../stores/project.js";
import { useStudioStore } from "../stores/studio.js";
import { useUiStore } from "../stores/ui.js";
import { useRouter } from "vue-router";
import PaneHeader from "../components/PaneHeader.vue";
import Icon from "../components/Icon.vue";
import RichEditor from "../components/RichEditor.vue";
import SceneLinks from "../components/SceneLinks.vue";
import VersionHistoryModal from "../components/VersionHistoryModal.vue";
import CritiqueModal from "../components/CritiqueModal.vue";
import EmptyState from "../components/EmptyState.vue";
import StatusSelect from "../components/StatusSelect.vue";
import Breadcrumb from "../components/Breadcrumb.vue";
import { promptDialog, confirmDialog } from "../services/dialog.js";
import { stitchChapter, splitChapter } from "../services/chapterStitch.js";
import { EDITOR_TOOLBAR_FULL } from "../services/editorToolbars.js";
import JwButton from "@renderer/components/ui/JwButton.vue";
import JwSelect from "@renderer/components/ui/JwSelect.vue";

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

const mode = ref("edit"); // "edit" | "outline" | "cards" | "read"
// Read mode has two scopes: a single chapter (existing prev/next paging) or
// the whole book stitched into one continuous scroll. In whole-book scope an
// IntersectionObserver tracks which scene is in view and updates the sidebar.
const readScope = ref("chapter"); // "chapter" | "book"
const linksOpen = ref(false);
const versionsOpen = ref(false);
const critiqueOpen = ref(false);
const MODES = [
  { id: "edit",    label: "Edit",    icon: "Quote" },
  { id: "outline", label: "Outline", icon: "List" },
  { id: "cards",   label: "Cards",   icon: "Grid" },
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

// Live word/char counts for the active scene, shown in the editor card's
// footer. Driven off the scene body (updated on every keystroke via the
// store) so they track typing without reaching into the editor.
function plainText(html) {
  if (!html) return "";
  const div = document.createElement("div");
  div.innerHTML = html;
  return div.textContent || "";
}
// Counts at the bottom of the editor — scoped to the active scene in
// single-scene mode, rolled up across every scene in the chapter when
// the writer is editing in continuous mode. Same computed pair drives
// the footer regardless of mode.
const sceneWordCount = computed(() => {
  if (continuousMode.value) {
    return scenes.value.reduce((sum, s) => {
      const t = plainText(s.body).trim();
      return sum + (t ? t.split(/\s+/).length : 0);
    }, 0);
  }
  const t = plainText(activeScene.value?.body).trim();
  return t ? t.split(/\s+/).length : 0;
});
const sceneCharCount = computed(() => {
  if (continuousMode.value) {
    return scenes.value.reduce((sum, s) => sum + plainText(s.body).length, 0);
  }
  return plainText(activeScene.value?.body).length;
});

// Read view shows the prose as a continuous chapter — no scene titles, no
// "* * *" scene marks, no editorial comment marks. Just the words, like a
// printed book. The underlying chapterBody getter still carries that
// structure for Studio / search / export consumers.
function readBody(chId) {
  const html = project.chapterBody[chId];
  if (!html) return `<h1>${ch.value?.title || ""}</h1><p><em>Empty chapter.</em></p>`;
  const div = document.createElement("div");
  div.innerHTML = html;
  div.querySelectorAll("h2.scene-title, p.scene-mark").forEach((el) => el.remove());
  div.querySelectorAll("span.comment-mark").forEach((el) => el.replaceWith(...el.childNodes));
  // Pending AI revisions are authoring chrome — strip from the read view:
  // delete the "before" entirely, unwrap the "after" so only the candidate
  // prose remains. Any paragraph left empty after the del-strip is removed.
  div.querySelectorAll("del[data-ai-del], .ai-del").forEach((el) => el.remove());
  div.querySelectorAll("ins[data-ai-ins], .ai-ins").forEach((el) => el.replaceWith(...el.childNodes));
  div.querySelectorAll("p").forEach((p) => {
    if (!p.textContent.trim() && !p.querySelector("img")) p.remove();
  });
  return div.innerHTML;
}

// Editor header breadcrumb: Part (→ outline) › Chapter (→ chapter overview)
// › Scene (current). The part hops to outline mode (local state, not a
// route); the chapter drops the scene param to show the chapter overview.
const crumbs = computed(() => {
  if (!ch.value) return [];
  const segs = [{ label: ch.value.partTitle || "Manuscript", onClick: () => { mode.value = "outline"; } }];
  if (activeScene.value) {
    segs.push({ label: `Ch. ${ch.value.num} · ${ch.value.title}`, to: `/chapters/${ch.value.id}` });
    segs.push({ label: `Scene ${activeSceneIdx.value + 1}` });
  } else {
    segs.push({ label: `Ch. ${ch.value.num}` });
  }
  return segs;
});

// A navigation to a different chapter/scene (e.g. clicking the sidebar)
// should drop the structural overview modes back into the editor —
// otherwise outline/cards are "sticky" and swallow the navigation. Read
// mode is left alone so its own prev/next chapter paging keeps working.
watch(() => [props.id, props.sceneId], () => {
  if (mode.value === "outline" || mode.value === "cards") mode.value = "edit";
});

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

// ── Corkboard (cards mode) ───────────────────────────────────────────
const dragSceneId = ref(null);
function synopsis(scene) {
  const text = (scene.body || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return text.length > 180 ? text.slice(0, 180) + "…" : text;
}
function onCardDragStart(id) { dragSceneId.value = id; }
function onCardDrop(targetId) {
  const from = dragSceneId.value;
  dragSceneId.value = null;
  if (!from || from === targetId || !ch.value) return;
  const ids = scenes.value.map((s) => s.id);
  const fromIdx = ids.indexOf(from);
  const toIdx = ids.indexOf(targetId);
  if (fromIdx < 0 || toIdx < 0) return;
  ids.splice(fromIdx, 1);
  ids.splice(toIdx, 0, from);
  project.reorderScenes(ch.value.id, ids);
}

function onSceneBodyChange(sceneId, html) {
  if (!ch.value) return;
  project.setSceneBody(ch.value.id, sceneId, html);
}

// Active scene's status — drives the scene-strip pill's color, so the
// writer always sees the open scene's state at a glance (draft / revise
// / done / etc.). Falls back to the chapter's status if the scene
// doesn't have one of its own. null = no color (pill stays neutral).
const activeStatus = computed(() => {
  const id = activeScene.value?.status || ch.value?.status;
  return id ? project.statusById(id) : null;
});

// ── Continuous-chapter editor mode ──────────────────────────────────
// User preference toggle that swaps the editor between "single scene"
// (default) and "continuous chapter" — all the chapter's scenes
// stitched into one editable document with visual scene boundaries
// between them. Round-trips through services/chapterStitch.
//
// Source-of-truth is ui.continuousChapter (persisted) so the mode
// follows the writer across chapter changes AND page reloads. Once on,
// it stays on until they toggle it off.
const continuousMode = computed({
  get: () => ui.continuousChapter,
  set: (v) => ui.setContinuousChapter(v),
});

const stitchedBody = computed(() => continuousMode.value && ch.value
  ? stitchChapter(scenes.value)
  : "");

function onStitchedChange(html) {
  if (!ch.value) return;
  const records = splitChapter(html);
  if (!records.length) return; // nothing to apply; safer than nuking the chapter
  project.applyStitchedChapter(ch.value.id, records);
}

function toggleContinuous() {
  continuousMode.value = !continuousMode.value;
}

// The "New scene" toolbar button (chapter-splitter) only makes sense in
// continuous mode — in single-scene mode the inserted boundary just
// sits as decorative content with no structural effect until the writer
// toggles to continuous, which is confusing. Hide the button when not
// in continuous mode.
const editorToolbar = computed(() => continuousMode.value
  ? EDITOR_TOOLBAR_FULL
  : EDITOR_TOOLBAR_FULL.filter((t) => t !== "newScene"));
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

// Split the current chapter at the editor's cursor. Content before the
// cursor stays in the active scene; content after the cursor (plus any
// scenes that followed) becomes a new chapter inserted right after this
// one. Useful for chopping a freshly-imported single-blob chapter into
// real chapters by walking the cursor to each "Chapter N" line.
const editorRef = ref(null);
async function splitChapterHere() {
  if (!ch.value || !activeScene.value || !editorRef.value?.editor) return;
  const editor = editorRef.value.editor;
  const pos = editor.state.selection.from;
  if (pos <= 0 || pos >= editor.state.doc.content.size) {
    ui.showToast({ message: "Place the cursor where the new chapter should begin." });
    return;
  }
  const title = await promptDialog({
    title: "Split chapter here",
    label: "New chapter title",
    placeholder: "Title for the chapter starting at the cursor",
    confirmLabel: "Split",
  });
  if (!title) return;

  const { DOMSerializer } = await import("@tiptap/pm/model");
  const ser = DOMSerializer.fromSchema(editor.schema);
  const fragToHtml = (fragment) => {
    const div = document.createElement("div");
    div.appendChild(ser.serializeFragment(fragment));
    return div.innerHTML;
  };
  const before = fragToHtml(editor.state.doc.cut(0, pos).content);
  const after  = fragToHtml(editor.state.doc.cut(pos).content);

  const newId = project.splitChapterAtScene(ch.value.id, activeScene.value.id, before, after, title);
  if (newId) {
    ui.select("chapters", newId);
    router.push(`/chapters/${newId}`);
    ui.showToast({ message: `Split into "${title}".` });
  }
}

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
  if (id) { ui.select("chapters", id); router.push(`/chapters/${id}`); mode.value = "edit"; }
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
  // Arrow paging only makes sense for the single-chapter scope. In
  // whole-book scope let the browser scroll naturally.
  if (readScope.value === "chapter") {
    if (e.key === "ArrowLeft")  { e.preventDefault(); goPrev(); }
    if (e.key === "ArrowRight") { e.preventDefault(); goNext(); }
  }
  if (e.key === "Escape")     { e.preventDefault(); mode.value = "edit"; }
}
onMounted(() => window.addEventListener("keydown", onKey));
onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKey);
  teardownBookObserver();
  ui.scrolledSceneId = null;
});

// ── Whole-book read scope ──────────────────────────────────────────
// One continuous scrollable page stitched from every part → chapter →
// scene. Each scene gets a [data-scene-id]/[data-chapter-id] anchor so an
// IntersectionObserver can map "what's at the top of the viewport" to a
// chapter/scene id, and update ui state so the sidebar lights up.
const bookScrollEl = ref(null);

// Per-scene HTML with comment marks unwrapped (same treatment readBody
// does for stitched chapters, but on a single raw scene body).
function sceneReadHtml(body) {
  if (!body) return "";
  if (!body.includes("comment-mark")) return body;
  const div = document.createElement("div");
  div.innerHTML = body;
  div.querySelectorAll("span.comment-mark").forEach((el) => el.replaceWith(...el.childNodes));
  return div.innerHTML;
}

let bookObserver = null;
let lastObservedSceneId = null;

function teardownBookObserver() {
  if (bookObserver) { bookObserver.disconnect(); bookObserver = null; }
  lastObservedSceneId = null;
}

function setupBookObserver() {
  teardownBookObserver();
  const root = bookScrollEl.value;
  if (!root) return;
  const targets = root.querySelectorAll("[data-scene-id]");
  if (!targets.length) return;
  bookObserver = new IntersectionObserver((entries) => {
    // Of currently-intersecting scenes, the one closest to the top of the
    // active band (set by rootMargin) is what the reader is on.
    const visible = entries.filter((e) => e.isIntersecting);
    if (!visible.length) return;
    visible.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
    const top = visible[0].target;
    const sceneId = top.dataset.sceneId;
    const chapterId = top.dataset.chapterId;
    if (sceneId === lastObservedSceneId) return;
    lastObservedSceneId = sceneId;
    ui.setScrolledScene(sceneId, chapterId);
  }, {
    root,
    // Active band: top 15% to 30% of the viewport. The first scene crossing
    // into it from below becomes the highlighted one.
    rootMargin: "-15% 0px -70% 0px",
    threshold: 0,
  });
  targets.forEach((el) => bookObserver.observe(el));
}

// Scroll the whole-book view to a chapter/scene anchor when the route
// changes (e.g. user clicks a sidebar scene while reading) without
// dropping out of whole-book scope.
async function scrollBookTo(chapterId, sceneId) {
  await nextTick();
  const root = bookScrollEl.value;
  if (!root) return;
  const sel = sceneId
    ? `[data-scene-id="${sceneId}"]`
    : chapterId ? `[data-chapter-id="${chapterId}"]` : null;
  if (!sel) return;
  const el = root.querySelector(sel);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
}

// React to scope changes. Entering whole-book: render, observe, and jump
// to the currently-selected chapter so the reader starts where they were.
// Leaving: tear down observer and clear scroll highlight.
watch([mode, readScope], async ([m, scope], [prevM, prevScope]) => {
  if (m === "read" && scope === "book") {
    await nextTick();
    setupBookObserver();
    // First entry — jump to current chapter (or scene if one is open).
    if (prevScope !== "book" || prevM !== "read") {
      scrollBookTo(ch.value?.id, props.sceneId);
    }
  } else if (prevM === "read" && prevScope === "book") {
    teardownBookObserver();
    ui.scrolledSceneId = null;
  }
});

// While reading the whole book, clicking a chapter/scene in the sidebar
// changes the route but should scroll the existing page, not collapse to
// one chapter.
watch(() => [props.id, props.sceneId], ([id, sceneId]) => {
  if (mode.value !== "read" || readScope.value !== "book") return;
  scrollBookTo(id, sceneId);
});

// Scenes can be added/removed/reordered while reading. Re-observe so the
// new anchors participate in highlighting.
watch(() => project.allChapters.map((c) => c.id + ":" + (project.scenesFor(c.id) || []).length).join("|"), async () => {
  if (mode.value !== "read" || readScope.value !== "book") return;
  await nextTick();
  setupBookObserver();
});
</script>

<template>
  <!-- ── Header (varies by mode) ─────────────────────────────── -->
  <header v-if="ch && mode === 'edit'" class="pane-header chapter-pane-header">
    <div class="pane-title">
      <Breadcrumb :segments="crumbs" />
      <input v-if="activeScene" class="chapter-name"
        :value="activeScene.title"
        :placeholder="`Scene ${activeSceneIdx + 1} title (optional)`"
        @input="onSceneTitleInput(activeScene.id, $event.target.value)" />
      <input v-else class="chapter-name"
        :value="ch.title"
        placeholder="Chapter title"
        @input="updateTitle(ch.id, $event.target.value)" />
    </div>
    <div class="pane-actions">
      <div class="seg-toggle" role="radiogroup" aria-label="View mode">
        <button v-for="m in MODES" :key="m.id"
          role="radio" :aria-checked="mode === m.id"
          :class="{ active: mode === m.id }"
          @click="mode = m.id">
          <Icon :name="m.icon" :size="13" />
          <span>{{ m.label }}</span>
        </button>
      </div>
      <router-link v-if="prev" :to="`/chapters/${prev.id}`" custom v-slot="{ navigate }">
        <JwButton intent="ghost" size="small" @click="navigate" v-tooltip.bottom="`Ch. ${prev.num} — ${prev.title}`">
          <Icon name="ChevRight" :size="12" style="transform:rotate(180deg)" /> Prev
        </JwButton>
      </router-link>
      <router-link v-if="next" :to="`/chapters/${next.id}`" custom v-slot="{ navigate }">
        <JwButton intent="ghost" size="small" @click="navigate" v-tooltip.bottom="`Ch. ${next.num} — ${next.title}`">
          Next <Icon name="ChevRight" :size="12" />
        </JwButton>
      </router-link>
      <JwButton v-if="activeScene" intent="ghost" size="small" @click="splitChapterHere" v-tooltip.bottom="'Split this chapter at the cursor'">
        <Icon name="Replace" :size="13" /> Split here
      </JwButton>
      <JwButton intent="ghost" size="small" @click="deleteChapter">Delete</JwButton>
      <JwButton intent="primary" size="small" @click="addChapter"><Icon name="Plus" :size="14" /> New chapter</JwButton>
      <StatusSelect
        :model-value="(activeScene ? activeScene.status : ch.status) || ''"
        @update:model-value="(v) => activeScene ? project.updateScene(ch.id, activeScene.id, { status: v }) : project.setChapterStatus(ch.id, v)" />
    </div>
  </header>
  <PaneHeader v-else-if="ch"
    :eyebrow="mode === 'outline' ? 'Manuscript' : ch.partTitle"
    :title="mode === 'outline' ? 'Outline' : `Chapter ${ch.num} · ${ch.title}`">

    <div class="seg-toggle" role="radiogroup" aria-label="View mode">
      <button v-for="m in MODES" :key="m.id"
        role="radio" :aria-checked="mode === m.id"
        :class="{ active: mode === m.id }"
        @click="mode = m.id">
        <Icon :name="m.icon" :size="13" />
        <span>{{ m.label }}</span>
      </button>
    </div>
    <!-- Versions + Critique are available in non-edit modes too — the
         writer often wants to critique while reading or to snapshot a
         version from the outline. Skip outline (no chapter context). -->
    <template v-if="mode !== 'outline'">
      <JwButton intent="ghost" size="small" @click="versionsOpen = true" v-tooltip.bottom="'Version history'">
        <Icon name="History" :size="13" /> Versions
      </JwButton>
      <JwButton intent="ghost" size="small" @click="critiqueOpen = true" v-tooltip.bottom="'AI critique — notes + structural analysis'">
        <Icon name="Sparkle" :size="13" />
        Critique
        <span v-if="ch?.critique?.notes?.length" class="critique-pill">{{ ch.critique.notes.length }}</span>
      </JwButton>
    </template>
    <router-link to="/import" custom v-slot="{ navigate }">
      <JwButton intent="ghost" size="small" @click="navigate" v-tooltip.bottom="'Import chapters from a file'"><Icon name="Plus" :size="14" /> Import</JwButton>
    </router-link>
    <JwButton intent="primary" size="small" @click="addChapter"><Icon name="Plus" :size="14" /> New chapter</JwButton>
  </PaneHeader>
  <PaneHeader v-else eyebrow="Manuscript" title="No chapters">
    <router-link to="/import" custom v-slot="{ navigate }">
      <JwButton intent="ghost" size="small" @click="navigate"><Icon name="Plus" :size="14" /> Import from file</JwButton>
    </router-link>
    <JwButton intent="primary" size="small" @click="addChapter"><Icon name="Plus" :size="14" /> New chapter</JwButton>
  </PaneHeader>

  <!-- ── OUTLINE MODE ─────────────────────────────────────────── -->
  <div v-if="ch && mode === 'outline'" class="pane-card">
   <div class="scrollarea outline-pane">
    <div class="outline-tree">
      <section v-for="(part, pi) in project.parts" :key="part.id" class="ol-part">
        <div class="ol-part-row">
          <span class="ol-part-eyebrow">Part {{ pi + 1 }}</span>
          <input class="ol-part-title"
            :value="part.title"
            placeholder="Untitled part"
            @input="updatePartTitle(part.id, $event.target.value)" />
          <div class="ol-row-actions">
            <JwButton intent="ghost" size="small"
              :disabled="pi === 0"
              v-tooltip.bottom="'Move part up'"
              @click="movePart(part.id, -1)">
              <Icon name="ChevRight" :size="12" style="transform:rotate(-90deg)" />
            </JwButton>
            <JwButton intent="ghost" size="small"
              :disabled="pi === project.parts.length - 1"
              v-tooltip.bottom="'Move part down'"
              @click="movePart(part.id, 1)">
              <Icon name="ChevRight" :size="12" style="transform:rotate(90deg)" />
            </JwButton>
            <JwButton intent="ghost" size="small"
              :disabled="project.parts.length <= 1"
              v-tooltip.bottom="project.parts.length <= 1 ? 'Project needs at least one part' : 'Delete part'"
              @click="deletePart(part)">
              <Icon name="Trash" :size="14" />
            </JwButton>
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
                  <JwSelect class="ol-move-select"
                    :model-value="part.id"
                    @update:model-value="(v) => moveChapterPart(c.id, v)"
                    :options="project.parts.map(p => ({ label: `Move to: ${p.title}`, value: p.id }))"
                    @click.stop />
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
      <JwButton intent="ghost" class="ol-add-part" @click="addPart">
        <Icon name="Plus" :size="13" /> New part
      </JwButton>
    </div>
   </div>
  </div>

  <!-- ── CARDS / CORKBOARD MODE ───────────────────────────────── -->
  <div v-else-if="ch && mode === 'cards'" class="pane-card">
   <div class="scrollarea cards-pane">
    <div class="cards-head">
      <div>
        <div class="t-eyebrow">Chapter {{ ch.num }}</div>
        <h2 class="cards-title">{{ ch.title }}</h2>
      </div>
      <span class="t-muted" style="font-size:12px">Drag cards to reorder scenes</span>
    </div>
    <div class="cards-grid">
      <div v-for="(scn, i) in scenes" :key="scn.id"
        class="scene-card" :class="{ dragging: dragSceneId === scn.id }"
        draggable="true"
        @dragstart="onCardDragStart(scn.id)"
        @dragend="dragSceneId = null"
        @dragover.prevent
        @drop="onCardDrop(scn.id)"
        @click="openScene(ch.id, scn.id)">
        <div class="scene-card-num">{{ ch.num }}.{{ i + 1 }}</div>
        <div class="scene-card-title">{{ scn.title || `Scene ${i + 1}` }}</div>
        <div class="scene-card-body">{{ synopsis(scn) || "Empty scene." }}</div>
      </div>
      <button class="scene-card scene-card-add" @click="addSceneHere">
        <Icon name="Plus" :size="18" /> <span>Add scene</span>
      </button>
    </div>
   </div>
  </div>

  <!-- ── READ MODE ────────────────────────────────────────────── -->
  <div v-else-if="ch && mode === 'read'" class="pane-card">
   <div class="read-mode">
    <div class="read-scope-bar">
      <div class="seg-toggle" role="radiogroup" aria-label="Read scope">
        <button role="radio" :aria-checked="readScope === 'chapter'" :class="{ active: readScope === 'chapter' }" @click="readScope = 'chapter'" v-tooltip.bottom="'Read one chapter at a time'">
          <Icon name="Book" :size="12" /><span>Chapter</span>
        </button>
        <button role="radio" :aria-checked="readScope === 'book'" :class="{ active: readScope === 'book' }" @click="readScope = 'book'" v-tooltip.bottom="'Read the whole book in one continuous page'">
          <Icon name="List" :size="12" /><span>Whole book</span>
        </button>
      </div>
    </div>

    <!-- Single chapter: existing prev/next paging. -->
    <div v-if="readScope === 'chapter'" class="manuscript scrollarea">
      <article class="manuscript-inner read-content" v-html="readBody(ch.id)" />
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

    <!-- Whole book: every part → chapter → scene stitched into one
         continuous scroll. Each scene has data attrs that the
         IntersectionObserver maps back to sidebar highlights. -->
    <div v-else class="manuscript scrollarea" ref="bookScrollEl">
      <article class="manuscript-inner read-content read-book">
        <template v-for="(part, pi) in project.parts" :key="part.id">
          <header class="book-part-head">
            <div class="book-part-eyebrow">Part {{ pi + 1 }}</div>
            <h2 class="book-part-title">{{ part.title }}</h2>
          </header>
          <section v-for="chap in part.chapters" :key="chap.id" class="book-chapter">
            <h1 class="book-chapter-title" :data-chapter-id="chap.id">
              <span class="book-chapter-num">Chapter {{ chap.num }}</span>
              <span class="book-chapter-name">{{ chap.title }}</span>
            </h1>
            <section v-for="scn in project.scenesFor(chap.id)" :key="scn.id"
              class="book-scene"
              :data-scene-id="scn.id"
              :data-chapter-id="chap.id">
              <div class="book-scene-body" v-html="sceneReadHtml(scn.body)" />
            </section>
          </section>
        </template>
        <p class="read-hint">End of book · Esc to edit</p>
      </article>
    </div>
   </div>
  </div>

  <!-- ── EDIT MODE (default) ──────────────────────────────────── -->
  <div v-else-if="ch" class="pane-card">
    <div style="padding:10px 22px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:12px;flex-wrap:wrap">
      <JwButton intent="ghost" size="small" @click="versionsOpen = true" v-tooltip.bottom="'Version history — save & restore snapshots of this chapter'">
        <Icon name="History" :size="13" /> Versions
      </JwButton>
      <JwButton intent="ghost" size="small" @click="critiqueOpen = true" v-tooltip.bottom="'AI critique — notes + structural analysis for this chapter'">
        <Icon name="Sparkle" :size="13" />
        Critique
        <span v-if="ch?.critique?.notes?.length" class="critique-pill">{{ ch.critique.notes.length }}</span>
      </JwButton>
      <JwButton intent="ghost" size="small" style="margin-left:auto"
        :class="{ 'is-active': continuousMode }"
        v-tooltip.bottom="continuousMode ? 'Switch back to single-scene editing' : 'Edit the whole chapter as one document (scene boundaries visible between)'"
        @click="toggleContinuous">
        <Icon name="Strands" :size="13" /> {{ continuousMode ? "Single scene" : "Continuous" }}
      </JwButton>
    </div>

    <!-- Single-scene editor: which scene shows is driven by the route
         hash (#scene-<id>), set by the sidebar's scene list. The
         prev/next/pill block is hidden in continuous mode — there's no
         single "current scene" when every scene is on screen at once. -->
    <div v-if="activeScene" class="scene-strip">
      <template v-if="!continuousMode">
        <JwButton intent="ghost" size="small"
          :disabled="!prevScene"
          v-tooltip.bottom="prevScene ? `Scene ${activeSceneIdx} — ${prevScene.title || 'Untitled'}` : 'Already the first scene'"
          @click="prevScene && goToScene(prevScene.id)">
          <Icon name="ChevRight" :size="12" style="transform:rotate(180deg)" /> Prev scene
        </JwButton>
        <span class="scene-pill" :class="{ 'has-status': activeStatus }"
              :style="activeStatus ? { '--pill-c': activeStatus.color } : null">
          <span v-if="activeStatus" class="scene-pill-dot" />
          Scene {{ activeSceneIdx + 1 }} of {{ scenes.length }}
          <span v-if="activeStatus" class="scene-pill-status">· {{ activeStatus.label }}</span>
        </span>
        <JwButton intent="ghost" size="small"
          :disabled="!nextScene"
          v-tooltip.bottom="nextScene ? `Scene ${activeSceneIdx + 2} — ${nextScene.title || 'Untitled'}` : 'Already the last scene'"
          @click="nextScene && goToScene(nextScene.id)">
          Next scene <Icon name="ChevRight" :size="12" />
        </JwButton>
      </template>
      <span v-else class="scene-pill">Chapter {{ ch.num }} · {{ scenes.length }} scene{{ scenes.length === 1 ? "" : "s" }}</span>
      <div class="scene-strip-actions" style="margin-left:auto">
        <JwButton intent="primary" class="scene-links-btn"
          v-tooltip.bottom="'Links — POV, characters, locations, objects, narrative strands'"
          @click="linksOpen = true">
          <Icon name="Network" :size="13" /> Links
        </JwButton>
        <JwButton intent="ghost" size="small"
          :disabled="scenes.length <= 1"
          v-tooltip.bottom="scenes.length <= 1 ? 'A chapter needs at least one scene' : 'Delete scene'"
          @click="removeScene(activeScene)">
          <Icon name="Trash" :size="14" />
        </JwButton>
      </div>
    </div>

    <SceneLinks v-if="linksOpen && activeScene"
      :chapter-id="ch.id"
      :scene-id="activeScene.id"
      @close="linksOpen = false" />

    <!-- Continuous-chapter editor — one big stitched document; on
         change we split it back and apply atomically. -->
    <RichEditor v-if="continuousMode && ch && scenes.length"
      ref="editorRef"
      :key="`continuous-${ch.id}`"
      :model-value="stitchedBody"
      :toolbar="editorToolbar"
      placeholder="Write the chapter — scenes are separated by the boundaries below…"
      :count-footer="false"
      :running-head="project.project.title"
      :folio-label="`Ch. ${ch.num}`"
      @change="onStitchedChange" />

    <RichEditor v-else-if="activeScene"
      ref="editorRef"
      :key="activeScene.id"
      :model-value="activeScene.body"
      :toolbar="editorToolbar"
      :placeholder="`Write scene ${activeSceneIdx + 1}…`"
      :count-footer="false"
      :running-head="project.project.title"
      :folio-label="`Ch. ${ch.num}`"
      @change="(html) => onSceneBodyChange(activeScene.id, html)" />

    <!-- Chapter overview: shown when no scene is picked yet. Lists
         every scene as a clickable card so the user can drop into one. -->
    <div v-else class="scrollarea" style="flex:1;min-height:0">
      <div class="chapter-overview">
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
      <span v-if="activeScene || continuousMode">
        <b class="t-num" style="color:var(--ink)">{{ sceneWordCount.toLocaleString() }}</b> words ·
        <b class="t-num" style="color:var(--ink)">{{ sceneCharCount.toLocaleString() }}</b> characters
        <span v-if="continuousMode" style="margin-left:6px">· chapter</span>
      </span>
      <span style="margin-left:auto">Autosaves to local storage</span>
    </div>
  </div>

  <div v-else class="pane-card" style="display:grid;place-items:center;padding:60px">
    <EmptyState icon="Book"
      title="No chapters yet"
      message="Create the first chapter to start writing, or import an existing manuscript from a file."
      action-label="Create your first chapter"
      @action="addChapter" />
  </div>

  <!-- Modal mounts — hoisted out of the mode-specific wrappers so they
       open regardless of edit/outline/cards/read mode. -->
  <VersionHistoryModal v-if="versionsOpen && ch"
    :chapter-id="ch.id"
    :chapter-title="`Ch. ${ch.num} · ${ch.title}`"
    @close="versionsOpen = false" />

  <CritiqueModal v-if="critiqueOpen && ch"
    :chapter-id="ch.id"
    @close="critiqueOpen = false" />
</template>

<style scoped>
.chapter-pane-header .pane-title { gap: 2px; }
.chapter-name {
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
.chapter-name:hover { border-color: var(--border-soft); }
.chapter-name:focus { border-color: var(--accent); background: var(--surface); box-shadow: 0 0 0 3px var(--accent-soft); }

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

/* ── Cards / corkboard ─────────────────────────────────────── */
.cards-pane { flex: 1; padding: 22px 28px 60px; background: var(--surface); }
.cards-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
.cards-title { font-family: var(--font-serif); font-size: 20px; font-weight: 600; margin: 2px 0 0; }
.cards-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 14px; }
.scene-card {
  text-align: left; appearance: none; font: inherit; cursor: pointer;
  border: 1px solid var(--border); border-radius: 10px; background: var(--surface);
  padding: 14px; min-height: 132px;
  display: flex; flex-direction: column; gap: 8px;
  transition: box-shadow .15s ease, border-color .15s ease, opacity .15s ease;
}
.scene-card:hover { border-color: var(--border-strong); box-shadow: 0 6px 18px rgba(0, 0, 0, .08); }
.scene-card.dragging { opacity: .45; }
.scene-card-num { font-size: 11px; color: var(--muted); font-variant-numeric: tabular-nums; }
.scene-card-title { font-family: var(--font-serif); font-weight: 600; font-size: 15px; color: var(--ink); }
.scene-card-body {
  font-size: 12.5px; line-height: 1.5; color: var(--ink-2);
  overflow: hidden; display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical;
}
.scene-card-add {
  flex-direction: row; align-items: center; justify-content: center; gap: 8px;
  color: var(--muted); border-style: dashed; background: var(--surface-2);
}
.scene-card-add:hover { color: var(--accent-ink); }

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
  display: inline-flex; align-items: center; gap: 5px;
  padding: 2px 10px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 999px;
  font-size: 10.5px; font-weight: 600;
  text-transform: uppercase; letter-spacing: 0.08em;
  color: var(--muted);
  flex-shrink: 0;
  transition: border-color .15s, background-color .15s;
}
.scene-pill.has-status {
  background: color-mix(in oklab, var(--pill-c) 10%, var(--surface));
  border-color: color-mix(in oklab, var(--pill-c) 35%, var(--border));
  color: var(--ink-2);
}
.scene-pill-dot {
  width: 8px; height: 8px;
  border-radius: 50%;
  background: var(--pill-c);
  box-shadow: inset 0 0 0 1px rgba(0,0,0,0.08);
  flex-shrink: 0;
}
.scene-pill-status { color: var(--pill-c); }
.critique-pill {
  display: inline-flex; align-items: center;
  margin-left: 4px;
  padding: 0 6px; min-width: 16px; height: 16px;
  border-radius: 999px;
  font-family: var(--font-mono); font-size: 10px; font-weight: 600;
  background: var(--accent-soft); color: var(--accent-ink);
  line-height: 1;
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
.scene-strip-actions :deep(.jw-btn.is-active) {
  background: var(--accent-soft);
  color: var(--accent-ink);
}

/* "Links" button — stands out from the muted scene-strip controls.
   Background/color/border come from intent="primary"; this layer adds
   the distinctive bolder text, subtle base shadow, and accent halo on
   hover that makes the button read as the surface's main action. */
.scene-links-btn {
  font-weight: 600;
  letter-spacing: 0.01em;
  box-shadow: 0 1px 0 rgba(0,0,0,0.06);
}
.scene-links-btn:hover {
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

/* ── Read scope toggle bar ─────────────────────────────────── */
.read-scope-bar {
  display: flex; justify-content: center;
  padding: 10px 22px 4px;
  flex-shrink: 0;
}
.read-scope-bar .seg-toggle { background: var(--surface); }

/* ── Whole-book read view ──────────────────────────────────── */
.read-book {
  /* Inherits .read-content max-width / typography. The part/chapter
     headers below add their own spacing on top of that. */
}
.book-part-head {
  max-width: 680px;
  margin: 80px auto 40px;
  padding-bottom: 18px;
  border-bottom: 1px solid var(--border-soft);
  text-align: center;
}
.book-part-head:first-child { margin-top: 20px; }
.book-part-eyebrow {
  font-size: 11px; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.18em;
  color: var(--muted);
  margin-bottom: 6px;
}
.book-part-title {
  font-family: var(--font-serif);
  font-size: 30px; font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--ink);
  margin: 0;
}

.book-chapter {
  /* Each chapter sits in its own block; spacing between them keeps
     the chapter break clear without a hard rule. */
  padding-top: 56px;
}
.book-chapter:first-of-type { padding-top: 28px; }
.book-chapter-title {
  /* Override the generic read-content h1 size — chapters here are a
     bit smaller than the full-page single-chapter h1 so they don't
     scream at every break. */
  font-size: 26px !important;
  margin-bottom: 22px !important;
  text-align: center;
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  scroll-margin-top: 12px;
}
.book-chapter-num {
  font-size: 11px; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.18em;
  color: var(--muted);
}
.book-chapter-name {
  font-family: var(--font-serif);
  font-size: 26px; font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--ink);
}
.book-scene { scroll-margin-top: 12px; }
.book-scene-body :deep(p:first-child) { margin-top: 0; }
.read-book :deep(.scene-mark) {
  text-align: center;
  color: var(--muted);
  letter-spacing: 0.4em;
  margin: 24px 0;
}
.read-book :deep(.scene-title) {
  font-family: var(--font-serif);
  font-style: italic;
  font-size: 16px;
  color: var(--ink-2);
  margin: 24px 0 14px;
}
</style>
