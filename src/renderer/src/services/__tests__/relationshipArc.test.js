// WS5 (2026-07-18): the standing per-character dynamic on relationship arcs.
// sanitizeSide is the leaf that guards what lands on an arc's `sides` map.

import { describe, expect, it } from "vitest";

import { sanitizeSide, pairKey } from "@renderer/services/analysis/relationshipArc.js";

describe("sanitizeSide", () => {
  it("trims and clamps the three fields", () => {
    const s = sanitizeSide({ wants: "  the chart back  ", fears: "Y".repeat(400), speaksLike: "clipped" });
    expect(s.wants).toBe("the chart back");
    expect(s.fears.length).toBe(300);
    expect(s.speaksLike).toBe("clipped");
  });

  it("returns null when nothing is grounded", () => {
    expect(sanitizeSide({ wants: "", fears: "   ", speaksLike: "" })).toBeNull();
    expect(sanitizeSide(null)).toBeNull();
    expect(sanitizeSide("nope")).toBeNull();
    expect(sanitizeSide(undefined)).toBeNull();
  });

  it("coerces non-string fields to empty, keeping the grounded ones", () => {
    expect(sanitizeSide({ wants: 42, fears: "his silence", speaksLike: {} })).toEqual({
      wants: "",
      fears: "his silence",
      speaksLike: "",
    });
  });
});

describe("pairKey", () => {
  it("is order-independent (A,B) == (B,A)", () => {
    expect(pairKey("c_b", "c_a")).toBe("c_a::c_b");
    expect(pairKey("c_a", "c_b")).toBe(pairKey("c_b", "c_a"));
    expect(pairKey("", "c_a")).toBe("");
  });
});
