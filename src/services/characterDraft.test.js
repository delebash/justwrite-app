// @vitest-environment jsdom
// The AI drafting of a character (2026-10-11, the AI drafting plan Task 7): the composed input
// (book context, the character's profile, the writer's description, a section's fields), the
// sanitizers (only known keys, clamped strings, no reused names), and the draft calls with the
// model stubbed. jsdom: the card builder strips HTML via document.createElement.
import { describe, expect, it, vi } from "vitest";

const runJsonAnalysis = vi.fn();
vi.mock("./runJson.js", () => ({ runJsonAnalysis: (...a) => runJsonAnalysis(...a) }));

const {
  composeDescriptionInput, composeNameIdeasInput, composeSectionInput, composeSuggestInput,
  draftSection, nameIdeasRequest, nestFields, profileFromDescription, sanitizeSection, sanitizeSuggestions,
  suggestCharacters, voiceFromDescription,
} = await import("./analysis/characterDraft.js");

function project() {
  return {
    project: { genre: "Literary mystery", premise: "A harbor archivist unpicks who altered her father's ledger." },
    allChapters: [],
    scenesFor: () => [],
    characters: [
      { id: "c1", name: "Mira", main: true, role: "Harbor archivist", aliases: ["Mir"], oneLiner: "Guarded.", tags: [] },
      { id: "c2", name: "Untitled character", main: false, role: "", aliases: [], tags: [] },
    ],
    characterExtras: { c1: { motivation: { want: "the truth" } } },
    locations: [], objects: [], groups: [], notes: [], strands: [], worldbuilding: [],
    worldbuildingCategories: [], architecture: {}, events: {},
  };
}
const t = (k) => `T(${k})`;

describe("the composed input", () => {
  it("carries the book context, the profile and the description, in that order", () => {
    const { user_content } = composeDescriptionInput(project(), "c2", "a nervous customs clerk", { budgetTokens: null }).variables;
    const at = (s) => user_content.indexOf(s);
    expect(at("BOOK CONTEXT")).toBe(0);
    expect(user_content).toContain("A harbor archivist unpicks");
    expect(at("CHARACTER PROFILE")).toBeGreaterThan(at("BOOK CONTEXT"));
    expect(user_content).toContain("Name: Untitled character");
    expect(at("THE WRITER'S DESCRIPTION")).toBeGreaterThan(at("CHARACTER PROFILE"));
    expect(user_content.trim().endsWith("a nervous customs clerk")).toBe(true);
  });

  it("leaves out an empty book context and an empty description — no empty headings", () => {
    const p = project();
    p.project = {};
    p.characters[0].main = false;
    const { user_content } = composeDescriptionInput(p, "c2", "  ", { budgetTokens: 0 }).variables;
    expect(user_content).not.toContain("BOOK CONTEXT");
    expect(user_content).not.toContain("DESCRIPTION");
    expect(user_content.startsWith("CHARACTER PROFILE")).toBe(true);
  });

  it("lists a section's fields with their labels and hints", () => {
    const { user_content } = composeSectionInput(project(), "c1", "function", { description: "", t, budgetTokens: null }).variables;
    expect(user_content).toContain("FIELDS TO DRAFT");
    expect(user_content).toContain("- function.theme — T(characters.fields.function.theme.label): T(characters.fields.function.theme.hint)");
    expect(user_content.match(/^- function\./gm)).toHaveLength(9);
  });

  it("names the cast and what the writer is looking for, for suggestions", () => {
    const { user_content } = composeSuggestInput(project(), { lookingFor: "a rival", budgetTokens: null }).variables;
    expect(user_content).toContain("ALREADY IN THE CAST\n- Mira\n- Untitled character");
    expect(user_content).toContain("WHAT THE WRITER IS LOOKING FOR\na rival");
  });

  it("asks Brainstorm for character names after the book, the profile and the cast (Name ideas)", () => {
    const r = composeNameIdeasInput(project(), "c2", { budgetTokens: null });
    expect(r.action).toBe("brainstorm");
    expect(r.variables.label).toBe("Character names");
    const u = r.variables.user_content;
    const at = (s) => u.indexOf(s);
    expect(at("BOOK CONTEXT")).toBe(0);
    expect(at("CHARACTER PROFILE")).toBeGreaterThan(at("BOOK CONTEXT"));
    expect(at("ALREADY IN THE CAST\n- Mira")).toBeGreaterThan(at("CHARACTER PROFILE"));
    expect(at("Category: Character names\nSeed: ")).toBeGreaterThan(at("ALREADY IN THE CAST"));
    expect(u.endsWith("Output 15–20 fresh suggestions, one per line.")).toBe(true);
  });

  it("sends no book context for an empty book, and a More like these round carries the likes", () => {
    const p = project();
    p.project = {};
    p.characters[0].main = false;
    const u = composeNameIdeasInput(p, "c2", { liked: ["Odo"], seen: ["Odo", "Ren"], budgetTokens: 0 }).variables.user_content;
    expect(u).not.toContain("BOOK CONTEXT");
    expect(u.startsWith("CHARACTER PROFILE")).toBe(true);
    expect(u).not.toMatch(/\{\{/);
    expect(u).toContain("DO NOT repeat any of these:\n- Odo");
    expect(u).toContain("already-seen suggestions:\n- Odo\n- Ren");
  });

  it("never offers a name the cast already uses, an alias included", async () => {
    const r = await nameIdeasRequest({ project: project(), characterId: "c2", budgetTokens: null });
    expect(r.exclude).toEqual(["Mira", "Mir", "Untitled character"]);
  });
});

describe("the sanitizers", () => {
  it("keep only the section's keys, as clamped strings", () => {
    const out = sanitizeSection({ "function.theme": "  truth costs  ", "function.buttons": 42, "invented.key": "x" }, ["function.theme", "function.buttons"]);
    expect(out).toEqual({ "function.theme": "truth costs", "function.buttons": "" });
  });

  it("nest flat keys into the review rows' shape", () => {
    expect(nestFields({ "function.theme": "a", backstory: "b" })).toEqual({ function: { theme: "a" }, backstory: "b" });
  });

  it("drop suggested names already in the cast (names or aliases) and repeats", () => {
    const out = sanitizeSuggestions({
      characters: [
        { name: "Tomas Vell", role: "clerk", oneLiner: "owes money" },
        { name: "mira", role: "x", oneLiner: "x" },
        { name: "Mir", role: "x", oneLiner: "x" },
        { name: "Tomas Vell", role: "dup", oneLiner: "dup" },
        { name: "", role: "nameless" },
        "garbage",
      ],
    }, project().characters);
    expect(out).toEqual([{ name: "Tomas Vell", role: "clerk", oneLiner: "owes money" }]);
  });

  it("return [] for a reply with no characters list", () => {
    expect(sanitizeSuggestions({}, [])).toEqual([]);
  });
});

describe("the draft calls (model stubbed)", () => {
  it("drafts a profile and a voice from a description through the seeded actions", async () => {
    runJsonAnalysis.mockResolvedValueOnce({ result: { model: "m" }, parsed: { oneLiner: "  a clerk  ", identity: { age: "41" }, bogus: 1 } });
    const p = await profileFromDescription({ project: project(), characterId: "c2", description: "a clerk", budgetTokens: null });
    expect(runJsonAnalysis.mock.calls.at(-1)[0]).toMatchObject({ action: "characterProfileDraft", feature: "characterProfile" });
    expect(p.fields.oneLiner).toBe("a clerk");
    expect(p.fields.identity.age).toBe(41);
    expect("bogus" in p.fields).toBe(false);

    runJsonAnalysis.mockResolvedValueOnce({ result: { model: "m" }, parsed: { sampleCalm: "Ledger's closed.", register: "clipped" } });
    const v = await voiceFromDescription({ project: project(), characterId: "c2", description: "a clerk", budgetTokens: null });
    expect(runJsonAnalysis.mock.calls.at(-1)[0]).toMatchObject({ action: "characterVoiceDraft", feature: "characterVoice" });
    expect(v.fields.voice.sample).toBe("Ledger's closed.");
  });

  it("drafts a section and returns it nested for the review rows", async () => {
    runJsonAnalysis.mockResolvedValueOnce({ result: { model: "m" }, parsed: { "function.theme": "truth costs", "x.y": "no" } });
    const r = await draftSection({ project: project(), characterId: "c1", sectionKey: "function", t, budgetTokens: null });
    expect(runJsonAnalysis.mock.calls.at(-1)[0]).toMatchObject({ action: "characterSection", feature: "characterProfile" });
    expect(r.fields.function.theme).toBe("truth costs");
    expect(r.fields.x).toBeUndefined();
  });

  it("suggests characters without reusing a cast name", async () => {
    runJsonAnalysis.mockResolvedValueOnce({ result: { model: "m" }, parsed: { characters: [{ name: "Mira" }, { name: "Odo", role: "pilot", oneLiner: "knows the reef" }] } });
    const list = await suggestCharacters({ project: project(), budgetTokens: null });
    expect(runJsonAnalysis.mock.calls.at(-1)[0]).toMatchObject({ action: "suggestCharacters", feature: "brainstorm" });
    expect(list).toEqual([{ name: "Odo", role: "pilot", oneLiner: "knows the reef" }]);
  });
});
