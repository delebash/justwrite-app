// Studio store — cast assignments, script analyses, render queue.

import { defineStore } from "pinia";
import { DEFAULT_CAST, SAMPLE_VOICES, SCRIPT_CH7, RENDER_QUEUE } from "../domain/seed.js";
import { getItem, setItem } from "../services/storage.js";

const LS_KEY = "justwrite:studio";

function load() {
  try {
    return JSON.parse(getItem(LS_KEY) || "null");
  } catch { return null; }
}
function save(state) {
  try {
    // Scripts go on disk too — speaker-detection results survive reload.
    setItem(LS_KEY, JSON.stringify({
      cast: state.cast,
      voices: state.voices,
      scripts: state.scripts,
    }));
  } catch {}
}

export const useStudioStore = defineStore("studio", {
  state: () => {
    const loaded = load();
    return {
      cast: loaded?.cast || { ...DEFAULT_CAST },
      voices: loaded?.voices || [...SAMPLE_VOICES],
      // Merge stored scripts over the seed so the demo ch7 script is
      // always available even on a fresh install.
      scripts: { ch7: [...SCRIPT_CH7], ...(loaded?.scripts || {}) },
      renderQueue: [...RENDER_QUEUE],
      // Session-only — Blob URLs don't survive reload. Keyed by chapter id.
      // Shape: { url, blob, duration }.
      chapterAudio: {},
    };
  },

  getters: {
    voiceById: (s) => (id) => s.voices.find((v) => v.id === id),
    voicesByProvider: (s) => (providerId) => s.voices.filter((v) => v.providerId === providerId),
    castedFor: (s) => (charId) => s.cast.characters[charId] || null,
    narratorVoice: (s) => s.cast.narrator,
    scriptFor: (s) => (chapterId) => s.scripts[chapterId] || null,
    scriptedChapterIds: (s) => Object.keys(s.scripts),
    unassignedCount: (s) => Object.values(s.cast.characters).filter((v) => !v).length,

    /**
     * Map of chapterId → Set<characterId> derived from script analyses.
     * Useful for surfaces that want to know who appears in each chapter
     * without re-running speaker detection: Outline mode, Search, the
     * cast-presence heatmap, Export, etc.
     *
     * Excludes the synthetic "narrator" speaker — callers that care can
     * read `narratorByChapter` instead.
     */
    speakersByChapter: (s) => {
      const out = {};
      for (const [chapterId, lines] of Object.entries(s.scripts)) {
        const set = new Set();
        for (const l of lines || []) {
          if (l.speaker && l.speaker !== "narrator") set.add(l.speaker);
        }
        out[chapterId] = set;
      }
      return out;
    },

    /** Set<chapterId> of chapters that have a stored script analysis. */
    chaptersWithScripts: (s) => new Set(Object.keys(s.scripts)),
  },

  actions: {
    clearCast() {
      this.cast = { narrator: null, characters: {} };
      save(this.$state);
    },
    setNarrator(voiceId) {
      this.cast = { ...this.cast, narrator: voiceId };
      save(this.$state);
    },
    assignVoice(charId, voiceId) {
      this.cast = {
        ...this.cast,
        characters: { ...this.cast.characters, [charId]: voiceId },
      };
      save(this.$state);
    },
    setVoices(voices) {
      this.voices = voices;
      save(this.$state);
    },
    mergeVoices(more) {
      const ids = new Set(this.voices.map((v) => v.id));
      const additions = more.filter((v) => !ids.has(v.id));
      this.voices = [...this.voices, ...additions];
      save(this.$state);
    },
    setScript(chapterId, lines) {
      this.scripts = { ...this.scripts, [chapterId]: lines };
      save(this.$state);
    },
    clearScript(chapterId) {
      const next = { ...this.scripts };
      delete next[chapterId];
      this.scripts = next;
      save(this.$state);
    },
    setChapterAudio(chapterId, audio) {
      // audio = { url, blob, duration } or null to clear
      const next = { ...this.chapterAudio };
      if (audio) next[chapterId] = audio;
      else delete next[chapterId];
      this.chapterAudio = next;
    },
    clearAllAudio() {
      // Revoke object URLs to free memory.
      for (const a of Object.values(this.chapterAudio)) {
        if (a?.url) URL.revokeObjectURL(a.url);
      }
      this.chapterAudio = {};
    },
  },
});

