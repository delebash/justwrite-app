// @vitest-environment jsdom
// Title ideas (2026-10-28, Brainstorm where it's used): Brainstorm's Titles at the book's title, a
// chapter's and a scene's — the writer's seed first, then what the title is for (the book; the
// chapter and its scenes; the scene's chapter, Summary and opening), and the titles already in use
// never offered. jsdom: the scenes' HTML is read via document.createElement.
import { describe, expect, it } from "vitest";

const { composeTitleIdeasInput, titleIdeasRequest } = await import("./analysis/titleIdeas.js");

function project() {
  const chapters = [
    { id: "ch1", num: 1, title: "The ledger", partTitle: "One" },
    { id: "ch2", num: 2, title: "", partTitle: "One" },
  ];
  const scenes = {
    ch1: [
      { id: "s1", title: "Low tide", summary: "Mira finds the ledger gone.", body: "<p>The archive smelled of salt and old glue.</p>" },
      { id: "s2", title: "", summary: "", body: "<p>Tomas waited on the quay.</p>" },
    ],
    ch2: [],
  };
  return {
    project: { title: "The Harbor Ledger", genre: "Literary mystery", premise: "A harbor archivist unpicks who altered her father's ledger." },
    allChapters: chapters,
    chapterById: (id) => chapters.find((c) => c.id === id),
    scenesFor: (id) => scenes[id] || [],
    characters: [], characterExtras: {}, locations: [], objects: [], groups: [], notes: [], strands: [],
    worldbuilding: [], worldbuildingCategories: [], architecture: {}, events: {},
  };
}

describe("Title ideas", () => {
  it("the book's: Brainstorm's Titles after the book, the writer's seed leading", () => {
    const r = composeTitleIdeasInput(project(), { target: "book", seed: "one word, nautical", budgetTokens: null });
    const c = r.variables.user_content;
    expect(r.action).toBe("brainstorm");
    expect(r.variables.label).toBe("Titles (book / chapter / scene)");
    expect(c.indexOf("BOOK CONTEXT")).toBe(0);
    expect(c).toContain("Category: Titles (book / chapter / scene)\nSeed: one word, nautical — titles for the book in BOOK CONTEXT");
  });

  it("a chapter's: the chapter, its title now and its scenes — the seed optional", () => {
    const c = composeTitleIdeasInput(project(), { target: "chapter", chapterId: "ch1", budgetTokens: null }).variables.user_content;
    expect(c).toContain("THE CHAPTER\nChapter 1\nIts title now: The ledger\nIts scenes:\n- Scene 1: Low tide\n- Scene 2: Tomas waited on the quay.");
    expect(c).toContain("Seed: titles for the chapter in THE CHAPTER, fitting the book in BOOK CONTEXT");
  });

  it("a scene's: its chapter, Summary and how it opens", () => {
    const c = composeTitleIdeasInput(project(), { target: "scene", chapterId: "ch1", sceneId: "s1", seed: "ominous", budgetTokens: null }).variables.user_content;
    expect(c).toContain("THE SCENE\nIn chapter 1: The ledger\nIts title now: Low tide\nSummary: Mira finds the ledger gone.\nHow it opens: The archive smelled of salt and old glue.");
    expect(c).toContain("Seed: ominous — titles for the scene in THE SCENE");
  });

  it("never offers a title already in use for that kind", async () => {
    expect((await titleIdeasRequest({ project: project(), target: "book", budgetTokens: null })).exclude).toEqual(["The Harbor Ledger"]);
    expect((await titleIdeasRequest({ project: project(), target: "chapter", chapterId: "ch1", budgetTokens: null })).exclude).toEqual(["The ledger"]);
    expect((await titleIdeasRequest({ project: project(), target: "scene", chapterId: "ch1", sceneId: "s2", budgetTokens: null })).exclude).toEqual(["Low tide"]);
  });
});
