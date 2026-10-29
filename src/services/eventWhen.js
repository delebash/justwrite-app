// An event's "when" — DateTimePicker's local "YYYY-MM-DDThh:mm" — as the timelines show and sort it:
// the project's Timeline (TimelinePage.vue) and an entity's Events (EventsTimelinePage.vue), which
// each kept their own copy until 2026-10-28. Midnight shows no time: the picker stores 00:00 when
// only a date is picked, so it reads as a date, the way a calendar shows an all-day item.
import { d as fmtDate } from "../i18n/index.js";

/** The moment, for sorting — null when there is none or it doesn't parse. */
export function parseWhen(when) {
  if (!when) return null;
  const t = new Date(when).getTime();
  return Number.isFinite(t) ? t : null;
}

/** `{ weekday, date, time }` for display — `time` "" at midnight; text that isn't a date as typed. */
export function formatWhen(when) {
  if (!when) return { weekday: "", date: "—", time: "" };
  const d = new Date(when);
  if (Number.isNaN(d.getTime())) return { weekday: "", date: when, time: "" };
  const midnight = d.getHours() === 0 && d.getMinutes() === 0;
  return {
    weekday: fmtDate(d, { weekday: "long" }),
    date: fmtDate(d, { month: "2-digit", day: "2-digit", year: "numeric" }),
    time: midnight ? "" : fmtDate(d, "time"),
  };
}
