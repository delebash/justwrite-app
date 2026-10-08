// SPDX-License-Identifier: MIT
// Host wiring for the shared data backup/restore/reset router (the kit's `makeDataRouter`) —
// the port of justwrite_server/data_admin.py. JustWrite keeps everything in its SQLite DB,
// so no extra asset dirs — a DB backup is the whole workspace. Backup + reset cover BOTH
// table sets: JustWrite's domain tables and the shared LLM tables, which live on the same
// DB. `reset` drops every table, recreates them and reseeds.

import { LLM_TABLES } from "@delebash/llm-runner/llm";
import * as llmDb from "@delebash/llm-runner/llm/db";
import { makeDataRouter } from "@delebash/llm-runner/platform";
import * as lifecycle from "@delebash/llm-runner/runner/lifecycle";
import { PRESERVED_FOLDER_KEYS } from "./api/settings_api.js";
import { TABLES } from "./database/models.js";
import { seedWorkspace } from "./database/seed.js";
import { state } from "./database/session.js";

/**
 * Full runner teardown (unload every child + clear the VRAM ledger). A reset or restore is a
 * CLEAN SLATE (2026-07-11, user decision): children spawned under pre-reset tunes/routing
 * must not keep running while the UI claims the new config is loaded. Best-effort — a reset
 * must never fail on teardown.
 */
async function stopRunnerBestEffort() {
  try {
    await lifecycle.getService().stop();
  } catch {
    /* best-effort */
  }
}

export async function reset() {
  const h = state.handle;
  if (h === null) return;

  // Unload models FIRST, while the config they were spawned from still exists.
  await stopRunnerBestEffort();

  // D3b (2026-07-13, user): a user-changed FOLDER PATH never resets. Capture the folder-path
  // config rows (autosaveDir / chooserDirs) BEFORE the drop and re-insert them AFTER the
  // reseed, so a relocated autosave folder + remembered chooser locations survive a
  // workspace reset. Same whitelist as DELETE /v1/settings.
  const preserved = new Map();
  for (const row of h.all(
    `SELECT * FROM settings WHERE settings."key" IN (${PRESERVED_FOLDER_KEYS.map(() => "?").join(", ")})`,
    PRESERVED_FOLDER_KEYS,
    "settings",
  )) {
    preserved.set(row.key, row.value);
  }

  // True drop + reseed (project policy: no migrations). DROP + CREATE recreates the SCHEMA,
  // not just the rows — so a reset also recovers from schema drift (e.g. a column added to
  // an LLM table since this DB was first created). Covers BOTH table sets, children before
  // parents (the reverse of the creation order); then JustWrite's tables, then the LLM ones,
  // as Python's drop_all / create_all ran.
  h.tx(() => {
    for (const t of [...TABLES].reverse()) h.exec(`DROP TABLE IF EXISTS "${t.name}"`);
    for (const t of [...LLM_TABLES].reverse()) h.exec(`DROP TABLE IF EXISTS "${t.name}"`);
    h.createTables(TABLES);
    llmDb.createAll(h);
  });

  seedWorkspace(h);
  // Restore the preserved folder-path config (user value wins over any seed).
  h.tx(() => {
    for (const [key, value] of preserved) {
      if (h.get("settings", key) === null) h.insert("settings", { key, value });
      else h.update("settings", { value }, { key });
    }
  });
}

export function getDataRouter() {
  return makeDataRouter({
    getDbPath: () => state.dbPath,
    metadata: [TABLES, LLM_TABLES],
    runReset: reset,
    assetDirs: () => ({}),
    // A restore replaces routing/tunes under the live app — same clean-slate rule as reset:
    // no child keeps running under the pre-restore config.
    onReplaced: stopRunnerBestEffort,
  });
}
