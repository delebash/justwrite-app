// SPDX-License-Identifier: MIT
// Port of tests/test_sweep_draft.py — /v1/projects/*/sweep-draft, the entity sweep's
// per-project working draft (A). Pins: absent → {"draft": null} (first run is not an error),
// PUT/GET roundtrip, replace-in-place, DELETE idempotent, 404 on a PUT for a project that
// doesn't exist, and the FK cascade (deleting the project takes its draft with it).
import { expect, test } from "vitest";
import { client, tmpPath, useHermeticKit } from "./helpers.js";

useHermeticKit();

async function seedProject(c, pid = "prj1") {
  const r = await c.put(`/v1/projects/${pid}`, { json: { project: { title: "Book" } } });
  expect([200, 204]).toContain(r.statusCode);
}

const DRAFT = {
  version: 1,
  chapters: {
    ch1: {
      chapter: { id: "ch1", num: 1, title: "Chapter 1" },
      status: "done",
      textHash: "h1",
      counts: { characters: 2, locations: 1, objects: 0 },
      proposals: { characters: [{ name: "Slate" }], locations: [], objects: [] },
    },
    ch2: {
      chapter: { id: "ch2", num: 2, title: "Chapter 2" },
      status: "error",
      textHash: "h2",
      reason: "model exploded",
    },
  },
};

test("absent_draft_is_null_not_404", async () => {
  const c = await client(tmpPath());
  await seedProject(c);
  const r = await c.get("/v1/projects/prj1/sweep-draft");
  expect(r.statusCode).toBe(200);
  expect(r.json()).toEqual({ draft: null, updatedAt: "" });
});

test("put_get_roundtrip_and_replace", async () => {
  const c = await client(tmpPath());
  await seedProject(c);
  const r = await c.put("/v1/projects/prj1/sweep-draft", { json: DRAFT });
  expect(r.statusCode === 200 && r.json().ok === true).toBe(true);
  const got = (await c.get("/v1/projects/prj1/sweep-draft")).json();
  expect(got.draft).toEqual(DRAFT);
  expect(got.updatedAt).toBeTruthy();

  // Replace in place — the second PUT wins wholesale.
  const smaller = { version: 1, chapters: {} };
  await c.put("/v1/projects/prj1/sweep-draft", { json: smaller });
  expect((await c.get("/v1/projects/prj1/sweep-draft")).json().draft).toEqual(smaller);
});

test("put_for_missing_project_is_404", async () => {
  const c = await client(tmpPath());
  expect((await c.put("/v1/projects/nope/sweep-draft", { json: DRAFT })).statusCode).toBe(404);
});

test("delete_is_idempotent", async () => {
  const c = await client(tmpPath());
  await seedProject(c);
  await c.put("/v1/projects/prj1/sweep-draft", { json: DRAFT });
  expect((await c.delete("/v1/projects/prj1/sweep-draft")).statusCode).toBe(204);
  expect((await c.get("/v1/projects/prj1/sweep-draft")).json().draft).toBeNull();
  // Deleting again is still 204 — no row, no error.
  expect((await c.delete("/v1/projects/prj1/sweep-draft")).statusCode).toBe(204);
});

test("project_delete_cascades_the_draft", async () => {
  const c = await client(tmpPath());
  await seedProject(c);
  await c.put("/v1/projects/prj1/sweep-draft", { json: DRAFT });
  expect((await c.delete("/v1/projects/prj1")).statusCode).toBe(204);
  // The draft row went with the project (FK ON DELETE CASCADE).
  await seedProject(c); // re-create the project id fresh
  expect((await c.get("/v1/projects/prj1/sweep-draft")).json().draft).toBeNull();
});
