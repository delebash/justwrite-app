// E (2026-07-18) — "Fill from book": the sanitizer between the model's reply
// and the character page's fields. The modal trusts sanitizeProfile output
// only, never `parsed` raw — these pin the contract.
// v2 (2026-07-18): the draft also covers identity (gender/pronouns/age/role),
// fear/contradiction/stakes, and physical constants.
import { describe, expect, it } from "vitest";

import { sanitizeProfile } from "../analysis/characterProfile.js";

const MOTIVATION_KEYS = ["contradiction", "fear", "lie", "need", "stakes", "truth", "want"];

describe("sanitizeProfile", () => {
  it("passes clean fields through trimmed", () => {
    const p = sanitizeProfile({
      identity: { gender: " male ", pronouns: "he/him", age: 34, role: "  Prism " },
      oneLiner: "  A galley slave who goes by Orholam. ",
      motivation: { want: "Freedom", need: "Absolution", lie: "He is beyond forgiveness", truth: "Mercy finds him", fear: "Oblivion", contradiction: "Devout yet faithless", stakes: "The Seven Satrapies fall" },
      arc: { start: "Broken", midpoint: "Chooses to row", end: "Free" },
      continuity: { physicalConstants: "One eye, blue-green" },
      backstory: "Once a priest.",
    });
    expect(p.identity).toEqual({ gender: "male", pronouns: "he/him", age: 34, role: "Prism" });
    expect(p.oneLiner).toBe("A galley slave who goes by Orholam.");
    expect(p.motivation.want).toBe("Freedom");
    expect(p.motivation.fear).toBe("Oblivion");
    expect(p.motivation.stakes).toBe("The Seven Satrapies fall");
    expect(p.arc).toEqual({ start: "Broken", midpoint: "Chooses to row", end: "Free" });
    expect(p.continuity.physicalConstants).toBe("One eye, blue-green");
    expect(p.backstory).toBe("Once a priest.");
  });

  it("missing / non-string / garbage fields become empty — the honest-\"\" contract", () => {
    const p = sanitizeProfile({ oneLiner: 42, motivation: { want: null }, arc: "nope" });
    expect(p.oneLiner).toBe("");
    expect(p.motivation).toEqual({ want: "", need: "", lie: "", truth: "", fear: "", contradiction: "", stakes: "" });
    expect(p.arc).toEqual({ start: "", midpoint: "", end: "" });
    expect(p.identity).toEqual({ gender: "", pronouns: "", role: "", age: null });
    expect(p.continuity).toEqual({ physicalConstants: "" });
    expect(p.backstory).toBe("");
    expect(sanitizeProfile(null).oneLiner).toBe("");
  });

  it("age → integer in [0,500] or null; never a garbage value", () => {
    expect(sanitizeProfile({ identity: { age: 29 } }).identity.age).toBe(29);
    expect(sanitizeProfile({ identity: { age: "42 years old" } }).identity.age).toBe(42); // parseInt
    expect(sanitizeProfile({ identity: { age: 40.7 } }).identity.age).toBe(41); // rounded
    expect(sanitizeProfile({ identity: { age: null } }).identity.age).toBeNull();
    expect(sanitizeProfile({ identity: { age: "unknown" } }).identity.age).toBeNull();
    expect(sanitizeProfile({ identity: { age: 9999 } }).identity.age).toBeNull(); // out of range
    expect(sanitizeProfile({ identity: {} }).identity.age).toBeNull();
  });

  it("clamps runaway lengths (oneLiner 400, motivation 300, arc 400, constants 500, backstory 2000)", () => {
    const long = "x".repeat(5000);
    const p = sanitizeProfile({
      oneLiner: long,
      motivation: { want: long, fear: long },
      arc: { start: long },
      continuity: { physicalConstants: long },
      backstory: long,
    });
    expect(p.oneLiner).toHaveLength(400);
    expect(p.motivation.want).toHaveLength(300);
    expect(p.motivation.fear).toHaveLength(300);
    expect(p.arc.start).toHaveLength(400);
    expect(p.continuity.physicalConstants).toHaveLength(500);
    expect(p.backstory).toHaveLength(2000);
  });

  it("never leaks extra keys from the model into the field shape", () => {
    const p = sanitizeProfile({ oneLiner: "ok", evil: "x", identity: { gender: "f", hacked: "!" }, motivation: { want: "y", extra: "z" } });
    expect(Object.keys(p).sort()).toEqual(["arc", "backstory", "continuity", "identity", "motivation", "oneLiner"]);
    expect(Object.keys(p.identity).sort()).toEqual(["age", "gender", "pronouns", "role"]);
    expect(Object.keys(p.motivation).sort()).toEqual(MOTIVATION_KEYS);
    expect(Object.keys(p.continuity)).toEqual(["physicalConstants"]);
  });
});
