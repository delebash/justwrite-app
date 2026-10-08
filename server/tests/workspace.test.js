// SPDX-License-Identifier: MIT
// Port of tests/test_workspace.py — /v1/data/reset, the reset-workspace wipe across every
// table (the kit's makeDataRouter), plus /v1/data/backup + /v1/data/restore round-trip.
//
// Reset drops + recreates every table, then re-seeds the default providers so the renderer
// reloads into a first-run-shaped workspace. Since QC-40 first-run means NO projects — the
// demo book is created only on demand (POST /v1/projects/demo). These tests assert the
// USER's data is gone and nothing project-shaped comes back.
import { join } from "node:path";
import { purePath } from "@delebash/llm-runner/platform/data_paths";
import { expect, test } from "vitest";
import { client, tmpPath, useHermeticKit } from "./helpers.js";

useHermeticKit();

test("reset_clears_user_data", async () => {
  const c = await client(tmpPath());
  // Populate a spread of tables: a project (+ cascaded book rows), settings, a session, a
  // chat session, a chapter version.
  await c.put("/v1/projects/prj1", { json: { project: { title: "Book" } } });
  await c.patch("/v1/settings", { json: { ui: { x: 1 } } });
  await c.post("/v1/sessions/record", { json: { chapterId: "ch1", words: 100, day: "2026-06-18" } });
  await c.put("/v1/chat/sessions/s1", {
    json: { projectId: "prj1", mode: "book", title: "hi", messages: [{ role: "user", content: "hi" }] },
  });
  await c.put("/v1/versions", { json: { projectId: "prj1", chapterId: "ch1", versions: [{ id: "v1", savedAt: "x", scenes: [] }] } });

  expect((await c.post("/v1/data/reset")).statusCode).toBe(200);

  // The user's own rows are gone; no project is re-seeded (QC-40).
  expect((await c.get("/v1/projects")).json()).toEqual([]);
  expect("ui" in (await c.get("/v1/settings")).json()).toBe(false);
  expect((await c.get("/v1/sessions")).json()).toEqual({ days: {}, chapterWords: {}, lastWrite: null });
  expect((await c.get("/v1/chat/sessions", { params: { projectId: "prj1" } })).json()).toEqual([]);
  expect((await c.get("/v1/versions", { params: { projectId: "prj1" } })).json()).toEqual({});
});

test("reset_preserves_folder_path_config", async () => {
  // D3b: the workspace reset must NOT reset a user-changed folder path. autosaveDir +
  // chooserDirs survive; other settings are wiped.
  const tmp = tmpPath();
  const c = await client(tmp);
  const target = purePath(join(tmp, "my-autosaves"));
  await c.put("/v1/projects/autosave-dir", { json: { dir: target } });
  await c.patch("/v1/settings", { json: { chooserDirs: { export: "/x/exports" }, ui: { x: 1 } } });

  expect((await c.post("/v1/data/reset")).statusCode).toBe(200);

  // The autosave folder still points where the user put it.
  expect((await c.get("/v1/projects/autosave-dir")).json().dir).toBe(target);
  const doc = (await c.get("/v1/settings")).json();
  expect(doc.autosaveDir).toBe(target);
  expect(doc.chooserDirs).toEqual({ export: "/x/exports" });
  expect("ui" in doc).toBe(false); // non-path workspace data is gone
});

test("reset_is_idempotent_on_empty", async () => {
  const c = await client(tmpPath());
  expect((await c.post("/v1/data/reset")).statusCode).toBe(200);
  expect((await c.post("/v1/data/reset")).statusCode).toBe(200);
  // Repeated resets keep the workspace empty of projects (QC-40).
  expect((await c.get("/v1/projects")).json()).toEqual([]);
});

test("backup_restore_roundtrip", async () => {
  const c = await client(tmpPath());
  await c.put("/v1/projects/prj1", { json: { project: { title: "Backed up" } } });
  // Back up, then mutate.
  const blob = (await c.get("/v1/data/backup")).rawPayload;
  expect(blob.subarray(0, 2).toString("latin1")).toBe("PK"); // a zip
  await c.put("/v1/projects/prj1", { json: { project: { title: "Changed after backup" } } });
  // Restore brings the project's saved state back.
  const form = new FormData();
  form.append("file", new Blob([blob], { type: "application/zip" }), "backup.zip");
  const r = await c.app.inject({ method: "POST", url: "/v1/data/restore", payload: form, headers: { host: "testserver" } });
  expect(r.statusCode).toBe(200);
  const snap = (await c.get("/v1/projects/prj1")).json();
  expect(snap.project.title).toBe("Backed up");
});
