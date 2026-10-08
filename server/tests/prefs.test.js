// SPDX-License-Identifier: MIT
// Port of tests/test_prefs.py — /v1/prefs, the family door over the SAME renderer document
// /v1/settings serves (P9). Pins the mapping: the two wires read and write the same rows,
// and the prefs DELETE keeps the D3b folder-path whitelist exactly like the settings DELETE.
import { expect, test } from "vitest";
import { client, tmpPath, useHermeticKit } from "./helpers.js";

useHermeticKit();

test("prefs_and_settings_serve_the_same_document", async () => {
  const c = await client(tmpPath());
  expect((await c.get("/v1/prefs")).json()).toEqual({});
  await c.patch("/v1/settings", { json: { ui: { sidebarCollapsed: true } } });
  expect((await c.get("/v1/prefs")).json()).toEqual({ ui: { sidebarCollapsed: true } });
});

test("prefs_patch_lands_in_the_settings_document", async () => {
  const c = await client(tmpPath());
  const merged = (await c.patch("/v1/prefs", { json: { ui: { a: 1 }, activeProjectId: "prj1" } })).json();
  expect(merged).toEqual({ ui: { a: 1 }, activeProjectId: "prj1" });
  expect((await c.get("/v1/settings")).json()).toEqual(merged);
});

test("prefs_patch_is_wholesale_per_section", async () => {
  const c = await client(tmpPath());
  await c.patch("/v1/prefs", { json: { ai: { flags: { m1: "fast", m2: "slow" } } } });
  await c.patch("/v1/prefs", { json: { ai: { flags: { m1: "fast" } } } });
  expect((await c.get("/v1/prefs")).json().ai).toEqual({ flags: { m1: "fast" } });
});

test("prefs_delete_keeps_the_d3b_folder_path_config", async () => {
  const c = await client(tmpPath());
  await c.patch("/v1/prefs", { json: { ui: { a: 1 }, autosaveDir: "D:/autosave", chooserDirs: { import: "E:/in" } } });
  expect((await c.delete("/v1/prefs")).statusCode).toBe(204);
  const doc = (await c.get("/v1/prefs")).json();
  expect("ui" in doc).toBe(false);
  expect(doc.autosaveDir).toBe("D:/autosave");
  expect(doc.chooserDirs).toEqual({ import: "E:/in" });
});
