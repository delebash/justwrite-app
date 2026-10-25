// SPDX-License-Identifier: MIT
// JustWrite's seeded settings (2026-10-11): a value the user can change still comes from the
// database, never from code. Seeded insert-if-missing per key — a value already set (the
// user's, or an earlier seed's) is never overwritten, unless it is still an earlier default
// (the kit's upgradeSettings) — at boot, after a workspace reset, and after a settings reset.
import { defaultsFingerprints, fingerprint } from "@delebash/core/platform/settings_upgrade";
import { expect, test } from "vitest";
import { DEFAULT_AI_PREFS, PREVIOUS_AI_PREFS, seedAppSettings, upgradeAppSettings } from "../src/database/app_settings_seed.js";
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

// Today's default of EVERY seeded key (the kit's fingerprint). A change here means a default
// changed: add the OLD fingerprint to PREVIOUS_AI_PREFS (so a library still holding it gets the
// new one), then update this line.
const TODAY = { storyContextShare: "7932a07a8cbc0885" };

test("today's defaults are the ones this test knows, and none of them is listed as earlier", () => {
  expect(defaultsFingerprints(DEFAULT_AI_PREFS)).toEqual(TODAY);
  for (const [key, print] of Object.entries(TODAY)) expect(PREVIOUS_AI_PREFS[key] ?? []).not.toContain(print);
});

test("a key still at an earlier default takes today's; one the user changed is left alone", async () => {
  const c = await client(tmpPath());
  seedWorkspace();
  // as a library made before a change would hold it: the earlier default, 0.1
  await c.patch("/v1/settings", { json: { ai: { storyContextShare: 0.1, autoRebuildRagIndex: true } } });
  expect(upgradeAppSettings(state.handle, { storyContextShare: [fingerprint(0.1)] })).toEqual(["storyContextShare"]);
  expect((await c.get("/v1/settings")).json().ai).toEqual({ storyContextShare: 0.15, autoRebuildRagIndex: true });
  // the user's own value
  await c.patch("/v1/settings", { json: { ai: { storyContextShare: 0.3 } } });
  expect(upgradeAppSettings(state.handle, { storyContextShare: [fingerprint(0.1)] })).toEqual([]);
  expect((await c.get("/v1/settings")).json().ai.storyContextShare).toBe(0.3);
});
