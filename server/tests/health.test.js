// SPDX-License-Identifier: MIT
// Port of tests/test_health.py — the JustWrite server boots, serves /v1/health, creates
// SQLite, and mounts the shared llm-runner router in-process.
//
// PYTHON FAILS `test_runner_cache_lives_under_data_dir` ON THIS BOX TODAY; THE JS PASSES IT
// (build sheet rule 21). Python's suite never redirects JUST_AI_HOME, and since the
// 2026-10-06 sibling adoption a fresh database whose own cache holds no models adopts the
// family registry's sibling cache that does — so Python read the user's real `caches.json`
// and pointed the service at JustWrite's dev cache (measured 2026-10-08:
// `E:\Dev\Web\justwrite-app\src-tauri\target\debug\data\ai-cache`). The JS points
// JUST_AI_HOME at a temp folder (helpers.useHermeticKit), so the cache is `<tmp>/ai-cache`.
// Fix for Python: set JUST_AI_HOME to a tmp folder in the suite.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pyPath } from "@delebash/llm-runner/runner/cache_registry";
import * as lifecycle from "@delebash/llm-runner/runner/lifecycle";
import { expect, test } from "vitest";
import { createApp } from "../src/app.js";
import { client, tmpPath, useHermeticKit } from "./helpers.js";

useHermeticKit();

test("health_and_db", async () => {
  const tmp = tmpPath();
  const c = await client(tmp);
  const r = await c.get("/v1/health");
  expect(r.statusCode).toBe(200);
  const body = r.json();
  expect(body.status).toBe("ok");
  expect(body.version).toBeTruthy();
  expect(body.dbReady).toBe(true);
  expect(body.dataDir).toBe(tmp);
  expect(existsSync(join(tmp, "justwrite.db"))).toBe(true);
});

test("runner_cache_lives_under_data_dir", async () => {
  // The bundled runner's engine + model cache resolves under the app data dir (portable
  // root: <dataDir>/ai-cache), not the OS ~/.cache — installLlm threads dataDir →
  // configureService(cacheRoot=...).
  const tmp = tmpPath();
  await createApp(tmp);
  expect(String(lifecycle.getService().cacheRoot)).toBe(pyPath(join(tmp, "ai-cache")));
});

test("shared_runner_mounted", async () => {
  const c = await client(tmpPath());
  // The shared runner is mounted in-process — JustWrite gets the same /v1/llm-runner/*
  // surface JustVoice does (config is DB-backed: /config).
  const r = await c.get("/v1/llm-runner/config");
  expect(r.statusCode).toBe(200);
  const body = r.json();
  expect("safetyMarginMb" in body).toBe(true); // camelCase wire from the runner
  expect(body.llamacpp.binaries.length).toBeGreaterThan(0); // binaries seeded into the DB
});

test("disk_usage_mounted", async () => {
  // The shared platform disk-usage router is mounted over the same dataDir. Every bucket key
  // is present, and the DB the server just created is counted in the `database` bucket.
  const c = await client(tmpPath());
  const r = await c.get("/v1/disk/usage");
  expect(r.statusCode).toBe(200);
  const body = r.json();
  for (const k of ["database", "appLogs", "modelsCache", "engineBuilds", "spawnLogs", "total", "diskFree", "diskTotal"]) {
    expect(k in body).toBe(true);
  }
  expect(body.database).toBeGreaterThan(0); // justwrite.db exists after createApp
  expect(body.diskTotal).toBeGreaterThan(0);
});
