// SPDX-License-Identifier: MIT
// The server's modules load under Node itself. Vitest runs each module through its own transform, where a named import
// that its module doesn't export becomes undefined and fails only if it is called; Node refuses to load the module at
// all. JustDirect's server didn't start on 2026-11-07 — a kit name imported from the wrong entry — while every server
// test passed. So the server's entry, and everything it imports, is loaded once by Node in a child process, the way the
// desktop app and `npm run server` load it (importing serve.js runs nothing: its main runs only as the entry).
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { expect, test } from "vitest";

const SERVE = pathToFileURL(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src/serve.js")).href;

test("the server's entry and everything it imports load under Node", () => {
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", `await import(${JSON.stringify(SERVE)})`], {
    encoding: "utf8",
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    timeout: 60_000,
  });
  expect(r.status, r.stderr).toBe(0);
});
