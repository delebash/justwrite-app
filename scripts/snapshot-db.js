// SPDX-License-Identifier: MIT
// Snapshot a live SQLite database with SQLite's backup API (safe against a source that is
// open and mid-write — a plain file copy is not), then switch warm-on-boot OFF in the copy.
// Used by scripts/smoke.js and scripts/eval.js (scripts/lib/scratch-server.js); runs on
// Electron's Node (scripts/node24.js), the runtime better-sqlite3 is built for. better-sqlite3
// is the kit's (its `openDatabase`; `.raw` is the better-sqlite3 handle) — this repo doesn't
// install it itself.
//
//   node scripts/node24.js scripts/snapshot-db.js <source.db> <dest.db> [--cache-root <dir>]
//
// --cache-root points the COPY at an engine cache when the source chose none (the stored choice
// the kit reads first — `runner_setting.cache_root`; a source that chose one keeps it), so a
// server on the copy loads the user's installed engine and models instead of downloading its
// own; the source database is never written.

import { openDatabase } from "@delebash/llm-runner/platform";

const [src, dest, flag, cacheRoot] = process.argv.slice(2);
if (!src || !dest || (flag && (flag !== "--cache-root" || !cacheRoot))) {
  console.error("usage: snapshot-db.js <source.db> <dest.db> [--cache-root <dir>]");
  process.exit(2);
}
const source = openDatabase(src, { foreignKeys: false, readonly: true });
await source.raw.backup(dest);
source.close();
const copy = openDatabase(dest, { foreignKeys: false });
try {
  copy.run("update runner_setting set value = '0' where key = 'warm_default_on_startup'");
  if (cacheRoot) {
    copy.run(
      "insert into runner_setting (key, value, built_in) values ('cache_root', ?, 0) on conflict (key) do update set value = excluded.value where runner_setting.value = ''",
      [cacheRoot],
    );
  }
} catch {
  /* no runner_setting table yet — nothing to switch off */
}
copy.close();
