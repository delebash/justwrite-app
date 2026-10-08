// SPDX-License-Identifier: MIT
// Port of tests/test_autosave.py — /v1/projects/*/autosave, the server-owned rotating disk
// autosave: 3-generation rotation, list newest-first, read/delete/delete-all, snapshot
// round-trip, id sanitization, and the autosave-dir setting. +1 test beyond Python: the file
// bytes are Python's (json.dumps indent=2, written with the OS line separator).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { purePath } from "@delebash/llm-runner/platform/data_paths";
import { pyJson } from "@delebash/llm-runner/platform/pyjson";
import { expect, test } from "vitest";
import { client, tmpPath, useHermeticKit } from "./helpers.js";

useHermeticKit();

const snap = (title, savedAt) => ({ project: { title }, savedAt, chapters: [{ id: "c1", body: "x" }] });

test("write_and_roundtrip", async () => {
  const c = await client(tmpPath());
  const s = snap("Book One", "2026-07-13T10:00:00Z");
  const r = await c.post("/v1/projects/prj1/autosave", { json: s });
  expect(r.statusCode).toBe(200);
  expect(r.json().key).toBe("prj1__current");
  // Read it back — same JSON structure (verbatim mirror, no book decomposition).
  const read = await c.get("/v1/projects/autosaves/prj1__current");
  expect(read.statusCode).toBe(200);
  expect(read.json()).toEqual(s);
});

test("rotation_keeps_three_generations", async () => {
  const c = await client(tmpPath());
  for (let i = 0; i < 4; i++) await c.post("/v1/projects/prj1/autosave", { json: snap(`v${i}`, `2026-07-13T10:0${i}:00Z`) });
  // After 4 writes: current=v3, prev=v2, prev2=v1 (v0 rotated out).
  expect((await c.get("/v1/projects/autosaves/prj1__current")).json().project.title).toBe("v3");
  expect((await c.get("/v1/projects/autosaves/prj1__prev")).json().project.title).toBe("v2");
  expect((await c.get("/v1/projects/autosaves/prj1__prev2")).json().project.title).toBe("v1");
  // Exactly 3 generations survive on disk for this project.
  const keys = (await c.get("/v1/projects/autosaves")).json().map((e) => e.key).sort();
  expect(keys).toEqual(["prj1__current", "prj1__prev", "prj1__prev2"]);
});

test("list_newest_first_and_fields", async () => {
  const c = await client(tmpPath());
  await c.post("/v1/projects/a/autosave", { json: snap("Alpha", "2026-07-13T09:00:00Z") });
  await c.post("/v1/projects/b/autosave", { json: snap("Beta", "2026-07-13T11:00:00Z") });
  const listed = (await c.get("/v1/projects/autosaves")).json();
  // Newest savedAt first.
  expect(listed[0].title).toBe("Beta");
  expect(listed[0].projectId).toBe("b");
  expect(listed[0].generation).toBe("current");
  expect(listed[0].key).toBe("b__current");
});

test("list_defaults_title_and_savedat", async () => {
  const c = await client(tmpPath());
  // A snapshot with neither project.title nor savedAt still lists cleanly.
  await c.post("/v1/projects/bare/autosave", { json: { chapters: [] } });
  const entry = (await c.get("/v1/projects/autosaves")).json()[0];
  expect(entry.title).toBe("Untitled");
  expect(entry.savedAt).toBe("");
});

test("delete_one", async () => {
  const c = await client(tmpPath());
  await c.post("/v1/projects/prj1/autosave", { json: snap("X", "t1") });
  await c.post("/v1/projects/prj1/autosave", { json: snap("Y", "t2") }); // current=Y, prev=X
  expect((await c.delete("/v1/projects/autosaves/prj1__prev")).statusCode).toBe(204);
  expect((await c.get("/v1/projects/autosaves/prj1__prev")).statusCode).toBe(404);
  // current survives.
  expect((await c.get("/v1/projects/autosaves/prj1__current")).statusCode).toBe(200);
});

test("delete_all", async () => {
  const c = await client(tmpPath());
  await c.post("/v1/projects/a/autosave", { json: snap("A", "t1") });
  await c.post("/v1/projects/b/autosave", { json: snap("B", "t2") });
  expect((await c.delete("/v1/projects/autosaves")).statusCode).toBe(204);
  expect((await c.get("/v1/projects/autosaves")).json()).toEqual([]);
});

test("read_missing_404", async () => {
  expect((await (await client(tmpPath())).get("/v1/projects/autosaves/nope__current")).statusCode).toBe(404);
});

test("read_malformed_key_404", async () => {
  // Unknown generation -> not a real key.
  expect((await (await client(tmpPath())).get("/v1/projects/autosaves/prj1__bogus")).statusCode).toBe(404);
});

test("unsafe_project_id_is_sanitized", async () => {
  const c = await client(tmpPath());
  // '.' is neither alnum nor '-'/'_', so safeId maps it to '_': "pr.j" -> "pr_j".
  const r = await c.post("/v1/projects/pr.j/autosave", { json: snap("Z", "t1") });
  expect(r.json().key).toBe("pr_j__current");
  expect((await c.get("/v1/projects/autosaves/pr_j__current")).statusCode).toBe(200);
});

test("autosave_dir_default_and_override", async () => {
  const tmp = tmpPath();
  const c = await client(tmp);
  // Default = <dataDir>/projects.
  const got = (await c.get("/v1/projects/autosave-dir")).json().dir;
  expect(got.endsWith("projects")).toBe(true);
  // Point it at a new folder; the dir is created and used by subsequent writes.
  const target = purePath(join(tmp, "my-autosaves"));
  const put = await c.put("/v1/projects/autosave-dir", { json: { dir: target } });
  expect(put.statusCode).toBe(200);
  expect(put.json().dir).toBe(target);
  expect(existsSync(target)).toBe(true);
  await c.post("/v1/projects/prj1/autosave", { json: snap("H", "t1") });
  expect(existsSync(join(target, "prj1.autosave.json"))).toBe(true);
  // GET reflects the new dir.
  expect((await c.get("/v1/projects/autosave-dir")).json().dir).toBe(target);
});

test("autosave_dir_rejects_empty", async () => {
  const c = await client(tmpPath());
  expect((await c.put("/v1/projects/autosave-dir", { json: { dir: "  " } })).statusCode).toBe(400);
});

test("autosave_dir_change_migrates_existing_files", async () => {
  // D3a: changing the folder MOVES the existing rotating files into the new folder (so a
  // folder change never loses the user's autosaves), leaving none behind.
  const tmp = tmpPath();
  const c = await client(tmp);
  await c.post("/v1/projects/prj1/autosave", { json: snap("A", "t1") });
  await c.post("/v1/projects/prj1/autosave", { json: snap("B", "t2") }); // current=B, prev=A
  const oldDir = (await c.get("/v1/projects/autosave-dir")).json().dir;
  expect(existsSync(join(oldDir, "prj1.autosave.json"))).toBe(true);
  expect(existsSync(join(oldDir, "prj1.autosave.prev.json"))).toBe(true);

  const target = purePath(join(tmp, "moved-autosaves"));
  expect((await c.put("/v1/projects/autosave-dir", { json: { dir: target } })).statusCode).toBe(200);
  // Files now live in the new folder...
  expect(existsSync(join(target, "prj1.autosave.json"))).toBe(true);
  expect(existsSync(join(target, "prj1.autosave.prev.json"))).toBe(true);
  // ...and no longer in the old one.
  expect(existsSync(join(oldDir, "prj1.autosave.json"))).toBe(false);
  expect(existsSync(join(oldDir, "prj1.autosave.prev.json"))).toBe(false);
  // Still readable through the API (which now reads the new folder), content intact.
  expect((await c.get("/v1/projects/autosaves/prj1__current")).json().project.title).toBe("B");
  expect((await c.get("/v1/projects/autosaves/prj1__prev")).json().project.title).toBe("A");
});

test("autosave_dir_change_does_not_clobber", async () => {
  // Migration never overwrites an autosave already present in the new folder.
  const tmp = tmpPath();
  const c = await client(tmp);
  await c.post("/v1/projects/prj1/autosave", { json: snap("OLD", "t1") });
  const target = join(tmp, "dest");
  mkdirSync(target);
  writeFileSync(join(target, "prj1.autosave.json"), '{"project": {"title": "KEEP"}}', "utf8");
  expect((await c.put("/v1/projects/autosave-dir", { json: { dir: target } })).statusCode).toBe(200);
  // The pre-existing file in the new folder is preserved, not clobbered.
  expect((await c.get("/v1/projects/autosaves/prj1__current")).json().project.title).toBe("KEEP");
});

test("autosaves_route_not_shadowed_by_project_get", async () => {
  // Regression guard: /v1/projects/autosaves must hit the list endpoint, NOT projects'
  // catch-all GET /{project_id} (which would 404 "project not found").
  const r = await (await client(tmpPath())).get("/v1/projects/autosaves");
  expect(r.statusCode).toBe(200);
  expect(r.json()).toEqual([]);
});

test("file_bytes_are_pythons", async () => {
  // json.dumps(snapshot, indent=2) — ensure_ascii, Python's separators — written by pathlib's
  // write_text: "\n" as the OS line separator.
  const tmp = tmpPath();
  const c = await client(tmp);
  const s = { project: { title: "Café — ü" }, savedAt: "t", n: [1, 2.5] };
  await c.post("/v1/projects/p/autosave", { json: s });
  const text = pyJson(s, { indent: 2 });
  const expected = process.platform === "win32" ? text.replace(/\n/g, "\r\n") : text;
  expect(readFileSync(join(tmp, "projects", "p.autosave.json"), "utf8")).toBe(expected);
  expect(expected).toContain('"Caf\\u00e9 \\u2014 \\u00fc"');
});
