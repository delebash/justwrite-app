// ============================================================
// sessions.js — daily word-count tracker, server-backed (/v1/sessions).
//
// Hydrates from the server at boot (await boot() before mount), so the
// synchronous getters have data and the per-chapter checkpoints are loaded
// before the first edit can attribute a delta. Each chapter word-count change
// attributes the positive delta to *today*; the server owns the authoritative
// delta (diffs its stored checkpoint), so a debounced POST of only the latest
// count per chapter can't double-count.
//
// State:
//   days:        { 'yyyy-mm-dd': words }   // full history (a real table now)
//   chapterWords:{ chapterId: lastCount }  // delta checkpoints
//   lastWrite:   { chapterId, day } | null // today's chapter pointer
// ============================================================

import { defineStore } from "pinia";

import { clearSessions, getSessions, recordSession } from "../services/sessionsApi.js";

// yyyy-mm-dd in local time so "today" matches the user's clock, not UTC.
function todayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function dayKeyOffset(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return todayKey(d);
}

// Debounced flush of the latest word count per chapter. The server computes
// the delta from its checkpoint, so sending only the most recent count (not
// every keystroke's delta) is correct and collapses a typing burst into one PUT.
const _pending = new Map(); // chapterId -> { words, day }
const _timers = new Map();
const FLUSH_MS = 400;

function _scheduleFlush(chapterId) {
  if (_timers.has(chapterId)) clearTimeout(_timers.get(chapterId));
  _timers.set(chapterId, setTimeout(() => {
    _timers.delete(chapterId);
    const p = _pending.get(chapterId);
    _pending.delete(chapterId);
    if (p) recordSession({ chapterId, words: p.words, day: p.day });
  }, FLUSH_MS));
}

export const useSessionsStore = defineStore("sessions", {
  state: () => ({
    days: {},
    chapterWords: {},
    // { chapterId, day } — the chapter that last received a positive delta.
    lastWrite: null,
    _booted: false,
  }),

  getters: {
    todayWords: (s) => s.days[todayKey()] || 0,

    // The chapter written in today, or null if nothing was written today.
    todayChapterId: (s) =>
      s.lastWrite && s.lastWrite.day === todayKey() ? s.lastWrite.chapterId : null,

    // Longest consecutive day-streak with non-zero words, ending today (today
    // counts if it has any words; otherwise we start from yesterday so the
    // streak isn't lost mid-day).
    streak: (s) => {
      let n = 0;
      const includeToday = (s.days[todayKey()] || 0) > 0;
      let cursor = includeToday ? 0 : -1;
      while ((s.days[dayKeyOffset(cursor)] || 0) > 0) { n++; cursor--; }
      return n;
    },

    // All-time totals across the full daily history (a real table holds every
    // day now, so no monthly archive is needed).
    allTimeTotals: (s) => {
      let totalWords = 0;
      let writingDays = 0;
      for (const w of Object.values(s.days)) {
        if (w > 0) { totalWords += w; writingDays++; }
      }
      return { totalWords, writingDays };
    },
  },

  actions: {
    /** Hydrate from the server. MUST be awaited before mounting Vue. */
    async boot() {
      if (this._booted) return;
      try {
        const data = await getSessions();
        this.days = data.days || {};
        this.chapterWords = data.chapterWords || {};
        this.lastWrite = data.lastWrite || null;
      } catch (err) {
        console.error("sessions.boot failed:", err);
      }
      this._booted = true;
    },

    /**
     * Note a chapter's new word count. Attributes the positive delta vs the
     * last-known count to today (optimistically, for instant getters); the
     * server re-derives the same delta authoritatively on flush. Negative
     * deltas (deletions) are NOT subtracted.
     */
    recordChapterWords(chapterId, words) {
      const prev = this.chapterWords[chapterId] || 0;
      const delta = Math.max(0, words - prev);
      this.chapterWords = { ...this.chapterWords, [chapterId]: words };
      if (delta > 0) {
        const key = todayKey();
        this.days = { ...this.days, [key]: (this.days[key] || 0) + delta };
        this.lastWrite = { chapterId, day: key };
      }
      _pending.set(chapterId, { words, day: todayKey() });
      _scheduleFlush(chapterId);
    },

    /**
     * Last `n` days oldest-first, padded with zeros so length is always `n`.
     * Item shape: { date, words, dow: 0..6 }.
     */
    historyFor(n = 14) {
      const out = [];
      for (let i = n - 1; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const key = todayKey(date);
        out.push({ date: key, words: this.days[key] || 0, dow: date.getDay() });
      }
      return out;
    },

    /** Average words per weekday across all recorded daily entries. */
    averageByDow() {
      const sums = [0, 0, 0, 0, 0, 0, 0];
      const counts = [0, 0, 0, 0, 0, 0, 0];
      for (const [key, w] of Object.entries(this.days)) {
        const [y, m, d] = key.split("-").map(Number);
        const dow = new Date(y, m - 1, d).getDay();
        sums[dow] += w;
        counts[dow]++;
      }
      return sums.map((s, i) => (counts[i] ? Math.round(s / counts[i]) : 0));
    },

    /** Aggregate stats over the last `n` days. */
    totalsBy(n = 14) {
      const series = this.historyFor(n);
      const total = series.reduce((a, b) => a + b.words, 0);
      const peak = series.reduce((m, b) => Math.max(m, b.words), 0);
      return { total, peak, avg: series.length ? Math.round(total / series.length) : 0 };
    },

    /** Wipe the session log (Settings → reset). */
    async reset() {
      for (const t of _timers.values()) clearTimeout(t);
      _timers.clear();
      _pending.clear();
      this.days = {};
      this.chapterWords = {};
      this.lastWrite = null;
      await clearSessions();
    },
  },
});

// "M T W T F S S" with Monday first — for the day-of-week chart.
export const DOW_LABELS_MONDAY_FIRST = ["M", "T", "W", "T", "F", "S", "S"];
export function reorderForMonday(sundayFirst) {
  return [...sundayFirst.slice(1), sundayFirst[0]];
}
