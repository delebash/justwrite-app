// SPDX-License-Identifier: MIT
// Port of tests/test_book_io.py — round-trip tests for the book assemble/decompose mapper
// (P2.1). The contract: on a canonical snapshot, `GET /book` after `PUT /book` returns
// exactly what went in (no data loss across the normalized tables). The fixture exercises
// every entity, relationship, polymorphic attachment, AI artifact, and trash bucket.
import { join } from "node:path";
import { openDatabase } from "@delebash/core/platform/sql";
import { expect, test } from "vitest";
import { ADDED_COLUMNS, TABLES } from "../src/database/models.js";
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
      aiSceneDrafting: true,
      language: "es",
      pdfPageSize: "trim-6x9",
      pdfMarginTop: 54,
      pdfMarginBottom: 63.5,
      pdfMarginSide: 54,
      styleFlagZ: 1.5,
      styleHotMeasures: 3,
      styleTrendZ: 0.4,
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
        // pov (a POV_OPTIONS slug, null when unset) + when (the story time, "" when unset): the
        // Links panel sets both — lost on every save until 2026-10-11. So were status (a statuses
        // id, "" when unset) and excludeFromAi, here and on the story-world entities below. The
        // Summary (2026-10-16) is "" when unset, as are the sheets' fields below.
        { id: "scn1", title: "The key", body: "<p>The key turned.</p>", pov: "limited-third", when: "1881-06-15T09:00", status: "draft", excludeFromAi: true, summary: "Elen finds the key.", characters: ["c1"], locations: ["l1"], objects: ["o1"], strands: ["s1"] },
        { id: "scn2", title: "", body: "<p>Cedar and ash.</p>", pov: null, when: "", status: "", excludeFromAi: false, summary: "", characters: ["c1", "c2"], locations: [], objects: [], strands: ["s2"] },
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
        status: "done",
        excludeFromAi: false,
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
        status: "",
        excludeFromAi: true,
      },
    ],
    characterExtras: {
      c1: { voice: { accent: "north" }, motivation: { want: "freedom" }, quotes: ["..."] },
    },
    locations: [
      { id: "l1", name: "Halden House", kind: "Home", note: "Cliff road.", tags: ["setting"], status: "todo", excludeFromAi: true, atmosphere: "Salt and cold stone.", history: "" },
    ],
    objects: [
      { id: "o1", name: "The Ledger", kind: "Manuscript", note: "84 pages.", tags: [], status: "", excludeFromAi: false, properties: "Water-stained.", history: "Idris's.", whereNow: "" },
    ],
    groups: [
      {
        id: "g1",
        name: "The Vael family",
        blurb: "Three generations.",
        color: "red",
        status: "draft",
        excludeFromAi: true,
        goals: "Keep the house.",
        leadership: "",
        history: "Mapmakers since 1820.",
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
      { id: "wb1", category: "geography", title: "North Coast", tags: ["setting"], status: "done", words: 540, summary: "s", body: "b", related: ["wb2"], excludeFromAi: true },
      { id: "wb2", category: "geography", title: "Brackish Cove", tags: ["disputed"], status: "draft", words: 230, summary: "s2", body: "b2", related: ["wb1"], excludeFromAi: false },
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

// A database made before the ADDED_COLUMNS columns existed (scenes' pov / "when"; status and
// exclude_from_ai on scenes and the story-world tables — all 2026-10-11; the sheets' fields and
// the scene Summary — 2026-10-16) gains every one at boot
// and then round-trips them — no reset, so a writer's existing books survive the upgrade.
test("an_older_database_gains_the_added_columns", async () => {
  const dir = tmpPath();
  const old = openDatabase(join(dir, "justwrite.db"), { foreignKeys: true });
  // Each such table as it was made before: today's DDL without its added columns' lines.
  for (const table of new Set(ADDED_COLUMNS.map(([t]) => t))) {
    const added = ADDED_COLUMNS.filter(([t]) => t === table).map(([, column]) => column);
    const isAdded = (line) => added.some((column) => line.startsWith(`\t${column} `) || line.startsWith(`\t"${column}" `));
    old.exec(TABLES.find((t) => t.name === table).ddl.split("\n").filter((line) => !isAdded(line)).join("\n"));
    const made = old.all(`PRAGMA table_info(${table})`).map((c) => c.name);
    for (const column of added) expect(made).not.toContain(column);
  }
  old.close();
  const c = await client(dir);
  const book = canonicalBook();
  expect((await c.put("/v1/projects/prj1/book", { json: book })).statusCode).toBe(204);
  expect((await c.get("/v1/projects/prj1/book")).json()).toEqual(book);
});

// A note saved with no tag comes back with none: the server used to fill the English "note"
// (2026-10-18), whatever the writer's language — the app gives a new note its default tag.
test("a_blank_note_tag_stays_blank", async () => {
  const c = await client(tmpPath());
  const book = canonicalBook();
  book.notes[0].tag = "";
  await c.put("/v1/projects/prj1/book", { json: book });
  expect((await c.get("/v1/projects/prj1/book")).json().notes[0].tag).toBe("");
});

// A book saved without a language (one from before 2026-10-18, a hand-made book.json) is English —
// what every book's EPUB declared until the book language existed.
test("a_book_without_a_language_is_english", async () => {
  const c = await client(tmpPath());
  const book = canonicalBook();
  delete book.project.language;
  await c.put("/v1/projects/prj1/book", { json: book });
  expect((await c.get("/v1/projects/prj1/book")).json().project.language).toBe("en");
});

// A book saved without a PDF page (one from before 2026-10-28) is A4 with the size's own margins —
// the page every PDF had — and a margin left empty stays the size's.
test("a_book_without_a_pdf_page_is_a4_with_the_sizes_margins", async () => {
  const c = await client(tmpPath());
  const book = canonicalBook();
  for (const k of ["pdfPageSize", "pdfMarginTop", "pdfMarginBottom", "pdfMarginSide"]) delete book.project[k];
  book.project.pdfMarginSide = -3; // not a margin: stored as none
  await c.put("/v1/projects/prj1/book", { json: book });
  const back = (await c.get("/v1/projects/prj1/book")).json().project;
  expect([back.pdfPageSize, back.pdfMarginTop, back.pdfMarginBottom, back.pdfMarginSide]).toEqual(["a4", null, null, null]);
});

// A book saved without a voice drift sensitivity (one from before 2026-10-28), or with values that
// can't be one, reads the values the analysis always used: 1, 2 and 0.5.
test("a_book_without_a_drift_sensitivity_reads_the_old_values", async () => {
  const c = await client(tmpPath());
  const book = canonicalBook();
  delete book.project.styleFlagZ;
  book.project.styleHotMeasures = 1.5; // not a count
  book.project.styleTrendZ = 0; // not positive
  await c.put("/v1/projects/prj1/book", { json: book });
  const back = (await c.get("/v1/projects/prj1/book")).json().project;
  expect([back.styleFlagZ, back.styleHotMeasures, back.styleTrendZ]).toEqual([1, 2, 0.5]);
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
