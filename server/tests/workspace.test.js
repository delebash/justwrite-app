// SPDX-License-Identifier: MIT
// Port of tests/test_workspace.py — /v1/data/reset, the reset-workspace wipe across every
// table (the kit's makeDataRouter), plus /v1/data/backup + /v1/data/restore round-trip.
//
// Reset drops + recreates every table, then re-seeds the default providers so the renderer
// reloads into a first-run-shaped workspace. Since QC-40 first-run means NO projects — the
// demo book is created only on demand (POST /v1/projects/demo). These tests assert the
// USER's data is gone and nothing project-shaped comes back.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { purePath } from "@delebash/core/platform/data_paths";
import { openDatabase } from "@delebash/core/platform/sql";
import { ZipReader } from "@delebash/core/platform/zip";
import { expect, test } from "vitest";
import { NOT_DATA_WRITES } from "../src/app.js";
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
  const r = await c.app.request("http://testserver/v1/data/restore", { method: "POST", body: form, headers: { host: "testserver" } });
  expect(r.status).toBe(200);
  const snap = (await c.get("/v1/projects/prj1")).json();
  expect(snap.project.title).toBe("Backed up");
});

// ── the access tokens are the server's, not the data's (the family's security review, 2026-10-20) ──

const restore = (c, blob, headers = {}) => {
  const form = new FormData();
  form.append("file", new Blob([blob], { type: "application/zip" }), "backup.zip");
  return c.app.request("http://testserver/v1/data/restore", { method: "POST", body: form, headers: { host: "testserver", ...headers } });
};

test("a reset keeps the access tokens: an exposed server never opens to the network", async () => {
  const c = await client(tmpPath());
  const auth = { authorization: "Bearer s3cret" };
  await c.put("/v1/server-auth", { json: { tokens: ["s3cret"], requireForLoopback: true } });
  expect((await c.post("/v1/data/reset", { headers: auth })).statusCode).toBe(200);
  expect((await c.get("/v1/projects")).statusCode).toBe(401);
  expect((await c.get("/v1/server-auth", { headers: auth })).json()).toEqual({ tokens: ["s3cret"], requireForLoopback: true });
  // and so does clearing the settings document
  expect((await c.delete("/v1/settings", { headers: auth })).statusCode).toBe(204);
  expect((await c.get("/v1/projects")).statusCode).toBe(401);
});

test("a restore keeps this server's whole auth row, never the backup's", async () => {
  const c = await client(tmpPath());
  // a backup made before any token was set, and one with another token and the switch off
  const none = (await c.get("/v1/data/backup")).rawPayload;
  await c.put("/v1/server-auth", { json: { tokens: ["old"], requireForLoopback: false } });
  const other = (await c.get("/v1/data/backup", { headers: { authorization: "Bearer old" } })).rawPayload;
  await c.put("/v1/server-auth", { json: { tokens: ["s3cret"], requireForLoopback: true }, headers: { authorization: "Bearer old" } });
  const auth = { authorization: "Bearer s3cret" };
  for (const blob of [none, other]) {
    expect((await restore(c, blob, auth)).status).toBe(200);
    expect((await c.get("/v1/projects")).statusCode).toBe(401);
    expect((await c.get("/v1/projects", { headers: { authorization: "Bearer old" } })).statusCode).toBe(403); // a wrong token
    expect((await c.get("/v1/server-auth", { headers: auth })).json()).toEqual({ tokens: ["s3cret"], requireForLoopback: true });
  }
});

test("a backup carries no access tokens", async () => {
  const c = await client(tmpPath());
  await c.put("/v1/server-auth", { json: { tokens: ["s3cret"] } });
  await c.patch("/v1/settings", { json: { ui: { x: 1 } }, headers: { authorization: "Bearer s3cret" } });
  const blob = (await c.get("/v1/data/backup", { headers: { authorization: "Bearer s3cret" } })).rawPayload;
  const dir = tmpPath();
  writeFileSync(join(dir, "backup.zip"), blob);
  const zip = await ZipReader.open(join(dir, "backup.zip"));
  expect(zip.names()).toContain("db.sqlite"); // the kit's DB_ARCNAME
  await zip.extractAll(join(dir, "out"));
  const db = openDatabase(join(dir, "out", "db.sqlite"), { foreignKeys: false, readonly: true });
  try {
    const keys = db.all(`SELECT "key" FROM settings`).map((r) => r.key);
    expect(keys).toContain("ui");
    expect(keys).not.toContain("auth");
  } finally {
    db.close();
  }
});

test("a restore's gate holds the data's writes, never an AI run or the engine's work", () => {
  const passes = ["/v1/ai/run", "/v1/ai/stream", "/v1/ai/embeddings", "/v1/llm-runner/calibrate", "/v1/llm-runner/engine/install",
    "/v1/llm-providers/probe-models", "/v1/llm-providers/p1/ping", "/v1/llm-providers/p1/key/reveal", "/v1/rag/prj1/search"];
  const held = ["/v1/projects/prj1/book", "/v1/projects/prj1/autosave", "/v1/settings", "/v1/prefs", "/v1/server-auth", "/v1/sync/run",
    "/v1/rag/prj1", "/v1/rag/prj1/remove", "/v1/llm-providers", "/v1/llm-providers/p1", "/v1/ai/routing", "/v1/ai/prompts/k",
    "/v1/images", "/v1/versions", "/v1/chat/sessions/s1", "/v1/ai/run/x"];
  for (const p of passes) expect(NOT_DATA_WRITES.test(p), p).toBe(true);
  for (const p of held) expect(NOT_DATA_WRITES.test(p), p).toBe(false);
});
