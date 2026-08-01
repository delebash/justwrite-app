// Version history — named, restartable snapshots of a chapter's scenes.
// Kept OUT of the project store so they never enter the undo buffer or
// bloat the per-change project snapshot. Persisted server-side
// (/v1/versions, SQL) and scoped by active project id (chapter ids aren't
// unique across projects). Newest-first, capped per chapter.
//
// Hydrated lazily per project (the history is a per-chapter modal feature,
// rarely opened) and persisted a chapter at a time as a wholesale replace —
// the same shape as chat threads.

import { defineStore } from "pinia";
import { getVersions, putChapterVersions } from "../services/versionsApi.js";
import { useProjectStore } from "./project.js";

const MAX_PER_CHAPTER = 30;

let _seq = 0;
function vid() { return `v${Date.now().toString(36)}${(_seq++).toString(36)}`; }
function wordCount(html) {
  const t = (html || "").replace(/<[^>]+>/g, " ").trim();
  return t ? t.split(/\s+/).length : 0;
}

// In-flight load promises per project, so concurrent ensureLoaded() calls share
// one fetch (and a second op can't proceed before the data lands). Module-scoped
// — not reactive state.
const _loadPromises = {};

export const useVersionsStore = defineStore("versions", {
  // byProject: { [projectId]: { [chapterId]: [version] } } — lazily hydrated
  // per project. A project key present (even {}) means "loaded".
  state: () => ({ byProject: {} }),

  getters: {
    versionsFor: (s) => (chapterId) => {
      const pid = useProjectStore().activeProjectId || "_";
      return s.byProject[pid]?.[chapterId] || [];
    },
  },

  actions: {
    // Load the active project's versions from the server once. Idempotent;
    // concurrent callers await the same fetch. Call before reads/writes.
    async ensureLoaded() {
      const pid = useProjectStore().activeProjectId || "_";
      if (this.byProject[pid] !== undefined) return;
      if (_loadPromises[pid]) return _loadPromises[pid];
      _loadPromises[pid] = (async () => {
        try {
          const byChapter = await getVersions(pid);
          this.byProject = { ...this.byProject, [pid]: (byChapter && typeof byChapter === "object") ? byChapter : {} };
        } catch (err) {
          console.error("versions.ensureLoaded failed:", err);
          this.byProject = { ...this.byProject, [pid]: {} };  // mark loaded (empty) to avoid a refetch loop
        } finally {
          delete _loadPromises[pid];
        }
      })();
      return _loadPromises[pid];
    },

    // Persist one chapter's version list (wholesale replace, like chat threads).
    _persistChapter(pid, chapterId) {
      putChapterVersions(pid, chapterId, this.byProject[pid]?.[chapterId] || []);
    },

    async saveVersion(chapterId, label = "") {
      await this.ensureLoaded();
      const project = useProjectStore();
      const pid = project.activeProjectId || "_";
      const scenes = project.scenesFor(chapterId).map((s) => ({ id: s.id, title: s.title || "", body: s.body || "" }));
      const version = {
        id: vid(),
        label: (label || "").trim(),
        savedAt: new Date().toISOString(),
        words: scenes.reduce((n, s) => n + wordCount(s.body), 0),
        scenes,
      };
      const forProject = { ...(this.byProject[pid] || {}) };
      forProject[chapterId] = [version, ...(forProject[chapterId] || [])].slice(0, MAX_PER_CHAPTER);
      this.byProject = { ...this.byProject, [pid]: forProject };
      this._persistChapter(pid, chapterId);
      return version.id;
    },

    async restoreVersion(chapterId, versionId) {
      await this.ensureLoaded();
      const project = useProjectStore();
      const pid = project.activeProjectId || "_";
      const v = (this.byProject[pid]?.[chapterId] || []).find((x) => x.id === versionId);
      if (!v) return false;
      // Routes through the project store's history, so the restore is
      // itself undoable and doesn't corrupt undo/redo.
      project.restoreChapterScenes(chapterId, v.scenes);
      return true;
    },

    async deleteVersion(chapterId, versionId) {
      await this.ensureLoaded();
      const pid = useProjectStore().activeProjectId || "_";
      const forProject = { ...(this.byProject[pid] || {}) };
      forProject[chapterId] = (forProject[chapterId] || []).filter((x) => x.id !== versionId);
      this.byProject = { ...this.byProject, [pid]: forProject };
      this._persistChapter(pid, chapterId);
    },

    // Re-insert a previously deleted version object. Keeps the list
    // sorted newest-first so Undo lands the row back in its original slot.
    async addVersion(chapterId, version) {
      await this.ensureLoaded();
      const pid = useProjectStore().activeProjectId || "_";
      const forProject = { ...(this.byProject[pid] || {}) };
      const list = forProject[chapterId] || [];
      if (list.some((v) => v.id === version.id)) return;
      const next = [version, ...list]
        .sort((a, b) => (b.savedAt || "").localeCompare(a.savedAt || ""))
        .slice(0, MAX_PER_CHAPTER);
      forProject[chapterId] = next;
      this.byProject = { ...this.byProject, [pid]: forProject };
      this._persistChapter(pid, chapterId);
    },
  },
});
