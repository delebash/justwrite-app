// E (2026-07-18) — "Fill from book": the sanitizer between the model's reply
// and the character page's fields. The modal trusts sanitizeProfile output
// only, never `parsed` raw — these pin the contract.
// v2 (2026-07-18): the draft also covers identity (gender/pronouns/age/role),
// fear/contradiction/stakes, and physical constants.
import { describe, expect, it } from "vitest";

import {
  sanitizeProfile, sanitizeVoice,
  profileFieldDefs, voiceFieldDefs, draftRows, emptyOnlyPicks, applyProfileDrafts,
} from "./analysis/characterProfile.js";

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

// WS8 (2026-07-19) — the voice pass: a flat 11-key model reply mapped onto the
// exact extras shape the page edits (sampleCalm → voice.sample, the page's
// pre-v3 calm-sample key; stressTells → presence).
describe("sanitizeVoice", () => {
  it("maps the flat reply onto the page's extras shape", () => {
    const v = sanitizeVoice({
      register: " formal, slips when angry ",
      rhythm: "clipped",
      vocabulary: "chart, reckon, leeward",
      subtext: "answers questions with questions",
      humor: "dry",
      languages: "Trade tongue, old Parian",
      tic: "hm",
      sampleCalm: "Chart it or lose it.",
      sampleAngry: "You had ONE watch.",
      sampleLying: "I was nowhere near the customs house.",
      stressTells: "Goes still; over-precise hands.",
    });
    expect(v.voice.register).toBe("formal, slips when angry");
    expect(v.voice.sample).toBe("Chart it or lose it.");       // calm → the page's `sample` key
    expect(v.voice.sampleAngry).toBe("You had ONE watch.");
    expect(v.voice.sampleLying).toBe("I was nowhere near the customs house.");
    expect(v.presence.stressTells).toBe("Goes still; over-precise hands.");
  });

  it("honest-\"\" for missing / garbage fields, and clamps lengths", () => {
    const empty = sanitizeVoice(null);
    expect(empty.voice.register).toBe("");
    expect(empty.voice.sample).toBe("");
    expect(empty.presence.stressTells).toBe("");
    const long = "x".repeat(1000);
    const v = sanitizeVoice({ register: long, sampleCalm: long, stressTells: long, rhythm: 42 });
    expect(v.voice.register).toHaveLength(200);
    expect(v.voice.sample).toHaveLength(300);
    expect(v.presence.stressTells).toHaveLength(300);
    expect(v.voice.rhythm).toBe("");
  });

  it("never leaks model-invented keys", () => {
    const v = sanitizeVoice({ register: "ok", accent: "cockney", forbidden: "never", evil: "x" });
    expect(Object.keys(v).sort()).toEqual(["presence", "voice"]);
    expect(Object.keys(v.voice).sort()).toEqual(
      ["humor", "languages", "register", "rhythm", "sample", "sampleAngry", "sampleLying", "subtext", "tic", "vocabulary"],
    );
    expect(Object.keys(v.presence)).toEqual(["stressTells"]);
    // accent + forbidden are deliberately NOT drafted (unprovable / rarely stated).
    expect(v.voice.accent).toBeUndefined();
  });
});

// WS-A (2026-07-19) — the shared field-defs + apply layer the single AND batch
// fill modals both use (QC-35: one source).
describe("profileFieldDefs / voiceFieldDefs", () => {
  it("reads current values from the record vs extras", () => {
    const c = { role: "Prism", age: 34, oneLiner: "one" };
    const x = { motivation: { fear: "oblivion" }, voice: { sample: "hi", register: "formal" }, presence: { stressTells: "still" } };
    const pd = Object.fromEntries(profileFieldDefs(c, x).map((d) => [d.key, d.current]));
    expect(pd["identity.role"]).toBe("Prism");
    expect(pd["identity.age"]).toBe("34");            // number → String
    expect(pd.oneLiner).toBe("one");
    expect(pd["motivation.fear"]).toBe("oblivion");
    expect(pd["motivation.want"]).toBe("");           // absent → ""
    const vd = Object.fromEntries(voiceFieldDefs(x).map((d) => [d.key, d.current]));
    expect(vd["voice.sample"]).toBe("hi");
    expect(vd["voice.register"]).toBe("formal");
    expect(vd["presence.stressTells"]).toBe("still");
  });

  it("age current is \"\" when null/absent", () => {
    const defs = profileFieldDefs({ age: null }, {});
    expect(defs.find((d) => d.key === "identity.age").current).toBe("");
  });
});

describe("draftRows + emptyOnlyPicks — the never-overwrite property", () => {
  const defs = [
    { key: "identity.role", label: "Role", current: "Prism" },   // already written
    { key: "oneLiner", label: "Description", current: "" },        // empty
    { key: "motivation.fear", label: "Core fear", current: "" },   // empty
    { key: "motivation.want", label: "Wants", current: "old want" }, // already written
  ];
  const fields = { identity: { role: "Drafted Role" }, oneLiner: "a drafted line", motivation: { fear: "being seen", want: "" } };

  it("draftRows: one row per grounded field, ticked only when current is empty", () => {
    const rows = draftRows(defs, fields);
    // motivation.want left "" by the model → no row; the other three are grounded
    expect(rows.map((r) => r.key)).toEqual(["identity.role", "oneLiner", "motivation.fear"]);
    expect(rows.find((r) => r.key === "identity.role").accept).toBe(false); // has current → unticked
    expect(rows.find((r) => r.key === "oneLiner").accept).toBe(true);       // empty → ticked
    expect(rows.find((r) => r.key === "motivation.fear").accept).toBe(true);
  });

  it("emptyOnlyPicks NEVER selects a field with a non-empty current value", () => {
    const picks = emptyOnlyPicks(defs, fields);
    expect(picks.map((p) => p.key)).toEqual(["oneLiner", "motivation.fear"]);
    // identity.role was grounded but had a current value → excluded (never overwrite).
    expect(picks.some((p) => p.key === "identity.role")).toBe(false);
    expect(picks.every((p) => p.proposed)).toBe(true); // empty proposals dropped
  });
});

describe("applyProfileDrafts", () => {
  function mockProject(extras = {}) {
    const calls = { updateCharacter: [], setCharacterExtras: [] };
    return {
      calls,
      characterExtras: { c1: extras },
      updateCharacter: (id, patch) => calls.updateCharacter.push([id, patch]),
      setCharacterExtras: (id, patch) => calls.setCharacterExtras.push([id, patch]),
    };
  }

  it("batches identity + oneLiner into ONE updateCharacter, age as a number", () => {
    const p = mockProject();
    const written = applyProfileDrafts(p, "c1", [
      { key: "identity.role", proposed: "Prism" },
      { key: "identity.age", proposed: "34" },
      { key: "oneLiner", proposed: "a line" },
    ]);
    expect(p.calls.updateCharacter).toHaveLength(1);
    expect(p.calls.updateCharacter[0]).toEqual(["c1", { role: "Prism", age: 34, oneLiner: "a line" }]);
    expect(written).toBe(3);
  });

  it("merges extras groups without clobbering existing siblings", () => {
    const p = mockProject({ motivation: { want: "keep me" }, voice: { accent: "keep me too" } });
    applyProfileDrafts(p, "c1", [
      { key: "motivation.fear", proposed: "being seen" },
      { key: "voice.register", proposed: "formal" },
      { key: "presence.stressTells", proposed: "goes still" },
    ]);
    const patch = Object.assign({}, ...p.calls.setCharacterExtras.map((c) => c[1]));
    expect(patch.motivation).toEqual({ want: "keep me", fear: "being seen" });   // sibling kept
    expect(patch.voice).toEqual({ accent: "keep me too", register: "formal" });  // sibling kept
    expect(patch.presence).toEqual({ stressTells: "goes still" });
  });

  it("age → null when non-numeric; empty picks write nothing", () => {
    const p = mockProject();
    applyProfileDrafts(p, "c1", [{ key: "identity.age", proposed: "unknown" }]);
    expect(p.calls.updateCharacter[0][1]).toEqual({ age: null });
    expect(applyProfileDrafts(p, "c1", [])).toBe(0);
  });
});
