// Project store — entities + chapter bodies + full CRUD.
// Snapshots persist to the server (SQLite via /v1/projects) through
// services/projectApi.js; the active project id lives in the settings
// document. Undo/redo is in-memory only; durable rollback is the Tauri
// disk autosave ($APPDATA/projects). No client-side IndexedDB store.
// Removals are SOFT — they push to `trash` keyed by kind; restore
// from TrashView. Each soft-delete fires an Undo toast via uiStore.

import { defineStore } from "pinia";
import { markRaw } from "vue";
import { useUiStore } from "./ui.js";
import { useSessionsStore } from "./sessions.js";
import { removeImage as removeImageFile } from "../services/imageStore.js";
import { readSetting, writeSetting, getAllSettings, applySettings } from "../services/settings.js";
import * as projectApi from "../services/projectApi.js";
import { replaceInHtml } from "../services/projectReplace.js";
import { nextColor, nextHue } from "../services/categoricalColors.js";
import {
  PROJECT, STRANDS, CHARACTERS, CHARACTER_EXTRAS, LOCATIONS, OBJECTS,
  PARTS, NOTES, GROUPS, ARCHITECTURE, WORLDBUILDING, WORLDBUILDING_CATEGORIES,
  SCENES, EVENTS,
} from "../domain/seed.js";
import {
  TUTORIAL_TITLE, TUTORIAL_AUTHOR,
  TUTORIAL_CHARACTERS, TUTORIAL_LOCATIONS,
  TUTORIAL_STRAND, TUTORIAL_WORLDBUILDING,
  TUTORIAL_CHAPTER, TUTORIAL_NOTE,
} from "../services/tutorialProject.js";

// Multi-project storage (all server-side SQL — no kv, no IndexedDB):
//   projects table (/v1/projects) — book snapshots; the registry is DERIVED
//                                   from this list (no separate index)
//   settings.activeProjectId      — id of the currently loaded project
// Undo/redo is in-memory only (not persisted across reloads); durable rollback
// is the per-chapter version history (stores/versions.js).

const uid = (p) => `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

function wordCountFromHtml(html) {
  if (!html) return 0;
  const text = String(html).replace(/<[^>]+>/g, " ").trim();
  return text ? text.split(/\s+/).length : 0;
}

// Book snapshots live in the server's `projects` table, reached via the domain
// API (services/projectApi.js). The cache is populated by hydrateProjects()
// before mount, so loadSnap stays synchronous for the store's bootstrap. The
// registry is derived from the same table; the active-id pointer is in settings.
function loadSnap(id) { return id ? projectApi.getSnapshot(id) : null; }
function saveSnap(id, snap) { if (id) projectApi.putSnapshot(id, snap); }
function removeSnap(id) { if (id) projectApi.removeProject(id); }

// The active project id lives in the settings document.
function loadActiveId() { return readSetting("activeProjectId") ?? null; }

// Awaited by main.js after bootSettings() and before mount: pulls the registry
// + active book into projectApi's cache so the sync bootstrap can read them.
// When no active pointer exists yet but projects do, prefetch the most recent
// so bootstrap can open it without a re-seed flash.
export async function hydrateProjects() {
  const activeId = loadActiveId();
  await projectApi.bootProjects(activeId);
  if (!activeId) {
    const reg = projectApi.listRegistry();
    if (reg.length) await projectApi.fetchSnapshot(reg[0].id);
  }
}


// ── Workspace bundling ────────────────────────────────────────────
// The autosave file (and the manual "Export backup…" path) carry the active
// project's snapshot PLUS the renderer's settings document (appearance, AI
// prefs, hardware presets, …) under `_workspace`, so any single file restores
// the whole workspace — preferences + project — not just the prose. Server-side
// collections (sessions, usage, versions, chat) live in the database itself,
// which is the durable store.
function workspaceKeysToBundle() {
  return { settings: getAllSettings() };
}

export function restoreWorkspaceBundle(workspace) {
  if (workspace && typeof workspace.settings === "object" && workspace.settings) {
    applySettings(workspace.settings);
    return true;
  }
  return false;
}

// ── Disk autosave (Tauri only) ─────────────────────────────────────
// IndexedDB is the primary store, but it lives inside the webview's
// profile — a "clear site data" or webview reset wipes it. Mirror every
// snapshot to $APPDATA/projects/<id>.autosave.json on a debounce so the
// user's work survives that, and so OS-level backups (OneDrive, Time
// Machine, …) pick the file up. Two prior generations are kept by the
// Rust side via rotation.
const DISK_AUTOSAVE_DEBOUNCE_MS = 10000;
let _diskAutosaveTimer = null;
let _diskAutosavePending = null;

function scheduleDiskAutosave(id, snap) {
  if (typeof window === "undefined") return;
  if (!window.justwrite?.project?.autosave) return; // browser-only dev path
  _diskAutosavePending = { id, snap };
  if (_diskAutosaveTimer) clearTimeout(_diskAutosaveTimer);
  _diskAutosaveTimer = setTimeout(flushDiskAutosave, DISK_AUTOSAVE_DEBOUNCE_MS);
}

function flushDiskAutosave() {
  if (_diskAutosaveTimer) { clearTimeout(_diskAutosaveTimer); _diskAutosaveTimer = null; }
  const pending = _diskAutosavePending;
  _diskAutosavePending = null;
  if (!pending) return;
  const jw = typeof window !== "undefined" ? window.justwrite : null;
  if (!jw?.project?.autosave) return;
  jw.project.autosave(pending.id, pending.snap).then((res) => {
    if (res && res.ok) writeSetting("lastAutosaveAt", new Date().toISOString());
  }).catch(() => {});
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", flushDiskAutosave);
  window.addEventListener("beforeunload", flushDiskAutosave);
}

// Decide which project to load on startup. Migrates the legacy single-project
// key on first run so existing workspaces aren't lost.
function bootstrap() {
  const registry = projectApi.listRegistry();  // derived from the projects table
  const activeId = loadActiveId();

  // Use the persisted activeId even if no project snapshot exists yet — a
  // brand-new project has an active id from the moment it's minted, but the
  // snapshot only gets written on the first edit. Requiring both would re-mint
  // a fresh uuid on every reload of an un-edited project and orphan anything
  // keyed on activeProjectId (RAG index, AI usage log, sessions, etc.). Persist
  // the id back to settings to migrate a legacy kv pointer.
  if (activeId) {
    writeSetting("activeProjectId", activeId);
    return { activeId, registry, snapshot: loadSnap(activeId) };
  }

  // No active pointer but projects exist (pointer cleared, or an upgrade) —
  // open the most recent (hydrateProjects prefetched its snapshot) rather than
  // re-seeding over real work.
  if (registry.length) {
    const id = registry[0].id;
    writeSetting("activeProjectId", id);
    return { activeId: id, registry, snapshot: loadSnap(id) };
  }

  // First-ever run: mint an id for the seeded demo. ensureActiveProjectPersisted()
  // (called from main.js after boot) writes its row so it survives a reload.
  const id = uid("prj");
  const entry = {
    id,
    title: "The Cartographer's Daughter",
    author: "Mira Halden",
    savedAt: new Date().toISOString(),
  };
  writeSetting("activeProjectId", id);
  return { activeId: id, registry: [entry], snapshot: null };
}

// IMPORTANT: bootstrap() reads from caches populated before mount — the
// settings document (services/settings.js → activeProjectId) and projectApi's
// registry + snapshot cache (services/projectApi.js). Both are empty until
// main.js's IIFE awaits bootSettings() + hydrateProjects(). ES modules evaluate
// before main.js's body, so calling bootstrap() at module-load time would
// silently read null for the active id / registry / snapshot and mint a fresh
// project UUID on every full reload — losing the user's chapters, RAG index,
// sessions, and everything else keyed on activeProjectId. The seed data made
// this look like persistence on the surface because the demo content reappears.
//
// Defer bootstrap (and the migration steps it feeds) into a lazy initialiser
// that runs once when the state factory first executes. Pinia state factories
// only run on the first useProjectStore() call, which happens during the
// app's component setup — well after bootSettings() + hydrateProjects() have run.
let _bootCache = null;
function getBoot() {
  if (_bootCache) return _bootCache;
  const boot = bootstrap();
  const loaded = boot.snapshot || {};

  normalizeStrands(loaded);

  // "Storylines" was briefly added as a fifth architecture doc and then
  // removed. Strip it from any project that picked it up so it doesn't
  // linger in the sidebar list.
  if (loaded.architecture && loaded.architecture.storylines) {
    const { storylines, ...rest } = loaded.architecture;
    loaded.architecture = rest;
  }

  // "Global notes" was retired in favour of story-wide entries in the
  // Notes view. Strip it from any project that still carries it.
  if (loaded.architecture && loaded.architecture.globalnotes) {
    const { globalnotes, ...rest } = loaded.architecture;
    loaded.architecture = rest;
  }

  // Chapters now contain scenes instead of a single body. Migrate every
  // existing `chapterBody[id] = html` into a one-scene record so the user's
  // prose is preserved exactly; clear the old chapterBody.
  // Gate on boot.snapshot — on a fresh install there is nothing to migrate
  // AND running the migration would set scenes to {}, which would then beat
  // the SCENES seed in the state factory below.
  if (boot.snapshot && (!loaded.scenes || typeof loaded.scenes !== "object")) {
    loaded.scenes = {};
    const oldBody = (loaded.chapterBody && typeof loaded.chapterBody === "object") ? loaded.chapterBody : {};
    for (const [chId, html] of Object.entries(oldBody)) {
      loaded.scenes[chId] = [{ id: `scn_${chId}_1`, title: "", body: html || "" }];
    }
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

  _bootCache = { boot, loaded };
  return _bootCache;
}

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
      blurb: "", status: "open", ...s,
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
const EMPTY_TRASH = {
  chapters: [], scenes: [], characters: [], locations: [], objects: [],
  groups: [], notes: [], strands: [], worldbuilding: [],
  events: [], statuses: [], tagVocab: [],
};

export const TRASH_KINDS = Object.keys(EMPTY_TRASH);

// ── Undo/redo ────────────────────────────────────────────────────────
// Snapshot-based history: before each mutation we push a deep clone of
// the relevant slices onto `past`. Undo pops the latest, replaces the
// current state with it, and pushes what was current onto `future`.
//
// In-memory we keep up to HISTORY_LIMIT snapshots. Undo/redo is NOT persisted
// across reloads — durable rollback is the per-chapter version history.
//
// Keystroke-grain edits coalesce into one snapshot per ~600ms quiescent
// window (see COALESCED_ACTIONS), so HISTORY_LIMIT roughly maps to
// minutes of writing: 100 ≈ 1 min, 500 ≈ 5 min, 1000 ≈ 10 min of
// continuous typing before the oldest undo step falls off. Marathon
// sessions benefit from the bigger ceiling; the memory cost is bounded
// by the project size × HISTORY_LIMIT, so very large projects (200k+
// words) may want to tune down if RAM becomes a constraint.
const HISTORY_LIMIT = 1000;
const HISTORY_SLICES = [
  "project", "parts", "scenes",
  "characters", "characterExtras",
  "locations", "objects", "groups", "notes", "strands",
  "architecture", "worldbuilding", "worldbuildingCategories", "tagVocabularies", "statuses",
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
  "applyStitchedChapter",
  "updateNote", "updateWorldbuilding", "updateArchitecture",
  "updateCharacter", "setCharacterExtras",
  "updateLocation", "updateObject", "updateStrand", "updateGroup",
  "updatePart", "updateStrandBeat", "updateScene",
  "renameTagVocab",
]);

let lastHistoryAt = 0;
let lastHistoryAction = null;

// User-definable status palette (project-wide, shared by every section
// that shows status). Seeded with the ids existing entities already use
// (`todo`/`draft`/`revise`/`done`) so no data needs migrating; colors are
// theme-adaptive CSS vars. Fully editable/deletable at runtime.
const DEFAULT_STATUSES = [
  { id: "todo",      label: "To do",     color: "var(--status-todo)" },
  { id: "draft",     label: "Draft",     color: "var(--status-draft)" },
  { id: "revise",    label: "Revise",    color: "var(--status-revise)" },
  { id: "done",      label: "Done",      color: "var(--status-done)" },
  // Throughline states — also re-link strands whose saved status is "open".
  { id: "open",      label: "Open",      color: "oklch(0.66 0.13 250)" },
  { id: "resolved",  label: "Resolved",  color: "oklch(0.62 0.14 150)" },
  { id: "abandoned", label: "Abandoned", color: "oklch(0.6 0.02 260)" },
];

export const useProjectStore = defineStore("project", {
  state: () => {
    // Lazy bootstrap — see getBoot() for why this can't run at module load.
    const { boot, loaded } = getBoot();
    return ({
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
    worldbuildingCategories: loaded.worldbuildingCategories || WORLDBUILDING_CATEGORIES.map((c) => ({ ...c })),
    tagVocabularies: { characters: [], locations: [], objects: [], worldbuilding: [], ...(loaded.tagVocabularies || {}) },
    statuses: loaded.statuses || DEFAULT_STATUSES.map((s) => ({ ...s })),
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

    // Per-day session recaps generated by the "Wrap up session" flow.
    // Keyed by yyyy-mm-dd. Each entry: { text, threads, generatedAt,
    // model, chapterId, totalWords }. Excluded from HISTORY_SLICES so
    // undo doesn't churn over them — recaps are append-mostly and the
    // writer doesn't expect undo to roll one back.
    dailyRecaps: loaded.dailyRecaps || {},

    // Reverse outline ("StorySnap") — single project-wide structural
    // artifact. Shape: { structureName, summary, actBreaks, plotPoints,
    // chapterBeats, generatedAt, model }. Null until generated.
    reverseOutline: loaded.reverseOutline || null,

    // Beat-sheet overlays — one mapping per template the writer has
    // run. Keyed by templateKey ("save-the-cat" | "heros-journey" |
    // "seven-point"). Each value: { templateKey, templateName,
    // summary, mapping, missingCount, totalBeats, generatedAt, model }.
    beatSheets: loaded.beatSheets || {},

    // Plot-hole / continuity audit results — single project-wide
    // artifact. Shape: { summary, findings: [...], generatedAt, model }.
    // Individual findings can be dismissed; the whole object can be
    // cleared and regenerated.
    plotHoles: loaded.plotHoles || null,

    // Voice canon — chapter ids the writer has marked as
    // representative of their established voice. The fingerprint
    // service uses these to build a sample + style summary that's
    // injected into every Rewrite / Expand / Continue / Describe.
    voiceCanonChapterIds: Array.isArray(loaded.voiceCanonChapterIds) ? loaded.voiceCanonChapterIds : [],

    // Relationship arcs — keyed by canonical pair key (sorted ids
    // joined by "::"). Each value is the analyseRelationship() result.
    // The writer can track multiple pairs concurrently.
    relationshipArcs: loaded.relationshipArcs || {},

    // Marketing pack — single project-wide artifact.
    // { logline, blurbs: [...3], synopsis, pitch, generatedAt, model }
    marketingPack: loaded.marketingPack || null,

    // World rules — free-text "rules the writer has explicitly stated
    // this world enforces" (magic system rules, technology constraints,
    // social structures, in-world physics). When non-empty, the Plot-
    // hole audit checks scenes against these in addition to the usual
    // contradiction / timeline / continuity passes. Closes the SFF gap
    // without a dedicated world-rule auditor surface.
    worldRules: typeof loaded.worldRules === "string" ? loaded.worldRules : "",

    // Multi-project registry. `_activeId` is the storage key the
    // current snapshot persists into. `_projects` mirrors the registry
    // so the sidebar dropdown can react. Neither participates in undo.
    _activeId: boot.activeId,
    _projects: boot.registry,

    // History — in-memory only (undo/redo doesn't survive reload; durable
    // rollback is the per-chapter version history). `markRaw` keeps Vue from
    // making the snapshots reactive.
    _past:   markRaw([]),
    _future: markRaw([]),

    // Reactive autosave timestamp — ticks each time _persist() runs so
    // the sidebar "Autosaved · 5s ago" indicator stays live. Not part
    // of HISTORY_SLICES or exportSnapshot — it's a runtime signal, not
    // persisted state. Starts at 0; first edit sets it.
    _lastSavedAt: 0,
    });
  },

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
    // Notes anchored to a chapter (header-level OR any scene in that
    // chapter). Used by the chapter view's "Notes" button to surface
    // every note pinned anywhere in this chapter at once.
    notesForChapter:   (s) => (chapterId) => s.notes.filter((n) => n.anchor?.chapterId === chapterId),
    // Notes anchored specifically to a scene. Subset of notesForChapter
    // for that scene's parent chapter.
    notesForScene:     (s) => (sceneId) => s.notes.filter((n) => n.anchor?.sceneId === sceneId),
    worldbuildingById: (s) => (id) => s.worldbuilding.find((a) => a.id === id),
    strandById:      (s) => (id) => s.strands.find((x) => x.id === id),
    imagesFor:         (s) => (id) => s.images[id] || [],
    eventsFor:         (s) => (id) => s.events[id] || [],
    trashCount:        (s) => Object.values(s.trash).reduce((n, list) => n + list.length, 0),
    canUndo:           (s) => s._past.length > 0,
    canRedo:           (s) => s._future.length > 0,
    projectsList:      (s) => s._projects,
    activeProjectId:   (s) => s._activeId,
    statusById:        (s) => (id) => s.statuses.find((x) => x.id === id) || null,
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
    },
    undo() {
      if (!this._past.length) return;
      const snap = this._past.pop();
      this._future.push(cloneSlices(this));
      applySlices(this, snap);
      lastHistoryAction = null;
      this._persist();
      useUiStore().showToast({ message: "Undid last change." });
    },
    redo() {
      if (!this._future.length) return;
      const snap = this._future.pop();
      this._past.push(cloneSlices(this));
      applySlices(this, snap);
      lastHistoryAction = null;
      this._persist();
      useUiStore().showToast({ message: "Redid change." });
    },
    clearHistory() {
      this._past = markRaw([]);
      this._future = markRaw([]);
      lastHistoryAction = null;
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
    // Persist a critique blob on a chapter. Shape (not strictly enforced):
    //   { generatedAt, model, notes: [{ severity, category, message }],
    //     structure: { tension, hookQuality, pacing, endingClass, summary } }
    // Either half can be present without the other (text critique and
    // structural analysis are independent LLM calls).
    setChapterCritique(id, critique) {
      this._record("setChapterCritique");
      this.parts = this.parts.map((p) => ({
        ...p,
        chapters: p.chapters.map((c) => (c.id === id ? { ...c, critique } : c)),
      }));
      this._persist();
    },
    clearChapterCritique(id) {
      this._record("clearChapterCritique");
      this.parts = this.parts.map((p) => ({
        ...p,
        chapters: p.chapters.map((c) => {
          if (c.id !== id) return c;
          const { critique, ...rest } = c;
          return rest;
        }),
      }));
      this._persist();
    },
    // Persist a reader-knowledge entry on a chapter. Shape:
    //   { povCharacter, newReaderFacts, newPovFacts, status, rationale,
    //     totalReaderKnown, totalPovKnown, activeIronyCount,
    //     generatedAt, model }
    // Written per-chapter as the sequential sweep walks the manuscript
    // so the user sees partial results immediately on cancel.
    setChapterReaderKnowledge(id, readerKnowledge) {
      this._record("setChapterReaderKnowledge");
      this.parts = this.parts.map((p) => ({
        ...p,
        chapters: p.chapters.map((c) => (c.id === id ? { ...c, readerKnowledge } : c)),
      }));
      this._persist();
    },
    clearChapterReaderKnowledge(id) {
      this._record("clearChapterReaderKnowledge");
      this.parts = this.parts.map((p) => ({
        ...p,
        chapters: p.chapters.map((c) => {
          if (c.id !== id) return c;
          const { readerKnowledge, ...rest } = c;
          return rest;
        }),
      }));
      this._persist();
    },
    clearAllReaderKnowledge() {
      this._record("clearAllReaderKnowledge");
      this.parts = this.parts.map((p) => ({
        ...p,
        chapters: p.chapters.map((c) => {
          const { readerKnowledge, ...rest } = c;
          return rest;
        }),
      }));
      this._persist();
    },
    setChapterTitle(id, title) {
      this._record("setChapterTitle");
      this.parts = this.parts.map((p) => ({ ...p, chapters: p.chapters.map((c) => c.id === id ? { ...c, title } : c) }));
      // Single-scene chapters keep the scene title in sync with the chapter
      // title — there's no meaningful per-scene distinction yet. Once a
      // second scene is added the titles decouple permanently.
      const scs = this.scenes[id] || [];
      if (scs.length === 1) {
        this.scenes = { ...this.scenes, [id]: [{ ...scs[0], title }] };
      }
      this._persist();
    },

    // Bulk-add an array of { title, html } chapters as a single history entry.
    // Used by the import wizard so a many-chapter ingest is one undo.
    // - partId: if set and it matches an existing part, chapters append there.
    // - partTitle: if set (and no matching partId), a new part holds the import.
    // - Otherwise chapters append to the last existing part.
    // - status: applied to every imported chapter.
    // Returns { partId, chapterIds }.
    importChapters({ chapters = [], partId: targetPartId = "", partTitle = "", status = "draft" } = {}) {
      const list = (chapters || []).filter((c) => c && (c.html || c.title));
      if (!list.length) return { partId: null, chapterIds: [] };
      this._record("importChapters");

      let partId;
      const existing = targetPartId ? this.parts.find((p) => p.id === targetPartId) : null;
      if (existing) {
        partId = existing.id;
      } else if (partTitle) {
        partId = uid("p");
        this.parts = [...this.parts, { id: partId, title: partTitle, chapters: [] }];
      } else if (this.parts.length === 0) {
        partId = uid("p");
        this.parts = [{ id: partId, title: "Part One", chapters: [] }];
      } else {
        partId = this.parts[this.parts.length - 1].id;
      }

      const chapterIds = [];
      const nextScenes = { ...this.scenes };
      const newChapters = list.map((c, i) => {
        const id = uid("ch");
        chapterIds.push(id);
        const sceneId = uid("scn");
        const title = c.title || `Chapter ${i + 1}`;
        // Single-scene chapters mirror the chapter title onto the scene
        // so the scene strip isn't a row of blank placeholders.
        nextScenes[id] = [{ id: sceneId, title, body: c.html || "" }];
        return {
          id,
          num: 0, // filled by _renumberChapters
          title,
          words: wordCountFromHtml(c.html || ""),
          status,
          strands: [],
        };
      });

      this.parts = this.parts.map((p) => p.id === partId
        ? { ...p, chapters: [...p.chapters, ...newChapters] }
        : p);
      this.scenes = nextScenes;
      this._renumberChapters();
      this._persist();
      return { partId, chapterIds };
    },

    // Split a chapter at a point inside one of its scenes. Used by the
    // RichEditor "split chapter here" command — the editor hands us the
    // HTML before and after the cursor, and we:
    //  - replace the source scene's body with `beforeHtml`,
    //  - create a new chapter (in the same part, right after this one),
    //  - seed it with a single scene containing `afterHtml` + any scenes
    //    that followed the source scene in the original chapter.
    // One history entry; one undo reverses the whole split.
    splitChapterAtScene(chapterId, sceneId, beforeHtml, afterHtml, newChapterTitle = "Untitled chapter") {
      const sourceScenes = this.scenes[chapterId] || [];
      const splitIdx = sourceScenes.findIndex((s) => s.id === sceneId);
      if (splitIdx < 0) return null;
      this._record("splitChapterAtScene");

      const before = sourceScenes.slice(0, splitIdx);
      const after  = sourceScenes.slice(splitIdx + 1);

      // Updated source chapter: scenes up to (and including) the split scene
      // truncated to `beforeHtml`.
      const updatedSplitScene = { ...sourceScenes[splitIdx], body: beforeHtml || "" };
      const stayScenes = [...before, updatedSplitScene];

      // New chapter starts with a scene containing the after-cursor body,
      // then inherits any scenes that originally followed. If the new
      // chapter ends up single-scene, the scene title mirrors the chapter
      // title to keep that invariant.
      const newChapterId = uid("ch");
      const carryTitle = after.length === 0 ? newChapterTitle : "";
      const carryScene = { id: uid("scn"), title: carryTitle, body: afterHtml || "" };
      const moveScenes = [carryScene, ...after];

      this.parts = this.parts.map((p) => {
        const idx = p.chapters.findIndex((c) => c.id === chapterId);
        if (idx < 0) return p;
        const newChapter = {
          id: newChapterId,
          num: 0,
          title: newChapterTitle,
          words: 0,
          status: p.chapters[idx].status || "draft",
          strands: [...(p.chapters[idx].strands || [])],
        };
        const chapters = [...p.chapters.slice(0, idx + 1), newChapter, ...p.chapters.slice(idx + 1)];
        return { ...p, chapters };
      });

      const nextScenes = { ...this.scenes };
      nextScenes[chapterId] = stayScenes.length ? stayScenes : [{ id: uid("scn"), title: "", body: "" }];
      nextScenes[newChapterId] = moveScenes;
      this.scenes = nextScenes;

      this._renumberChapters();
      this._recomputeChapterWords(chapterId);
      this._recomputeChapterWords(newChapterId);
      this._persist();
      return newChapterId;
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
      // If this is the first scene in the chapter, seed its title from
      // the chapter title so the single-scene invariant holds at creation
      // time too. Explicit input.title still wins.
      let seedTitle = "";
      if (list.length === 0 && input.title === undefined) {
        const ch = this.allChapters.find((c) => c.id === chapterId);
        seedTitle = ch?.title || "";
      }
      this.scenes = {
        ...this.scenes,
        [chapterId]: [...list, { id, title: seedTitle, body: "", ...input }],
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
    // Continuous-chapter editor write path. Takes the array of records
    // produced by splitChapter() (services/chapterStitch.js) and updates
    // the chapter's scenes atomically:
    //   - Existing sceneId  → body (and optional title) updated in place
    //   - sceneId === null (isNew: true) → minted as a fresh scene
    //   - Scenes that no longer appear in `records` are removed (the
    //     "writer deleted the boundary, merge scenes" path)
    // Single history entry per typing window thanks to applyStitchedChapter
    // being in COALESCED_ACTIONS — the writer's undo lands on the previous
    // quiescent state of the whole chapter, not one scene at a time.
    applyStitchedChapter(chapterId, records) {
      this._record("applyStitchedChapter");
      const prev = this.scenes[chapterId] || [];
      const prevById = new Map(prev.map((s) => [s.id, s]));
      const next = [];
      for (const r of records) {
        if (r.sceneId && prevById.has(r.sceneId)) {
          const existing = prevById.get(r.sceneId);
          next.push({ ...existing, body: r.body, title: r.title || existing.title });
        } else {
          next.push({ id: uid("scn"), title: r.title || "", body: r.body });
        }
      }
      // If the writer somehow emptied the chapter (deleted every boundary
      // AND every block), keep one empty scene — chapters always have at
      // least one scene (matches removeScene's invariant).
      if (!next.length) next.push({ id: uid("scn"), title: "", body: "" });
      this.scenes = { ...this.scenes, [chapterId]: next };
      this._recomputeChapterWords(chapterId);
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
      const idx = list.findIndex((s) => s.id === sceneId);
      if (idx < 0) return;
      const scene = list[idx];
      // Trash carries the parent chapterId and original position so a
      // later restore re-inserts the scene where it used to live.
      this._pushTrash("scenes", { ...scene, chapterId, index: idx });
      this.scenes = {
        ...this.scenes,
        [chapterId]: list.filter((s) => s.id !== sceneId),
      };
      // Notes anchored to this scene re-bind to the parent chapter so the
      // writer's annotations aren't silently orphaned. Restoring the scene
      // from trash won't auto-re-attach them (anchors stay at chapter
      // level) — that's the trade for keeping the notes findable now.
      this.notes = this.notes.map((n) =>
        n.anchor?.sceneId === sceneId
          ? { ...n, anchor: { chapterId } }
          : n);
      this._recomputeChapterWords(chapterId);
      this._toast(`Removed scene${scene.title ? ` "${scene.title}"` : ""}`, "scenes", sceneId);
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
    // Project-wide find & replace across scene PROSE. Records ONE history
    // entry no matter how many scenes/matches change, so a single undo
    // reverts the whole operation. Returns the total matches replaced.
    replaceInScenes(term, replaceWith, { caseSensitive = false } = {}) {
      if (!term) return 0;
      let total = 0;
      const next = {};
      const touched = [];
      for (const [chId, list] of Object.entries(this.scenes)) {
        let changed = false;
        const newList = list.map((s) => {
          const r = replaceInHtml(s.body || "", term, replaceWith, caseSensitive);
          if (r.count > 0) { total += r.count; changed = true; return { ...s, body: r.html }; }
          return s;
        });
        next[chId] = changed ? newList : list;
        if (changed) touched.push(chId);
      }
      if (!total) return 0;
      this._record("replaceInScenes");
      this.scenes = next;
      for (const chId of touched) this._recomputeChapterWords(chId);
      this._persist();
      return total;
    },
    // Same, scoped to a single scene (the per-row "Replace" in the modal).
    replaceInScene(chapterId, sceneId, term, replaceWith, { caseSensitive = false } = {}) {
      if (!term) return 0;
      const list = this.scenes[chapterId] || [];
      const scn = list.find((s) => s.id === sceneId);
      if (!scn) return 0;
      const r = replaceInHtml(scn.body || "", term, replaceWith, caseSensitive);
      if (!r.count) return 0;
      this._record("replaceInScene");
      this.scenes = {
        ...this.scenes,
        [chapterId]: list.map((s) => (s.id === sceneId ? { ...s, body: r.html } : s)),
      };
      this._recomputeChapterWords(chapterId);
      this._persist();
      return r.count;
    },
    // Replace a chapter's scenes wholesale — used by version-history
    // restore. Records history so the restore is itself undoable.
    restoreChapterScenes(chapterId, scenes) {
      this._record("restoreChapterScenes");
      const next = (scenes || []).map((s) => ({ id: s.id, title: s.title || "", body: s.body || "" }));
      this.scenes = {
        ...this.scenes,
        [chapterId]: next.length ? next : [{ id: uid("scn"), title: "", body: "" }],
      };
      this._recomputeChapterWords(chapterId);
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
      this.characters.push({ id, main: false, age: null, gender: "", pronouns: "", aliases: [], lifeStatus: "", oneLiner: "", role: "", name: "Untitled character", tags: [], ...input });
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
    // Persist a consistency-audit result on a character. Shape:
    //   { concerns: [...], verdict, sceneCount, generatedAt, model }
    // Mirrors the chapter.critique pattern.
    setCharacterAudit(id, audit) {
      this._record("setCharacterAudit");
      this.characters = this.characters.map((c) => c.id === id ? { ...c, audit } : c);
      this._persist();
    },
    clearCharacterAudit(id) {
      this._record("clearCharacterAudit");
      this.characters = this.characters.map((c) => {
        if (c.id !== id) return c;
        const { audit, ...rest } = c;
        return rest;
      });
      this._persist();
    },
    clearAllCharacterAudits() {
      this._record("clearAllCharacterAudits");
      this.characters = this.characters.map((c) => {
        const { audit, ...rest } = c;
        return rest;
      });
      this._persist();
    },
    // Reverse outline ("StorySnap") — one structural artifact per
    // project, regenerated as the draft changes shape. Stored on the
    // project root so it persists across sessions. Not in HISTORY_SLICES
    // so an undo of a chapter edit doesn't rewind a freshly-generated
    // outline.
    setReverseOutline(outline) {
      this.reverseOutline = outline ? { ...outline } : null;
      this._persist();
    },
    clearReverseOutline() {
      this.reverseOutline = null;
      this._persist();
    },
    // Beat-sheet overlay — one per template. Skip _record so the
    // mapping doesn't churn over undo when the chapter list changes.
    setBeatSheet(templateKey, mapping) {
      if (!templateKey) return;
      this.beatSheets = { ...this.beatSheets, [templateKey]: { ...mapping, templateKey } };
      this._persist();
    },
    clearBeatSheet(templateKey) {
      if (!templateKey || !this.beatSheets?.[templateKey]) return;
      const next = { ...this.beatSheets };
      delete next[templateKey];
      this.beatSheets = next;
      this._persist();
    },
    // Plot-hole / continuity audit results.
    setPlotHoles(payload) {
      this.plotHoles = payload ? { ...payload } : null;
      this._persist();
    },
    clearPlotHoles() {
      this.plotHoles = null;
      this._persist();
    },
    // Voice canon — marked chapters that represent the writer's
    // established voice. Used by the voice-fingerprint service to
    // build a sample + style summary injected into writer actions.
    setVoiceCanonChapters(ids) {
      const next = Array.isArray(ids) ? ids.filter(Boolean) : [];
      this.voiceCanonChapterIds = next;
      this._persist();
    },
    toggleVoiceCanonChapter(id) {
      if (!id) return;
      const cur = Array.isArray(this.voiceCanonChapterIds) ? this.voiceCanonChapterIds : [];
      const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
      this.voiceCanonChapterIds = next;
      this._persist();
    },
    clearVoiceCanon() {
      this.voiceCanonChapterIds = [];
      this._persist();
    },
    // Relationship arcs — keyed by canonical pair id (sorted ids
    // joined by "::"). Skip _record so undo of chapter edits doesn't
    // rewind a freshly-generated arc.
    setRelationshipArc(pairKey, arc) {
      if (!pairKey) return;
      this.relationshipArcs = { ...this.relationshipArcs, [pairKey]: { ...arc } };
      this._persist();
    },
    clearRelationshipArc(pairKey) {
      if (!pairKey || !this.relationshipArcs?.[pairKey]) return;
      const next = { ...this.relationshipArcs };
      delete next[pairKey];
      this.relationshipArcs = next;
      this._persist();
    },
    clearAllRelationshipArcs() {
      this.relationshipArcs = {};
      this._persist();
    },
    // Marketing pack — single project-wide artifact.
    setMarketingPack(pack) {
      this.marketingPack = pack ? { ...pack } : null;
      this._persist();
    },
    clearMarketingPack() {
      this.marketingPack = null;
      this._persist();
    },
    setWorldRules(text) {
      this.worldRules = String(text || "");
      this._persist();
    },
    // Multi-reader panel critique persisted per chapter. Sits alongside
    // chapter.critique (the single-pass critique) and chapter.readerKnowledge
    // (the dramatic-irony tracker) — three independent revision lenses on
    // the same chapter.
    setChapterMultiReader(id, payload) {
      this._record("setChapterMultiReader");
      this.parts = this.parts.map((p) => ({
        ...p,
        chapters: p.chapters.map((c) => (c.id === id ? { ...c, multiReader: payload } : c)),
      }));
      this._persist();
    },
    clearChapterMultiReader(id) {
      this._record("clearChapterMultiReader");
      this.parts = this.parts.map((p) => ({
        ...p,
        chapters: p.chapters.map((c) => {
          if (c.id !== id) return c;
          const { multiReader, ...rest } = c;
          return rest;
        }),
      }));
      this._persist();
    },
    dismissPlotHole(findingId) {
      if (!this.plotHoles?.findings) return;
      this.plotHoles = {
        ...this.plotHoles,
        findings: this.plotHoles.findings.map((f) =>
          f.id === findingId ? { ...f, dismissed: true } : f),
      };
      this._persist();
    },
    undismissPlotHole(findingId) {
      if (!this.plotHoles?.findings) return;
      this.plotHoles = {
        ...this.plotHoles,
        findings: this.plotHoles.findings.map((f) =>
          f.id === findingId ? { ...f, dismissed: false } : f),
      };
      this._persist();
    },

    // ── Locations ───────────────────────────────────────────
    addLocation(input = {}) { this._record("addLocation"); const id = uid("l"); this.locations.push({ id, name: "Untitled location", kind: "", note: "", tags: [], ...input }); this._persist(); return id; },
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
    addObject(input = {}) { this._record("addObject"); const id = uid("o"); this.objects.push({ id, name: "Untitled object", kind: "", note: "", tags: [], ...input }); this._persist(); return id; },
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
      // anchor = null     → story-wide note (default)
      // anchor = { chapterId }            → pinned to a chapter
      // anchor = { chapterId, sceneId }   → pinned to a specific scene
      this.notes.push({ id, title: "Untitled note", body: "", tag: "note", updated: today, anchor: null, ...input });
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

    // Bulk-add an array of { title, html } notes as a single history entry.
    // Mirrors importChapters — used by the import wizard so a many-note
    // ingest is one undo.
    //   tag    — applied to every imported note (default "note").
    //   anchor — story-wide (null) | { chapterId } | { chapterId, sceneId }.
    // Returns { noteIds }.
    importNotes({ notes = [], tag = "note", anchor = null } = {}) {
      const list = (notes || []).filter((n) => n && (n.html || n.title));
      if (!list.length) return { noteIds: [] };
      this._record("importNotes");
      const today = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });
      const noteIds = [];
      // Snapshot the anchor so every imported note holds an independent copy
      // — otherwise undo / per-note re-anchor would mutate shared state.
      const cloneAnchor = () => (anchor ? { ...anchor } : null);
      for (const n of list) {
        const id = uid("n");
        noteIds.push(id);
        this.notes.push({
          id,
          title: n.title || "Untitled note",
          body: n.html || "",
          tag: tag || "note",
          updated: today,
          anchor: cloneAnchor(),
        });
      }
      this._persist();
      return { noteIds };
    },

    // ── Worldbuilding ───────────────────────────────────────
    addWorldbuilding(input = {}) {
      this._record("addWorldbuilding");
      const id = uid("wb");
      this.worldbuilding.push({ id, title: "Untitled article", category: this.worldbuildingCategories[0]?.id || "geography", tags: [], status: "", words: 0, summary: "", body: "", related: [], ...input });
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
    // Drag-drop move: reassign an article's category and position it
    // before `insertBeforeId` in the flat list (append to the category's
    // tail when null). One history entry so a cross-category drag is a
    // single undo. Display order per category follows flat-array order.
    moveWorldbuilding(id, toCategory, insertBeforeId = null) {
      this._record("moveWorldbuilding");
      const art = this.worldbuilding.find((a) => a.id === id);
      if (!art) return;
      const rest = this.worldbuilding.filter((a) => a.id !== id);
      let at = insertBeforeId ? rest.findIndex((a) => a.id === insertBeforeId) : -1;
      if (at < 0) at = rest.length;
      rest.splice(at, 0, { ...art, category: toCategory });
      this.worldbuilding = rest;
      this._persist();
    },

    // ── Worldbuilding categories (user-definable) ───────────
    addWorldbuildingCategory({ label = "New category", icon = "Sparkle", hue } = {}) {
      this._record("addWorldbuildingCategory");
      const id = uid("wbc");
      const finalHue = hue ?? nextHue(this.worldbuildingCategories.length);
      this.worldbuildingCategories = [...this.worldbuildingCategories, { id, label, icon, hue: finalHue }];
      this._persist();
      return id;
    },
    updateWorldbuildingCategory(id, patch) {
      this._record("updateWorldbuildingCategory");
      this.worldbuildingCategories = this.worldbuildingCategories.map((c) => (c.id === id ? { ...c, ...patch } : c));
      this._persist();
    },
    removeWorldbuildingCategory(id) {
      // Keep at least one category, and never orphan articles — reassign
      // any article in the deleted category to the first remaining one.
      if (this.worldbuildingCategories.length <= 1) return false;
      this._record("removeWorldbuildingCategory");
      const remaining = this.worldbuildingCategories.filter((c) => c.id !== id);
      const fallback = remaining[0].id;
      this.worldbuildingCategories = remaining;
      this.worldbuilding = this.worldbuilding.map((a) => (a.category === id ? { ...a, category: fallback } : a));
      this._persist();
      return true;
    },
    reorderWorldbuildingCategories(ids) {
      this._record("reorderWorldbuildingCategories");
      const byId = new Map(this.worldbuildingCategories.map((c) => [c.id, c]));
      const next = ids.map((i) => byId.get(i)).filter(Boolean);
      for (const c of this.worldbuildingCategories) if (!ids.includes(c.id)) next.push(c);
      this.worldbuildingCategories = next;
      this._persist();
    },

    // ── Tag vocabularies (per-kind curated suggestions) ──────
    addTagVocab(kind, label = "New tag") {
      this._record("addTagVocab");
      const id = uid("tv");
      const next = { ...this.tagVocabularies };
      next[kind] = [...(next[kind] || []), { id, label }];
      this.tagVocabularies = next;
      this._persist();
      return id;
    },
    renameTagVocab(kind, id, label) {
      this._record("renameTagVocab");
      const next = { ...this.tagVocabularies };
      next[kind] = (next[kind] || []).map((t) => (t.id === id ? { ...t, label } : t));
      this.tagVocabularies = next;
      this._persist();
    },
    removeTagVocab(kind, id) {
      this._record("removeTagVocab");
      const list = this.tagVocabularies[kind] || [];
      const tag = list.find((t) => t.id === id);
      if (!tag) return;
      this._pushTrash("tagVocab", { ...tag, kind });
      const next = { ...this.tagVocabularies };
      next[kind] = list.filter((t) => t.id !== id);
      this.tagVocabularies = next;
      this._toast(`Removed tag "${tag.label}"`, "tagVocab", id);
      this._persist();
    },

    // ── Narrative strands ───────────────────────────────────
    addStrand(input = {}) {
      this._record("addStrand");
      const id = uid("strand");
      this.strands.push({
        id,
        name: "Untitled narrative strand",
        color: nextColor(this.strands.length),
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

    // Move a beat from one strand to another while preserving its id
    // and any caller-supplied patch (commonly { chapterId } for plot
    // board drag-drop). One history entry so a cross-strand drag is a
    // single undo. Returns true on success, false if the beat or target
    // strand can't be found.
    moveBeat(fromStrandId, toStrandId, beatId, patch = {}) {
      if (fromStrandId === toStrandId) return false;
      const fromStrand = this.strands.find((s) => s.id === fromStrandId);
      const toStrand   = this.strands.find((s) => s.id === toStrandId);
      const beat = fromStrand?.beats?.find((b) => b.id === beatId);
      if (!fromStrand || !toStrand || !beat) return false;
      this._record("moveBeat");
      const moved = { ...beat, ...patch };
      this.strands = this.strands.map((s) => {
        if (s.id === fromStrandId) return { ...s, beats: (s.beats || []).filter((b) => b.id !== beatId) };
        if (s.id === toStrandId)   return { ...s, beats: [...(s.beats || []), moved] };
        return s;
      });
      this._persist();
      return true;
    },

    // ── Groups ──────────────────────────────────────────────
    addGroup(input = {}) { this._record("addGroup"); const id = uid("g"); this.groups.push({ id, name: "Untitled group", blurb: "", color: nextColor(this.groups.length), members: [], ...input }); this._persist(); return id; },
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
    // A member is identified by the (kind, id) pair — ids are only unique
    // within a kind, so matching on id alone can clobber a same-id member
    // of another kind.
    addGroupMember(groupId, member) {
      this._record("addGroupMember");
      this.groups = this.groups.map((g) => g.id === groupId
        ? { ...g, members: [...(g.members || []).filter((m) => !(m.kind === member.kind && m.id === member.id)), member] } : g);
      this._persist();
    },
    // Drop a single matching entry rather than filtering every match, so a
    // legacy snapshot that picked up duplicate/blank-id refs can be cleared
    // one click at a time instead of cascade-deleting the whole kind.
    removeGroupMember(groupId, kind, id) {
      this._record("removeGroupMember");
      this.groups = this.groups.map((g) => {
        if (g.id !== groupId) return g;
        const members = [...(g.members || [])];
        const i = members.findIndex((m) => m.kind === kind && m.id === id);
        if (i >= 0) members.splice(i, 1);
        return { ...g, members };
      });
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
    removeEvent(entityId, eventId) {
      this._record("removeEvent");
      const list = this.events[entityId] || [];
      const idx = list.findIndex((e) => e.id === eventId);
      if (idx < 0) return;
      const ev = list[idx];
      // Carry entityId and original position so restore re-inserts where
      // the event used to live.
      this._pushTrash("events", { ...ev, entityId, index: idx });
      this.events = { ...this.events, [entityId]: list.filter((e) => e.id !== eventId) };
      this._toast(`Removed event "${ev.title || "Untitled event"}"`, "events", eventId);
      this._persist();
    },

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
        case "events": {
          const { entityId, index, ...event } = rest;
          const list = this.events[entityId] || [];
          const insertAt = Math.max(0, Math.min(index ?? list.length, list.length));
          const next = [...list];
          next.splice(insertAt, 0, event);
          this.events = { ...this.events, [entityId]: next };
          break;
        }
        case "tagVocab": {
          const { kind, ...tag } = rest;
          const next = { ...this.tagVocabularies };
          next[kind] = [...(next[kind] || []), tag];
          this.tagVocabularies = next;
          break;
        }
        case "scenes": {
          const { chapterId, index, ...scene } = rest;
          const list = this.scenes[chapterId];
          if (!list) {
            // Parent chapter is gone (also in trash, or purged). Put the
            // scene back so the user can restore the chapter first — its
            // own trash payload carries the scenes that were still in it
            // at chapter-delete time, but standalone scene trash entries
            // are orphaned without the parent.
            this.trash = { ...this.trash, scenes: [...(this.trash.scenes || []), item] };
            const ui = useUiStore();
            ui.showToast({ message: `Restore the parent chapter first — then this scene.` });
            return;
          }
          const insertAt = Math.max(0, Math.min(index ?? list.length, list.length));
          const next = [...list];
          next.splice(insertAt, 0, scene);
          this.scenes = { ...this.scenes, [chapterId]: next };
          this._recomputeChapterWords(chapterId);
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

    // ── Statuses (user-definable palette) ───────────────────
    addStatusDef({ label = "New status", color = "var(--status-todo)" } = {}) {
      this._record("addStatusDef");
      const id = uid("st");
      this.statuses = [...this.statuses, { id, label, color }];
      this._persist();
      return id;
    },
    updateStatusDef(id, patch) {
      this._record("updateStatusDef");
      this.statuses = this.statuses.map((s) => (s.id === id ? { ...s, ...patch } : s));
      this._persist();
    },
    removeStatusDef(id) {
      this._record("removeStatusDef");
      const s = this.statuses.find((x) => x.id === id);
      if (!s) return;
      this._pushTrash("statuses", { ...s });
      // Entities still referencing this id simply resolve to "unset"
      // (statusById → null), so no sweep is needed.
      this.statuses = this.statuses.filter((x) => x.id !== id);
      this._toast(`Deleted status "${s.label}"`, "statuses", id);
      this._persist();
    },
    reorderStatusDefs(ids) {
      this._record("reorderStatusDefs");
      const byId = new Map(this.statuses.map((s) => [s.id, s]));
      const next = ids.map((id) => byId.get(id)).filter(Boolean);
      for (const s of this.statuses) if (!ids.includes(s.id)) next.push(s);
      this.statuses = next;
      this._persist();
    },

    // ── Snapshot ────────────────────────────────────────────
    loadSnapshot(snap) {
      const hadWorkspace = !!(snap && snap._workspace);
      if (hadWorkspace) restoreWorkspaceBundle(snap._workspace);
      // _workspace lives alongside the project fields in the file but isn't
      // part of $state — strip it before assignment so it doesn't leak in.
      const { _workspace, ...projectSnap } = snap || {};
      Object.assign(this.$state, normalizeStrands(projectSnap));
      this.clearHistory();
      this._persist();
      // Caller decides whether to reload; sister stores (AI/sessions)
      // only re-hydrate from IDB at boot, so a workspace restore needs one.
      return { workspaceRestored: hadWorkspace };
    },
    // Full backup bundle — what gets written to disk and what the manual
    // export downloads. Project snapshot + every non-project workspace key.
    exportFullBackup() {
      return { ...this.exportSnapshot(), _workspace: workspaceKeysToBundle() };
    },
    exportSnapshot() {
      return {
        project: this.project, parts: this.parts, scenes: this.scenes,
        characters: this.characters, characterExtras: this.characterExtras,
        locations: this.locations, objects: this.objects, groups: this.groups,
        strands: this.strands, notes: this.notes, architecture: this.architecture,
        worldbuilding: this.worldbuilding, worldbuildingCategories: this.worldbuildingCategories,
        tagVocabularies: this.tagVocabularies,
        images: this.images, events: this.events,
        statuses: this.statuses,
        trash: this.trash,
        dailyRecaps: this.dailyRecaps,
        reverseOutline: this.reverseOutline,
        beatSheets: this.beatSheets,
        plotHoles: this.plotHoles,
        voiceCanonChapterIds: this.voiceCanonChapterIds,
        relationshipArcs: this.relationshipArcs,
        marketingPack: this.marketingPack,
        worldRules: this.worldRules,
        savedAt: new Date().toISOString(),
      };
    },

    // ── Daily session recap ─────────────────────────────────────────
    // Set / clear / lookup helpers. Skip _record so the recap doesn't
    // get rolled back by undo when the writer keeps drafting after the
    // wrap-up modal closes.
    setDailyRecap(dayKey, payload) {
      if (!dayKey) return;
      this.dailyRecaps = { ...this.dailyRecaps, [dayKey]: { ...payload, day: dayKey } };
      this._persist();
    },
    clearDailyRecap(dayKey) {
      if (!dayKey || !this.dailyRecaps?.[dayKey]) return;
      const next = { ...this.dailyRecaps };
      delete next[dayKey];
      this.dailyRecaps = next;
      this._persist();
    },
    getDailyRecap(dayKey) {
      return this.dailyRecaps?.[dayKey] || null;
    },
    // The most-recent recap (by day key), or null. Used by the resume
    // briefing to fold yesterday's wrap-up into tomorrow's orientation.
    mostRecentRecap() {
      const keys = Object.keys(this.dailyRecaps || {}).sort();
      if (!keys.length) return null;
      const lastKey = keys[keys.length - 1];
      return this.dailyRecaps[lastKey] || null;
    },

    // ── Multi-project ───────────────────────────────────────
    // Lazily assign an active id on first persist when starting fresh
    // (no migration happened and no project has ever been created).
    _ensureActiveId() {
      if (!this._activeId) this._activeId = uid("prj");
      return this._activeId;
    },
    // The registry is derived from the projects table, so only the in-memory
    // mirror is kept here — persistence happens via putSnapshot (writes the
    // project row) and removeProject (deletes it).
    _writeRegistry(reg) {
      this._projects = reg;
    },
    // On a brand-new install the seeded demo project lives only in memory until
    // the first edit. With the registry derived from the projects table, write
    // its row now (called once from main.js after boot) so it survives a reload.
    ensureActiveProjectPersisted() {
      // Persist the seed ONLY when we're sure the active project has no server
      // row yet (a brand-new mint). Gate on the server-derived registry, and
      // only when that registry actually loaded — otherwise a failed/late book
      // fetch (or a server-down-at-boot race) would let us PUT the seed over a
      // real project (the snapshot is null in both cases). getSnapshot() can't
      // tell "absent" from "fetch failed"; the registry can.
      if (!this._activeId || !projectApi.isRegistryLoaded()) return;
      const onServer = projectApi.listRegistry().some((p) => p.id === this._activeId);
      if (!onServer) this._persist();
    },
    _persist() {
      const id = this._ensureActiveId();
      const snap = this.exportSnapshot();
      saveSnap(id, snap);
      writeSetting("activeProjectId", id);
      this._lastSavedAt = Date.now();
      // Disk mirror is a full workspace bundle, not just the project, so
      // any single autosave file is one-shot recoverable.
      scheduleDiskAutosave(id, { ...snap, _workspace: workspaceKeysToBundle() });
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

    // Seed a learn-by-doing project — a real JustWrite project (one
     // chapter / three scenes / two characters / one location / one
     // narrative strand with a beat / one worldbuilding article / a
     // "read me first" note). The user can poke at every surface of
     // the app without breaking their own work, then delete the project
     // from the sidebar's project switcher.
     //
     // Implemented on top of createProject() + the normal CRUD actions
     // so it benefits from the same invariants (history, persistence,
     // multi-project plumbing) the rest of the store relies on.
     createTutorialProject() {
       const id = this.createProject({ title: TUTORIAL_TITLE, author: TUTORIAL_AUTHOR });

       for (const c of TUTORIAL_CHARACTERS) this.addCharacter(c);
       for (const l of TUTORIAL_LOCATIONS) this.addLocation(l);
       this.addWorldbuilding(TUTORIAL_WORLDBUILDING);
       this.addNote(TUTORIAL_NOTE);

       const strandId = this.addStrand({ name: TUTORIAL_STRAND.name, color: TUTORIAL_STRAND.color });
       const chapterId = this.addChapter({ title: TUTORIAL_CHAPTER.title, partId: this.parts[0]?.id, status: "draft" });
       for (const sc of TUTORIAL_CHAPTER.scenes) this.addScene(chapterId, { title: sc.title, body: sc.body });

       this.addStrandBeat(strandId, {
         label: TUTORIAL_STRAND.beat.label,
         note: TUTORIAL_STRAND.beat.note,
         chapterId,
       });

       useUiStore().showToast({ message: `Opened "${TUTORIAL_TITLE}". Delete it from the project switcher when you're done.` });
       return id;
     },

     createProject({ title = "Untitled project", author = "" } = {}) {
      // Snapshot the current project first so switching away doesn't
      // lose unflushed edits.
      this._persist();
      const id = uid("prj");
      const fresh = {
        project: { ...PROJECT, title, author, coverImage: null, wordsWritten: 0 },
        strands: [], characters: [], characterExtras: {},
        locations: [], objects: [], groups: [], notes: [],
        parts: [{ id: uid("p"), title: "Part One", chapters: [] }],
        architecture: { ...ARCHITECTURE },
        worldbuilding: [],
        worldbuildingCategories: WORLDBUILDING_CATEGORIES.map((c) => ({ ...c })),
        tagVocabularies: { characters: [], locations: [], objects: [], worldbuilding: [] },
        statuses: DEFAULT_STATUSES.map((s) => ({ ...s })),
        scenes: {},
        images: {}, events: {},
        trash: { ...EMPTY_TRASH },
        dailyRecaps: {},
        reverseOutline: null,
        beatSheets: {},
        plotHoles: null,
        voiceCanonChapterIds: [],
        relationshipArcs: {},
        marketingPack: null,
        worldRules: "",
      };
      this._activeId = id;
      Object.assign(this.$state, fresh);
      this.clearHistory();
      this._persist();
      useUiStore().showToast({ message: `Created "${title}".` });
      return id;
    },

    async switchProject(id) {
      if (!id || id === this._activeId) return;
      // The target snapshot may not be cached yet — fetch it from the domain
      // API (fetchSnapshot returns the cached copy when present).
      const snap = normalizeStrands(await projectApi.fetchSnapshot(id));
      if (!snap) {
        useUiStore().showToast({ message: "That project couldn't be loaded." });
        return;
      }
      // Persist the outgoing project before swapping.
      this._persist();
      this._activeId = id;
      Object.assign(this.$state, snap);
      this.clearHistory();
      writeSetting("activeProjectId", id);
      useUiStore().showToast({ message: `Switched to "${snap.project?.title || "project"}".` });
    },

    async deleteProject(id) {
      if (!id) return;
      const entry = this._projects.find((p) => p.id === id);
      removeSnap(id);
      this._writeRegistry(this._projects.filter((p) => p.id !== id));
      if (id === this._activeId) {
        // Move to another project, or seed a blank one if none remain.
        const next = this._projects[0];
        if (next) {
          this._activeId = null; // force switchProject() to actually load
          await this.switchProject(next.id);
        } else {
          this._activeId = null;
          this.createProject({ title: "Untitled project" });
        }
      }
      if (entry) useUiStore().showToast({ message: `Deleted "${entry.title}".` });
    },
  },
});
