// Project store — entities + chapter bodies + full CRUD.
// Everything persists via the IDB-backed storage adapter so reloads
// remember edits without the 5MB localStorage ceiling.
// Removals are SOFT — they push to `trash` keyed by kind; restore
// from TrashView. Each soft-delete fires an Undo toast via uiStore.

import { defineStore } from "pinia";
import { markRaw } from "vue";
import { useUiStore } from "./ui.js";
import { useSessionsStore } from "./sessions.js";
import { removeImage as removeImageFile } from "../services/imageStore.js";
import { getItem, setItem, removeItem } from "../services/storage.js";
import {
  PROJECT, STRANDS, CHARACTERS, CHARACTER_EXTRAS, LOCATIONS, OBJECTS,
  PARTS, NOTES, GROUPS, ARCHITECTURE, WORLDBUILDING, WORLDBUILDING_CATEGORIES,
  SCENES, EVENTS,
} from "../domain/seed.js";

// Multi-project storage:
//   justwrite:project:<id>       — full snapshot per project
//   justwrite:projects:registry  — [{id,title,author,savedAt}] summary list
//   justwrite:projects:active    — id of the currently loaded project
//   justwrite:project            — LEGACY single-project key, migrated on first load
//   justwrite:project:history    — undo tail (kept global; cleared on project switch)
const LS_LEGACY_KEY    = "justwrite:project";
const LS_PROJECT_PREFIX = "justwrite:project:";
const LS_REGISTRY_KEY  = "justwrite:projects:registry";
const LS_ACTIVE_KEY    = "justwrite:projects:active";
const LS_HISTORY_KEY   = "justwrite:project:history";

const uid = (p) => `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

function loadJSON(key) { try { return JSON.parse(getItem(key) || "null"); } catch { return null; } }
function saveJSON(key, val) { try { setItem(key, JSON.stringify(val)); } catch {} }
function removeKey(key) { try { removeItem(key); } catch {} }

function loadRegistry() {
  const v = loadJSON(LS_REGISTRY_KEY);
  return Array.isArray(v) ? v : [];
}
function loadSnap(id) { return id ? loadJSON(LS_PROJECT_PREFIX + id) : null; }
function saveSnap(id, snap) { if (id) saveJSON(LS_PROJECT_PREFIX + id, snap); }
function removeSnap(id) { if (id) removeKey(LS_PROJECT_PREFIX + id); }

function loadHistory() {
  const v = loadJSON(LS_HISTORY_KEY);
  return Array.isArray(v) ? v : [];
}
function saveHistory(tail) { saveJSON(LS_HISTORY_KEY, tail); }

// Decide which project to load on startup. Migrates the legacy single-project
// key on first run so existing workspaces aren't lost.
function bootstrap() {
  let registry = loadRegistry();
  let activeId = loadJSON(LS_ACTIVE_KEY);

  if (activeId && loadSnap(activeId)) {
    return { activeId, registry, snapshot: loadSnap(activeId) };
  }

  // Migrate legacy single-project state into the new layout.
  const legacy = loadJSON(LS_LEGACY_KEY);
  if (legacy && legacy.project) {
    const id = uid("prj");
    saveSnap(id, legacy);
    const entry = {
      id,
      title:  legacy.project.title  || "Untitled",
      author: legacy.project.author || "",
      savedAt: legacy.savedAt || new Date().toISOString(),
    };
    registry = [entry, ...registry.filter((p) => p.id !== id)];
    saveJSON(LS_REGISTRY_KEY, registry);
    saveJSON(LS_ACTIVE_KEY, id);
    removeKey(LS_LEGACY_KEY);
    return { activeId: id, registry, snapshot: legacy };
  }

  // First-ever run: mint an id for the seeded demo so it appears in the
  // registry without waiting for the first edit. The state factory will
  // fill the snapshot from the seed data.
  const id = uid("prj");
  const entry = {
    id,
    title: "The Cartographer's Daughter",
    author: "Mira Halden",
    savedAt: new Date().toISOString(),
  };
  registry = [entry];
  saveJSON(LS_REGISTRY_KEY, registry);
  saveJSON(LS_ACTIVE_KEY, id);
  return { activeId: id, registry, snapshot: null };
}

const boot = bootstrap();
const loaded = boot.snapshot || {};

// Canonical entity name is "strands". Earlier versions stored it as
// "plotlines" (and originally as "strand"/"strands"). normalizeStrands
// folds any persisted snapshot back to the canonical shape — chapter
// {strand,plotlines} → chapter.strands, scene.plotlines → scene.strands,
// state/trash.plotlines → .strands, and group members tagged
// kind:"plotline" → "strand". Safe to call on any snapshot; runs at boot
// here and again whenever another project is loaded (see switchProject).
function normalizeStrands(snap) {
  if (!snap || typeof snap !== "object") return snap;
  if (Array.isArray(snap.parts)) {
    snap.parts = snap.parts.map((p) => ({
      ...p,
      chapters: (p.chapters || []).map((c) => {
        if (Array.isArray(c.strands)) return c;
        const { strand, plotlines, ...rest } = c;
        const list = Array.isArray(plotlines) ? plotlines : strand ? [strand] : [];
        return { ...rest, strands: list };
      }),
    }));
  }
  if (!Array.isArray(snap.strands) && Array.isArray(snap.plotlines)) {
    snap.strands = snap.plotlines;
    delete snap.plotlines;
  }
  if (Array.isArray(snap.strands)) {
    // Backfill new fields on older records so the UI doesn't render `undefined`.
    snap.strands = snap.strands.map((s) => ({
      blurb: "", status: "open", beats: [], ...s,
      beats: Array.isArray(s.beats) ? s.beats.map((b) => ({ sceneId: null, ...b })) : [],
    }));
  }
  if (snap.scenes && typeof snap.scenes === "object") {
    for (const chId of Object.keys(snap.scenes)) {
      const list = snap.scenes[chId];
      if (!Array.isArray(list)) continue;
      snap.scenes[chId] = list.map((scn) => {
        if (!scn || Array.isArray(scn.strands)) return scn;
        const { plotlines, ...rest } = scn;
        return { ...rest, strands: Array.isArray(plotlines) ? plotlines : [] };
      });
    }
  }
  if (snap.trash && Array.isArray(snap.trash.plotlines) && !Array.isArray(snap.trash.strands)) {
    snap.trash = { ...snap.trash, strands: snap.trash.plotlines };
    delete snap.trash.plotlines;
  }
  if (Array.isArray(snap.groups)) {
    snap.groups = snap.groups.map((g) => ({
      ...g,
      members: Array.isArray(g.members)
        ? g.members.map((m) => (m && m.kind === "plotline" ? { ...m, kind: "strand" } : m))
        : g.members,
    }));
  }
  return snap;
}
normalizeStrands(loaded);

// "Storylines" was briefly added as a fifth architecture doc and then
// removed. Strip it from any project that picked it up so it doesn't
// linger in the sidebar list.
if (loaded.architecture && loaded.architecture.storylines) {
  const { storylines, ...rest } = loaded.architecture;
  loaded.architecture = rest;
}

// Chapters now contain scenes instead of a single body. Migrate every
// existing `chapterBody[id] = html` into a one-scene record so the user's
// prose is preserved exactly; clear the old chapterBody and the persisted
// history tail (old snapshots referenced the dead field).
// Gate on boot.snapshot — on a fresh install there is nothing to migrate
// AND running the migration would set scenes to {}, which would then beat
// the SCENES seed in the state factory below.
let _scenesMigrationRan = false;
if (boot.snapshot && (!loaded.scenes || typeof loaded.scenes !== "object")) {
  _scenesMigrationRan = true;
  loaded.scenes = {};
  const oldBody = (loaded.chapterBody && typeof loaded.chapterBody === "object") ? loaded.chapterBody : {};
  for (const [chId, html] of Object.entries(oldBody)) {
    loaded.scenes[chId] = [{ id: `scn_${chId}_1`, title: "", body: html || "" }];
  }
  // Seed an empty scene for any chapter that had no body yet so the user
  // always has a place to write.
  if (Array.isArray(loaded.parts)) {
    for (const p of loaded.parts) {
      for (const c of (p.chapters || [])) {
        if (!loaded.scenes[c.id]) {
          loaded.scenes[c.id] = [{ id: `scn_${c.id}_1`, title: "", body: "" }];
        }
      }
    }
  }
  delete loaded.chapterBody;
}

const EMPTY_TRASH = {
  chapters: [], characters: [], locations: [], objects: [],
  groups: [], notes: [], strands: [], worldbuilding: [],
};

export const TRASH_KINDS = Object.keys(EMPTY_TRASH);

// ── Undo/redo ────────────────────────────────────────────────────────
// Snapshot-based history: before each mutation we push a deep clone of
// the relevant slices onto `past`. Undo pops the latest, replaces the
// current state with it, and pushes what was current onto `future`.
//
// In-memory we keep up to HISTORY_LIMIT snapshots. On disk we keep at
// most PERSIST_TAIL_SIZE so a recently-closed app can still recover
// the last few changes without bloating the persisted snapshot. The
// persist is debounced — a typing session writes once after the user
// pauses, not on every keystroke.
const HISTORY_LIMIT = 100;
const PERSIST_TAIL_SIZE = 10;
const PERSIST_DEBOUNCE_MS = 1500;
const HISTORY_SLICES = [
  "project", "parts", "scenes",
  "characters", "characterExtras",
  "locations", "objects", "groups", "notes", "strands",
  "architecture", "worldbuilding",
  "images", "events",
  "trash",
];
function cloneSlices(state) {
  // Cheap structural clone via JSON. The slices contain only plain
  // objects (no Maps/Sets/Dates), so this is safe and fast.
  const out = {};
  for (const k of HISTORY_SLICES) out[k] = JSON.parse(JSON.stringify(state[k]));
  return out;
}
function applySlices(state, snap) {
  for (const k of HISTORY_SLICES) state[k] = snap[k];
}

// Some mutations fire on every keystroke (chapter body, inline title
// edits). We coalesce them into a single history entry per quiescent
// window so a typing session doesn't fill the buffer.
const COALESCE_WINDOW_MS = 600;
const COALESCED_ACTIONS = new Set([
  "setSceneBody", "setSceneTitle", "setChapterTitle", "setChapterWords",
  "updateNote", "updateWorldbuilding", "updateArchitecture",
  "updateCharacter", "setCharacterExtras",
  "updateLocation", "updateObject", "updateStrand", "updateGroup",
  "updatePart", "updateStrandBeat", "updateScene",
]);

let lastHistoryAt = 0;
let lastHistoryAction = null;
// Debounce handle for history persistence — module-scoped so it
// survives across action invocations on the same store instance.
let historyPersistTimer = null;

export const useProjectStore = defineStore("project", {
  state: () => ({
    project:    { ...PROJECT, ...(loaded.project || {}) },
    strands:  loaded.strands  || [...STRANDS],
    characters: loaded.characters || [...CHARACTERS],
    characterExtras: { ...CHARACTER_EXTRAS, ...(loaded.characterExtras || {}) },
    locations:  loaded.locations  || [...LOCATIONS],
    objects:    loaded.objects    || [...OBJECTS],
    parts:      loaded.parts      || PARTS.map((p) => ({ ...p, chapters: [...p.chapters] })),
    notes:      loaded.notes      || [...NOTES],
    groups:     loaded.groups     || [...GROUPS],
    architecture: { ...ARCHITECTURE, ...(loaded.architecture || {}) },
    worldbuilding: loaded.worldbuilding || [...WORLDBUILDING],
    worldbuildingCategories: [...WORLDBUILDING_CATEGORIES],
    // Scenes registry: { [chapterId]: [{ id, title, body, ...links }] }.
    // Seeded from the SCENES map — chapters not listed there open empty
    // so the writer can add their own scenes from the overview pane.
    // The optional Links arrays (characters/locations/objects/strands)
    // are preserved when present in the seed so Relations / Strand /
    // entity-detail views light up on a fresh workspace.
    scenes: loaded.scenes || Object.fromEntries(
      Object.entries(SCENES).map(([chId, list]) => [
        chId,
        list.map((s, i) => ({
          id: `scn_${chId}_${i + 1}`,
          title: s.title || "",
          body: s.body || "",
          characters: Array.isArray(s.characters) ? [...s.characters] : [],
          locations:  Array.isArray(s.locations)  ? [...s.locations]  : [],
          objects:    Array.isArray(s.objects)    ? [...s.objects]    : [],
          strands:  Array.isArray(s.strands)  ? [...s.strands]  : [],
        })),
      ])
    ),
    images: loaded.images || {},
    // Per-entity event log. Seeded only on a fresh install so re-seeding
    // doesn't clobber user-added events on existing workspaces.
    events: loaded.events || JSON.parse(JSON.stringify(EVENTS)),
    trash: { ...EMPTY_TRASH, ...(loaded.trash || {}) },

    // Multi-project registry. `_activeId` is the localStorage slot the
    // current snapshot persists into. `_projects` mirrors the registry
    // so the sidebar dropdown can react. Neither participates in undo.
    _activeId: boot.activeId,
    _projects: boot.registry,

    // History — `_past` is hydrated from disk so undo survives reload
    // (up to PERSIST_TAIL_SIZE entries). `_future` is never persisted:
    // every edit invalidates it anyway, so there's nothing useful to
    // restore. `markRaw` keeps Vue from making the snapshots reactive.
    // If we just rewrote the model from chapterBody → scenes, the
    // persisted history tail is shaped for the old slices and would
    // re-introduce the dead field on undo. Discard it.
    _past:   markRaw(_scenesMigrationRan ? [] : loadHistory().map(normalizeStrands)),
    _future: markRaw([]),
  }),

  getters: {
    allChapters: (s) => s.parts.flatMap((p) => p.chapters.map((c) => ({
      ...c,
      partId: p.id,
      partTitle: p.title,
      // Live scene count overrides any stale c.scenes that may be persisted
      // (the seed used to bake counts like "scenes: 5" before scenes were
      // first-class).
      scenes: (s.scenes[c.id] || []).length,
    }))),
    chapterById:       (s) => (id) => s.allChapters.find((c) => c.id === id),
    // Reader/exporter facade: each chapter rendered as a single HTML
    // string by concatenating its scenes with a scene-break paragraph
    // between them. Computed lazily — every consumer (Studio, search,
    // export, RichEditor read-mode) gets the latest stitched chapter
    // automatically when scenes change.
    chapterBody: (s) => {
      const out = {};
      for (const chId of Object.keys(s.scenes)) {
        const list = s.scenes[chId] || [];
        out[chId] = list
          .map((scn) => (scn.title ? `<h2 class="scene-title">${scn.title}</h2>` : "") + (scn.body || ""))
          .join('<p class="scene-mark">* * *</p>');
      }
      return out;
    },
    scenesFor:         (s) => (chapterId) => s.scenes[chapterId] || [],
    characterById:     (s) => (id) => s.characters.find((c) => c.id === id),
    locationById:      (s) => (id) => s.locations.find((l) => l.id === id),
    objectById:        (s) => (id) => s.objects.find((o) => o.id === id),
    groupById:         (s) => (id) => s.groups.find((g) => g.id === id),
    noteById:          (s) => (id) => s.notes.find((n) => n.id === id),
    worldbuildingById: (s) => (id) => s.worldbuilding.find((a) => a.id === id),
    strandById:      (s) => (id) => s.strands.find((x) => x.id === id),
    imagesFor:         (s) => (id) => s.images[id] || [],
    eventsFor:         (s) => (id) => s.events[id] || [],
    trashCount:        (s) => Object.values(s.trash).reduce((n, list) => n + list.length, 0),
    canUndo:           (s) => s._past.length > 0,
    canRedo:           (s) => s._future.length > 0,
    projectsList:      (s) => s._projects,
    activeProjectId:   (s) => s._activeId,
  },

  actions: {
    // ── History ─────────────────────────────────────────────
    /**
     * Record the current state as a history entry. Call BEFORE making
     * the mutation. `actionId` is used for keystroke coalescing — calls
     * with the same actionId within COALESCE_WINDOW_MS reuse the most
     * recent snapshot.
     */
    _record(actionId) {
      const now = Date.now();
      const isCoalescing = COALESCED_ACTIONS.has(actionId)
        && lastHistoryAction === actionId
        && (now - lastHistoryAt) < COALESCE_WINDOW_MS;
      lastHistoryAt = now;
      lastHistoryAction = actionId;
      if (isCoalescing) return;
      this._past.push(cloneSlices(this));
      if (this._past.length > HISTORY_LIMIT) this._past.shift();
      // Any new edit invalidates the redo stack.
      if (this._future.length) this._future = markRaw([]);
      this._scheduleHistoryPersist();
    },
    undo() {
      if (!this._past.length) return;
      const snap = this._past.pop();
      this._future.push(cloneSlices(this));
      applySlices(this, snap);
      lastHistoryAction = null;
      this._persist();
      this._scheduleHistoryPersist();
      useUiStore().showToast({ message: "Undid last change." });
    },
    redo() {
      if (!this._future.length) return;
      const snap = this._future.pop();
      this._past.push(cloneSlices(this));
      applySlices(this, snap);
      lastHistoryAction = null;
      this._persist();
      this._scheduleHistoryPersist();
      useUiStore().showToast({ message: "Redid change." });
    },
    clearHistory() {
      this._past = markRaw([]);
      this._future = markRaw([]);
      lastHistoryAction = null;
      if (historyPersistTimer) { clearTimeout(historyPersistTimer); historyPersistTimer = null; }
      saveHistory([]);
    },

    /**
     * Persist the tail of `_past` to localStorage on a debounce so a
     * typing session doesn't write on every keystroke. We only keep
     * the last PERSIST_TAIL_SIZE entries — that's enough to recover
     * from a "closed the window after a fat-finger" mishap without
     * the storage cost of the full 100-step in-memory buffer.
     */
    _scheduleHistoryPersist() {
      if (historyPersistTimer) clearTimeout(historyPersistTimer);
      historyPersistTimer = setTimeout(() => {
        historyPersistTimer = null;
        const tail = this._past.slice(-PERSIST_TAIL_SIZE);
        saveHistory(tail);
      }, PERSIST_DEBOUNCE_MS);
    },

    // ── Chapters ─────────────────────────────────────────────
    addChapter({ title, partId, status = "todo" }) {
      this._record("addChapter");
      const id = uid("ch");
      const target = Math.max(0, this.parts.findIndex((p) => p.id === partId));
      const partIdx = target >= 0 && partId ? target : this.parts.length - 1;
      const num = this.allChapters.length + 1;
      // chapter.scenes is now derived live from state.scenes; new chapters
      // start with no scenes — the user adds them via the chapter overview
      // pane or the sidebar's per-chapter "+ scene" action.
      this.parts[partIdx].chapters.push({ id, num, title, words: 0, status, strands: [] });
      this.scenes = { ...this.scenes, [id]: [] };
      this._persist();
      return id;
    },
    removeChapter(id) {
      this._record("removeChapter");
      for (const p of this.parts) {
        const idx = p.chapters.findIndex((c) => c.id === id);
        if (idx < 0) continue;
        const chapter = p.chapters[idx];
        const sceneList = this.scenes[id] || [];
        this._pushTrash("chapters", { ...chapter, partId: p.id, scenes: sceneList });
        this.parts = this.parts.map((part) => part.id === p.id
          ? { ...part, chapters: part.chapters.filter((c) => c.id !== id) }
          : part);
        const next = { ...this.scenes }; delete next[id]; this.scenes = next;
        this._toast(`Deleted "${chapter.title}"`, "chapters", id);
        this._persist();
        return;
      }
    },
    setChapterWords(id, words) {
      this._record("setChapterWords");
      this.parts = this.parts.map((p) => ({ ...p, chapters: p.chapters.map((c) => c.id === id ? { ...c, words } : c) }));
      // Attribute the delta to today's session log.
      useSessionsStore().recordChapterWords(id, words);
      this._persist();
    },
    setChapterStatus(id, status) {
      this._record("setChapterStatus");
      this.parts = this.parts.map((p) => ({ ...p, chapters: p.chapters.map((c) => c.id === id ? { ...c, status } : c) }));
      this._persist();
    },
    setChapterStrands(id, strands) {
      this._record("setChapterStrands");
      const next = Array.isArray(strands) ? [...new Set(strands)] : [];
      this.parts = this.parts.map((p) => ({ ...p, chapters: p.chapters.map((c) => c.id === id ? { ...c, strands: next } : c) }));
      this._persist();
    },
    toggleChapterStrand(id, strandId) {
      this._record("toggleChapterStrand");
      this.parts = this.parts.map((p) => ({
        ...p,
        chapters: p.chapters.map((c) => {
          if (c.id !== id) return c;
          const current = Array.isArray(c.strands) ? c.strands : [];
          const next = current.includes(strandId)
            ? current.filter((x) => x !== strandId)
            : [...current, strandId];
          return { ...c, strands: next };
        }),
      }));
      this._persist();
    },
    setChapterTitle(id, title) {
      this._record("setChapterTitle");
      this.parts = this.parts.map((p) => ({ ...p, chapters: p.chapters.map((c) => c.id === id ? { ...c, title } : c) }));
      this._persist();
    },

    // ── Scenes ──────────────────────────────────────────────
    // Each chapter owns a list of scene objects: { id, title, body }.
    // The chapterBody getter stitches them together for read mode,
    // search, Studio script analysis, and manuscript export.
    //
    // Word counts roll up to the chapter automatically — every scene
    // body edit recomputes the chapter total and notifies sessions.
    _recomputeChapterWords(chapterId) {
      const list = this.scenes[chapterId] || [];
      let words = 0;
      for (const scn of list) {
        const text = (scn.body || "").replace(/<[^>]+>/g, " ").trim();
        if (text) words += text.split(/\s+/).length;
      }
      this.parts = this.parts.map((p) => ({
        ...p,
        chapters: p.chapters.map((c) => c.id === chapterId ? { ...c, words } : c),
      }));
      useSessionsStore().recordChapterWords(chapterId, words);
    },
    addScene(chapterId, input = {}) {
      this._record("addScene");
      const id = uid("scn");
      const list = this.scenes[chapterId] || [];
      this.scenes = {
        ...this.scenes,
        [chapterId]: [...list, { id, title: "", body: "", ...input }],
      };
      this._persist();
      return id;
    },
    updateScene(chapterId, sceneId, patch) {
      this._record("updateScene");
      this.scenes = {
        ...this.scenes,
        [chapterId]: (this.scenes[chapterId] || []).map((s) =>
          s.id === sceneId ? { ...s, ...patch } : s),
      };
      this._persist();
    },
    setSceneBody(chapterId, sceneId, html) {
      this._record("setSceneBody");
      this.scenes = {
        ...this.scenes,
        [chapterId]: (this.scenes[chapterId] || []).map((s) =>
          s.id === sceneId ? { ...s, body: html } : s),
      };
      this._recomputeChapterWords(chapterId);
      this._persist();
    },
    setSceneTitle(chapterId, sceneId, title) {
      this._record("setSceneTitle");
      this.scenes = {
        ...this.scenes,
        [chapterId]: (this.scenes[chapterId] || []).map((s) =>
          s.id === sceneId ? { ...s, title } : s),
      };
      this._persist();
    },
    removeScene(chapterId, sceneId) {
      this._record("removeScene");
      const list = this.scenes[chapterId] || [];
      if (list.length <= 1) return;  // Always keep at least one scene per chapter.
      this.scenes = {
        ...this.scenes,
        [chapterId]: list.filter((s) => s.id !== sceneId),
      };
      this._recomputeChapterWords(chapterId);
      this._persist();
    },
    moveScene(chapterId, sceneId, dir) {
      this._record("moveScene");
      const list = this.scenes[chapterId] || [];
      const idx = list.findIndex((s) => s.id === sceneId);
      const target = idx + dir;
      if (idx < 0 || target < 0 || target >= list.length) return;
      const next = [...list];
      [next[idx], next[target]] = [next[target], next[idx]];
      this.scenes = { ...this.scenes, [chapterId]: next };
      this._persist();
    },

    // ── Parts ───────────────────────────────────────────────
    // Walk parts in order, reassign chapter.num sequentially. Called
    // after any structural change (part reorder, chapter cross-part move,
    // part removal that absorbed orphan chapters) so "Chapter 7" still
    // means "the seventh chapter overall."
    _renumberChapters() {
      let n = 1;
      this.parts = this.parts.map((p) => ({
        ...p,
        chapters: p.chapters.map((c) => ({ ...c, num: n++ })),
      }));
    },
    addPart({ title } = {}) {
      this._record("addPart");
      const id = uid("p");
      const next = title?.trim() || `Part ${this.parts.length + 1}`;
      this.parts = [...this.parts, { id, title: next, chapters: [] }];
      this._persist();
      return id;
    },
    updatePart(id, patch) {
      this._record("updatePart");
      this.parts = this.parts.map((p) => p.id === id ? { ...p, ...patch } : p);
      this._persist();
    },
    removePart(id) {
      this._record("removePart");
      const idx = this.parts.findIndex((p) => p.id === id);
      if (idx < 0) return;
      const orphans = this.parts[idx].chapters;
      const targetIdx = idx > 0 ? idx - 1 : idx + 1;
      const target = this.parts[targetIdx];
      let next = this.parts.filter((p) => p.id !== id);
      // Move any chapters from the removed part into the neighbour part
      // so they're not lost. If this was the last remaining part, the
      // chapters go with it — the caller is responsible for blocking
      // that case in the UI (we don't want a project with zero parts).
      if (target && orphans.length) {
        next = next.map((p) => p.id === target.id
          ? { ...p, chapters: [...p.chapters, ...orphans] }
          : p);
      }
      this.parts = next;
      this._renumberChapters();
      this._persist();
    },
    movePart(id, dir) {
      this._record("movePart");
      const idx = this.parts.findIndex((p) => p.id === id);
      const target = idx + dir;
      if (idx < 0 || target < 0 || target >= this.parts.length) return;
      const next = [...this.parts];
      [next[idx], next[target]] = [next[target], next[idx]];
      this.parts = next;
      this._renumberChapters();
      this._persist();
    },
    moveChapterToPart(chapterId, partId) {
      this._record("moveChapterToPart");
      let chapter = null;
      const stripped = this.parts.map((p) => {
        const idx = p.chapters.findIndex((c) => c.id === chapterId);
        if (idx < 0) return p;
        chapter = p.chapters[idx];
        return { ...p, chapters: p.chapters.filter((c) => c.id !== chapterId) };
      });
      if (!chapter) return;
      this.parts = stripped.map((p) => p.id === partId
        ? { ...p, chapters: [...p.chapters, chapter] }
        : p);
      this._renumberChapters();
      this._persist();
    },
    // Generic drag-drop position move: takes a chapter to a target part
    // and inserts it before `insertBeforeChapterId` (or appends if null /
    // unknown id). Used by sidebar DnD where the drop position matters.
    moveChapter(chapterId, toPartId, insertBeforeChapterId = null) {
      this._record("moveChapter");
      let chapter = null;
      const stripped = this.parts.map((p) => {
        const idx = p.chapters.findIndex((c) => c.id === chapterId);
        if (idx < 0) return p;
        chapter = p.chapters[idx];
        return { ...p, chapters: p.chapters.filter((c) => c.id !== chapterId) };
      });
      if (!chapter) return;
      this.parts = stripped.map((p) => {
        if (p.id !== toPartId) return p;
        const at = insertBeforeChapterId
          ? p.chapters.findIndex((c) => c.id === insertBeforeChapterId)
          : -1;
        if (at < 0) return { ...p, chapters: [...p.chapters, chapter] };
        return {
          ...p,
          chapters: [...p.chapters.slice(0, at), chapter, ...p.chapters.slice(at)],
        };
      });
      this._renumberChapters();
      this._persist();
    },
    // Replace the whole parts order with the given id sequence. The
    // sidebar drag-and-drop calls this with the post-drop ordering.
    reorderParts(partIds) {
      this._record("reorderParts");
      const byId = new Map(this.parts.map((p) => [p.id, p]));
      const next = partIds.map((id) => byId.get(id)).filter(Boolean);
      // Preserve any parts the caller forgot to mention (defensive — drag
      // operations should always include the full list).
      for (const p of this.parts) {
        if (!partIds.includes(p.id)) next.push(p);
      }
      this.parts = next;
      this._renumberChapters();
      this._persist();
    },
    // Replace chapter order within a single part.
    reorderChaptersInPart(partId, chapterIds) {
      this._record("reorderChaptersInPart");
      this.parts = this.parts.map((p) => {
        if (p.id !== partId) return p;
        const byId = new Map(p.chapters.map((c) => [c.id, c]));
        const next = chapterIds.map((id) => byId.get(id)).filter(Boolean);
        for (const c of p.chapters) {
          if (!chapterIds.includes(c.id)) next.push(c);
        }
        return { ...p, chapters: next };
      });
      this._renumberChapters();
      this._persist();
    },
    // Replace scene order within a chapter (drag-drop arbitrary position).
    reorderScenes(chapterId, sceneIds) {
      this._record("reorderScenes");
      const list = this.scenes[chapterId] || [];
      const byId = new Map(list.map((s) => [s.id, s]));
      const next = sceneIds.map((id) => byId.get(id)).filter(Boolean);
      for (const s of list) {
        if (!sceneIds.includes(s.id)) next.push(s);
      }
      this.scenes = { ...this.scenes, [chapterId]: next };
      this._persist();
    },

    // ── Generic reorder for flat entity lists ───────────────
    // Every sidebar list (strands, groups, characters, objects,
    // locations, worldbuilding) lives as a flat array on state. The
    // caller produces the new full order of ids; missing ids get
    // appended at the end so a partial caller can't accidentally drop
    // entries.
    _reorderFlat(stateKey, ids) {
      const list = this[stateKey] || [];
      const byId = new Map(list.map((x) => [x.id, x]));
      const next = ids.map((id) => byId.get(id)).filter(Boolean);
      for (const x of list) {
        if (!ids.includes(x.id)) next.push(x);
      }
      this[stateKey] = next;
    },
    reorderStrands(ids)       { this._record("reorderStrands");       this._reorderFlat("strands", ids);       this._persist(); },
    reorderGroups(ids)        { this._record("reorderGroups");        this._reorderFlat("groups", ids);        this._persist(); },
    reorderCharacters(ids)    { this._record("reorderCharacters");    this._reorderFlat("characters", ids);    this._persist(); },
    reorderObjects(ids)       { this._record("reorderObjects");       this._reorderFlat("objects", ids);       this._persist(); },
    reorderLocations(ids)     { this._record("reorderLocations");     this._reorderFlat("locations", ids);     this._persist(); },
    reorderNotes(ids)         { this._record("reorderNotes");         this._reorderFlat("notes", ids);         this._persist(); },
    reorderWorldbuilding(ids) { this._record("reorderWorldbuilding"); this._reorderFlat("worldbuilding", ids); this._persist(); },

    // ── Characters ──────────────────────────────────────────
    addCharacter(input = {}) {
      this._record("addCharacter");
      const id = uid("c");
      this.characters.push({ id, main: false, age: null, oneLiner: "", role: "", name: "Untitled character", ...input });
      this._persist();
      return id;
    },
    removeCharacter(id) {
      this._record("removeCharacter");
      const c = this.characters.find((x) => x.id === id);
      if (!c) return;
      this._pushTrash("characters", { ...c, extras: this.characterExtras[id] });
      this.characters = this.characters.filter((x) => x.id !== id);
      const ce = { ...this.characterExtras }; delete ce[id]; this.characterExtras = ce;
      this._toast(`Deleted "${c.name}"`, "characters", id);
      this._persist();
    },
    updateCharacter(id, patch) { this._record("updateCharacter"); this.characters = this.characters.map((c) => c.id === id ? { ...c, ...patch } : c); this._persist(); },
    setCharacterExtras(id, extras) { this._record("setCharacterExtras"); this.characterExtras = { ...this.characterExtras, [id]: { ...(this.characterExtras[id] || {}), ...extras } }; this._persist(); },

    // ── Locations ───────────────────────────────────────────
    addLocation(input = {}) { this._record("addLocation"); const id = uid("l"); this.locations.push({ id, name: "Untitled location", kind: "", note: "", ...input }); this._persist(); return id; },
    removeLocation(id) {
      this._record("removeLocation");
      const l = this.locations.find((x) => x.id === id);
      if (!l) return;
      this._pushTrash("locations", { ...l });
      this.locations = this.locations.filter((x) => x.id !== id);
      this._toast(`Deleted "${l.name}"`, "locations", id);
      this._persist();
    },
    updateLocation(id, patch) { this._record("updateLocation"); this.locations = this.locations.map((l) => l.id === id ? { ...l, ...patch } : l); this._persist(); },

    // ── Objects ─────────────────────────────────────────────
    addObject(input = {}) { this._record("addObject"); const id = uid("o"); this.objects.push({ id, name: "Untitled object", kind: "", note: "", ...input }); this._persist(); return id; },
    removeObject(id) {
      this._record("removeObject");
      const o = this.objects.find((x) => x.id === id);
      if (!o) return;
      this._pushTrash("objects", { ...o });
      this.objects = this.objects.filter((x) => x.id !== id);
      this._toast(`Deleted "${o.name}"`, "objects", id);
      this._persist();
    },
    updateObject(id, patch) { this._record("updateObject"); this.objects = this.objects.map((o) => o.id === id ? { ...o, ...patch } : o); this._persist(); },

    // ── Notes ───────────────────────────────────────────────
    addNote(input = {}) {
      this._record("addNote");
      const id = uid("n");
      const today = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });
      this.notes.push({ id, title: "Untitled note", body: "", tag: "note", updated: today, ...input });
      this._persist();
      return id;
    },
    removeNote(id) {
      this._record("removeNote");
      const n = this.notes.find((x) => x.id === id);
      if (!n) return;
      this._pushTrash("notes", { ...n });
      this.notes = this.notes.filter((x) => x.id !== id);
      this._toast(`Deleted "${n.title}"`, "notes", id);
      this._persist();
    },
    updateNote(id, patch) {
      this._record("updateNote");
      const today = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });
      this.notes = this.notes.map((n) => n.id === id ? { ...n, ...patch, updated: today } : n);
      this._persist();
    },

    // ── Worldbuilding ───────────────────────────────────────
    addWorldbuilding(input = {}) {
      this._record("addWorldbuilding");
      const id = uid("wb");
      this.worldbuilding.push({ id, title: "Untitled article", category: "geography", tags: [], status: "todo", words: 0, summary: "", body: "", related: [], ...input });
      this._persist();
      return id;
    },
    removeWorldbuilding(id) {
      this._record("removeWorldbuilding");
      const a = this.worldbuilding.find((x) => x.id === id);
      if (!a) return;
      this._pushTrash("worldbuilding", { ...a });
      this.worldbuilding = this.worldbuilding.filter((x) => x.id !== id);
      this._toast(`Deleted "${a.title}"`, "worldbuilding", id);
      this._persist();
    },
    updateWorldbuilding(id, patch) { this._record("updateWorldbuilding"); this.worldbuilding = this.worldbuilding.map((a) => a.id === id ? { ...a, ...patch } : a); this._persist(); },

    // ── Narrative strands ───────────────────────────────────
    addStrand(input = {}) {
      this._record("addStrand");
      const id = uid("strand");
      this.strands.push({
        id,
        name: "Untitled narrative strand",
        color: "oklch(0.78 0.06 200)",
        blurb: "",
        body: "",
        status: "open",
        beats: [],
        ...input,
      });
      this._persist();
      return id;
    },
    removeStrand(id) {
      this._record("removeStrand");
      const s = this.strands.find((x) => x.id === id);
      if (!s) return;
      this._pushTrash("strands", { ...s });
      this.strands = this.strands.filter((x) => x.id !== id);
      // Clear dangling refs so chapter rows don't render a dead strand id.
      this.parts = this.parts.map((p) => ({
        ...p,
        chapters: p.chapters.map((c) => {
          const list = Array.isArray(c.strands) ? c.strands : [];
          return list.includes(id) ? { ...c, strands: list.filter((x) => x !== id) } : c;
        }),
      }));
      this._toast(`Deleted narrative strand "${s.name}"`, "strands", id);
      this._persist();
    },
    updateStrand(id, patch) { this._record("updateStrand"); this.strands = this.strands.map((s) => s.id === id ? { ...s, ...patch } : s); this._persist(); },

    // ── Strand beats ────────────────────────────────────────
    // Beats are turning points on a strand pinned to a specific
    // scene within a chapter:
    //   { id, chapterId, sceneId, label, note }
    // E.g. { chapterId: "ch4", sceneId: "scn_ch4_1", label: "Inciting", note: "..." }
    addStrandBeat(strandId, input = {}) {
      this._record("addStrandBeat");
      const beat = {
        id: uid("b"),
        chapterId: null,
        sceneId: null,
        label: "",
        note: "",
        ...input,
      };
      this.strands = this.strands.map((s) => s.id === strandId
        ? { ...s, beats: [...(s.beats || []), beat] }
        : s);
      this._persist();
      return beat.id;
    },
    updateStrandBeat(strandId, beatId, patch) {
      this._record("updateStrandBeat");
      this.strands = this.strands.map((s) => s.id === strandId
        ? { ...s, beats: (s.beats || []).map((b) => b.id === beatId ? { ...b, ...patch } : b) }
        : s);
      this._persist();
    },
    removeStrandBeat(strandId, beatId) {
      this._record("removeStrandBeat");
      this.strands = this.strands.map((s) => s.id === strandId
        ? { ...s, beats: (s.beats || []).filter((b) => b.id !== beatId) }
        : s);
      this._persist();
    },

    // ── Groups ──────────────────────────────────────────────
    addGroup(input = {}) { this._record("addGroup"); const id = uid("g"); this.groups.push({ id, name: "Untitled group", blurb: "", color: "oklch(0.6 0.1 200)", members: [], ...input }); this._persist(); return id; },
    removeGroup(id) {
      this._record("removeGroup");
      const g = this.groups.find((x) => x.id === id);
      if (!g) return;
      this._pushTrash("groups", { ...g });
      this.groups = this.groups.filter((x) => x.id !== id);
      this._toast(`Deleted "${g.name}"`, "groups", id);
      this._persist();
    },
    updateGroup(id, patch) { this._record("updateGroup"); this.groups = this.groups.map((g) => g.id === id ? { ...g, ...patch } : g); this._persist(); },
    addGroupMember(groupId, member) {
      this._record("addGroupMember");
      this.groups = this.groups.map((g) => g.id === groupId
        ? { ...g, members: [...(g.members || []).filter((m) => m.id !== member.id), member] } : g);
      this._persist();
    },
    removeGroupMember(groupId, memberId) {
      this._record("removeGroupMember");
      this.groups = this.groups.map((g) => g.id === groupId
        ? { ...g, members: (g.members || []).filter((m) => m.id !== memberId) } : g);
      this._persist();
    },

    // ── Architecture ────────────────────────────────────────
    updateArchitecture(id, patch) { this._record("updateArchitecture"); this.architecture = { ...this.architecture, [id]: { ...this.architecture[id], ...patch } }; this._persist(); },

    // ── Cover image ─────────────────────────────────────────
    // Stored on `project.project.coverImage` as an imageStore record.
    // Unlinks any previous disk-backed file before overwriting.
    setCoverImage(image) {
      this._record("setCoverImage");
      const old = this.project.coverImage;
      if (old && old !== image) removeImageFile(old).catch(() => {});
      this.project = { ...this.project, coverImage: image || null };
      this._persist();
    },
    clearCoverImage() {
      this._record("clearCoverImage");
      const old = this.project.coverImage;
      if (old) removeImageFile(old).catch(() => {});
      this.project = { ...this.project, coverImage: null };
      this._persist();
    },
    updateProjectMeta(patch) {
      this._record("updateProjectMeta");
      this.project = { ...this.project, ...patch };
      this._persist();
    },

    // ── Images / Events ─────────────────────────────────────
    addImage(entityId, image) { this._record("addImage"); const id = uid("img"); this.images = { ...this.images, [entityId]: [...(this.images[entityId] || []), { id, addedAt: Date.now(), ...image }] }; this._persist(); },
    removeImage(entityId, imageId) {
      this._record("removeImage");
      const list = this.images[entityId] || [];
      const target = list.find((i) => i.id === imageId);
      if (target) removeImageFile(target).catch(() => {});  // fire-and-forget unlink
      this.images = { ...this.images, [entityId]: list.filter((i) => i.id !== imageId) };
      this._persist();
    },
    addEvent(entityId, event) { this._record("addEvent"); const id = uid("ev"); this.events = { ...this.events, [entityId]: [...(this.events[entityId] || []), { id, when: "", title: "Untitled event", note: "", ...event }] }; this._persist(); },
    updateEvent(entityId, eventId, patch) { this._record("updateEvent"); this.events = { ...this.events, [entityId]: (this.events[entityId] || []).map((e) => e.id === eventId ? { ...e, ...patch } : e) }; this._persist(); },
    removeEvent(entityId, eventId) { this._record("removeEvent"); this.events = { ...this.events, [entityId]: (this.events[entityId] || []).filter((e) => e.id !== eventId) }; this._persist(); },

    // ── Trash ───────────────────────────────────────────────
    _pushTrash(kind, item) {
      this.trash = { ...this.trash, [kind]: [...(this.trash[kind] || []), { ...item, deletedAt: Date.now() }] };
    },
    _toast(message, kind, id) {
      const ui = useUiStore();
      ui.showToast({ message, action: { label: "Undo", fn: () => this.restoreFromTrash(kind, id) } });
    },
    restoreFromTrash(kind, id) {
      const list = this.trash[kind] || [];
      const item = list.find((x) => x.id === id);
      if (!item) return;
      this.trash = { ...this.trash, [kind]: list.filter((x) => x.id !== id) };

      const { deletedAt, ...rest } = item;
      switch (kind) {
        case "chapters": {
          const { partId, body, scenes: savedScenes, ...chapter } = rest;
          const exists = this.parts.some((p) => p.id === partId);
          this.parts = this.parts.map((p) => p.id === partId
            ? { ...p, chapters: [...p.chapters, chapter] }
            : p);
          if (!exists && this.parts.length) {
            // Drop into the last part if the original is gone.
            const last = this.parts[this.parts.length - 1];
            this.parts = [...this.parts.slice(0, -1), { ...last, chapters: [...last.chapters, chapter] }];
          }
          // Restore the chapter's scenes. Fall back to the legacy `body`
          // field (pre-scenes trash entries) so an upgrade in mid-delete
          // doesn't lose the prose.
          let nextScenes;
          if (Array.isArray(savedScenes) && savedScenes.length) {
            nextScenes = savedScenes;
          } else if (body) {
            nextScenes = [{ id: uid("scn"), title: "", body }];
          } else {
            nextScenes = [{ id: uid("scn"), title: "", body: "" }];
          }
          this.scenes = { ...this.scenes, [chapter.id]: nextScenes };
          break;
        }
        case "characters": {
          const { extras, ...c } = rest;
          this.characters = [...this.characters, c];
          if (extras) this.characterExtras = { ...this.characterExtras, [c.id]: extras };
          break;
        }
        default:
          this[kind] = [...this[kind], rest];
      }
      this._persist();
    },
    purgeFromTrash(kind, id) {
      this.trash = { ...this.trash, [kind]: (this.trash[kind] || []).filter((x) => x.id !== id) };
      this._persist();
    },
    emptyTrash() {
      this.trash = { ...EMPTY_TRASH };
      this._persist();
    },

    // ── Snapshot ────────────────────────────────────────────
    loadSnapshot(snap) { Object.assign(this.$state, normalizeStrands(snap)); this.clearHistory(); this._persist(); },
    exportSnapshot() {
      return {
        project: this.project, parts: this.parts, scenes: this.scenes,
        characters: this.characters, characterExtras: this.characterExtras,
        locations: this.locations, objects: this.objects, groups: this.groups,
        strands: this.strands, notes: this.notes, architecture: this.architecture,
        worldbuilding: this.worldbuilding, images: this.images, events: this.events,
        trash: this.trash,
        savedAt: new Date().toISOString(),
      };
    },

    // ── Multi-project ───────────────────────────────────────
    // Lazily assign an active id on first persist when starting fresh
    // (no migration happened and no project has ever been created).
    _ensureActiveId() {
      if (!this._activeId) this._activeId = uid("prj");
      return this._activeId;
    },
    _writeRegistry(reg) {
      this._projects = reg;
      saveJSON(LS_REGISTRY_KEY, reg);
    },
    _persist() {
      const id = this._ensureActiveId();
      const snap = this.exportSnapshot();
      saveSnap(id, snap);
      saveJSON(LS_ACTIVE_KEY, id);
      // Keep the registry entry's title/author/savedAt in sync so the
      // sidebar dropdown reflects renames the moment the user types.
      const entry = {
        id,
        title:  this.project.title  || "Untitled",
        author: this.project.author || "",
        savedAt: snap.savedAt,
      };
      const idx = this._projects.findIndex((p) => p.id === id);
      const next = idx >= 0
        ? this._projects.map((p, i) => (i === idx ? entry : p))
        : [...this._projects, entry];
      this._writeRegistry(next);
    },

    createProject({ title = "Untitled project", author = "" } = {}) {
      // Snapshot the current project first so switching away doesn't
      // lose unflushed edits.
      this._persist();
      const id = uid("prj");
      const fresh = {
        project: { ...PROJECT, title, author, coverImage: null, wordsWritten: 0, lastSaved: "" },
        strands: [], characters: [], characterExtras: {},
        locations: [], objects: [], groups: [], notes: [],
        parts: [{ id: uid("p"), title: "Part One", chapters: [] }],
        architecture: { ...ARCHITECTURE },
        worldbuilding: [],
        scenes: {},
        images: {}, events: {},
        trash: { ...EMPTY_TRASH },
      };
      this._activeId = id;
      Object.assign(this.$state, fresh);
      this.clearHistory();
      this._persist();
      useUiStore().showToast({ message: `Created "${title}".` });
      return id;
    },

    switchProject(id) {
      if (!id || id === this._activeId) return;
      const snap = normalizeStrands(loadSnap(id));
      if (!snap) {
        useUiStore().showToast({ message: "That project couldn't be loaded." });
        return;
      }
      // Persist the outgoing project before swapping.
      this._persist();
      this._activeId = id;
      Object.assign(this.$state, snap);
      this.clearHistory();
      saveJSON(LS_ACTIVE_KEY, id);
      useUiStore().showToast({ message: `Switched to "${snap.project?.title || "project"}".` });
    },

    deleteProject(id) {
      if (!id) return;
      const entry = this._projects.find((p) => p.id === id);
      removeSnap(id);
      this._writeRegistry(this._projects.filter((p) => p.id !== id));
      if (id === this._activeId) {
        // Move to another project, or seed a blank one if none remain.
        const next = this._projects[0];
        if (next) {
          this._activeId = null; // force switchProject() to actually load
          this.switchProject(next.id);
        } else {
          this._activeId = null;
          this.createProject({ title: "Untitled project" });
        }
      }
      if (entry) useUiStore().showToast({ message: `Deleted "${entry.title}".` });
    },
  },
});
