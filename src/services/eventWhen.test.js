// An event's "when" on the timelines (services/eventWhen.js, 2026-10-28): the picker stores 00:00 when
// only a date is picked, so midnight shows the date alone; any other time shows; text that isn't a
// date shows as typed; the sort key is the moment, null without one.
import { describe, expect, it } from "vitest";
import { formatWhen, parseWhen } from "./eventWhen.js";

describe("an event's when", () => {
  it("shows the date alone at midnight, the time otherwise", () => {
    const dateOnly = formatWhen("1826-09-12T00:00");
    expect(dateOnly.time).toBe("");
    expect(dateOnly.date).toMatch(/1826/);
    expect(dateOnly.weekday).not.toBe("");
    expect(formatWhen("1826-09-12T14:30").time).not.toBe("");
    expect(formatWhen("1826-09-12T00:05").time).not.toBe("");
  });

  it("shows text that isn't a date as typed, and a dash for none", () => {
    expect(formatWhen("the long winter")).toEqual({ weekday: "", date: "the long winter", time: "" });
    expect(formatWhen("")).toEqual({ weekday: "", date: "—", time: "" });
  });

  it("sorts by the moment; none or unreadable is null", () => {
    expect(parseWhen("1699-01-01T00:00")).toBeLessThan(parseWhen("1802-06-01T00:00"));
    expect(parseWhen("")).toBeNull();
    expect(parseWhen("the long winter")).toBeNull();
  });
});
