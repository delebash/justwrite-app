// ============================================================
// sessions.js — daily word-count tracker.
//
// Each time a chapter's word total changes, we attribute the
// positive delta to *today*. We keep DAILY granularity for the
// last MAX_DAYS days; anything older gets rolled into a monthly
// archive so the store never grows without bound.
//
// State shape:
//   days:    { 'yyyy-mm-dd': words }     // ≤ MAX_DAYS entries
//   months:  { 'yyyy-mm':    { words, days } }  // archive
//   lastSeen:{ chapterId: lastKnownWordCount }
//
// `months[k].days` is the count of distinct writing days in that
// month (so all-time stats can still compute averages). Daily
// detail older than the cap is lost — by design; a writing app
// doesn't need it.
// ============================================================

import { defineStore } from "pinia";
import { getItem, setItem } from "../services/storage.js";

const LS_KEY = "justwrite:sessions";

// Number of days of full-resolution history we keep. ~13 months covers
// every "trailing year" chart someone might reasonably want; anything
// older is collapsed into the monthly archive.
const MAX_DAYS = 400;

function load() {
  try { return JSON.parse(getItem(LS_KEY) || "null"); }
  catch { return null; }
}
function save(state) {
  try {
    setItem(LS_KEY, JSON.stringify({
      days: state.days,
      months: state.months,
      lastSeen: state.lastSeen,
    }));
  } catch {}
}

// yyyy-mm-dd in local time so "today" matches the user's clock, not UTC.
function todayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function monthKeyOf(dayKey) {
  return dayKey.slice(0, 7);
}
function dayKeyOffset(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return todayKey(d);
}

// True if `key` (yyyy-mm-dd) is strictly older than `cutoff` (also yyyy-mm-dd).
// String comparison works because the format is lexicographically ordered.
function isOlderThan(key, cutoff) {
  return key < cutoff;
}

export const useSessionsStore = defineStore("sessions", {
  state: () => {
    const loaded = load() || {};
    return {
      days: loaded.days || {},
      months: loaded.months || {},
      lastSeen: loaded.lastSeen || {},
    };
  },

  getters: {
    todayWords: (s) => s.days[todayKey()] || 0,

    // Longest consecutive day-streak with non-zero words, ending today
    // (today counts if it has any words, otherwise we start from
    // yesterday so the streak isn't lost mid-day). Bounded by MAX_DAYS
    // since older detail is no longer in `days`.
    streak: (s) => {
      let n = 0;
      const includeToday = (s.days[todayKey()] || 0) > 0;
      let cursor = includeToday ? 0 : -1;
      while (true) {
        const key = dayKeyOffset(cursor);
        if ((s.days[key] || 0) > 0) { n++; cursor--; }
        else break;
        if (n >= MAX_DAYS) break;
      }
      return n;
    },

    /**
     * All-time totals across both daily entries and the monthly archive.
     * Lets dashboards show a real "since you started" figure without
     * keeping every individual day forever.
     */
    allTimeTotals: (s) => {
      let totalWords = 0;
      let writingDays = 0;
      for (const w of Object.values(s.days)) {
        if (w > 0) { totalWords += w; writingDays++; }
      }
      for (const m of Object.values(s.months || {})) {
        totalWords += m.words || 0;
        writingDays += m.days || 0;
      }
      return { totalWords, writingDays };
    },
  },

  actions: {
    /**
     * Note a chapter's new word count. Records the positive delta vs
     * the last-known count as today's session contribution. Negative
     * deltas (deletions) are NOT subtracted — that would let a user
     * trash a chapter and lose their visible progress.
     */
    recordChapterWords(chapterId, words) {
      const prev = this.lastSeen[chapterId] || 0;
      const delta = Math.max(0, words - prev);
      this.lastSeen = { ...this.lastSeen, [chapterId]: words };
      if (delta > 0) {
        const key = todayKey();
        this.days = { ...this.days, [key]: (this.days[key] || 0) + delta };
      }
      // Lazy maintenance — runs in O(days_to_archive) which is 0 on
      // every call except the first one of a new day.
      this._archiveOldDays();
      save(this.$state);
    },

    /**
     * Roll any daily entries older than MAX_DAYS into monthly buckets.
     * Idempotent — running it on already-archived state is a no-op.
     * Safe to call frequently.
     */
    _archiveOldDays() {
      const cutoff = dayKeyOffset(-MAX_DAYS);
      let mutated = false;
      const days = { ...this.days };
      const months = { ...this.months };
      for (const [key, w] of Object.entries(days)) {
        if (!isOlderThan(key, cutoff)) continue;
        if (w > 0) {
          const mk = monthKeyOf(key);
          const cur = months[mk] || { words: 0, days: 0 };
          months[mk] = { words: cur.words + w, days: cur.days + 1 };
        }
        delete days[key];
        mutated = true;
      }
      if (mutated) {
        this.days = days;
        this.months = months;
      }
    },

    /**
     * Return the last `n` days oldest-first, padded with zeros so the
     * length is always `n`. Item shape: { date, words, dow: 0..6 }.
     * If `n > MAX_DAYS` it's clamped — the daily archive doesn't go
     * back any further.
     */
    historyFor(n = 14) {
      const capped = Math.min(n, MAX_DAYS);
      const out = [];
      for (let i = capped - 1; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const key = todayKey(date);
        out.push({ date: key, words: this.days[key] || 0, dow: date.getDay() });
      }
      return out;
    },

    /**
     * Monthly archive as a sorted list — oldest first. Useful for any
     * future "all-time by month" chart.
     */
    archiveMonths() {
      return Object.entries(this.months || {})
        .map(([key, v]) => ({ key, ...v }))
        .sort((a, b) => a.key.localeCompare(b.key));
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
      return sums.map((s, i) => counts[i] ? Math.round(s / counts[i]) : 0);
    },

    /** Aggregate stats over the last `n` days. */
    totalsBy(n = 14) {
      const series = this.historyFor(n);
      const total = series.reduce((a, b) => a + b.words, 0);
      const peak = series.reduce((m, b) => Math.max(m, b.words), 0);
      return {
        total, peak,
        avg: series.length ? Math.round(total / series.length) : 0,
      };
    },

    /** Wipe the session log (settings → reset). */
    reset() {
      this.days = {};
      this.months = {};
      this.lastSeen = {};
      save(this.$state);
    },
  },
});

// Convert the canonical dayKey ordering to "M T W T F S S" with Monday
// first — handy for the day-of-week chart.
export const DOW_LABELS_MONDAY_FIRST = ["M", "T", "W", "T", "F", "S", "S"];
export function reorderForMonday(sundayFirst) {
  return [...sundayFirst.slice(1), sundayFirst[0]];
}

export const SESSIONS_MAX_DAYS = MAX_DAYS;
