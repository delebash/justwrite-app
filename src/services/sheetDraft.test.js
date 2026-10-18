// @vitest-environment jsdom
// AI drafting on the location, object and group pages and on Worldbuilding (2026-10-16): the
// composed inputs (book context, the entry, the writer's description, the sheet's fields in
// English), the sanitizers (only the sheet's keys, clamped; no reused location names), the apply
// path (only sheet keys, one store call), and the calls with the model stubbed. jsdom: the
// description's HTML is read via document.createElement.
import { describe, expect, it, vi } from "vitest";

const runJsonAnalysis = vi.fn();
vi.mock("./runJson.js", () => ({ runJsonAnalysis: (...a) => runJsonAnalysis(...a) }));
const runAiFeature = vi.fn();
vi.mock("@delebash/ui", () => ({ runAiFeature: (...a) => runAiFeature(...a) }));

const {
  applySheetDrafts, composeArticleInput, composeSheetInput, composeSheetNameIdeasInput, composeSuggestLocationsInput,
  draftArticle, draftSheet, sanitizeLocationSuggestions, sanitizeSheet, sheetDraftDefs, sheetNameIdeasRequest, suggestLocations,
} = await import("./analysis/sheetDraft.js");

function project() {
  return {
    project: { genre: "Literary mystery", premise: "A harbor archivist unpicks who altered her father's ledger." },
    allChapters: [],
    scenesFor: () => [],
    characters: [],
    characterExtras: {},
    locations: [
      { id: "l1", name: "North quay cannery", kind: "Cannery", note: "<p>Shut since the fire.</p>", tags: [], atmosphere: "Salt and soot.", history: "" },
      { id: "l2", name: "The archive", kind: "", note: "", tags: [] },
    ],
    objects: [{ id: "o1", name: "Brass key", kind: "", note: "", tags: [], properties: "", history: "", whereNow: "" }],
    groups: [{ id: "g1", name: "Pilots' Guild", blurb: "<p>They sell safe passage.</p>", members: [], goals: "" }],
    notes: [], strands: [],
    worldbuilding: [{ id: "wb1", title: "Harbor dues", category: "economy", summary: "How cargo is taxed.", body: "<p>Old text.</p>", tags: [] }],
    worldbuildingCategories: [{ id: "economy", label: "Economy" }],
    architecture: {}, events: {},
    applySheetDraft: vi.fn(),
  };
}

describe("the composed sheet input", () => {
  it("carries the book, the entry, the description and the fields, in that order, in English", () => {
    const { action, variables, keys } = composeSheetInput(project(), "location", "l1", "smugglers meet there at low tide");
    const c = variables.user_content;
    const at = (s) => c.indexOf(s);
    expect(action).toBe("locationDraft");
    expect(keys).toEqual(["atmosphere", "history"]);
    expect(at("BOOK CONTEXT")).toBe(0);
    expect(at("THE LOCATION")).toBeGreaterThan(at("BOOK CONTEXT"));
    expect(c).toContain("Name: North quay cannery\nKind: Cannery\nDescription: Shut since the fire.\nAtmosphere & senses: Salt and soot.");
    expect(at("THE WRITER'S DESCRIPTION")).toBeGreaterThan(at("THE LOCATION"));
    expect(c).toContain("FIELDS TO DRAFT\n- atmosphere — Atmosphere & senses: What it's like to be there");
    expect(c.match(/^- (atmosphere|history) — /gm)).toHaveLength(2);
  });

  it("uses a group's blurb as its description, and its own action and keys", () => {
    const { action, variables, keys } = composeSheetInput(project(), "group", "g1", "");
    expect(action).toBe("groupDraft");
    expect(keys).toEqual(["goals", "leadership", "history"]);
    expect(variables.user_content).toContain("THE GROUP\nName: Pilots' Guild\nDescription: They sell safe passage.");
    expect(variables.user_content).not.toContain("THE WRITER'S DESCRIPTION");
  });

  it("refuses an entry that isn't there", () => {
    expect(() => composeSheetInput(project(), "object", "nope", "x")).toThrow(/No object/);
  });

  it("asks for the entry's own description first while it has none", () => {
    const { variables, keys } = composeSheetInput(project(), "location", "l2", "where the ledgers are kept");
    expect(keys).toEqual(["description", "atmosphere", "history"]);
    expect(variables.user_content).toContain("FIELDS TO DRAFT\n- description — Description: What the location is, in a few sentences: its main description.\n- atmosphere — ");
    expect(variables.user_content).not.toMatch(/^Description: /m);
  });

  it("lists the description's review row under the page's label, only while it's empty", () => {
    const t = (k) => `[${k}]`;
    const p = project();
    expect(sheetDraftDefs("group", { ...p.groups[0], blurb: "" }, t)[0]).toEqual({ key: "description", label: "[groups.blurbPlaceholder]", current: "" });
    expect(sheetDraftDefs("location", p.locations[1], t)[0].label).toBe("[common.description]");
    expect(sheetDraftDefs("location", p.locations[0], t).map((d) => d.key)).toEqual(["atmosphere", "history"]);
  });
});

describe("sanitizers and apply", () => {
  it("keeps exactly the sheet's keys, as trimmed, capped strings", () => {
    const out = sanitizeSheet({ properties: "  brass  ", history: 7, extra: "dropped", whereNow: "x".repeat(2000) }, ["properties", "history", "whereNow"]);
    expect(out).toEqual({ properties: "brass", history: "", whereNow: "x".repeat(1200) });
  });

  it("applies only the sheet's keys, in one store call", () => {
    const p = project();
    const n = applySheetDrafts(p, "object", "o1", [
      { key: "properties", proposed: " Warm brass. " }, { key: "name", proposed: "Hijacked" }, { key: "whereNow", proposed: "In the safe." },
    ]);
    expect(n).toBe(2);
    expect(p.applySheetDraft).toHaveBeenCalledTimes(1);
    expect(p.applySheetDraft).toHaveBeenCalledWith("objects", "o1", { properties: "Warm brass.", whereNow: "In the safe." });
    expect(applySheetDrafts(p, "object", "o1", [{ key: "name", proposed: "x" }])).toBe(0);
    expect(p.applySheetDraft).toHaveBeenCalledTimes(1);
  });

  it("writes the description as paragraphs while the entry has none, with the sheet in the same step", () => {
    const p = project();
    expect(applySheetDrafts(p, "location", "l2", [{ key: "description", proposed: "Damp stacks.\n\nOne lamp." }, { key: "history", proposed: "Moved twice." }])).toBe(2);
    expect(p.applySheetDraft).toHaveBeenCalledWith("locations", "l2", { note: "<p>Damp stacks.</p><p>One lamp.</p>", history: "Moved twice." });
    // a description written meanwhile is never replaced
    expect(applySheetDrafts(p, "group", "g1", [{ key: "description", proposed: "Other text." }])).toBe(0);
    expect(p.applySheetDraft).toHaveBeenCalledTimes(1);
  });

  it("drops a suggested location the book has, and repeats", () => {
    const out = sanitizeLocationSuggestions({
      locations: [
        { name: "The Archive", kind: "x" }, { name: "Tide steps", kind: "stairs", note: "Where notes are passed." },
        { name: "tide steps" }, { name: "" }, { kind: "no name" },
      ],
    }, project().locations);
    expect(out).toEqual([{ name: "Tide steps", kind: "stairs", note: "Where notes are passed." }]);
  });
});

describe("Name ideas and Suggest locations inputs", () => {
  it("asks Brainstorm in the page kind's category, with the names already taken", () => {
    const loc = composeSheetNameIdeasInput(project(), "location", "l2", { budgetTokens: null });
    expect(loc.action).toBe("brainstorm");
    expect(loc.variables.label).toBe("Place names");
    expect(loc.variables.user_content).toContain("LOCATIONS ALREADY IN THE BOOK\n- North quay cannery\n- The archive");
    expect(loc.variables.user_content).toContain("Seed: names for the location in THE LOCATION, fitting the book in BOOK CONTEXT");
    expect(composeSheetNameIdeasInput(project(), "object", "o1").variables.label).toBe("Item / object names");
    expect(composeSheetNameIdeasInput(project(), "group", "g1").variables.label).toBe("Anything (free prompt)");
  });

  it("excludes the kind's names from the ideas", async () => {
    const r = await sheetNameIdeasRequest({ project: project(), kind: "location", entityId: "l1", budgetTokens: null });
    expect(r.exclude).toEqual(["North quay cannery", "The archive"]);
  });

  it("lists the locations the book has and what the writer wants", () => {
    const c = composeSuggestLocationsInput(project(), { lookingFor: "somewhere private", budgetTokens: null }).variables.user_content;
    expect(c).toContain("LOCATIONS ALREADY IN THE BOOK");
    expect(c.trim().endsWith("WHAT THE WRITER IS LOOKING FOR\nsomewhere private")).toBe(true);
  });
});

describe("the calls, the model stubbed", () => {
  it("drafts a sheet under the Story-world sheets feature", async () => {
    runJsonAnalysis.mockResolvedValueOnce({ result: { model: "m" }, parsed: { description: "A dusty room.", atmosphere: "Wet rope.", history: "Burned in '62.", other: "x" } });
    const r = await draftSheet({ project: project(), kind: "location", entityId: "l2", description: "a dusty room", budgetTokens: null });
    expect(r).toEqual({ fields: { description: "A dusty room.", atmosphere: "Wet rope.", history: "Burned in '62." }, model: "m" });
    const opts = runJsonAnalysis.mock.calls.at(-1)[0];
    expect([opts.action, opts.feature]).toEqual(["locationDraft", "storyWorld"]);
  });

  it("suggests locations under Brainstorm", async () => {
    runJsonAnalysis.mockResolvedValueOnce({ result: {}, parsed: { locations: [{ name: "Tide steps", kind: "stairs", note: "" }] } });
    expect(await suggestLocations({ project: project(), budgetTokens: null })).toEqual([{ name: "Tide steps", kind: "stairs", note: "" }]);
    const opts = runJsonAnalysis.mock.calls.at(-1)[0];
    expect([opts.action, opts.feature]).toEqual(["suggestLocations", "brainstorm"]);
  });

  it("drafts an article's body from its title, category, summary and current text, as HTML", async () => {
    const c = composeArticleInput(project(), "wb1").variables.user_content;
    expect(c).toContain("THE ARTICLE\nTitle: Harbor dues\nCategory: Economy\nSummary: How cargo is taxed.");
    expect(c).toContain("WHAT THE ARTICLE SAYS NOW\nOld text.");
    runAiFeature.mockResolvedValueOnce({ content: "Dues are paid at the quay.\n\nClerks keep two books.", model: "m" });
    const r = await draftArticle({ project: project(), articleId: "wb1", budgetTokens: null });
    expect(r.html).toBe("<p>Dues are paid at the quay.</p><p>Clerks keep two books.</p>");
    const opts = runAiFeature.mock.calls.at(-1)[0];
    expect([opts.action, opts.feature]).toEqual(["worldbuildingDraft", "storyWorld"]);
  });
});
