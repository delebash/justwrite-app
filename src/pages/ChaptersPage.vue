<script setup>
import { cutToLength } from "@delebash/core/platform/text";
import { computed, ref, watch, nextTick, onMounted, onBeforeUnmount } from "vue";
import { useI18n } from "vue-i18n";
import { useProjectStore } from "../stores/project.js";
import { useUiStore } from "../stores/ui.js";
import { useRoute, useRouter } from "vue-router";
import { PaneHeader, pageFill } from "@delebash/ui";
import EntityIndex from "../components/EntityIndex.vue";
import { useStatusDisplay } from "../composables/useStatusDisplay.js";
import { Icon } from "@delebash/ui";
import RichEditor from "../components/RichEditor.vue";
import AiFeatureChip from "../components/AiFeatureChip.vue";
import SceneLinks from "../components/SceneLinks.vue";
import VersionHistoryModal from "../components/VersionHistoryModal.vue";
import CritiqueModal from "../components/CritiqueModal.vue";
import MultiReaderPanelModal from "../components/MultiReaderPanelModal.vue";
import SceneNotesPanel from "../components/SceneNotesPanel.vue";
import StuckDiagnosticModal from "../components/StuckDiagnosticModal.vue";
import BrainstormModal from "../components/BrainstormModal.vue";
import BrainstormPopup from "../components/BrainstormPopup.vue";
import { sceneIdeasRequest } from "../services/analysis/planningDraft.js";
import { titleIdeasRequest } from "../services/analysis/titleIdeas.js";
import SensoryResearchModal from "../components/SensoryResearchModal.vue";
import EntitySweepModal from "../components/EntitySweepModal.vue";
import { EmptyState } from "@delebash/ui";
import StatusSelect from "../components/StatusSelect.vue";
import { promptDialog, confirmDialog, useAiTasksStore } from "@delebash/ui";
import { stitchChapter, splitChapter } from "../services/chapterStitch.js";
import { vSceneImages, withSceneImages } from "../services/imageStore.js";
import { EDITOR_TOOLBAR_FULL } from "../services/editorToolbars.js";
import { UiButton, UiMenu, UiMenuItem, UiMenuSeparator } from "@delebash/ui";
import { UiSelect } from "@delebash/ui";
import { UiSegmented } from "@delebash/ui";
import { UiTag } from "@delebash/ui";
import { bookIndexOn } from "../services/rag/vectorStore.js";
import { selectNewRowName, useSelectNewName } from "../composables/useSelectNewName.js";
import { proseStoryContext } from "../services/storyContext.js";

const props = defineProps({
  id: { type: String, default: "" },
  sceneId: { type: String, default: "" },
});
const project = useProjectStore();
const { statusLabel, statusSeverity } = useStatusDisplay();
const ui = useUiStore();
const router = useRouter();
const route = useRoute();
// Same shape SettingsView uses: `t` in script, `$t` in template. Note the
// `v-for="t in …"` loops in the template SHADOW this `t` inside their scope —
// those must use `$t`, and build:spa will not catch it if they don't.
const { t } = useI18n({ useScope: "global" });


// chapterId → [{ id, name }] of characters appearing in the chapter, from the
// explicit scene→character links (state.scenes[*].characters). (Was derived
// from Audio Studio speaker analysis, removed when audio moved to JustVoice.)
const speakersByChapter = computed(() => {
  const out = {};
  for (const ch of project.allChapters) {
    const ids = new Set();
    for (const scn of project.scenesFor(ch.id)) {
      for (const cid of scn.characters || []) ids.add(cid);
    }
    out[ch.id] = [...ids]
      .map((id) => project.characterById(id))
      .filter(Boolean)
      .map((c) => ({ id: c.id, name: c.name }));
  }
  return out;
});

// Mode persists on the ui store so a user's preferred view
// (edit / outline / read) survives navigation and reload.
const mode = computed({
  get: () => ui.chapterMode,
  set: (v) => ui.setChapterMode(v),
});
// Within edit mode, the user can present scenes as a vertical list
// (the default scene editor) or as a corkboard of cards. The chosen
// preference persists; the *effective* display falls back to "list"
// whenever a scene is focused (cards don't carry a single-scene view),
// without overwriting the stored preference — that way clicking a
// card and then navigating back to the chapter heading restores cards.
const editStyle = computed({
  get: () => activeScene.value ? "list" : ui.chapterEditStyle,
  set: (v) => ui.setChapterEditStyle(v),
});
// Read mode has two scopes: a single chapter (existing prev/next paging) or
// the whole book stitched into one continuous scroll. In whole-book scope an
// IntersectionObserver tracks which scene is in view and updates the sidebar.
const readScope = ref("chapter"); // "chapter" | "book"
const linksOpen = ref(false);
const versionsOpen = ref(false);
const critiqueOpen = ref(false);
const multiReaderOpen = ref(false);
const sweepOpen = ref(false);
const notesPanelOpen = ref(false);
// The docked notes panel's fixed scope: "scene" (the active scene's notes) or
// "chapter" (chapter-level + a section per scene). The chapter/scene it renders
// for comes from the live active context (ch / activeScene) — every opener
// navigates there first, so the inspector always matches the editor.
const notesPanelScope = ref("scene");
function askTheBook() {
  if (!ch.value) return;
  ui.openChatPanelFor({
    mode: "book",
    question: ch.value.title
      ? t("chapters.header.askQuestionTitled", { num: ch.value.num, title: ch.value.title })
      : t("chapters.header.askQuestion", { num: ch.value.num }),
    sourceKey: `ask:chapter:${ch.value.id}`,
  });
}
// computed(), not const: a module-scope array freezes its labels at import and
// would never re-translate when the locale changes (SettingsView's SECTIONS is
// the same shape).
const MODES = computed(() => [
  { value: "edit",    label: t("chapters.modes.edit"),    icon: "Quote" },
  { value: "outline", label: t("chapters.modes.outline"), icon: "List" },
  { value: "read",    label: t("chapters.modes.read"),    icon: "Eye" },
]);
const READ_SCOPE_OPTIONS = computed(() => [
  { value: "chapter",  label: t("chapters.read.scopeChapter"),  icon: "Book",  tooltip: t("chapters.read.scopeChapterTooltip") },
  { value: "book",     label: t("chapters.read.scopeBook"),     icon: "List",  tooltip: t("chapters.read.scopeBookTooltip") },
]);

// No id in the route → the INDEX (the grid of chapters), exactly like every other
// section. This used to fall back twice — `props.id || ui.selections.chapters ||
// allChapters[0]?.id` — which meant the no-selection state could never render, and
// Chapters was the one part of the app with no list page. That wasn't a decision
// anyone made; it was a default. (The user, 2026-07-26: "why not standardize it
// like all the others… they all have a grid along with the nav".)
// Sidebar and Home are untouched: `go("chapters")` already pushes `/chapters`
// (Sidebar.vue:226-232), so the nav lands on the list purely from this gate, and
// every chapter/scene row still routes to `/chapters/:id[/:sceneId]` as before.
const ch = computed(() => (props.id ? project.chapterById(props.id) : null));
// ── Index mode: the grid of chapters, on the shared EntityIndex ──────
// `allChapters` already decorates every row with partId, partTitle and a LIVE
// scene count (project.js:675-682), so the grid needs no new data. Outline stays
// a different job: this finds and scans, Outline restructures — so the index
// never nests scenes and Outline never grows filters.
const indexColumns = computed(() => [
  { accessorKey: "num", header: t("chapters.index.columns.num"), sortable: true, headerStyle: "min-width: 56px" },
  { accessorKey: "title", header: t("chapters.index.columns.title"), sortable: true, headerStyle: "min-width: 240px" },
  { accessorKey: "partTitle", header: t("chapters.index.columns.part"), sortable: true, headerStyle: "min-width: 160px" },
  { accessorKey: "status", header: t("chapters.index.columns.status"), sortable: true, headerStyle: "min-width: 120px" },
  { accessorKey: "scenes", header: t("chapters.index.columns.scenes"), sortable: true, headerStyle: "min-width: 90px" },
  { accessorKey: "words", header: t("chapters.index.columns.words"), sortable: true, headerStyle: "min-width: 100px" },
]);
const statusOptions = computed(() =>
  project.statusesShown.map((s) => ({ value: s.id, label: s.label })),
);
const partOptions = computed(() =>
  project.parts.map((p) => ({ value: p.id, label: p.title || t("sidebar.placeholders.untitledPart") })),
);
const indexFacets = computed(() => [
  { key: "status", label: t("chapters.index.facets.status"), options: statusOptions.value },
  { key: "partId", label: t("chapters.index.facets.part"), options: partOptions.value },
]);
function onIndexRowClick(event) {
  const id = event?.data?.id;
  if (id) { ui.select("chapters", id); router.push(`/chapters/${id}`); }
}

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

// The editor's prose actions send their scene's story context (slice 2): the scene at the cursor
// in the stitched chapter, else the scene being edited.
function storyContextFor({ sceneId, action, feature } = {}) {
  return proseStoryContext(project, { chapterId: ch.value?.id, sceneId: sceneId || activeScene.value?.id, action, feature });
}

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
  // a server image's stored path moves aside first (a parsed <img> starts loading at once)
  div.innerHTML = withSceneImages(html);
  div.querySelectorAll("h2.scene-title, p.scene-mark").forEach((el) => { el.remove(); });
  div.querySelectorAll("span.comment-mark").forEach((el) => { el.replaceWith(...el.childNodes); });
  // Pending AI revisions are authoring chrome — strip from the read view:
  // delete the "before" entirely, unwrap the "after" so only the candidate
  // prose remains. Any paragraph left empty after the del-strip is removed.
  // #42: strikethroughs never show in read mode — AI dels (pending or kept)
  // AND plain <s> strikes (pre-fix AI runs left originals as plain Strike).
  div.querySelectorAll("del[data-ai-del], .ai-del, s, strike").forEach((el) => { el.remove(); });
  div.querySelectorAll("ins[data-ai-ins], .ai-ins").forEach((el) => { el.replaceWith(...el.childNodes); });
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
  const segs = [{ label: ch.value.partTitle || t("home.manuscript"), onClick: () => { mode.value = "outline"; } }];
  if (activeScene.value) {
    segs.push({ label: t("common.chapterRefTitled", { num: ch.value.num, title: ch.value.title }), to: `/chapters/${ch.value.id}` });
    segs.push({ label: t("common.sceneN", { n: activeSceneIdx.value + 1 }) });
  } else {
    segs.push({ label: t("common.chapterShort", { num: ch.value.num }) });
  }
  return segs;
});

// Explicit scene focus (clicking a scene in the sidebar) drops into
// edit mode — the user picked a scene and wants to edit it. The
// editStyle computed automatically returns "list" while a scene is
// focused without modifying the user's stored preference, so cards
// return when they navigate back to the chapter heading. Outline
// shows whole-manuscript structure so it also resets on any chapter
// switch.
watch(() => [props.id, props.sceneId], ([_newId, newSceneId], [_oldId, oldSceneId]) => {
  if (newSceneId && newSceneId !== oldSceneId) {
    mode.value = "edit";
    return;
  }
  if (mode.value === "outline") mode.value = "edit";
});
// The same on arrival: a scene's route (a link, a search result) never shows the Outline, which has
// no single scene — it showed the Outline when that was the page's last mode (2026-10-29).
if (props.sceneId && mode.value === "outline") mode.value = "edit";

// Record the scene the writer is viewing as their last-edited position, so
// Home's Resume and the sidebar chapter-row landing return here (persisted via
// ui → /v1/settings), and open its chapter in the sidebar so the scene's row shows
// — however the scene was reached (a link, a beat chip, a search result). Immediate
// so a direct scene URL is captured on arrival.
watch(() => [props.id, props.sceneId], ([id, sceneId]) => {
  if (id && sceneId && project.scenesFor(id).some((s) => s.id === sceneId)) {
    ui.noteScene(id, sceneId);
    ui.expandChapter(id);
  }
}, { immediate: true });

// Live counts for the Notes badges on the chapter header + scene strip.
const chapterNotesCount = computed(() => ch.value
  ? project.notesForChapter(ch.value.id).length
  : 0);
const activeSceneNotesCount = computed(() => activeScene.value
  ? project.notesForScene(activeScene.value.id).length
  : 0);
// Opens the docked notes panel. `focus` = "chapter" for chapter scope, or a
// sceneId for scene scope. Navigates into edit mode for the target first so the
// panel — which docks inside the edit-mode editor — is on screen; this also
// serves the outline note-count badges, which can target other chapters/scenes.
function openNotesPanel(chapterId, focus = "chapter") {
  if (!chapterId) return;
  const sid = focus && focus !== "chapter" ? focus : "";
  ui.select("chapters", chapterId);
  notesPanelScope.value = sid ? "scene" : "chapter";
  const target = sid ? `/chapters/${chapterId}/${sid}` : `/chapters/${chapterId}`;
  if (router.currentRoute.value.path !== target) router.push(target);
  mode.value = "edit";
  notesPanelOpen.value = true;
}
function openChapterNotes() {
  if (ch.value) openNotesPanel(ch.value.id, "chapter");
}
function openSceneNotes(sceneId) {
  if (ch.value) openNotesPanel(ch.value.id, sceneId);
}

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
// A card shows the scene's Summary (slice 3, 2026-10-16), else the start of its prose.
function synopsis(scene) {
  const summary = String(scene.summary || "").trim();
  if (summary) return summary;
  const text = (scene.body || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return text.length > 180 ? `${cutToLength(text, 180)}…` : text;
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
function removeScene(scene) {
  if (!ch.value || !scene) return;
  if (scenes.value.length <= 1) return;
  // After delete, move to the next remaining scene (or the previous if
  // we just deleted the last one). The store handles the trash entry
  // and undo toast — view just navigates.
  const fallback = nextScene.value || prevScene.value;
  project.removeScene(ch.value.id, scene.id);
  if (fallback) goToScene(fallback.id);
}

// ── CRUD ─────────────────────────────────────────────────────────────
// The header's title: in Edit, the open scene's name (else the chapter's), edited in place; in
// Read and Outline, the chapter's heading. "+ New" lands here with ?new=1 — the create handlers
// below push /chapters/<id>?new=1 after minting a default chapter — and the name is selected,
// ready to type over.
const header = ref(null);
useSelectNewName(header);
const headerTitle = computed(() => {
  if (mode.value === "edit") return activeScene.value ? activeScene.value.title : ch.value?.title;
  return mode.value === "outline"
    ? t("chapters.modes.outline")
    : t("chapters.header.chapterTitle", { num: ch.value?.num, title: ch.value?.title });
});
const headerPlaceholder = computed(() => (activeScene.value
  ? t("chapters.edit.sceneTitlePlaceholder", { n: activeSceneIdx.value + 1 })
  : t("sidebar.actions.newChapterLabel")));
function onHeaderTitle(v) {
  if (activeScene.value) onSceneTitleInput(activeScene.value.id, v);
  else updateTitle(ch.value.id, v);
}

function addChapter() {
  const id = project.addChapter({});
  ui.select("chapters", id);
  router.push(`/chapters/${id}?new=1`);
  mode.value = "edit";
}
function deleteChapter() {
  if (!ch.value) return;
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

// ── Scene-strip AI dropdown ───────────────────────────────────────
// One button in the scene strip that opens a menu of every writerAI action — the kit's UiMenu
// (Quasar's QMenu: kept on screen, closed by a pick, Esc or a click outside; since 2026-10-11 —
// a hand-rolled absolute box before, cut off at 1280 px and off screen at 390). Talks to the
// active RichEditor via its defineExpose surface.
const aiRunning = computed(() => editorRef.value?.aiRunning || false);
const hasSelection = computed(() => editorRef.value?.hasSelection || false);
const proseRules = computed(() => editorRef.value?.PROSE_RULES_LIST || []);
// Shift-click on any AI dropdown item forces the three-variations
// modal even when the global "Show variations" toggle is off. The
// click (UiMenuItem's select detail.originalEvent) is forwarded into
// runWriterAction / runProsePass so they can read the shiftKey flag
// without RichEditor needing to observe the dropdown's DOM events.
function callAi(key, e) {
  editorRef.value?.runWriterAction?.(key, { shiftKey: !!e?.shiftKey });
}
function callProse(key, e) {
  editorRef.value?.runProsePass?.(key, { shiftKey: !!e?.shiftKey });
}
// #42: any AI strikethrough (pending original or kept history) enables the
// clean-up item; the command lives in the editor's aiDiff extension.
const hasStrikes = computed(() => (editorRef.value?.strikeCount || 0) > 0);
// The AI-text mark (2026-10-18): AI-written text in the selection, or in the scene with nothing
// selected, enables Mark as mine.
const aiTextHere = computed(() => !!editorRef.value?.aiTextHere);
function callMarkAsMine() {
  editorRef.value?.markAsMine?.();
}

// Draft from plan (slice 4, the AI drafting spec §6): only in a book with AI scene drafting on
// (Settings → Project); a scene's plan is its Summary. A stitched chapter's scene is checked when
// the draft runs (the editor knows the scene at the cursor).
const sceneDrafting = computed(() => !!project.project.aiSceneDrafting);
const planReady = computed(() => continuousMode.value || !!String(activeScene.value?.summary || "").trim());
const showDraftCta = computed(() => sceneDrafting.value && !continuousMode.value && !!activeScene.value
  && !plainText(activeScene.value.body).trim());
function callDraftFromPlan(e) {
  editorRef.value?.runDraftFromPlan?.({ shiftKey: !!e?.shiftKey });
}

// B5-7 (#43): the AI-complete notice lives HERE, on the editor's bottom bar
// (right of the word count), instead of a toast — writerAI tasks register
// with silentToast and this bar shows the latest completion since mount.
// "View task queue" opens the shared AI status panel; ✕ dismisses.
const aiTasks = useAiTasksStore();
const noticeSince = Date.now();
const dismissedNoticeId = ref(null);
const aiNotice = computed(() => {
  // Lingering ∪ history: under FAMILY_TASK_LINGER (2026-08-07) a completed task
  // sits in visibleTasks for 5 s BEFORE reaching history — reading history alone
  // made this notice fire 5 s late. Ids survive archival, so a dismissal during
  // the linger still covers the same task's history incarnation.
  const match = (x) => (x.feature === "writerAI" || x.feature === "sceneDrafting") && x.status === "done" && x.finishedAt >= noticeSince;
  const h = aiTasks.visibleTasks.find(match) || (aiTasks.history || []).find(match);
  return h && h.id !== dismissedNoticeId.value ? h : null;
});
function callClearStrikethroughs() {
  editorRef.value?.clearAllStrikethroughs?.();
}

// ── Unstuck (stuck-on-this-chapter diagnostic) ───────────────────
// Opens a modal that asks the model for five distinct unblock moves.
// Each move's "Use this" button drives runGuidedContinue on the editor
// so the next 2-4 paragraphs land in the chosen direction.
const stuckOpen = ref(false);
const stuckContextText = ref("");
const stuckChapterTitle = ref("");
const stuckChapterNum = ref(null);
function openStuck() {
  if (!editorRef.value) {
    ui.showToast({ message: t("chapters.ai.openChapterFirst") });
    return;
  }
  const ctx = editorRef.value.grabUnstuckContext?.(1800) || "";
  if (!ctx.trim()) {
    ui.showToast({ message: t("chapters.ai.unstuckNeedsProse") });
    return;
  }
  stuckContextText.value = ctx;
  stuckChapterTitle.value = ch.value?.title || "";
  stuckChapterNum.value = ch.value?.num ?? null;
  stuckOpen.value = true;
}
function closeStuck() { stuckOpen.value = false; }
function onStuckUseMove(move) {
  stuckOpen.value = false;
  editorRef.value?.runGuidedContinue?.(move?.instruction || "");
}

// ── Next plot beats / Plot twists (the AI drafting plan Task P2; answered 2026-10-16) ──
// Brainstorm's plot ideas from the cursor, in the Brainstorm window (2026-10-28: its seed prompt,
// Generate — nothing runs on open); "Write this" does what Unstuck's does — the next 2-4
// paragraphs in that direction, as the accept/reject diff.
const ideas = ref(null); // { category, sceneId, proseTail } while the window is open
function openIdeas(category) {
  if (!editorRef.value) {
    ui.showToast({ message: t("chapters.ai.openChapterFirst") });
    return;
  }
  const proseTail = editorRef.value.grabUnstuckContext?.(1800) || "";
  if (!proseTail.trim()) {
    ui.showToast({ message: t("chapters.ai.ideasNeedProse") });
    return;
  }
  const sceneId = editorRef.value.sceneIdAtCursor?.() || activeScene.value?.id || null;
  ideas.value = { category, sceneId, proseTail };
}
function ideasRound(round) {
  const s = ideas.value;
  return sceneIdeasRequest({ project, chapterId: ch.value?.id, sceneId: s.sceneId, category: s.category, proseTail: s.proseTail, ...round });
}
function onIdeaPick(text) {
  ideas.value = null;
  editorRef.value?.runGuidedContinue?.(text);
}

// ── Sensory research ────────────────────────────────────────────
// Highlight a subject; modal returns a pack of short concrete sensory
// phrases the writer can click to drop into the prose. Additive — like
// Describe, but structured instead of streamed.
const sensoryOpen = ref(false);
const sensorySubject = ref("");
function openSensory() {
  if (!editorRef.value) {
    ui.showToast({ message: t("chapters.ai.openChapterFirst") });
    return;
  }
  const subj = editorRef.value.grabSensorySubject?.() || "";
  if (!subj.trim()) {
    ui.showToast({ message: t("chapters.ai.highlightSubjectFirst") });
    return;
  }
  sensorySubject.value = subj;
  sensoryOpen.value = true;
}
function closeSensory() { sensoryOpen.value = false; }
function onSensoryInsert(phrase) {
  editorRef.value?.insertSensoryPhrase?.(phrase);
}

// ── Guided Continue (standalone) ────────────────────────────────
// Same engine as Unstuck's "Write this" but driven by a one-line
// direction the writer types in a prompt dialog. For when they
// already know what should happen next and want a 200-word draft.
// The direction actions: ask for the one-line direction, then the editor runs it. Continue with
// direction… and Write dialogue… from the cursor, Rewrite with direction… on the selection (the AI
// drafting plan Task 14). The field label and Continue's button are shared.
const DIRECTED = {
  continue: { run: "runGuidedContinue", title: "guidedTitle", message: "guidedMessage", placeholder: "guidedPlaceholder", confirm: "guidedConfirm" },
  rewrite: { run: "runGuidedRewrite", title: "guidedRewriteTitle", message: "guidedRewriteMessage", placeholder: "guidedRewritePlaceholder", confirm: "guidedRewriteConfirm" },
  dialogue: { run: "runWriteDialogue", title: "dialogueTitle", message: "dialogueMessage", placeholder: "dialoguePlaceholder", confirm: "guidedConfirm" },
};
async function openDirected(kind, e) {
  if (!editorRef.value) {
    ui.showToast({ message: t("chapters.ai.openChapterFirst") });
    return;
  }
  const d = DIRECTED[kind];
  const instruction = await promptDialog({
    title: t(`chapters.dialogs.${d.title}`),
    message: t(`chapters.dialogs.${d.message}`),
    label: t("chapters.dialogs.guidedLabel"),
    placeholder: t(`chapters.dialogs.${d.placeholder}`),
    confirmLabel: t(`chapters.dialogs.${d.confirm}`),
  });
  const text = String(instruction || "").trim();
  if (!text) return;
  editorRef.value?.[d.run]?.(text, { shiftKey: !!e?.shiftKey });
}
const openGuidedContinue = (e) => openDirected("continue", e);

async function splitChapterHere() {
  if (!ch.value || !activeScene.value || !editorRef.value?.editor) return;
  const editor = editorRef.value.editor;
  const pos = editor.state.selection.from;
  if (pos <= 0 || pos >= editor.state.doc.content.size) {
    ui.showToast({ message: t("chapters.dialogs.splitCursorHint") });
    return;
  }
  const { DOMSerializer } = await import("@tiptap/pm/model");
  const ser = DOMSerializer.fromSchema(editor.schema);
  const fragToHtml = (fragment) => {
    const div = document.createElement("div");
    div.appendChild(ser.serializeFragment(fragment));
    return div.innerHTML;
  };
  const before = fragToHtml(editor.state.doc.cut(0, pos).content);
  const after  = fragToHtml(editor.state.doc.cut(pos).content);

  // the new chapter opens with its name selected (?new=1), as "+ New chapter" does
  const newId = project.splitChapterAtScene(ch.value.id, activeScene.value.id, before, after);
  if (newId) {
    ui.select("chapters", newId);
    router.push(`/chapters/${newId}?new=1`);
  }
}

// ── Parts ───────────────────────────────────────────────────────────
function updatePartTitle(id, v) { project.updatePart(id, { title: v }); }
function moveChapterPart(chapterId, partId) { project.moveChapterToPart(chapterId, partId); }
function movePart(id, dir) { project.movePart(id, dir); }

// A new part is named in place, in its outline row.
function addPart() {
  const id = project.addPart();
  selectNewRowName(`.ol-part-title[data-part-id="${id}"]`);
}
function addChapterToPart(partId) {
  const id = project.addChapter({ partId });
  if (id) { ui.select("chapters", id); router.push(`/chapters/${id}?new=1`); mode.value = "edit"; }
}
// The outline's "+ Add scene": the scene appears in place and its (optional) title takes the cursor.
function addSceneToChapter(chapterId) {
  const id = project.addScene(chapterId, {});
  ui.expandChapter(chapterId);
  selectNewRowName(`.ol-scene-title[data-scene-id="${id}"]`);
}

async function deletePart(part) {
  if (project.parts.length <= 1) return;  // Refuse to leave the project partless.
  const count = part.chapters.length;
  const neighborIdx = project.parts.findIndex((p) => p.id === part.id);
  const neighbor = neighborIdx > 0 ? project.parts[neighborIdx - 1] : project.parts[neighborIdx + 1];
  const message = count
    ? t("chapters.dialogs.deletePartMessage", { n: count, into: neighbor.title }, count)
    : t("chapters.dialogs.deletePartEmpty");
  const yes = await confirmDialog({
    title: t("chapters.dialogs.deletePartTitle", { title: part.title }),
    message,
    confirmLabel: t("chapters.dialogs.deletePartConfirm"),
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
    if (t) return t.length > 220 ? `${cutToLength(t, 220).trim()}…` : t;
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
onMounted(() => {
  window.addEventListener("keydown", onKey);
});
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
  if (!body.includes("comment-mark")) return withSceneImages(body);
  const div = document.createElement("div");
  div.innerHTML = withSceneImages(body);
  div.querySelectorAll("span.comment-mark").forEach((el) => { el.replaceWith(...el.childNodes); });
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
  targets.forEach((el) => { bookObserver.observe(el); });
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
watch(() => project.allChapters.map((c) => `${c.id}:${(project.scenesFor(c.id) || []).length}`).join("|"), async () => {
  if (mode.value !== "read" || readScope.value !== "book") return;
  await nextTick();
  setupBookObserver();
});
</script>

<template>
  <q-page :style-fn="pageFill" class="main">
    <!-- ── Header ─────────────────────────────────────────────────
         One header for all three modes (edit / outline / read). Only the
         title region differs — edit mode shows the chapter/scene title
         input, outline/read show a static eyebrow + h1. The centered
         Edit/Outline/Read toggle is the same across modes so its position
         doesn't jump when you switch view. Mode-specific action buttons
         (if we ever add any back) go inside .pane-actions, where they'll
         be conditional on `mode`. -->
    <PaneHeader v-if="ch" ref="header" class="chapter-pane-header"
      :crumbs="mode === 'edit' ? crumbs : null"
      :eyebrow="mode === 'outline' ? $t('sidebar.sections.manuscript') : ch.partTitle"
      :editable="mode === 'edit'" :title="headerTitle" :placeholder="headerPlaceholder"
      @update:title="onHeaderTitle">
      <!-- Title ideas (2026-10-28): Brainstorm's Titles at the title the header edits — the open
           scene's, else the chapter's -->
      <template v-if="mode === 'edit'" #after-title>
        <BrainstormPopup :key="activeScene?.id || ch.id" category="title" :label="$t('brainstorm.titleIdeas')"
          :meta="{ kind: 'title-ideas', chapterId: ch.id, sceneId: activeScene?.id || '' }"
          :request="(round) => titleIdeasRequest({ project, target: activeScene ? 'scene' : 'chapter', chapterId: ch.id, sceneId: activeScene?.id, ...round })"
          @pick="onHeaderTitle" />
      </template>
      <UiButton v-if="bookIndexOn" intent="ghost" size="small" data-panel-toggle @click="askTheBook"
        v-tooltip.bottom="$t('chapters.header.askTheBookTooltip', { num: ch.num })">
        <Icon name="Chat" :size="14" /> {{ $t('sidebar.nav.askTheBook') }}
      </UiButton>
      <UiSegmented
        class="seg-toggle"
        :model-value="mode"
        :options="MODES"
        option-value="value"
        :aria-label="$t('chapters.header.viewModeAriaLabel')"
        @update:model-value="mode = $event">
        <template #option="{ option }">
          <Icon :name="option.icon" :size="13" />
          <span>{{ option.label }}</span>
        </template>
      </UiSegmented>
      <UiButton intent="ghost" size="small" class="chapter-sweep-btn" @click="sweepOpen = true"
        v-tooltip.bottom="$t('chapters.header.entitySweepTooltip')">
        <Icon name="Sparkle" :size="13" /> {{ $t('chapters.header.entitySweep') }}
      </UiButton>
    </PaneHeader>
    <!-- No chapter in the route: the INDEX header, matching every other section.
         The title only says "No chapters" when the book genuinely has none. -->
    <PaneHeader v-else :eyebrow="$t('panes.chapters.eyebrow')"
      :title="project.allChapters.length ? $t('nav.chapters') : $t('panes.chapters.emptyTitle')"
      help-key="writing#chapters">
      <router-link to="/import" custom v-slot="{ navigate }">
        <UiButton intent="ghost" size="small" @click="navigate"><Icon name="Plus" :size="14" /> {{ $t('chapters.empty.importFromFile') }}</UiButton>
      </router-link>
      <UiButton intent="primary" size="small" @click="addChapter"><Icon name="Plus" :size="14" /> {{ $t('sidebar.actions.newChapterTitle') }}</UiButton>
    </PaneHeader>

    <!-- ── OUTLINE MODE ─────────────────────────────────────────── -->
    <div v-if="ch && mode === 'outline'" class="pane-card">
     <div class="scrollarea outline-pane">
      <!-- i18n-t + named slots (the user's ruling, 2026-07-26). `@` is a slot rather than
           literal message text on purpose: in vue-i18n's message syntax `@:key` is a linked
           message, so a bare @ is a metacharacter. -->
      <!-- Outline's OWN description. The long surface description that used to sit
           here moved to the index (chapters.index.intro): it describes the whole
           Chapters area, so it belongs where you land when you click Chapters —
           the same place Characters puts its description. This line is only about
           Outline. It also drops the old sentence's claim of a "Cards" VIEW MODE:
           the modes are Edit / Outline / Read, and Card view is a toggle inside
           Edit. No drag-to-reorder is promised either — the pane has none. -->
      <p class="chap-desc">{{ $t("chapters.outline.intro") }}</p>
      <div class="outline-tree">
        <section v-for="(part, pi) in project.parts" :key="part.id" class="ol-part">
          <div class="ol-part-row">
            <span class="ol-part-eyebrow">{{ $t('chapters.outline.partN', { n: pi + 1 }) }}</span>
            <input class="ol-part-title"
              :value="part.title"
              :placeholder="$t('sidebar.placeholders.untitledPart')"
              :data-part-id="part.id"
              @input="updatePartTitle(part.id, $event.target.value)" />
            <div class="ol-row-actions">
              <UiButton intent="ghost" size="small"
                :disabled="pi === 0"
                v-tooltip.bottom="pi === 0 ? $t('chapters.outline.alreadyFirstPart') : $t('chapters.outline.movePartUp')"
                @click="movePart(part.id, -1)">
                <Icon name="ChevRight" :size="12" style="transform:rotate(-90deg)" />
              </UiButton>
              <UiButton intent="ghost" size="small"
                :disabled="pi === project.parts.length - 1"
                v-tooltip.bottom="pi === project.parts.length - 1 ? $t('chapters.outline.alreadyLastPart') : $t('chapters.outline.movePartDown')"
                @click="movePart(part.id, 1)">
                <Icon name="ChevRight" :size="12" style="transform:rotate(90deg)" />
              </UiButton>
              <UiButton intent="ghost" size="small"
                :disabled="project.parts.length <= 1"
                v-tooltip.bottom="project.parts.length <= 1 ? $t('chapters.outline.needOnePart') : $t('chapters.dialogs.deletePartConfirm')"
                @click="deletePart(part)">
                <Icon name="Trash" :size="14" />
              </UiButton>
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
                  :placeholder="$t('chapters.outline.untitledChapter')"
                  @click.stop
                  @input="updateTitle(c.id, $event.target.value)" />
                <span class="ol-chapter-meta">
                  {{ $t('chapters.outline.sceneCount', { n: c.scenes }, c.scenes) }} · {{ $t('chapters.outline.wordCount', { n: $n(c.words) }, c.words) }}
                </span>
                <span v-if="project.notesForChapter(c.id).length"
                  class="ol-scene-notes"
                  v-tooltip.bottom="$t('chapters.outline.chapterNotesTooltip')"
                  @click.stop="openNotesPanel(c.id, 'chapter')">
                  {{ $t('chapters.outline.noteCount', { n: project.notesForChapter(c.id).length }, project.notesForChapter(c.id).length) }}
                </span>
                <div class="ol-row-actions">
                  <label v-if="project.parts.length > 1" class="ol-move-to" @click.stop>
                    <UiSelect class="ol-move-select"
                      :model-value="part.id"
                      @update:model-value="(v) => moveChapterPart(c.id, v)"
                      :options="project.parts.map(p => ({ label: $t('chapters.outline.moveTo', { title: p.title }), value: p.id }))"
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
                    :placeholder="$t('chapters.outline.sceneN', { n: si + 1 })"
                    @click.stop
                    :data-scene-id="scn.id"
                    @input="project.setSceneTitle(c.id, scn.id, $event.target.value)" />
                  <span v-if="project.notesForScene(scn.id).length"
                    class="ol-scene-notes"
                    v-tooltip.bottom="$t('chapters.outline.sceneNotesTooltip')"
                    @click.stop="openNotesPanel(c.id, scn.id)">
                    {{ $t('chapters.outline.noteCount', { n: project.notesForScene(scn.id).length }, project.notesForScene(scn.id).length) }}
                  </span>
                </div>
                <button class="ol-add ol-add-scene" @click="addSceneToChapter(c.id)">
                  <Icon name="Plus" :size="11" /> {{ $t('sidebar.actions.newSceneConfirm') }}
                </button>
              </div>
            </div>
            <button class="ol-add ol-add-chapter" @click="addChapterToPart(part.id)">
              <Icon name="Plus" :size="11" /> {{ $t('chapters.outline.addChapter') }}
            </button>
          </div>
        </section>
        <UiButton intent="ghost" class="ol-add-part" @click="addPart">
          <Icon name="Plus" :size="13" /> {{ $t('sidebar.actions.newPartTitle') }}
        </UiButton>
      </div>
     </div>
    </div>

    <!-- ── READ MODE ────────────────────────────────────────────── -->
    <div v-else-if="ch && mode === 'read'" class="pane-card">
     <div class="read-mode">
      <div class="read-scope-bar">
        <UiSegmented
          class="seg-toggle"
          :model-value="readScope"
          :options="READ_SCOPE_OPTIONS"
          option-value="value"
          :aria-label="$t('chapters.read.scopeAriaLabel')"
          @update:model-value="readScope = $event">
          <template #option="{ option }">
            <Icon :name="option.icon" :size="12" />
            <span>{{ option.label }}</span>
          </template>
        </UiSegmented>
      </div>

      <!-- Single chapter: existing prev/next paging. -->
      <div v-if="readScope === 'chapter'" class="manuscript scrollarea">
        <article v-scene-images class="manuscript-inner read-content" v-html="readBody(ch.id)" />
        <nav class="read-nav">
          <button v-if="prev" class="read-nav-btn" @click="goPrev">
            <Icon name="ChevRight" :size="14" style="transform:rotate(180deg)" />
            <div>
              <div class="read-nav-eyebrow">{{ $t('common.previous') }}</div>
              <div class="read-nav-title">{{ $t('chapters.read.chapterRef', { num: prev.num, title: prev.title }) }}</div>
            </div>
          </button>
          <span v-else />
          <button v-if="next" class="read-nav-btn align-end" @click="goNext">
            <div>
              <div class="read-nav-eyebrow">{{ $t('common.next') }}</div>
              <div class="read-nav-title">{{ $t('chapters.read.chapterRef', { num: next.num, title: next.title }) }}</div>
            </div>
            <Icon name="ChevRight" :size="14" />
          </button>
          <span v-else />
        </nav>
        <p class="read-hint">{{ $t('chapters.read.navHint') }}</p>
      </div>

      <!-- Whole book: every part → chapter → scene stitched into one
           continuous scroll. Each scene has data attrs that the
           IntersectionObserver maps back to sidebar highlights. -->
      <div v-else class="manuscript scrollarea" ref="bookScrollEl">
        <article class="manuscript-inner read-content read-book">
          <template v-for="(part, pi) in project.parts" :key="part.id">
            <header class="book-part-head">
              <div class="book-part-eyebrow">{{ $t('chapters.outline.partN', { n: pi + 1 }) }}</div>
              <h2 class="book-part-title">{{ part.title }}</h2>
            </header>
            <section v-for="chap in part.chapters" :key="chap.id" class="book-chapter">
              <h1 class="book-chapter-title" :data-chapter-id="chap.id">
                <span class="book-chapter-num">{{ $t('chapters.read.chapterN', { num: chap.num }) }}</span>
                <span class="book-chapter-name">{{ chap.title }}</span>
              </h1>
              <section v-for="scn in project.scenesFor(chap.id)" :key="scn.id"
                class="book-scene"
                :data-scene-id="scn.id"
                :data-chapter-id="chap.id">
                <div v-scene-images class="book-scene-body" v-html="sceneReadHtml(scn.body)" />
              </section>
            </section>
          </template>
          <p class="read-hint">{{ $t('chapters.read.endOfBook') }}</p>
        </article>
      </div>
     </div>
    </div>

    <!-- ── EDIT MODE (default) ──────────────────────────────────── -->
    <!-- When the docked notes panel opens, .has-side-panel flips the card to a
         row so the editor column (.chapters-edit-main) shrinks beside it. -->
    <div v-else-if="ch" class="pane-card" :class="{ 'has-side-panel': notesPanelOpen }">
     <div class="chapters-edit-main">
      <div class="chapter-bar">
        <div class="chapter-bar-group">
          <UiButton intent="ghost" size="small"
            :class="{ 'is-active': continuousMode }"
            v-tooltip.bottom="continuousMode ? $t('chapters.edit.singleSceneTooltip') : $t('chapters.edit.continuousTooltip')"
            @click="toggleContinuous">
            <Icon name="Strands" :size="13" /> {{ continuousMode ? $t('chapters.edit.singleScene') : $t('chapters.edit.continuous') }}
          </UiButton>
          <UiButton v-if="!activeScene" intent="ghost" size="small"
            v-tooltip.bottom="editStyle === 'cards' ? $t('chapters.edit.listViewTooltip') : $t('chapters.edit.cardViewTooltip')"
            @click="editStyle = editStyle === 'cards' ? 'list' : 'cards'">
            <Icon :name="editStyle === 'cards' ? 'List' : 'Grid'" :size="13" />
            {{ editStyle === 'cards' ? $t('chapters.edit.listView') : $t('chapters.edit.cardView') }}
          </UiButton>
        </div>
        <div class="chapter-bar-group">
          <UiButton v-if="prev" intent="ghost" size="small"
            v-tooltip.bottom="$t('chapters.edit.chapterRefDash', { num: prev.num, title: prev.title })"
            @click="goPrev">
            <Icon name="ChevRight" :size="12" style="transform:rotate(180deg)" /> {{ $t('chapters.edit.previousChapter') }}
          </UiButton>
          <UiButton v-if="next" intent="ghost" size="small"
            v-tooltip.bottom="$t('chapters.edit.chapterRefDash', { num: next.num, title: next.title })"
            @click="goNext">
            {{ $t('chapters.edit.nextChapter') }} <Icon name="ChevRight" :size="12" />
          </UiButton>
        </div>
        <div v-if="!activeScene" class="chapter-bar-group chapter-bar-end">
          <StatusSelect
            :model-value="ch.status || ''"
            @update:model-value="(v) => project.setChapterStatus(ch.id, v)" />
          <UiButton intent="ghost" size="small" @click="versionsOpen = true" v-tooltip.bottom="$t('chapters.edit.versionsTooltip')">
            <Icon name="History" :size="13" style="margin-right:3px" /> {{ $t('chapters.edit.versions') }}
          </UiButton>
          <UiButton intent="ghost" size="small" @click="critiqueOpen = true" v-tooltip.bottom="$t('chapters.edit.critiqueTooltip')">
            <Icon name="Sparkle" :size="13" />
            {{ $t('chapters.edit.critique') }}
            <span v-if="ch?.critique?.notes?.length" class="critique-pill">{{ ch.critique.notes.length }}</span>
          </UiButton>
          <UiButton intent="ghost" size="small" @click="multiReaderOpen = true" v-tooltip.bottom="$t('chapters.edit.multiReaderTooltip')">
            <Icon name="Users" :size="13" />
            {{ $t('chapters.edit.multiReader') }}
            <span v-if="ch?.multiReader?.panel?.length" class="critique-pill">4</span>
          </UiButton>
          <UiButton intent="ghost" size="small" @click="openChapterNotes"
            v-tooltip.bottom="$t('chapters.edit.notesTooltip')">
            <Icon name="Note" :size="13" />
            {{ $t('nav.notes') }}
            <span v-if="chapterNotesCount" class="critique-pill">{{ chapterNotesCount }}</span>
          </UiButton>
          <UiButton intent="primary" size="small" @click="addChapter" v-tooltip.bottom="$t('chapters.edit.addChapterTooltip')"><Icon name="Plus" :size="14" /> {{ $t('sidebar.actions.newChapterTitle') }}</UiButton>
          <UiButton intent="danger" size="small" @click="deleteChapter" v-tooltip.bottom="$t('chapters.edit.deleteChapterTooltip')">{{ $t('chapters.edit.deleteChapter') }}</UiButton>
        </div>
        <div v-else></div>
      </div>

      <!-- ── Body switches between corkboard (cards) and the scene
           editor (list). The bar above and footer below stay put so
           the header is consistent across both styles. ──────────── -->
      <template v-if="editStyle === 'cards'">
        <div class="scrollarea cards-pane">
          <p class="t-muted" style="font-size:12px;margin:0 0 14px">{{ $t('chapters.edit.dragToReorder') }}</p>
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
              <div class="scene-card-title">{{ scn.title || $t('chapters.outline.sceneN', { n: i + 1 }) }}</div>
              <div class="scene-card-body">{{ synopsis(scn) || $t('chapters.edit.emptyScene') }}</div>
            </div>
            <button class="scene-card scene-card-add" @click="addSceneHere">
              <Icon name="Plus" :size="18" /> <span>{{ $t('sidebar.actions.newSceneConfirm') }}</span>
            </button>
          </div>
        </div>
      </template>

      <template v-else>
      <!-- Single-scene editor: which scene shows is driven by the route
           hash (#scene-<id>), set by the sidebar's scene list. The
           prev/next/pill block is hidden in continuous mode — there's no
           single "current scene" when every scene is on screen at once. -->
      <div v-if="activeScene" class="scene-strip">
        <template v-if="!continuousMode">
          <UiButton intent="ghost" size="small"
            :disabled="!prevScene"
            v-tooltip.bottom="prevScene ? $t('chapters.sceneStrip.sceneRef', { n: activeSceneIdx, title: prevScene.title || $t('sidebar.projectSwitcher.untitled') }) : $t('chapters.sceneStrip.alreadyFirst')"
            @click="prevScene && goToScene(prevScene.id)">
            <Icon name="ChevRight" :size="12" style="transform:rotate(180deg)" /> {{ $t('chapters.sceneStrip.prevScene') }}
          </UiButton>
          <span class="scene-pill" :class="{ 'has-status': activeStatus }"
                :style="activeStatus ? { '--pill-c': activeStatus.color } : null">
            <span v-if="activeStatus" class="scene-pill-dot" />
            {{ $t('chapters.sceneStrip.sceneOf', { i: activeSceneIdx + 1, n: scenes.length }) }}
            <span v-if="activeStatus" class="scene-pill-status">· {{ activeStatus.label }}</span>
          </span>
          <UiButton intent="ghost" size="small"
            :disabled="!nextScene"
            v-tooltip.bottom="nextScene ? $t('chapters.sceneStrip.sceneRef', { n: activeSceneIdx + 2, title: nextScene.title || $t('sidebar.projectSwitcher.untitled') }) : $t('chapters.sceneStrip.alreadyLast')"
            @click="nextScene && goToScene(nextScene.id)">
            {{ $t('chapters.sceneStrip.nextScene') }} <Icon name="ChevRight" :size="12" />
          </UiButton>
        </template>
        <span v-else class="scene-pill">{{ $t('chapters.sceneStrip.chapterScenes', { num: ch.num, n: scenes.length }, scenes.length) }}</span>
        <div class="scene-strip-actions" style="margin-left:auto">
          <!-- AI writing assist — single dropdown that hosts every action
               that used to live in the selection bubble. Grouped by what
               they operate on so users know whether to make a selection
               first. -->
          <UiMenu trigger-class="ui-btn ui-btn--ghost ui-btn--small ai-strip-trigger" content-class="ai-strip-menu"
            align="end" :disabled="aiRunning" v-tooltip.bottom="$t('chapters.ai.triggerTooltip')">
            <template #trigger>
            <span class="ai-strip-badge">{{ $t('chapters.ai.badge') }}</span>
            <Icon name="ChevDown" :size="12" class="ai-strip-caret" />
            </template>
            <!-- Routing chip at the top of the menu: shows the current
                 provider + model for every writerAI action below, with
                 a click-to-edit popover for picking a different one. -->
            <div class="ai-strip-routing">
              <span class="ai-strip-routing-label">{{ $t('chapters.ai.runningOn') }}</span>
              <AiFeatureChip feature="writerAI" :label="$t('chapters.ai.writerActions')" editable />
            </div>
            <UiMenuSeparator class="ai-strip-divider" />
            <div class="ai-strip-section">
              {{ $t('chapters.ai.groupSelectionOnly') }}
              <span v-if="!hasSelection" class="ai-strip-section-hint">{{ $t('chapters.ai.highlightToEnable') }}</span>
            </div>
            <UiMenuItem class="ai-strip-item" :disabled="aiRunning || !hasSelection" @select="(ev) => callAi('rewrite', ev.detail.originalEvent)">
              <div class="ai-strip-label">{{ $t('chapters.ai.rewriteLabel') }}</div>
              <div class="ai-strip-desc">{{ $t('chapters.ai.rewriteDesc') }}</div>
            </UiMenuItem>
            <UiMenuItem class="ai-strip-item" :disabled="aiRunning || !hasSelection" @select="(ev) => openDirected('rewrite', ev.detail.originalEvent)">
              <div class="ai-strip-label">{{ $t('chapters.ai.guidedRewriteLabel') }}</div>
              <div class="ai-strip-desc">{{ $t('chapters.ai.guidedRewriteDesc') }}</div>
            </UiMenuItem>
            <UiMenuItem class="ai-strip-item" :disabled="aiRunning || !hasSelection" @select="(ev) => callAi('expand', ev.detail.originalEvent)">
              <div class="ai-strip-label">{{ $t('chapters.ai.expandLabel') }}</div>
              <div class="ai-strip-desc">{{ $t('chapters.ai.expandDesc') }}</div>
            </UiMenuItem>
            <UiMenuItem class="ai-strip-item" :disabled="aiRunning || !hasSelection" @select="(ev) => callAi('describe', ev.detail.originalEvent)">
              <div class="ai-strip-label">{{ $t('chapters.ai.describeLabel') }}</div>
              <div class="ai-strip-desc">{{ $t('chapters.ai.describeDesc') }}</div>
            </UiMenuItem>
            <UiMenuItem class="ai-strip-item" :disabled="aiRunning || !hasSelection" @select="openSensory">
              <div class="ai-strip-label">{{ $t('chapters.ai.sensoryLabel') }}</div>
              <div class="ai-strip-desc">{{ $t('chapters.ai.sensoryDesc') }}</div>
            </UiMenuItem>
            <UiMenuSeparator class="ai-strip-divider" />
            <div class="ai-strip-section">{{ $t('chapters.ai.groupSelectionOrScene') }}</div>
            <UiMenuItem class="ai-strip-item" :disabled="aiRunning" @select="(ev) => callAi('tighten', ev.detail.originalEvent)">
              <div class="ai-strip-label">{{ $t('chapters.ai.tightenLabel') }}</div>
              <div class="ai-strip-desc">{{ $t('chapters.ai.tightenDesc') }}</div>
            </UiMenuItem>
            <UiMenuSeparator class="ai-strip-divider" />
            <div class="ai-strip-section">{{ $t('chapters.ai.groupFromCursor') }}</div>
            <UiMenuItem v-if="sceneDrafting" class="ai-strip-item" :disabled="aiRunning || !planReady" @select="(ev) => callDraftFromPlan(ev.detail.originalEvent)">
              <div class="ai-strip-label">{{ $t('chapters.ai.draftFromPlanLabel') }}</div>
              <div class="ai-strip-desc">{{ planReady ? $t('chapters.ai.draftFromPlanDesc') : $t('chapters.ai.draftFromPlanNeedsSummary') }}</div>
            </UiMenuItem>
            <UiMenuItem class="ai-strip-item" :disabled="aiRunning" @select="(ev) => callAi('continue', ev.detail.originalEvent)">
              <div class="ai-strip-label">{{ $t('chapters.ai.continueLabel') }}</div>
              <div class="ai-strip-desc">{{ $t('chapters.ai.continueDesc') }}</div>
            </UiMenuItem>
            <UiMenuItem class="ai-strip-item" :disabled="aiRunning" @select="(ev) => openGuidedContinue(ev.detail.originalEvent)">
              <div class="ai-strip-label">{{ $t('chapters.ai.guidedLabel') }}</div>
              <div class="ai-strip-desc">{{ $t('chapters.ai.guidedDesc') }}</div>
            </UiMenuItem>
            <UiMenuItem class="ai-strip-item" :disabled="aiRunning" @select="(ev) => openDirected('dialogue', ev.detail.originalEvent)">
              <div class="ai-strip-label">{{ $t('chapters.ai.dialogueLabel') }}</div>
              <div class="ai-strip-desc">{{ $t('chapters.ai.dialogueDesc') }}</div>
            </UiMenuItem>
            <UiMenuItem class="ai-strip-item" :disabled="aiRunning" @select="openStuck">
              <div class="ai-strip-label">{{ $t('chapters.ai.unstuckLabel') }}</div>
              <div class="ai-strip-desc">{{ $t('chapters.ai.unstuckDesc') }}</div>
            </UiMenuItem>
            <UiMenuItem class="ai-strip-item" :disabled="aiRunning" @select="openIdeas('next_beat')">
              <div class="ai-strip-label">{{ $t('brainstorm.categories.next_beat.label') }}</div>
              <div class="ai-strip-desc">{{ $t('chapters.ai.nextBeatsDesc') }}</div>
            </UiMenuItem>
            <UiMenuItem class="ai-strip-item" :disabled="aiRunning" @select="openIdeas('twist')">
              <div class="ai-strip-label">{{ $t('brainstorm.categories.twist.label') }}</div>
              <div class="ai-strip-desc">{{ $t('chapters.ai.twistsDesc') }}</div>
            </UiMenuItem>
            <template v-if="proseRules.length">
              <UiMenuSeparator class="ai-strip-divider" />
              <div class="ai-strip-section">
                {{ $t('chapters.ai.groupLineEdits') }}
                <span class="ai-strip-section-hint">{{ $t('chapters.ai.lineEditsHint') }}</span>
              </div>
              <UiMenuItem v-for="r in proseRules" :key="r.key" class="ai-strip-item" :disabled="aiRunning" @select="(ev) => callProse(r.key, ev.detail.originalEvent)">
                <div class="ai-strip-label">{{ r.label }}</div>
                <div class="ai-strip-desc">{{ r.description }}</div>
              </UiMenuItem>
            </template>
            <UiMenuSeparator class="ai-strip-divider" />
            <div class="ai-strip-section">{{ $t('chapters.ai.groupCleanUp') }}</div>
            <UiMenuItem class="ai-strip-item" :disabled="!hasStrikes" @select="callClearStrikethroughs">
              <div class="ai-strip-label">{{ $t('chapters.ai.clearStrikesLabel') }}</div>
              <div class="ai-strip-desc">{{ $t('chapters.ai.clearStrikesDesc') }}</div>
            </UiMenuItem>
            <UiMenuItem class="ai-strip-item" :disabled="!aiTextHere" @select="callMarkAsMine">
              <div class="ai-strip-label">{{ $t('chapters.ai.markAsMineLabel') }}</div>
              <div class="ai-strip-desc">{{ $t('chapters.ai.markAsMineDesc') }}</div>
            </UiMenuItem>
          </UiMenu>
          <StatusSelect
            :model-value="activeScene.status || ''"
            @update:model-value="(v) => project.updateScene(ch.id, activeScene.id, { status: v })" />
          <UiButton intent="ghost" size="small" @click="splitChapterHere" v-tooltip.bottom="$t('chapters.sceneStrip.splitHereTooltip')">
            <template #icon><Icon name="Replace" :size="14" /></template>
            {{ $t('chapters.sceneStrip.splitHere') }}
          </UiButton>
          <UiButton intent="ghost" size="small" class="scene-notes-btn"
            v-tooltip.bottom="$t('chapters.outline.sceneNotesTooltip')"
            @click="openSceneNotes(activeScene.id)">
            {{ $t('nav.notes') }}
            <span v-if="activeSceneNotesCount" class="critique-pill">{{ activeSceneNotesCount }}</span>
          </UiButton>
          <UiButton intent="ghost" size="small"
            v-tooltip.bottom="$t('chapters.sceneStrip.linksTooltip')"
            @click="linksOpen = true">
            <template #icon><Icon name="Network" :size="14" /></template>
            {{ $t('chapters.sceneStrip.links') }}
          </UiButton>
          <UiButton intent="primary" size="small" @click="addSceneHere" v-tooltip.bottom="$t('chapters.sceneStrip.addSceneTooltip')">
            <Icon name="Plus" :size="13" /> {{ $t('sidebar.actions.newSceneTitle') }}
          </UiButton>
          <UiButton intent="danger" size="small"
            :disabled="scenes.length <= 1"
            v-tooltip.bottom="scenes.length <= 1 ? $t('chapters.sceneStrip.needOneScene') : $t('chapters.sceneStrip.deleteSceneTooltip')"
            @click="removeScene(activeScene)">
            {{ $t('chapters.sceneStrip.deleteScene') }}
          </UiButton>
        </div>
      </div>

      <SceneLinks v-if="linksOpen && activeScene"
        :chapter-id="ch.id"
        :scene-id="activeScene.id"
        @close="linksOpen = false" />

      <!-- Draft from plan in an empty scene (slice 4) — only in a book with AI scene drafting on. -->
      <div v-if="showDraftCta" class="scene-draft-cta">
        <UiButton intent="secondary" size="small" :disabled="aiRunning || !planReady" @click="callDraftFromPlan">
          <template #icon><Icon name="Sparkle" :size="13" /></template>
          {{ $t('chapters.ai.draftFromPlanLabel') }}
        </UiButton>
        <span class="scene-draft-cta-hint">{{ planReady ? $t('chapters.ai.draftFromPlanDesc') : $t('chapters.ai.draftFromPlanNeedsSummary') }}</span>
      </div>

      <!-- Continuous-chapter editor — one big stitched document; on
           change we split it back and apply atomically. -->
      <RichEditor v-if="continuousMode && ch && scenes.length"
        ref="editorRef"
        :key="`continuous-${ch.id}`"
        :model-value="stitchedBody"
        :toolbar="editorToolbar"
        :placeholder="$t('chapters.edit.continuousPlaceholder')"
        :count-footer="false"
        :running-head="project.project.title"
        :story-context="storyContextFor"
        :folio-label="t('common.chapterShort', { num: ch.num })"
        @change="onStitchedChange" />

      <RichEditor v-else-if="activeScene"
        ref="editorRef"
        :key="activeScene.id"
        :model-value="activeScene.body"
        :toolbar="editorToolbar"
        :placeholder="$t('chapters.edit.scenePlaceholder', { n: activeSceneIdx + 1 })"
        :count-footer="false"
        :running-head="project.project.title"
        :story-context="storyContextFor"
        :folio-label="t('common.chapterShort', { num: ch.num })"
        @change="(html) => onSceneBodyChange(activeScene.id, html)" />

      <!-- Chapter overview: shown when no scene is picked yet. Lists
           every scene as a clickable card so the user can drop into one. -->
      <div v-else class="scrollarea" style="flex:1;min-height:0">
        <div class="chapter-overview">
          <h2 class="chapter-overview-title">{{ ch.title }}</h2>
          <p class="chapter-overview-hint">
            {{ scenes.length
                ? $t('chapters.edit.pickAScene')
                : $t('chapters.edit.noScenesYet') }}
          </p>
          <div v-if="scenes.length" class="chapter-overview-scenes">
            <button v-for="(scn, sIdx) in scenes" :key="scn.id"
              class="overview-scene-card"
              @click="goToScene(scn.id)">
              <span class="overview-scene-num">{{ $t('chapters.outline.sceneN', { n: sIdx + 1 }) }}</span>
              <span class="overview-scene-title">{{ scn.title || $t('chapters.edit.untitledScene') }}</span>
              <span class="overview-scene-snippet">{{ snippetFor(ch.id) && sIdx === 0 ? snippetFor(ch.id) : '' }}</span>
            </button>
          </div>
          <button class="overview-add-scene" @click="addSceneHere">
            <Icon name="Plus" :size="13" /> {{ scenes.length ? $t('chapters.edit.addAnotherScene') : $t('chapters.edit.addFirstScene') }}
          </button>
        </div>
      </div>
      </template>

      <div style="display:flex;align-items:center;gap:16px;padding:8px 22px;border-top:1px solid var(--border);background:var(--surface-2);font-size:11.5px;color:var(--muted)">
        <span v-if="activeScene || continuousMode">
          <b class="t-num" style="color:var(--ink)">{{ $n(sceneWordCount) }}</b> {{ $t('chapters.footer.words') }} ·
          <b class="t-num" style="color:var(--ink)">{{ $n(sceneCharCount) }}</b> {{ $t('chapters.footer.characters') }}
          <span v-if="continuousMode" style="margin-left:6px">{{ $t('chapters.footer.chapterSuffix') }}</span>
        </span>
        <span v-if="aiNotice" class="ai-done-note">
          <Icon name="Sparkle" :size="11" />
          <span>{{ $t('chapters.footer.aiDone', { label: aiNotice.label, s: $n(aiNotice.durationMs / 1000, 'oneDecimal') }) }}<template v-if="aiNotice.tokensOut"> {{ $t('chapters.footer.aiTokens', { n: $n(aiNotice.tokensOut) }) }}</template></span>
          <button class="ai-done-link" @click="aiTasks.openPanel()">{{ $t('chapters.footer.viewTaskQueue') }}</button>
          <button class="ai-done-x" :aria-label="$t('chapters.footer.dismiss')" @click="dismissedNoticeId = aiNotice.id">✕</button>
        </span>
        <span style="margin-left:auto">{{ $t('chapters.footer.autosaves') }}</span>
      </div>
     </div>

     <SceneNotesPanel v-if="notesPanelOpen && ch"
       :chapter-id="ch.id"
       :scope="notesPanelScope"
       :scene-id="activeScene?.id || ''"
       @close="notesPanelOpen = false" />
    </div>

    <!-- ── INDEX (no chapter in the route) ──────────────────────────
         The grid of chapters, on the same shared shell as every other section.
         Outline is NOT this: that one restructures the book (rename in place,
         move parts, add/delete, scenes nested); this one finds and scans. So the
         index never nests scenes, and Outline never grows filters. -->
    <EntityIndex v-else-if="project.allChapters.length"
      :rows="project.allChapters"
      :columns="indexColumns"
      :facets="indexFacets"
      :search-fields="['title', 'partTitle']"
      :search-placeholder="$t('chapters.index.searchPlaceholder')"
      :empty-text="$t('chapters.index.noMatches')"
      @row-click="onIndexRowClick">
      <template #intro>
        <i18n-t keypath="chapters.index.intro" tag="p" class="entity-desc chap-desc" scope="global">
          <template #chapters><strong>{{ $t("nav.chapters") }}</strong></template>
          <template #edit><strong>{{ $t("chapters.modes.edit") }}</strong></template>
          <template #listView><strong>{{ $t("chapters.edit.listView") }}</strong></template>
          <template #cardView><strong>{{ $t("chapters.edit.cardView") }}</strong></template>
          <template #outline><strong>{{ $t("chapters.modes.outline") }}</strong></template>
          <template #read><strong>{{ $t("chapters.modes.read") }}</strong></template>
          <template #at><code>@</code></template>
          <template #ai><strong>{{ $t("chapters.ai.badge") }}</strong></template>
          <template #links><strong>{{ $t("chapters.sceneStrip.links") }}</strong></template>
        </i18n-t>
      </template>

      <template #num="{ row }">
        <span class="t-num entity-cell-sub">{{ row.num }}</span>
      </template>

      <template #title="{ row }">
        <div class="entity-cell-title">
          <span class="entity-cell-title-text">{{ row.title }}</span>
        </div>
      </template>

      <template #partTitle="{ row }">
        <span class="entity-cell-sub">{{ row.partTitle || $t('sidebar.placeholders.untitledPart') }}</span>
      </template>

      <template #status="{ row }">
        <UiTag v-if="row.status" :value="statusLabel(row.status)" :intent="statusSeverity(row.status)" />
        <span v-else class="entity-status-empty">—</span>
      </template>

      <template #scenes="{ row }">
        <span class="t-num entity-cell-sub">{{ row.scenes }}</span>
      </template>

      <template #words="{ row }">
        <span class="t-num entity-cell-sub">{{ $n(row.words || 0) }}</span>
      </template>
    </EntityIndex>

    <div v-else class="pane-card" style="display:grid;place-items:center;padding:60px">
      <EmptyState icon="Book"
        :title="$t('chapters.empty.title')"
        :message="$t('chapters.empty.message')"
        :action-label="$t('chapters.empty.actionLabel')"
        @action="addChapter" />
    </div>

    <!-- Modal mounts — hoisted out of the mode-specific wrappers so they
         open regardless of edit/outline/cards/read mode. -->
    <VersionHistoryModal v-if="versionsOpen && ch"
      :chapter-id="ch.id"
      :chapter-title="t('common.chapterRefTitled', { num: ch.num, title: ch.title })"
      @close="versionsOpen = false" />

    <CritiqueModal v-if="critiqueOpen && ch"
      :chapter-id="ch.id"
      @close="critiqueOpen = false" />

    <MultiReaderPanelModal v-if="multiReaderOpen && ch"
      :chapter-id="ch.id"
      @close="multiReaderOpen = false" />

    <StuckDiagnosticModal v-if="stuckOpen"
      :context-text="stuckContextText"
      :chapter-title="stuckChapterTitle"
      :chapter-num="stuckChapterNum"
      @close="closeStuck"
      @use-move="onStuckUseMove" />

    <BrainstormModal v-if="ideas"
      :eyebrow="$t(`brainstorm.categories.${ideas.category}.label`)"
      :title="ch?.title || $t('sidebar.projectSwitcher.untitled')"
      :lede="$t(ideas.category === 'twist' ? 'chapters.ai.twistsDesc' : 'chapters.ai.nextBeatsDesc')"
      :category="ideas.category" :request="ideasRound"
      :meta="{ kind: `scene-${ideas.category}`, sceneId: ideas.sceneId }"
      :task-label="$t('plotBoard.ai.taskIdeas', { name: ch?.title || $t('sidebar.projectSwitcher.untitled') })"
      :pick-label="$t('stuck.writeThis')"
      @pick="onIdeaPick" @close="ideas = null" />

    <SensoryResearchModal v-if="sensoryOpen"
      :subject="sensorySubject"
      @close="closeSensory"
      @insert="onSensoryInsert" />

    <EntitySweepModal v-if="sweepOpen"
      @close="sweepOpen = false"
      @committed="sweepOpen = false" />
  </q-page>
</template>

<style scoped>
.chap-desc {
  font-size: 14px; line-height: 1.55; color: var(--muted);
  margin: 0 0 18px;
}
.chap-desc strong { color: var(--ink-2); font-weight: 600; }
.chap-desc code { font-family: var(--font-mono); font-size: 0.92em; padding: 0 4px; background: var(--surface-3); border-radius: 4px; }

/* 3-column grid [title 1fr | seg-toggle auto | spacer 1fr] so the
   Edit/Outline/Read toggle sits in the horizontal centre of the header
   regardless of title width. The seg-toggle is the only thing left in
   .pane-actions after all other actions moved into the toolbar below. */
.pane-header.chapter-pane-header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
}
.pane-header.chapter-pane-header :deep(.pane-actions) { grid-column: 2; }
/* The title's column is a third of the row (the centred switch); with Title ideas beside it, the
   button moves under the title when both don't fit, rather than cutting the title short. */
.pane-header.chapter-pane-header :deep(.pane-title-row) { flex-wrap: wrap; }
/* At phone width (Quasar's xs) one column, like every other page header: the breadcrumb and
   title on their row, the Edit/Outline/Read switch on the row below. */
@media (max-width: 599.98px) {
  .pane-header.chapter-pane-header { grid-template-columns: minmax(0, 1fr); }
  .pane-header.chapter-pane-header :deep(.pane-actions) { grid-column: 1; }
}
/* Entity sweep sits to the right of the Edit/Outline/Read control with a
   little breathing room so it doesn't read as part of the segmented group. */
.chapter-sweep-btn { margin-left: 6px; }

/* The chapter bar above the editor: view toggles left, previous/next chapter in the middle,
   the chapter's own actions right. A group that doesn't fit wraps to the next row rather than
   running past the card (at 1280 px the chapter's actions did); at phone width (Quasar's xs)
   each group takes its own row. */
.chapter-bar {
  display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 12px;
  padding: 10px 22px; border-bottom: 1px solid var(--border);
}
.chapter-bar-group { display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: center; }
.chapter-bar-end { gap: 8px; }
@media (max-width: 599.98px) {
  .chapter-bar { padding: 8px 16px; }
  .chapter-bar-group { flex-basis: 100%; gap: 8px; }
  .chapter-bar > :empty { display: none; } /* the desktop's centring placeholder */
}

/* ── Edit-mode layout: editor column + docked notes panel ──────
   The card is a flex column by default; .chapters-edit-main fills it and
   stacks the toolbar/editor/footer as before. When the notes panel opens,
   .has-side-panel flips the card to a row so the editor column takes the
   remaining width (shrinking) and the panel holds its fixed 336px. */
.chapters-edit-main {
  flex: 1; min-width: 0; min-height: 0;
  display: flex; flex-direction: column;
}
.pane-card.has-side-panel { flex-direction: row; }


/* UiSegmented override — matches the original .seg-toggle look */
.seg-toggle :deep(button) {
  font-size: 11.5px; font-weight: 500;
  gap: 5px;
  padding: 4px 10px;
}
.seg-toggle :deep(button.active) {
  box-shadow: var(--shadow-1), 0 0 0 1px var(--border);
}

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
.scene-card:hover { border-color: var(--border-strong); box-shadow: 0 6px 18px var(--shadow-soft); }
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
  grid-template-columns: auto auto 1fr auto auto auto;
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
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 10px;
  padding: 4px 8px;
  border-radius: 5px;
  cursor: pointer;
  transition: background .12s ease;
}
.ol-scene-notes {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 2px 7px;
  font-family: var(--font-mono); font-size: 10.5px;
  font-variant-numeric: tabular-nums;
  border-radius: 999px;
  background: var(--accent-soft); color: var(--accent-ink);
  cursor: pointer;
  transition: background .12s ease;
}
.ol-scene-notes:hover { background: var(--accent); color: var(--on-accent, #fff); }
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
/* Draft from plan in an empty scene (slice 4): one button and its line, on the strip's gutter. */
.scene-draft-cta {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  padding: 10px 22px 0;
}
.scene-draft-cta-hint { font-size: 12px; color: var(--muted); max-width: 60ch; }
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
  box-shadow: inset 0 0 0 1px var(--shadow-soft);
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
/* At phone width (Quasar's xs) the strip's actions wrap instead of running off the edge. */
@media (max-width: 599.98px) {
  .scene-strip { padding: 8px 16px; }
  .scene-strip-actions { flex-shrink: 1; min-width: 0; flex-wrap: wrap; }
}
/* B5-7 — the bottom-bar AI-complete notice (right of the word count). */
.ai-done-note {
  display: inline-flex; align-items: center; gap: 6px;
  color: var(--ink-2);
}
.ai-done-link {
  border: 0; background: transparent; cursor: pointer;
  color: var(--accent-ink); font-size: 11.5px; padding: 0;
  text-decoration: underline; text-underline-offset: 2px;
}
.ai-done-x {
  border: 0; background: transparent; cursor: pointer;
  color: var(--muted); font-size: 10px; padding: 0 2px; line-height: 1;
}
.ai-done-x:hover { color: var(--ink); }

.scene-strip-actions :deep(.ui-btn.is-active) {
  background: var(--accent-soft);
  color: var(--accent-ink);
}

/* ── AI dropdown (scene strip) ────────────────────────────── */
/* Sized to match the Status select pill (height: 30px, padding: 0 9px,
   border-radius: 8px in StatusSelect.vue) so the AI trigger sits flush
   with it. Width is bumped via padding 0 14px — wider than Status to
   read as the headline AI affordance — but the height matches. */
.ai-strip-trigger {
  height: 30px;
  padding: 0 14px;
  gap: 7px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--ink);
  font-size: 12.5px;
}
.ai-strip-trigger:hover:not(:disabled) {
  border-color: var(--border-strong);
  background: var(--surface-2);
}
.ai-strip-trigger[data-state="open"] {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}
.ai-strip-trigger .ai-strip-caret {
  transition: transform .15s ease;
}
.ai-strip-trigger[data-state="open"] .ai-strip-caret {
  transform: rotate(180deg);
}
/* Small filled "AI" pill — the accent colour landing on the white
   button is the only color signal that this is the AI affordance. */
.ai-strip-badge {
  display: inline-flex; align-items: center;
  padding: 0 5px; height: 14px; border-radius: 3px;
  background: var(--accent); color: var(--on-accent, #fff);
  font-family: var(--font-mono);
  font-size: 9px; font-weight: 700; letter-spacing: 0.08em;
}
/* The menu is UiMenu's QMenu (content-class), outside this component's scope. z-index 999 is the
   kit's one value for a popup (.lu-mmenu, .ui-select-content, the routing chip's .afc-pop) —
   Quasar's own 6000 painted the chip's popover behind this menu. */
:global(.q-menu.ai-strip-menu) {
  z-index: 999;
  width: 380px; max-width: calc(100vw - 16px);
  max-height: 70vh;
  background: var(--surface); border: 1px solid var(--border);
  border-radius: 8px; box-shadow: 0 8px 24px var(--shadow-medium);
  padding: 6px;
  display: flex; flex-direction: column;
}
/* Routing row at the top of the AI dropdown. The chip sits next to a
   "Running on" label so the writer knows which provider + model will
   run when they pick an action below — and can change it inline before
   committing. */
.ai-strip-routing {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  padding: 8px 12px 6px;
}
.ai-strip-routing-label {
  font-family: var(--font-mono); font-size: 10px;
  letter-spacing: 0.12em; text-transform: uppercase; color: var(--muted);
}
.ai-strip-section {
  display: flex; align-items: baseline; gap: 8px;
  font-family: var(--font-mono); font-size: 10px;
  letter-spacing: 0.12em; text-transform: uppercase; color: var(--muted);
  padding: 6px 12px 2px;
}
.ai-strip-section-hint {
  font-family: var(--font-ui); font-size: 10.5px;
  letter-spacing: 0; text-transform: none;
  color: var(--subtle, var(--muted)); font-style: italic;
}
.ai-strip-item {
  display: flex; flex-direction: column; gap: 3px;
  padding: 10px 12px; border-radius: 6px;
  text-align: left; background: none; border: 0; cursor: pointer;
  color: inherit; font: inherit;
}
.ai-strip-item[data-highlighted]:not([data-disabled]) { background: var(--surface-2); outline: none; }
/* Disabled items get a stronger greying treatment than a flat opacity so
   they read as "not available right now" instead of "loading". */
.ai-strip-item[data-disabled] {
  cursor: not-allowed;
  color: var(--muted);
}
.ai-strip-item[data-disabled] .ai-strip-label { color: var(--muted); font-weight: 500; }
.ai-strip-item[data-disabled] .ai-strip-desc  { color: var(--subtle, var(--muted)); }
.ai-strip-label { font-size: 14px; font-weight: 600; color: var(--ink); }
.ai-strip-desc  { font-size: 12.5px; color: var(--muted); line-height: 1.45; }
.ai-strip-divider {
  height: 1px; background: var(--border-soft); margin: 4px 6px;
}

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
/* The vignette is a single rule now — --read-glow flips per-mode in
   tokens.css so we don't need a dark-mode override here. */
.read-mode {
  flex: 1; min-height: 0;
  display: flex; flex-direction: column;
  background:
    radial-gradient(800px 600px at 50% 0%, var(--read-glow), transparent 60%),
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
