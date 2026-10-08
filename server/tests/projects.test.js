// SPDX-License-Identifier: MIT
// Port of tests/test_projects.py — /v1/projects, the book domain API (normalized tables, not
// a blob). PUT /{id} and PUT /{id}/book both decompose into the per-entity tables; the GETs
// assemble them back.
import { expect, test } from "vitest";
import { client, tmpPath, useHermeticKit } from "./helpers.js";

useHermeticKit();

const SNAP = {
  project: { title: "The Cartographer's Daughter", author: "Mira Halden" },
  parts: [
    {
      id: "p1",
      title: "Part One",
      chapters: [
        { id: "ch1", num: 1, title: "Arrival", words: 1200, status: "draft", strands: [] },
        { id: "ch2", num: 2, title: "The Map", words: 800, status: "todo", strands: [] },
      ],
    },
  ],
  scenes: { ch1: [{ id: "s1", title: "", body: "<p>hi</p>" }], ch2: [] },
  characters: [{ id: "c1", name: "Mira" }],
};

test("put_get_roundtrip_and_list", async () => {
  const c = await client(tmpPath());
  expect((await c.get("/v1/projects")).json()).toEqual([]);

  // PUT /{id} is an alias of PUT /book: it decomposes into the normalized tables. GET /{id}
  // assembles them back. assemble emits the canonical shape (extra default keys), so assert
  // the meaningful data survived rather than byte-equality with the minimal input.
  expect((await c.put("/v1/projects/prj1", { json: SNAP })).statusCode).toBe(204);
  const got = (await c.get("/v1/projects/prj1")).json();
  expect(got.project.title).toBe("The Cartographer's Daughter");
  expect(got.project.author).toBe("Mira Halden");
  expect(got.parts.map((p) => p.title)).toEqual(["Part One"]);
  expect(got.parts[0].chapters.map((ch) => ch.title)).toEqual(["Arrival", "The Map"]);
  expect(got.scenes.ch1[0].body).toBe("<p>hi</p>");
  expect(got.characters.map((ch) => ch.name)).toEqual(["Mira"]);
  // /book returns the same assembled snapshot as the /{id} alias.
  expect((await c.get("/v1/projects/prj1/book")).json()).toEqual(got);

  const lst = (await c.get("/v1/projects")).json();
  expect(lst.length).toBe(1);
  expect(lst[0].id).toBe("prj1");
  expect(lst[0].title).toBe("The Cartographer's Daughter");
  expect(lst[0].author).toBe("Mira Halden");
  expect(lst[0].updatedAt).not.toBeNull(); // camelCase key present
  expect(lst[0].updatedAt).not.toBeUndefined();
});

test("chapters_and_characters_extracted", async () => {
  const c = await client(tmpPath());
  await c.put("/v1/projects/prj1", { json: SNAP });

  const chapters = (await c.get("/v1/projects/prj1/chapters")).json();
  expect(chapters.map((ch) => ch.title)).toEqual(["Arrival", "The Map"]);
  expect(chapters[0]).toEqual({
    id: "ch1",
    num: 1,
    title: "Arrival",
    words: 1200,
    status: "draft",
    partId: "p1",
    partTitle: "Part One",
    sceneCount: 1,
  });
  expect(chapters[1].sceneCount).toBe(0);

  const chars = (await c.get("/v1/projects/prj1/characters")).json();
  expect(chars.length).toBe(1);
  expect(chars[0].id).toBe("c1");
  expect(chars[0].name).toBe("Mira");
});

test("get_missing_404", async () => {
  expect((await (await client(tmpPath())).get("/v1/projects/nope")).statusCode).toBe(404);
  expect((await (await client(tmpPath())).get("/v1/projects/nope/chapters")).statusCode).toBe(404);
});

test("persist_across_instances_and_delete", async () => {
  const tmp = tmpPath();
  await (await client(tmp)).put("/v1/projects/prj1", { json: SNAP });
  const c2 = await client(tmp);
  // A second server instance reads the same SQLite file → the normalized rows.
  expect((await c2.get("/v1/projects/prj1")).json().project.author).toBe("Mira Halden");
  expect((await c2.delete("/v1/projects/prj1")).statusCode).toBe(204);
  expect((await c2.get("/v1/projects")).json()).toEqual([]);
});

test("ai_artifact_maps_roundtrip_and_legacy_lift", async () => {
  // #235: the four per-entity AI artifacts travel as top-level keyed maps
  // (chapterCritiques / chapterReaderKnowledge / chapterMultiReader / characterAudits) and
  // never come back embedded on the entity objects. A legacy snapshot that still embeds them
  // ingests into the same columns.
  const c = await client(tmpPath());

  // New wire shape: maps in, maps out, entities clean.
  const snap = {
    project: { title: "Artifacts" },
    parts: [{ id: "p1", title: "P", chapters: [{ id: "ch1", num: 1, title: "A", words: 0, status: "draft", strands: [] }] }],
    scenes: { ch1: [] },
    characters: [{ id: "c1", name: "Mira" }],
    chapterCritiques: { ch1: { notes: [{ message: "tighten" }] } },
    chapterReaderKnowledge: { ch1: { status: "ok" } },
    chapterMultiReader: { ch1: { panel: [1, 2] } },
    characterAudits: { c1: { noteCount: 2 } },
  };
  expect((await c.put("/v1/projects/prj_art", { json: snap })).statusCode).toBe(204);
  let got = (await c.get("/v1/projects/prj_art")).json();
  expect(got.chapterCritiques).toEqual({ ch1: { notes: [{ message: "tighten" }] } });
  expect(got.chapterReaderKnowledge).toEqual({ ch1: { status: "ok" } });
  expect(got.chapterMultiReader).toEqual({ ch1: { panel: [1, 2] } });
  expect(got.characterAudits).toEqual({ c1: { noteCount: 2 } });
  expect("critique" in got.parts[0].chapters[0]).toBe(false);
  expect("audit" in got.characters[0]).toBe(false);

  // Legacy shape: embedded on the entities (an old export/backup) — the decompose fallback
  // lifts them into the same columns, so the GET emits the map shape.
  const legacy = {
    project: { title: "Legacy" },
    parts: [
      {
        id: "p1",
        title: "P",
        chapters: [{ id: "chL", num: 1, title: "Old", words: 0, status: "draft", strands: [], critique: { notes: [{ message: "legacy" }] } }],
      },
    ],
    scenes: { chL: [] },
    characters: [{ id: "cL", name: "N", audit: { noteCount: 1 } }],
  };
  expect((await c.put("/v1/projects/prj_leg", { json: legacy })).statusCode).toBe(204);
  got = (await c.get("/v1/projects/prj_leg")).json();
  expect(got.chapterCritiques).toEqual({ chL: { notes: [{ message: "legacy" }] } });
  expect(got.characterAudits).toEqual({ cL: { noteCount: 1 } });
  expect("critique" in got.parts[0].chapters[0]).toBe(false);
});

test("trashed_entity_artifact_rides_the_tombstone", async () => {
  // #235 checker catch: a TRASHED chapter's artifact travels inside its opaque trash payload
  // (the durable carrier) — the live maps only cover live ids, so a map entry for a non-live
  // id is dropped, not resurrected.
  const c = await client(tmpPath());
  const snap = {
    project: { title: "Trashed" },
    parts: [{ id: "p1", title: "P", chapters: [] }],
    scenes: {},
    characters: [],
    trash: {
      chapters: [
        {
          id: "chT",
          num: 1,
          title: "Gone",
          words: 0,
          status: "draft",
          strands: [],
          scenes: [],
          partId: "p1",
          deletedAt: 1,
          critique: { notes: [{ message: "carried" }] },
        },
      ],
      scenes: [],
      characters: [],
      locations: [],
      objects: [],
      groups: [],
      notes: [],
      strands: [],
      worldbuilding: [],
      events: [],
      statuses: [],
      tagVocab: [],
    },
    // A stale live-map entry for the trashed id — must NOT survive (the tombstone copy is
    // the one source for non-live entities).
    chapterCritiques: { chT: { notes: [{ message: "stale-live-copy" }] } },
  };
  expect((await c.put("/v1/projects/prj_tomb", { json: snap })).statusCode).toBe(204);
  const got = (await c.get("/v1/projects/prj_tomb")).json();
  expect(got.trash.chapters[0].critique).toEqual({ notes: [{ message: "carried" }] });
  expect(got.chapterCritiques).toEqual({});
});
