// The location, object and group sheets' one source (2026-10-16): the fields as decided (the AI
// drafting spec §9.1), their catalog words, the describe box's "thin" rule and the review-row defs.
import { describe, expect, it } from "vitest";
import en from "../i18n/locales/en.json";
import {
  isThinSheet,
  sheetCount,
  sheetFieldDefs,
  sheetFieldLabelKeys,
  sheetFields,
  STORY_WORLD_SHEETS,
} from "./storyWorldSheet.js";

const lookup = (key) => key.split(".").reduce((o, k) => o?.[k], en);

describe("STORY_WORLD_SHEETS", () => {
  it("has the decided fields, in page order", () => {
    expect(sheetFields("location")).toEqual(["atmosphere", "history"]);
    expect(sheetFields("object")).toEqual(["properties", "history", "whereNow"]);
    expect(sheetFields("group")).toEqual(["goals", "leadership", "history"]);
  });

  it("gives every field a label and a hint in the catalog", () => {
    for (const kind of Object.keys(STORY_WORLD_SHEETS)) {
      for (const k of sheetFields(kind)) {
        const keys = sheetFieldLabelKeys(kind, k);
        expect(typeof lookup(keys.label), keys.label).toBe("string");
        expect(typeof lookup(keys.hint), keys.hint).toBe("string");
      }
    }
  });

  it("refuses an unknown kind", () => {
    expect(() => sheetFields("character")).toThrow(/Unknown story-world sheet/);
  });
});

describe("counts and the thin rule", () => {
  it("counts the filled fields; whitespace isn't filled; the description doesn't count", () => {
    const loc = { note: "<p>A cliff road.</p>", atmosphere: "Salt.", history: "  " };
    expect(sheetCount("location", loc)).toBe(1);
    expect(isThinSheet("location", loc)).toBe(false);
    expect(isThinSheet("location", { note: "<p>A cliff road.</p>" })).toBe(true);
    expect(isThinSheet("group", { blurb: "Three generations.", goals: "" })).toBe(true);
  });
});

describe("sheetFieldDefs", () => {
  it("builds one def per field with its words and current value", () => {
    const t = (key) => `T(${key})`;
    expect(sheetFieldDefs("object", { whereNow: "In the safe." }, t)).toEqual([
      { key: "properties", label: "T(objects.fields.properties.label)", hint: "T(objects.fields.properties.hint)", current: "" },
      { key: "history", label: "T(objects.fields.history.label)", hint: "T(objects.fields.history.hint)", current: "" },
      { key: "whereNow", label: "T(objects.fields.whereNow.label)", hint: "T(objects.fields.whereNow.hint)", current: "In the safe." },
    ]);
  });
});
