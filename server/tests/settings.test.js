// SPDX-License-Identifier: MIT
// Port of tests/test_settings.py — /v1/settings, the renderer's preferences document (real
// rows, not kv blobs).
import { join } from "node:path";
import { purePath } from "@delebash/llm-runner/platform/data_paths";
import { expect, test } from "vitest";
import { client, tmpPath, useHermeticKit } from "./helpers.js";

useHermeticKit();

test("empty", async () => {
  expect((await (await client(tmpPath())).get("/v1/settings")).json()).toEqual({});
});

test("patch_returns_merged_document", async () => {
  const c = await client(tmpPath());
  const merged = (await c.patch("/v1/settings", { json: { ui: { sidebarCollapsed: true }, activeProjectId: "prj1" } })).json();
  expect(merged).toEqual({ ui: { sidebarCollapsed: true }, activeProjectId: "prj1" });
  expect((await c.get("/v1/settings")).json()).toEqual(merged);
});

test("partial_patch_keeps_other_sections", async () => {
  const c = await client(tmpPath());
  await c.patch("/v1/settings", { json: { ui: { a: 1 }, ai: { defaultLlmId: "x" } } });
  // Patching one section leaves siblings untouched...
  await c.patch("/v1/settings", { json: { activeProjectId: "prj2" } });
  const doc = (await c.get("/v1/settings")).json();
  expect(doc.ui).toEqual({ a: 1 });
  expect(doc.ai).toEqual({ defaultLlmId: "x" });
  expect(doc.activeProjectId).toBe("prj2");
});

test("section_value_is_replaced_wholesale", async () => {
  const c = await client(tmpPath());
  // A section is the unit of replacement (no deep merge), so a key dropped from the new value
  // is actually gone.
  await c.patch("/v1/settings", { json: { ai: { flags: { m1: "fast", m2: "slow" } } } });
  await c.patch("/v1/settings", { json: { ai: { flags: { m1: "fast" } } } });
  expect((await c.get("/v1/settings")).json().ai).toEqual({ flags: { m1: "fast" } });
});

test("values_are_real_json_not_strings", async () => {
  const c = await client(tmpPath());
  await c.patch("/v1/settings", { json: { ui: { nested: { on: true, n: 3 }, list: [1, 2] } } });
  const ui = (await c.get("/v1/settings")).json().ui;
  expect(ui.nested).toEqual({ on: true, n: 3 });
  expect(ui.list).toEqual([1, 2]);
});

test("persist_across_instances_and_clear", async () => {
  const tmp = tmpPath();
  const c = await client(tmp);
  await c.patch("/v1/settings", { json: { ui: { sidebarCollapsed: true } } });
  const c2 = await client(tmp); // new server instance, same SQLite file
  expect((await c2.get("/v1/settings")).json()).toEqual({ ui: { sidebarCollapsed: true } });
  expect((await c2.delete("/v1/settings")).statusCode).toBe(204);
  expect((await c2.get("/v1/settings")).json()).toEqual({});
});

test("clear_preserves_folder_path_config", async () => {
  // D3b: a user-changed folder path never resets. DELETE /v1/settings keeps the folder-path
  // whitelist (autosaveDir + chooserDirs) and wipes everything else.
  const tmp = tmpPath();
  const c = await client(tmp);
  await c.patch("/v1/settings", { json: { ui: { x: 1 }, chooserDirs: { backup: "/data/backups" } } });
  await c.put("/v1/projects/autosave-dir", { json: { dir: purePath(join(tmp, "as")) } }); // writes the autosaveDir row
  expect((await c.delete("/v1/settings")).statusCode).toBe(204);
  const doc = (await c.get("/v1/settings")).json();
  expect("ui" in doc).toBe(false); // non-path workspace data wiped
  expect(doc.chooserDirs).toEqual({ backup: "/data/backups" }); // remembered dirs survive
  expect(doc.autosaveDir).toBe(purePath(join(tmp, "as"))); // autosave folder survives
});
