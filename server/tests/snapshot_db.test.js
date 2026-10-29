// SPDX-License-Identifier: MIT
// scripts/snapshot-db.js — the copy of the user's database that the smoke, the flows, the eval and
// the screenshot capture run their servers on. A server on the copy must write nowhere but its own
// folder: the copy keeps the user's settings except the two that point outside it, the autosave
// folder (it would rotate the book's autosaves in the user's real folder) and sync (its cloud
// folder and paired devices would get the test's edits). Run as the script runs: its own process.
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { openDatabase } from "@delebash/core/platform/sql";
import { expect, test } from "vitest";
import { tmpPath } from "./helpers.js";

const SCRIPT = join(import.meta.dirname, "..", "..", "scripts", "snapshot-db.js");

test("the copy keeps the user's settings but none that point outside its folder", () => {
  const dir = tmpPath();
  const src = join(dir, "source.db");
  const dest = join(dir, "copy.db");
  const db = openDatabase(src, { foreignKeys: false });
  db.run("create table settings (key text primary key, value text)");
  db.run("create table runner_setting (key text primary key, value text, built_in integer)");
  db.run("insert into settings values ('ui', ?), ('autosaveDir', ?), ('sync', ?)", [
    JSON.stringify({ themeMode: "dark" }),
    JSON.stringify(join(dir, "real-autosaves")),
    JSON.stringify({ folder: join(dir, "real-cloud-folder"), peers: [{ url: "http://laptop:17495" }], autoMinutes: 5 }),
  ]);
  db.run("insert into runner_setting values ('warm_default_on_startup', '1', 1)");
  db.close();

  const r = spawnSync(process.execPath, [SCRIPT, src, dest], { encoding: "utf8", env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" } });
  expect(r.stderr).toBe("");
  expect(r.status).toBe(0);

  const copy = openDatabase(dest, { foreignKeys: false, readonly: true });
  expect(copy.all("select key from settings order by key").map((s) => s.key)).toEqual(["ui"]);
  expect(copy.one("select value from runner_setting where key = 'warm_default_on_startup'").value).toBe("0");
  copy.close();
  // the source is never written
  const source = openDatabase(src, { foreignKeys: false, readonly: true });
  expect(source.all("select key from settings order by key").map((s) => s.key)).toEqual(["autosaveDir", "sync", "ui"]);
  source.close();
});
