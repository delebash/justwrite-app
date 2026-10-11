// SPDX-License-Identifier: MIT
// JustWrite's seeded settings (2026-10-11): a value the user can change still comes from the
// database, never from code. Seeded insert-if-missing per key — a value already set (the
// user's, or an earlier seed's) is never overwritten — at boot, after a workspace reset, and
// after a settings reset.
import { expect, test } from "vitest";
import { DEFAULT_AI_PREFS, seedAppSettings } from "../src/database/app_settings_seed.js";
import { seedWorkspace } from "../src/database/seed.js";
import { state } from "../src/database/session.js";
import { client, tmpPath, useHermeticKit } from "./helpers.js";

useHermeticKit();

test("a fresh workspace gets the story-context share", async () => {
  const c = await client(tmpPath());
  seedWorkspace();
  const ai = (await c.get("/v1/settings")).json().ai;
  expect(ai).toEqual({ storyContextShare: 0.15 });
  expect(DEFAULT_AI_PREFS.storyContextShare).toBe(0.15);
});

test("an existing ai section gains the missing key and keeps its own", async () => {
  const c = await client(tmpPath());
  await c.patch("/v1/settings", { json: { ai: { autoRebuildRagIndex: true } } });
  expect(seedAppSettings(state.handle)).toBe(1);
  expect((await c.get("/v1/settings")).json().ai).toEqual({ autoRebuildRagIndex: true, storyContextShare: 0.15 });
});

test("a value already set is never overwritten, and a second seed adds nothing", async () => {
  const c = await client(tmpPath());
  await c.patch("/v1/settings", { json: { ai: { storyContextShare: 0.3 } } });
  expect(seedAppSettings(state.handle)).toBe(0);
  expect((await c.get("/v1/settings")).json().ai.storyContextShare).toBe(0.3);
});

test("a settings reset seeds it again", async () => {
  const c = await client(tmpPath());
  seedWorkspace();
  await c.patch("/v1/settings", { json: { ai: { storyContextShare: 0.3 } } });
  expect((await c.delete("/v1/settings")).statusCode).toBe(204);
  expect((await c.get("/v1/settings")).json().ai).toEqual({ storyContextShare: 0.15 });
});
