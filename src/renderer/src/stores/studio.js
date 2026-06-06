// Studio store — cast assignments, script analyses, render queue.

import { defineStore } from "pinia";
import { DEFAULT_CAST, SCRIPT_CH7, RENDER_QUEUE, STARTER_RENDER_PRESETS } from "../domain/seed.js";
import { getItem, setItem } from "../services/storage.js";
import * as audioStore from "../services/audioStore.js";

const LS_KEY = "justwrite:studio";

function load() {
  try {
    return JSON.parse(getItem(LS_KEY) || "null");
  } catch { return null; }
}

// Decide whether to drop the starter render presets into a workspace.
// Three cases produce true:
//   - Brand-new install (no studio state at all).
//   - Upgrade from a pre-Phase-2 version (renderPresets field missing
//     entirely from the saved blob).
//   - Upgrade from Phase 2 but the writer never created a preset (empty
//     array AND the seed flag never flipped — this is the "one-time
//     backfill" path).
// Once defaultPresetsSeeded is true we never re-seed, so a writer who
// intentionally deletes every starter doesn't see them come back on
// the next launch.
function needsStarterPresets(loaded) {
  if (!loaded) return true;
  if (loaded.defaultPresetsSeeded) return false;
  return !loaded.renderPresets || loaded.renderPresets.length === 0;
}
function save(state) {
  try {
    // Scripts go on disk too — speaker-detection results survive reload.
    // chapterAudio: only file-kind records (path on disk) get persisted;
    // blob-kind records die with the session because object URLs and
    // Blobs can't survive a reload.
    const persistedAudio = {};
    for (const [k, a] of Object.entries(state.chapterAudio || {})) {
      if (a?.kind === "file" && a?.path) {
        persistedAudio[k] = {
          kind: "file",
          projectId: a.projectId,
          chapterId: a.chapterId,
          path: a.path,
          size: a.size,
          duration: a.duration,
          version: a.version,
        };
      }
    }
    setItem(LS_KEY, JSON.stringify({
      cast: state.cast,
      voices: state.voices,
      scripts: state.scripts,
      corrections: state.corrections,
      lastScriptChapter: state.lastScriptChapter,
      chapterAudio: persistedAudio,
      renderPresets: state.renderPresets,
      chapterPresets: state.chapterPresets,
      defaultPresetsSeeded: state.defaultPresetsSeeded,
    }));
  } catch {}
}

export const useStudioStore = defineStore("studio", {
  state: () => {
    const loaded = load();
    return {
      cast: loaded?.cast || { ...DEFAULT_CAST },
      // Fresh projects start empty; live discovery (`listVoices` in StudioView)
      // populates from each ready provider's /v1/audio/voices or its static
      // ttsVoices list. Existing projects keep their persisted voices.
      voices: loaded?.voices || [],
      // Merge stored scripts over the seed so the demo ch7 script is
      // always available even on a fresh install.
      scripts: { ch7: [...SCRIPT_CH7], ...(loaded?.scripts || {}) },
      renderQueue: [...RENDER_QUEUE],
      // Keyed by chapter id. File-kind records (Tauri builds) survive
      // reload via the persistence path above — they point at a WAV in
      // $APPDATA/audio/<projectId>/. Blob-kind records (browser dev
      // path) are session-only because object URLs die with the page.
      // Shape: { kind, chapterId, duration, path?, size?, version?,
      //          blob?, url? }.
      chapterAudio: loaded?.chapterAudio || {},
      // Which chapter the Script tab was last viewing. Restored on
      // mount so opening Studio → Script lands you where you left off.
      // Null until the user has actually picked one.
      lastScriptChapter: loaded?.lastScriptChapter || null,
      // Per-project speaker-attribution corrections. Each entry records
      // a human override of a script line's speaker; the most recent
      // ones are fed back into the speaker-detection prompt on the next
      // Re-analyze as few-shot examples ("here are lines you got wrong
      // last time and what they should have been").
      // Shape: { characterId, textSnippet, originalSpeaker, chapterId, ts }.
      // Cap is enforced in editScriptLine.
      corrections: loaded?.corrections || [],
      // Phase 2 of the audiobook-tuning system: project-level named
      // "render presets" that layer engine params on top of the
      // per-voice override on top of the provider default. Stored as
      // { id, name, params } so the writer can save "Tense chapter"
      // and assign it from the Studio Render tab. Chapter assignments
      // live in chapterPresets (chapterId → presetId).
      //
      // Seed semantics: on first install (or first open after Phase 2
      // shipped, for an existing user who hasn't touched the system
      // yet) we drop in a small starter library — Narration / Dramatic
      // Dialogue / Quiet Reflection / Action — pulled from seed.js.
      // `defaultPresetsSeeded` is a one-shot flag: once it's true we
      // never seed again, so deleting the starters is permanent and
      // the writer can't accidentally "lose" their own presets after
      // an upgrade.
      renderPresets: needsStarterPresets(loaded)
        ? [...STARTER_RENDER_PRESETS]
        : (loaded?.renderPresets || []),
      chapterPresets: loaded?.chapterPresets || {},
      defaultPresetsSeeded: loaded?.defaultPresetsSeeded || needsStarterPresets(loaded),
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
    presetById: (s) => (id) => s.renderPresets.find((p) => p.id === id) || null,
    presetForChapter(s) {
      return (chapterId) => {
        const id = s.chapterPresets[chapterId];
        if (!id) return null;
        return s.renderPresets.find((p) => p.id === id) || null;
      };
    },

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
      // Add new voices, AND backfill empty metadata fields on existing ones
      // — so an upgraded inferrer (or a provider that starts returning
      // gender it didn't before) eventually fills in cached voices. Writer
      // overrides via updateVoice still win because we never overwrite a
      // non-empty field.
      const byId = new Map(this.voices.map((v) => [v.id, v]));
      const fillFields = ["gender", "accent", "tone", "age"];
      for (const incoming of more) {
        const existing = byId.get(incoming.id);
        if (!existing) {
          byId.set(incoming.id, incoming);
          continue;
        }
        let patched = existing;
        for (const k of fillFields) {
          if (!existing[k] && incoming[k]) {
            patched = patched === existing ? { ...existing } : patched;
            patched[k] = incoming[k];
          }
        }
        if (patched !== existing) byId.set(incoming.id, patched);
      }
      this.voices = Array.from(byId.values());
      save(this.$state);
    },
    // Patch a single voice. Used by the voice library's click-to-cycle
    // gender chip — and any future per-voice editor.
    updateVoice(id, patch) {
      this.voices = this.voices.map((v) => v.id === id ? { ...v, ...patch } : v);
      save(this.$state);
    },
    setScript(chapterId, lines) {
      this.scripts = { ...this.scripts, [chapterId]: lines };
      save(this.$state);
    },
    // Patch a single line in a chapter's script. Used by the Script tab's
    // editable speaker dropdown. When the speaker actually changes on a
    // dialogue line, also push an entry onto `corrections` so the next
    // Re-analyze can use it as a few-shot example. Re-analyze itself
    // overwrites scripts wholesale, so the correction memory is what
    // persists the human's judgement across runs.
    editScriptLine(chapterId, lineIdx, patch) {
      const lines = this.scripts[chapterId];
      if (!Array.isArray(lines) || !lines[lineIdx]) return;
      const prev = lines[lineIdx];
      const next = { ...prev, ...patch };
      const nextLines = lines.slice();
      nextLines[lineIdx] = next;
      this.scripts = { ...this.scripts, [chapterId]: nextLines };

      const changed = patch.speaker != null && patch.speaker !== prev.speaker;
      if (changed && prev.kind === "dialogue" && next.speaker !== "unknown") {
        const snippet = String(next.text || "").slice(0, 240);
        const entry = {
          characterId: next.speaker,
          textSnippet: snippet,
          originalSpeaker: prev.speaker,
          chapterId,
          ts: 0, // Date.now() is unavailable in some contexts; rough ordering by array position suffices
        };
        // Drop any older correction for the same snippet — keeps the memory tidy
        // if the writer toggles the same line back and forth.
        const filtered = this.corrections.filter(
          (c) => !(c.chapterId === chapterId && c.textSnippet === snippet),
        );
        // Cap at 200 so the persisted state doesn't grow unbounded across a
        // long-running project. Oldest entries fall off first.
        const MAX = 200;
        const all = [...filtered, entry];
        this.corrections = all.length > MAX ? all.slice(all.length - MAX) : all;
      }
      save(this.$state);
    },
    clearCorrections() {
      this.corrections = [];
      save(this.$state);
    },
    setLastScriptChapter(chapterId) {
      this.lastScriptChapter = chapterId || null;
      save(this.$state);
    },
    clearScript(chapterId) {
      const next = { ...this.scripts };
      delete next[chapterId];
      this.scripts = next;
      save(this.$state);
    },
    // ── Render presets (Phase 2 audiobook tuning) ─────────────────────
    // Ids are slugged from the name; name collisions are handled by
    // appending -2, -3, ... since we can't use Date.now() / Math.random
    // for stable persistence-friendly ids (both blocked in this codebase
    // for resume reasons).
    addRenderPreset({ name, params } = {}) {
      const clean = name?.trim();
      if (!clean) return null;
      const baseId = clean.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "preset";
      let id = baseId;
      let n = 2;
      while (this.renderPresets.some((p) => p.id === id)) {
        id = `${baseId}-${n}`;
        n += 1;
      }
      this.renderPresets = [...this.renderPresets, { id, name: clean, params: params || {} }];
      save(this.$state);
      return id;
    },
    updateRenderPreset(id, patch) {
      this.renderPresets = this.renderPresets.map((p) =>
        p.id === id ? { ...p, ...patch, params: patch.params ? { ...patch.params } : p.params } : p,
      );
      save(this.$state);
    },
    removeRenderPreset(id) {
      this.renderPresets = this.renderPresets.filter((p) => p.id !== id);
      // Clear any chapter assignments pointing at the removed preset so
      // a future render falls back to provider+voice defaults instead
      // of silently no-oping against a stale id.
      const next = { ...this.chapterPresets };
      let changed = false;
      for (const [chId, presetId] of Object.entries(next)) {
        if (presetId === id) { delete next[chId]; changed = true; }
      }
      if (changed) this.chapterPresets = next;
      save(this.$state);
    },
    setChapterPreset(chapterId, presetId) {
      const next = { ...this.chapterPresets };
      if (presetId) next[chapterId] = presetId;
      else delete next[chapterId];
      this.chapterPresets = next;
      save(this.$state);
    },

    setChapterAudio(chapterId, audio) {
      // audio = a record from audioStore.saveChapter(), or null to clear.
      const next = { ...this.chapterAudio };
      if (audio) next[chapterId] = audio;
      else delete next[chapterId];
      this.chapterAudio = next;
      save(this.$state);
    },
    clearAllAudio() {
      // Revoke session-only object URLs to free memory. File records'
      // on-disk files are NOT removed here — that's the caller's job
      // (via audioStore.removeChapter / clearProject) so a stray reset
      // doesn't silently delete the writer's rendered audiobook.
      for (const a of Object.values(this.chapterAudio)) {
        if (a?.kind === "blob" && a?.url) URL.revokeObjectURL(a.url);
      }
      this.chapterAudio = {};
      save(this.$state);
    },
    // Used by the project store's purgeFromTrash / emptyTrash. Removes
    // both the on-disk WAV and the in-memory record. Soft-delete to
    // Trash is NOT a caller of this — chapters can be restored, and
    // the writer would be surprised if undeleting brought back the
    // chapter but not its rendered audio.
    async removeChapterAudio(chapterId) {
      const rec = this.chapterAudio[chapterId];
      if (!rec) return;
      await audioStore.removeChapter(rec);
      const next = { ...this.chapterAudio };
      delete next[chapterId];
      this.chapterAudio = next;
      save(this.$state);
    },
    // Used by the project store's deleteProject. Wipes the project's
    // audio directory on disk AND drops every in-memory record that
    // belongs to it (matched by `projectId` on the record itself —
    // path-string matching would break on path normalization).
    async clearProjectAudio(projectId) {
      if (!projectId) return;
      await audioStore.clearProject(projectId);
      const next = {};
      for (const [k, a] of Object.entries(this.chapterAudio)) {
        if (a?.projectId !== projectId) next[k] = a;
        else if (a?.kind === "blob" && a?.url) {
          try { URL.revokeObjectURL(a.url); } catch {}
        }
      }
      this.chapterAudio = next;
      save(this.$state);
    },
  },
});

