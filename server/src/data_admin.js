// SPDX-License-Identifier: MIT
// Host wiring for the shared data backup/restore/reset router (the kit's `makeDataRouter`) —
// the port of justwrite_server/data_admin.py. JustWrite keeps everything in its SQLite DB,
// so no extra asset dirs — a DB backup is the whole workspace. Backup + reset cover BOTH
// table sets: JustWrite's domain tables and the shared LLM tables, which live on the same
// DB. `reset` drops every table, recreates them and reseeds.
//
// The access tokens (the settings' `auth` row) are this server's, not the data's: a reset keeps
// them, a restore keeps this server's (never the backup's — one made before a token was set would
// open an exposed server to the network, one with another token lock every client out), and a
// backup carries none (the template's keepAuth; the family's security review, 2026-10-20).

import path from "node:path";
import { LLM_TABLES } from "@delebash/core/llm";
import * as llmDb from "@delebash/core/llm/db";
import { makeDataRouter } from "@delebash/core/platform";
import * as lifecycle from "@delebash/core/runner/lifecycle";
import { KEPT_KEYS } from "./api/settings_api.js";
import { TABLES } from "./database/models.js";
import { seedWorkspace } from "./database/seed.js";
import { state } from "./database/session.js";
import { resetBookSync, restoreSyncHooks, windowChanges } from "./sync.js";

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
  // workspace reset — and the access tokens with them (a reset on an exposed headless server
  // must not open it to the network). Same KEPT_KEYS as DELETE /v1/settings.
  const preserved = new Map();
  for (const row of h.all(
    `SELECT * FROM settings WHERE settings."key" IN (${KEPT_KEYS.map(() => "?").join(", ")})`,
    KEPT_KEYS,
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
  // Sync starts a new library: the old one's engine tables and triggers go with the dropped
  // tables (this device keeps its identity).
  resetBookSync(h, path.dirname(state.dbPath));
  // Restore the preserved rows (user value wins over any seed).
  h.tx(() => {
    for (const [key, value] of preserved) {
      if (h.get("settings", key) === null) h.insert("settings", { key, value });
      else h.update("settings", { value }, { key });
    }
  });
  // the data's new epoch (after the kept rows, which held the old one): every other window reloads
  windowChanges.renewEpoch(h);
  windowChanges.replaced();
}

/** The `auth` row's text, read before a restore's copy and written back after it — both inside the
 *  restore's transaction (`h` its connection, the live database as `main`). The kit runs beforeCopy
 *  twice — first as a dry run, rolled back — so the second read is the one kept. */
let keptAuth;
const keepAuth = {
  beforeCopy: (h) => {
    keptAuth = h.all(`SELECT value FROM main.settings WHERE "key" = 'auth'`)[0]?.value;
  },
  afterCopy: (h) => {
    h.run(`DELETE FROM main.settings WHERE "key" = 'auth'`);
    if (keptAuth !== undefined) h.run(`INSERT INTO main.settings ("key", value) VALUES ('auth', ?)`, [keptAuth]);
  },
};

/** The kit's /v1/data router. `gate`: the app's MaintenanceGate (app.js) — while a restore or a reset
 *  replaces the data, the other writes wait or are refused, and the restore is all or nothing. */
export function getDataRouter({ gate } = {}) {
  return makeDataRouter({
    getDbPath: () => state.dbPath,
    metadata: [TABLES, LLM_TABLES],
    runReset: reset,
    assetDirs: () => ({}),
    // Sync's restore steps (sync.js), then this server's tokens: a backup from another sync
    // library is refused while this device syncs; the backup's rows keep their sync stamps;
    // this device keeps its own sync settings and continues as a new device, so the other
    // devices' newer work wins.
    beforeCopy: (h) => {
      restoreSyncHooks.beforeCopy(h);
      keepAuth.beforeCopy(h);
    },
    afterCopy: (h) => {
      restoreSyncHooks.afterCopy(h);
      keepAuth.afterCopy(h);
      // and the data's new epoch, in the same transaction as the restored rows (the backup's own
      // row replaced): every other window reloads (sync.js windowChanges)
      windowChanges.renewEpoch(h);
    },
    // then a backup from an older version gets what this one's seed adds (as at start)
    afterTables: async () => {
      await restoreSyncHooks.afterTables();
      seedWorkspace(state.handle);
    },
    // a backup file carries no way in: shared or left somewhere, it never hands out a token
    scrubBackup: (h) => h.run(`DELETE FROM settings WHERE "key" = 'auth'`),
    // A restore replaces routing/tunes under the live app — same clean-slate rule as reset: the
    // engine stops before (nothing it runs writes into the data being replaced) and after (no
    // child keeps running under the pre-restore config).
    beforeReplace: stopRunnerBestEffort,
    // every window reloads — only once the data has been replaced (a refused restore replaced nothing)
    onReplaced: async () => {
      windowChanges.replaced();
      await stopRunnerBestEffort();
    },
    gate,
  });
}
