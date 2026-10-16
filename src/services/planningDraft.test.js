// @vitest-environment jsdom
// Slice 3's AI planning (2026-10-16): a scene's Summary from its prose, a plot template's beats for
// this book, a strand's next beats / twists, the Fabula or Setting from the premise — the composed
// inputs, the review rows, and the calls with the model stubbed. jsdom: HTML is read via
// document.createElement.
import { describe, expect, it, vi } from "vitest";

const runJsonAnalysis = vi.fn();
vi.mock("./runJson.js", () => ({ runJsonAnalysis: (...a) => runJsonAnalysis(...a) }));
const runAiFeature = vi.fn();
vi.mock("@delebash/llm-ui", () => ({ runAiFeature: (...a) => runAiFeature(...a) }));

const {
  cleanSummary, composePremiseDraftInput, composeSceneIdeasInput, composeSceneSummaryInput, composeStrandIdeasInput,
  composeTemplateFillInput, draftFromPremise, fillTemplate, sceneIdeas, strandIdeas, summarizeScene, templateBeats,
  templateOfStrand,
} = await import("./analysis/planningDraft.js");

// The templates as the plot board has them, words by key (tr is the identity on the key's last part).
const tr = (key) => key.split(".").slice(-2).join(".");
const TEMPLATES = {
  "three-act": {
    labelKey: "x.threeAct.label", blurbKey: "x.threeAct.blurb",
    beats: [
      { labelKey: "hook.label", noteKey: "hook.note" },
      { labelKey: "midpoint.label", noteKey: "midpoint.note" },
      { labelKey: "climax.label", noteKey: "climax.note" },
    ],
  },
};

function project() {
  const scenes = {
    ch1: [
      { id: "s1", title: "The key", body: "<p>Mira turns the key.</p><p>The ledger is gone.</p>", pov: "limited-third", characters: ["c1"], locations: ["l1"], objects: [], summary: "" },
      { id: "s2", title: "", body: "", characters: [], locations: [], objects: [], summary: "Old plan." },
    ],
  };
  return {
    project: { genre: "Literary mystery", premise: "A harbor archivist unpicks who altered her father's ledger." },
    allChapters: [{ id: "ch1", num: 3, title: "The Ledger" }],
    scenesFor: (id) => scenes[id] || [],
    characters: [{ id: "c1", name: "Mira", main: true, tags: [] }],
    characterExtras: {},
    locations: [{ id: "l1", name: "The archive", kind: "", note: "", tags: [] }],
    objects: [], groups: [], notes: [], worldbuilding: [], worldbuildingCategories: [], events: {},
    strands: [{
      id: "st1", name: "Main plot", blurb: "", beats: [
        { id: "b1", label: "hook.label", note: "hook.note" },
        { id: "b2", label: "midpoint.label", note: "The ledger was altered twice." },
        { id: "b3", label: "climax.label", note: "" },
        { id: "b4", label: "A beat of my own", note: "" },
      ],
    }],
    architecture: { fabula: { id: "fabula", body: "<p>First draft.</p>" }, setting: { id: "setting", body: "" } },
  };
}

describe("a scene's Summary", () => {
  it("composes the scene's place and links, then its prose", () => {
    const { variables, hasProse } = composeSceneSummaryInput(project(), "ch1", "s1");
    expect(hasProse).toBe(true);
    expect(variables.user_content).toBe(
      'THE SCENE\nChapter 3 "The Ledger"\nScene 1 "The key"\nNarration: Limited third person\nCharacters: Mira\nLocations: The archive\n\n' +
      "THE PROSE\nMira turns the key.\nThe ledger is gone.",
    );
  });

  it("cleans a reply to one clamped line", () => {
    expect(cleanSummary('Summary: "Mira finds\nthe ledger gone."')).toBe("Mira finds the ledger gone.");
    expect(cleanSummary("x".repeat(900))).toHaveLength(600);
  });

  it("refuses a scene with no prose; drafts one with the Planning feature", async () => {
    await expect(summarizeScene({ project: project(), chapterId: "ch1", sceneId: "s2" })).rejects.toThrow();
    runAiFeature.mockResolvedValueOnce({ content: "Mira finds the ledger gone.", model: "m" });
    expect(await summarizeScene({ project: project(), chapterId: "ch1", sceneId: "s1" })).toEqual({ summary: "Mira finds the ledger gone.", model: "m" });
    const opts = runAiFeature.mock.calls.at(-1)[0];
    expect([opts.action, opts.feature]).toEqual(["sceneSummary", "planning"]);
  });
});

describe("Fill this template for my story", () => {
  it("knows a strand applied from a template by its beats, and not one without", () => {
    expect(templateOfStrand(project().strands[0], TEMPLATES, tr)).toBe(TEMPLATES["three-act"]);
    expect(templateOfStrand({ beats: [{ label: "hook.label" }] }, TEMPLATES, tr)).toBeNull();
    expect(templateBeats(project().strands[0], TEMPLATES["three-act"], tr).map((b) => b.beat.id)).toEqual(["b1", "b2", "b3"]);
  });

  it("composes the book, the structure and each beat with what it asks for", () => {
    const { variables } = composeTemplateFillInput(project(), project().strands[0], TEMPLATES["three-act"], { budgetTokens: null, tr });
    expect(variables.user_content).toContain("THE STRUCTURE\nthreeAct.label — threeAct.blurb");
    expect(variables.user_content).toContain("BEATS TO FILL\n- beat1 — hook.label: hook.note\n- beat2 — midpoint.label: midpoint.note\n- beat3 — climax.label: climax.note");
  });

  it("rows: a template note counts as unwritten and comes ticked; the writer's own note doesn't", async () => {
    runJsonAnalysis.mockResolvedValueOnce({ parsed: { beat1: "Mira finds a torn page.", beat2: "A second hand in the ledger.", beat3: "", beat9: "x" } });
    // fillTemplate reads the words through the app's i18n, which answers a key it doesn't have
    // with the key itself — so these test templates' keys match the beats' labels as they are.
    const rows = await fillTemplate({ project: project(), strandId: "st1", templates: TEMPLATES, budgetTokens: null });
    expect(rows).toEqual([
      { key: "b1", label: "hook.label", current: "", proposed: "Mira finds a torn page.", accept: true },
      { key: "b2", label: "midpoint.label", current: "The ledger was altered twice.", proposed: "A second hand in the ledger.", accept: false },
    ]);
  });
});

describe("a strand's next beats and twists", () => {
  it("asks Brainstorm's plot category with the strand and its beats", () => {
    const r = composeStrandIdeasInput(project(), project().strands[0], "twist", { budgetTokens: null });
    expect(r.action).toBe("brainstormPlot");
    expect(r.variables.kind).toMatch(/twists/);
    expect(r.variables.user_content).toContain("THE STRAND\nName: Main plot");
    expect(r.variables.user_content).toContain("ITS BEATS SO FAR\n- hook.label — hook.note");
    expect(r.variables.user_content).toContain("Seed: twists for the strand in THE STRAND, after its last beat");
  });

  it("rows: one per fresh idea, unticked, never a beat the strand has", async () => {
    runAiFeature.mockResolvedValueOnce({ content: "1. The archive floods\n2. A beat of my own\n3. Tomas lies about the key", model: "m" });
    const rows = await strandIdeas({ project: project(), strandId: "st1", category: "next_beat", budgetTokens: null });
    expect(rows.map((r) => [r.proposed, r.accept, r.label])).toEqual([["The archive floods", false, ""], ["Tomas lies about the key", false, ""]]);
  });
});

describe("next beats and twists at the cursor", () => {
  it("asks Brainstorm's plot category with the scene's story context and the prose so far", () => {
    const r = composeSceneIdeasInput(project(), { chapterId: "ch1", sceneId: "s1", category: "next_beat", proseTail: "Mira turns the key.", seen: ["Old idea"], budgetTokens: null });
    const c = r.variables.user_content;
    expect(r.action).toBe("brainstormPlot");
    expect(r.variables.kind).toMatch(/next plot beats/);
    expect(c.indexOf("STORY CONTEXT\n")).toBe(0);
    expect(c).toContain("## Premise");
    expect(c).toContain("THE STORY SO FAR\nMira turns the key.");
    expect(c).toContain("Seed: next beats from where THE STORY SO FAR ends, fitting STORY CONTEXT");
    expect(c).toContain("Avoid repeating any of these already-seen suggestions:\n- Old idea");
  });

  it("returns the fresh ideas, under Brainstorm, never one already shown", async () => {
    runAiFeature.mockResolvedValueOnce({ content: "1. The archive floods\n2. Old idea\n- Tomas lies about the key", model: "m" });
    const ideas = await sceneIdeas({ project: project(), chapterId: "ch1", sceneId: "s1", category: "twist", proseTail: "x", seen: ["Old idea"], budgetTokens: null });
    expect(ideas).toEqual(["The archive floods", "Tomas lies about the key"]);
    const opts = runAiFeature.mock.calls.at(-1)[0];
    expect([opts.action, opts.feature, opts.meta.kind]).toEqual(["brainstormPlot", "brainstorm", "scene-twist"]);
  });
});

describe("Draft from the premise", () => {
  it("composes the book, the document's name and purpose, and what it says now", () => {
    const c = composePremiseDraftInput(project(), "fabula", { title: "Fabula", purpose: "The events in order.", budgetTokens: null }).variables.user_content;
    expect(c.indexOf("BOOK CONTEXT")).toBe(0);
    expect(c).toContain("THE DOCUMENT\nName: Fabula\nWhat it is for: The events in order.");
    expect(c.trim().endsWith("WHAT IT SAYS NOW\nFirst draft.")).toBe(true);
    expect(composePremiseDraftInput(project(), "setting", { title: "Setting" }).variables.user_content).not.toContain("WHAT IT SAYS NOW");
  });

  it("returns the draft as editor HTML, under Planning", async () => {
    runAiFeature.mockResolvedValueOnce({ content: "Mira's father dies.\n\nThe ledger changes hands.", model: "m" });
    const r = await draftFromPremise({ project: project(), docId: "fabula", title: "Fabula", budgetTokens: null });
    expect(r.html).toBe("<p>Mira's father dies.</p><p>The ledger changes hands.</p>");
    expect(runAiFeature.mock.calls.at(-1)[0].action).toBe("premiseDraft");
  });
});
