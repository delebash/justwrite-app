// SPDX-License-Identifier: MIT
// Port of tests/test_book_io.py — round-trip tests for the book assemble/decompose mapper
// (P2.1). The contract: on a canonical snapshot, `GET /book` after `PUT /book` returns
// exactly what went in (no data loss across the normalized tables). The fixture exercises
// every entity, relationship, polymorphic attachment, AI artifact, and trash bucket.
import { expect, test } from "vitest";
import { client, tmpPath, useHermeticKit } from "./helpers.js";

useHermeticKit();

function canonicalBook() {
  return {
    project: {
      title: "The Cartographer's Daughter",
      author: "Mira Halden",
      subtitle: "A novel",
      genre: "Literary speculative fiction",
      wordsGoal: 90000,
      dailyTarget: 1200,
      wordsWritten: 41280,
      startedOn: "March 11, 2026",
      deadline: "December 1, 2026",
      premise: "A mapmaker's daughter inherits a ledger.",
      coverImage: null,
    },
    parts: [
      {
        id: "p1",
        title: "The Inheritance",
        chapters: [
          { id: "ch1", num: 1, title: "What the door remembers", words: 120, status: "done", strands: ["s1", "s2"] },
          { id: "ch2", num: 2, title: "An inventory", words: 0, status: "todo", strands: [] },
        ],
      },
    ],
    // #235: the per-entity AI artifacts travel as top-level keyed maps, never embedded on the
    // chapter/character objects. assemble always emits all four (empty when unset), so the
    // canonical shape carries all four too.
    chapterCritiques: { ch1: { generatedAt: "x", notes: [{ severity: "low", message: "tighten" }] } },
    chapterReaderKnowledge: {},
    chapterMultiReader: {},
    characterAudits: { c1: { verdict: "consistent", concerns: [] } },
    scenes: {
      ch1: [
        { id: "scn1", title: "The key", body: "<p>The key turned.</p>", characters: ["c1"], locations: ["l1"], objects: ["o1"], strands: ["s1"] },
        { id: "scn2", title: "", body: "<p>Cedar and ash.</p>", characters: ["c1", "c2"], locations: [], objects: [], strands: ["s2"] },
      ],
      ch2: [],
    },
    characters: [
      {
        id: "c1",
        main: true,
        age: 31,
        gender: "",
        pronouns: "she/her",
        aliases: ["El"],
        lifeStatus: "alive",
        oneLiner: "Cartographer's daughter.",
        role: "Protagonist",
        name: "Elen Vael",
        tags: ["lead"],
      },
      {
        id: "c2",
        main: false,
        age: null,
        gender: "m",
        pronouns: "he/him",
        aliases: [],
        lifeStatus: "deceased",
        oneLiner: "Left a ledger.",
        role: "Father",
        name: "Idris Vael",
        tags: [],
      },
    ],
    characterExtras: {
      c1: { voice: { accent: "north" }, motivation: { want: "freedom" }, quotes: ["..."] },
    },
    locations: [{ id: "l1", name: "Halden House", kind: "Home", note: "Cliff road.", tags: ["setting"] }],
    objects: [{ id: "o1", name: "The Ledger", kind: "Manuscript", note: "84 pages.", tags: [] }],
    groups: [
      {
        id: "g1",
        name: "The Vael family",
        blurb: "Three generations.",
        color: "red",
        members: [
          { kind: "character", id: "c1", name: "Elen Vael" },
          { kind: "character", id: "c2", name: "Idris Vael" },
          { kind: "location", id: "l1", name: "Halden House" },
        ],
      },
    ],
    notes: [
      { id: "n1", title: "Story-wide", body: "x", tag: "note", updated: "May 22", anchor: null },
      { id: "n2", title: "Chapter note", body: "y", tag: "plot", updated: "May 21", anchor: { chapterId: "ch1" } },
      { id: "n3", title: "Scene note", body: "z", tag: "research", updated: "May 20", anchor: { chapterId: "ch1", sceneId: "scn1" } },
    ],
    strands: [
      {
        id: "s1",
        name: "Inheritance",
        color: "gold",
        blurb: "b",
        body: "",
        status: "open",
        beats: [{ id: "b1", chapterId: "ch1", sceneId: "scn1", label: "Inciting", note: "finds it" }],
      },
      { id: "s2", name: "The Ledger", color: "blue", blurb: "b2", body: "", status: "open", beats: [] },
    ],
    architecture: {
      premise: { id: "premise", title: "Premise", status: "done", words: 18, body: "..." },
      setting: { id: "setting", title: "Setting", status: "draft", words: 90, body: "..." },
    },
    worldbuilding: [
      { id: "wb1", category: "geography", title: "North Coast", tags: ["setting"], status: "done", words: 540, summary: "s", body: "b", related: ["wb2"] },
      { id: "wb2", category: "geography", title: "Brackish Cove", tags: ["disputed"], status: "draft", words: 230, summary: "s2", body: "b2", related: ["wb1"] },
    ],
    worldbuildingCategories: [
      { id: "geography", label: "Geography", icon: "Pin", hue: 130 },
      { id: "history", label: "History", icon: "Calendar", hue: 30 },
    ],
    tagVocabularies: {
      characters: [{ id: "tv1", label: "lead" }],
      locations: [],
      objects: [],
      worldbuilding: [{ id: "tv2", label: "setting" }],
    },
    images: {
      c1: [{ id: "img1", addedAt: 1700000000000, kind: "file", path: "/x/a.png", name: "a.png", mime: "image/png" }],
    },
    events: {
      setting: [{ id: "ev1", when: "1881-06-15T09:00", title: "First survey", note: "n" }],
      c1: [{ id: "ev2", when: "1995-11-04T03:14", title: "Born", note: "storm" }],
    },
    statuses: [
      { id: "todo", label: "To do", color: "var(--status-todo)" },
      { id: "done", label: "Done", color: "var(--status-done)" },
    ],
    trash: {
      chapters: [],
      scenes: [],
      characters: [{ id: "c9", name: "Cut character", deletedAt: 1700000001000 }],
      locations: [],
      objects: [],
      groups: [],
      notes: [],
      strands: [],
      worldbuilding: [],
      events: [],
      statuses: [],
      tagVocab: [{ id: "tvx", kind: "characters", label: "old", deletedAt: 1700000002000 }],
    },
    dailyRecaps: { "2026-06-18": { text: "wrote", day: "2026-06-18", totalWords: 1200 } },
    reverseOutline: { structureName: "3-act", summary: "s", generatedAt: "x" },
    beatSheets: { "save-the-cat": { templateKey: "save-the-cat", templateName: "Save the Cat", mapping: {} } },
    plotHoles: { summary: "none", findings: [], generatedAt: "x" },
    voiceCanonChapterIds: ["ch1"],
    relationshipArcs: { "c1::c2": { summary: "father-daughter" } },
    marketingPack: { logline: "a ledger", blurbs: ["a", "b", "c"] },
    worldRules: "Maps can be wrong.",
    savedAt: "2026-06-18T10:00:00.000Z",
  };
}

test("book_round_trips", async () => {
  const c = await client(tmpPath());
  const book = canonicalBook();
  expect((await c.put("/v1/projects/prj1/book", { json: book })).statusCode).toBe(204);
  expect((await c.get("/v1/projects/prj1/book")).json()).toEqual(book);
});

test("book_404_when_absent", async () => {
  expect((await (await client(tmpPath())).get("/v1/projects/nope/book")).statusCode).toBe(404);
});

test("book_appears_in_project_list", async () => {
  const c = await client(tmpPath());
  await c.put("/v1/projects/prj1/book", { json: canonicalBook() });
  const listing = (await c.get("/v1/projects")).json();
  expect(listing.some((p) => p.id === "prj1" && p.title === "The Cartographer's Daughter")).toBe(true);
});

test("projects_isolated", async () => {
  const c = await client(tmpPath());
  const b = canonicalBook();
  b.project.title = "Other";
  b.characters = [];
  b.characterExtras = {};
  await c.put("/v1/projects/prjA/book", { json: canonicalBook() });
  await c.put("/v1/projects/prjB/book", { json: b });
  expect((await c.get("/v1/projects/prjA/book")).json().project.title).toBe("The Cartographer's Daughter");
  const gotB = (await c.get("/v1/projects/prjB/book")).json();
  expect(gotB.project.title).toBe("Other");
  expect(gotB.characters).toEqual([]); // B's emptiness didn't pull in A's rows
});

test("reput_replaces_not_merges", async () => {
  const c = await client(tmpPath());
  await c.put("/v1/projects/prj1/book", { json: canonicalBook() });
  const smaller = canonicalBook();
  smaller.characters = [smaller.characters[0]]; // drop c2
  smaller.groups[0].members = smaller.groups[0].members.filter((m) => m.id !== "c2");
  smaller.scenes.ch1[1].characters = ["c1"]; // scn2 no longer references c2
  expect((await c.put("/v1/projects/prj1/book", { json: smaller })).statusCode).toBe(204);
  const got = (await c.get("/v1/projects/prj1/book")).json();
  expect(got.characters.map((ch) => ch.id)).toEqual(["c1"]);
  expect(got).toEqual(smaller);
});
