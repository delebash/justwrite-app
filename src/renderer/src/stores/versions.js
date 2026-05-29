// Version history — named, restartable snapshots of a chapter's scenes.
// Kept OUT of the project store so they never enter the undo buffer or
// bloat the per-change project snapshot. Persisted to its own storage
// key and scoped by active project id (chapter ids aren't unique across
// projects). Newest-first, capped per chapter.

import { defineStore } from "pinia";
import { getItem, setItem } from "../services/storage.js";
import { useProjectStore } from "./project.js";

const KEY = "justwrite:versions";
const MAX_PER_CHAPTER = 30;

function load() {
  try { return JSON.parse(getItem(KEY) || "{}"); } catch { return {}; }
}

let _seq = 0;
function vid() { return `v${Date.now().toString(36)}${(_seq++).toString(36)}`; }
function wordCount(html) {
  const t = (html || "").replace(/<[^>]+>/g, " ").trim();
  return t ? t.split(/\s+/).length : 0;
}

export const useVersionsStore = defineStore("versions", {
  // byProject: { [projectId]: { [chapterId]: [version] } }
  state: () => ({ byProject: load() }),

  getters: {
    versionsFor: (s) => (chapterId) => {
      const pid = useProjectStore().activeProjectId || "_";
      return s.byProject[pid]?.[chapterId] || [];
    },
  },

  actions: {
    _persist() { setItem(KEY, JSON.stringify(this.byProject)); },

    saveVersion(chapterId, label = "") {
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
      this._persist();
      return version.id;
    },

    restoreVersion(chapterId, versionId) {
      const project = useProjectStore();
      const pid = project.activeProjectId || "_";
      const v = (this.byProject[pid]?.[chapterId] || []).find((x) => x.id === versionId);
      if (!v) return false;
      // Routes through the project store's history, so the restore is
      // itself undoable and doesn't corrupt undo/redo.
      project.restoreChapterScenes(chapterId, v.scenes);
      return true;
    },

    deleteVersion(chapterId, versionId) {
      const pid = useProjectStore().activeProjectId || "_";
      const forProject = { ...(this.byProject[pid] || {}) };
      forProject[chapterId] = (forProject[chapterId] || []).filter((x) => x.id !== versionId);
      this.byProject = { ...this.byProject, [pid]: forProject };
      this._persist();
    },
  },
});
