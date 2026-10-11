// @vitest-environment jsdom
// The story-context composer (2026-10-11, the AI drafting plan Task 4): the ONE source every
// drafting call reads — the book's frame, then for a scene what is linked to it — built from
// the story-bible cards, honouring Exclude from AI, cut to a token budget by whole pieces.
// jsdom: the card builder strips HTML via document.createElement.
import { describe, expect, it } from "vitest";
import { composeBookContext, composeSceneContext, storyBudgetTokens } from "./storyContext.js";

function project(overrides = {}) {
  const scenes = {
    ch1: [
      { id: "s0", title: "Before", body: `<p>${"Rain on the slates. ".repeat(80)}The door gave.</p>`, characters: [], locations: [], objects: [] },
      {
        id: "s1", title: "The customs house", body: "<p>Aria waited by the ledger desk.</p>",
        characters: ["c_aria", "c_bren"], locations: ["l_customs"], objects: ["o_ledger"], pov: "limited-third",
      },
    ],
  };
  return {
    project: { title: "The Chart", genre: "Literary fantasy", premise: "A mapmaker charts a forbidden coast." },
    worldRules: "Maps can lie.",
    allChapters: [{ id: "ch1", title: "Arrival", num: 1 }],
    scenesFor: (chId) => scenes[chId] || [],
    characters: [
      { id: "c_aria", name: "Aria", main: true, role: "protagonist", aliases: [], oneLiner: "Maps what others fear.", tags: [] },
      { id: "c_bren", name: "Bren", main: false, role: "harbourmaster", aliases: [], tags: [] },
    ],
    characterExtras: { c_aria: { motivation: { want: "the northern chart" } } },
    locations: [{ id: "l_customs", name: "Customs House", kind: "building", note: "Where cargo is declared.", tags: [] }],
    objects: [{ id: "o_ledger", name: "The Ledger", kind: "book", note: "Bound in sealskin.", tags: [] }],
    groups: [],
    notes: [{ id: "n1", title: "Tone", body: "<p>Keep it quiet; the threat stays offstage.</p>", tag: "note", anchor: { chapterId: "ch1", sceneId: "s1" } }],
    strands: [{ id: "st1", name: "The Map Plot", status: "open", blurb: "", body: "", beats: [{ id: "b1", chapterId: "ch1", sceneId: "s1", label: "Chart revealed", note: "Aria sees it" }] }],
    worldbuilding: [],
    worldbuildingCategories: [],
    architecture: {
      premise: { id: "premise", title: "Premise", body: "" },
      fabula: { id: "fabula", title: "Fabula", body: "" },
      setting: { id: "setting", title: "Setting", body: "<p>A cold harbour city under a guild.</p>" },
    },
    events: {},
    ...overrides,
  };
}

describe("storyBudgetTokens", () => {
  it("is the share of the window, rounded down", () => {
    expect(storyBudgetTokens(0.15, 32768)).toBe(4915);
  });
  it("is null — no ceiling — when the window is unknown (a cloud route)", () => {
    expect(storyBudgetTokens(0.15, null)).toBeNull();
  });
  it("is 0 — send nothing — when the share was never seeded", () => {
    expect(storyBudgetTokens(null, 32768)).toBe(0);
  });
});

describe("composeBookContext", () => {
  it("carries the premise, genre, world rules, the Setting and the main cast", () => {
    const r = composeBookContext(project(), { budgetTokens: null });
    expect(r.text).toContain("A mapmaker charts a forbidden coast.");
    expect(r.text).toContain("Literary fantasy");
    expect(r.text).toContain("Maps can lie.");
    expect(r.text).toContain("A cold harbour city under a guild.");
    expect(r.text).toContain("Aria");
    expect(r.names).toEqual(["Premise", "Genre", "World rules", "Setting", "Main cast"]);
    expect(r.tokens).toBe(Math.ceil(r.text.length / 4));
  });

  it("is empty for an empty book — no headings with nothing under them", () => {
    const r = composeBookContext({ project: {}, characters: [], allChapters: [], scenesFor: () => [] }, { budgetTokens: null });
    expect(r).toEqual({ text: "", names: [], tokens: 0 });
  });

  it("sends nothing when the budget is 0", () => {
    expect(composeBookContext(project(), { budgetTokens: 0 }).text).toBe("");
  });
});

describe("composeSceneContext", () => {
  it("adds the scene's POV, beat, notes, linked cards in link order, and the previous scene's end", () => {
    const r = composeSceneContext(project(), { chapterId: "ch1", sceneId: "s1", budgetTokens: null });
    expect(r.text).toContain("Limited third person");
    expect(r.text).toContain("Chart revealed");
    expect(r.text).toContain("Keep it quiet");
    expect(r.text).toContain("Where cargo is declared.");
    expect(r.text).toContain("Bound in sealskin.");
    expect(r.text).toContain("The door gave.");
    expect(r.text.indexOf("Aria")).toBeLessThan(r.text.indexOf("Bren"));
    expect(r.names).toEqual(expect.arrayContaining(["POV", "Beats", "Scene notes", "Aria", "Bren", "Customs House", "The Ledger", "Previous scene"]));
  });

  it("leaves out an entity marked Exclude from AI", () => {
    const p = project();
    p.characters[1].excludeFromAi = true;
    const r = composeSceneContext(p, { chapterId: "ch1", sceneId: "s1", budgetTokens: null });
    expect(r.names).not.toContain("Bren");
    expect(r.text).not.toContain("harbourmaster");
  });

  it("is just the book's frame for a scene with nothing linked", () => {
    const r = composeSceneContext(project(), { chapterId: "ch1", sceneId: "s0", budgetTokens: null });
    expect(r.names).toEqual(["Premise", "Genre", "World rules", "Setting", "Main cast"]);
  });

  it("keeps only whole pieces within the budget, the book's frame first", () => {
    const full = composeSceneContext(project(), { chapterId: "ch1", sceneId: "s1", budgetTokens: null });
    const book = composeBookContext(project(), { budgetTokens: null });
    const r = composeSceneContext(project(), { chapterId: "ch1", sceneId: "s1", budgetTokens: book.tokens + 20 });
    expect(r.tokens).toBeLessThanOrEqual(book.tokens + 20);
    expect(r.names.slice(0, 5)).toEqual(book.names);
    expect(r.names.length).toBeLessThan(full.names.length);
  });

  it("is empty for an unknown scene", () => {
    expect(composeSceneContext(project(), { chapterId: "ch1", sceneId: "nope", budgetTokens: null }).text).toBe("");
  });
});
