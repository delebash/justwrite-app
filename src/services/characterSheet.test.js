// The character sheet's one source of sections and fields (2026-10-11): the counts the page
// shows, the describe box's "thin" rule, and the review-row defs a section draft builds.
import { describe, expect, it } from "vitest";
import en from "../i18n/locales/en.json";
import {
  fieldKey,
  fieldLabelKeys,
  isThinCharacter,
  SHEET_SECTIONS,
  sectionCount,
  sectionFieldDefs,
} from "./characterSheet.js";

const lookup = (key) => key.split(".").reduce((o, k) => o?.[k], en);

describe("SHEET_SECTIONS", () => {
  it("has the page's seven sections with their field counts", () => {
    expect(SHEET_SECTIONS.map((s) => [s.key, s.fields.length])).toEqual([
      ["identity", 12], ["arc", 3], ["voice", 15], ["function", 9],
      ["capabilities", 5], ["continuity", 8], ["depth", 7],
    ]);
  });

  it("gives every field a label and a hint in the catalog", () => {
    for (const s of SHEET_SECTIONS) {
      for (const f of s.fields) {
        const k = fieldLabelKeys(f);
        expect(typeof lookup(k.label), k.label).toBe("string");
        expect(typeof lookup(k.hint), k.hint).toBe("string");
      }
    }
  });

  it("keys every field uniquely", () => {
    const keys = SHEET_SECTIONS.flatMap((s) => s.fields.map(fieldKey));
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("counts and the thin rule", () => {
  it("counts filled fields per section, ignoring whitespace", () => {
    const extras = { motivation: { want: "the chart", fear: "  " }, backstory: "Born at sea." };
    expect(sectionCount(extras, "identity")).toBe(1);
    expect(sectionCount(extras, "depth")).toBe(1);
    expect(sectionCount(extras, "nope")).toBe(0);
  });

  it("is thin with no extras, and stops being thin once any field is set", () => {
    expect(isThinCharacter(undefined)).toBe(true);
    expect(isThinCharacter({})).toBe(true);
    expect(isThinCharacter({ capabilities: { limits: "cannot swim" } })).toBe(false);
    expect(isThinCharacter({ backstory: "x" })).toBe(false);
  });
});

describe("sectionFieldDefs", () => {
  it("builds review-row defs with the current value", () => {
    const t = (k) => `T(${k})`;
    const defs = sectionFieldDefs("depth", { backstory: "Born at sea.", depth: { family: "two sisters" } }, t);
    expect(defs[0]).toEqual({ key: "backstory", label: "T(characters.detail.backstory)", hint: "T(characters.detail.backstoryHint)", current: "Born at sea." });
    expect(defs.find((d) => d.key === "depth.family").current).toBe("two sisters");
    expect(defs).toHaveLength(7);
  });
});
