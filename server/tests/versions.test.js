// SPDX-License-Identifier: MIT
// Port of tests/test_versions.py — /v1/versions, per-chapter version history (real rows).
import { expect, test } from "vitest";
import { client, tmpPath, useHermeticKit } from "./helpers.js";

useHermeticKit();

async function makeProject(c, pid = "prj1") {
  // chapter_versions.project_id FKs projects(id), so a version needs a book.
  expect((await c.put(`/v1/projects/${pid}`, { json: { project: { title: "Book" } } })).statusCode).toBe(204);
}

const v = (vid, kw = {}) => ({
  id: vid,
  label: "",
  savedAt: `2026-06-18T0${vid.at(-1)}:00:00`,
  words: 10,
  scenes: [{ id: "s1", title: "", body: "<p>hi</p>" }],
  ...kw,
});

const versions = (c) => c.get("/v1/versions", { params: { projectId: "prj1" } });

test("empty", async () => {
  expect((await versions(await client(tmpPath()))).json()).toEqual({});
});

test("put_get_roundtrip_grouped_and_ordered", async () => {
  const c = await client(tmpPath());
  await makeProject(c);
  // Newest-first list for ch1, plus a separate ch2 thread.
  await c.put("/v1/versions", { json: { projectId: "prj1", chapterId: "ch1", versions: [v("v3"), v("v2"), v("v1")] } });
  await c.put("/v1/versions", { json: { projectId: "prj1", chapterId: "ch2", versions: [v("v9", { label: "cut" })] } });

  const doc = (await versions(c)).json();
  expect(doc.ch1.map((x) => x.id)).toEqual(["v3", "v2", "v1"]); // position order preserved
  expect(doc.ch1[0].scenes[0].body).toBe("<p>hi</p>");
  expect(doc.ch2[0].label).toBe("cut");
});

test("replace_is_wholesale_per_chapter", async () => {
  const c = await client(tmpPath());
  await makeProject(c);
  await c.put("/v1/versions", { json: { projectId: "prj1", chapterId: "ch1", versions: [v("v1"), v("v2")] } });
  // A shorter list replaces the chapter entirely (delete of v2 + keep v1).
  await c.put("/v1/versions", { json: { projectId: "prj1", chapterId: "ch1", versions: [v("v1")] } });
  expect((await versions(c)).json().ch1.map((x) => x.id)).toEqual(["v1"]);
  // Empty list clears the chapter.
  await c.put("/v1/versions", { json: { projectId: "prj1", chapterId: "ch1", versions: [] } });
  expect((await versions(c)).json()).toEqual({});
});

test("persist_across_instances_and_project_delete_cascade", async () => {
  const tmp = tmpPath();
  const c = await client(tmp);
  await makeProject(c);
  await c.put("/v1/versions", { json: { projectId: "prj1", chapterId: "ch1", versions: [v("v1")] } });

  const c2 = await client(tmp); // new server instance, same SQLite file
  expect((await versions(c2)).json().ch1[0].id).toBe("v1");

  expect((await c2.delete("/v1/projects/prj1")).statusCode).toBe(204);
  expect((await versions(c2)).json()).toEqual({});
});
