// E (2026-07-18) — "Fill from book": the sanitizer between the model's reply
// and the character page's fields. The modal trusts sanitizeProfile output
// only, never `parsed` raw — these pin the contract.
import { describe, expect, it } from "vitest";

import { sanitizeProfile } from "../analysis/characterProfile.js";

describe("sanitizeProfile", () => {
  it("passes clean fields through trimmed", () => {
    const p = sanitizeProfile({
      oneLiner: "  A galley slave who goes by Orholam. ",
      motivation: { want: "Freedom", need: "Absolution", lie: "He is beyond forgiveness", truth: "Mercy finds him" },
      arc: { start: "Broken", midpoint: "Chooses to row", end: "Free" },
      backstory: "Once a priest.",
    });
    expect(p.oneLiner).toBe("A galley slave who goes by Orholam.");
    expect(p.motivation).toEqual({ want: "Freedom", need: "Absolution", lie: "He is beyond forgiveness", truth: "Mercy finds him" });
    expect(p.arc).toEqual({ start: "Broken", midpoint: "Chooses to row", end: "Free" });
    expect(p.backstory).toBe("Once a priest.");
  });

  it("missing / non-string / garbage fields become empty strings — the honest-\"\" contract", () => {
    const p = sanitizeProfile({ oneLiner: 42, motivation: { want: null }, arc: "nope" });
    expect(p.oneLiner).toBe("");
    expect(p.motivation).toEqual({ want: "", need: "", lie: "", truth: "" });
    expect(p.arc).toEqual({ start: "", midpoint: "", end: "" });
    expect(p.backstory).toBe("");
    expect(sanitizeProfile(null).oneLiner).toBe("");
  });

  it("clamps runaway lengths (oneLiner 400, motivation 300, arc 400, backstory 2000)", () => {
    const long = "x".repeat(5000);
    const p = sanitizeProfile({ oneLiner: long, motivation: { want: long }, arc: { start: long }, backstory: long });
    expect(p.oneLiner).toHaveLength(400);
    expect(p.motivation.want).toHaveLength(300);
    expect(p.arc.start).toHaveLength(400);
    expect(p.backstory).toHaveLength(2000);
  });

  it("never leaks extra keys from the model into the field shape", () => {
    const p = sanitizeProfile({ oneLiner: "ok", evil: "x", motivation: { want: "y", extra: "z" } });
    expect(Object.keys(p).sort()).toEqual(["arc", "backstory", "motivation", "oneLiner"]);
    expect(Object.keys(p.motivation).sort()).toEqual(["lie", "need", "truth", "want"]);
  });
});
