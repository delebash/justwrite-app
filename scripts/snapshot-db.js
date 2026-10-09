// SPDX-License-Identifier: MIT
// Snapshot a live SQLite database with SQLite's backup API (safe against a source that is
// open and mid-write — a plain file copy is not), then switch warm-on-boot OFF in the copy.
// Used by scripts/smoke.js; runs on Electron's Node (scripts/node24.js), the runtime
// better-sqlite3 is built for. better-sqlite3 is the kit's (its `openDatabase`; `.raw` is the
// better-sqlite3 handle) — this repo doesn't install it itself.
//
//   node scripts/node24.js scripts/snapshot-db.js <source.db> <dest.db>

import { openDatabase } from "@delebash/llm-runner/platform";

const [src, dest] = process.argv.slice(2);
if (!src || !dest) {
  console.error("usage: snapshot-db.js <source.db> <dest.db>");
  process.exit(2);
}
const source = openDatabase(src, { foreignKeys: false, readonly: true });
await source.raw.backup(dest);
source.close();
const copy = openDatabase(dest, { foreignKeys: false });
try {
  copy.run("update runner_setting set value = '0' where key = 'warm_default_on_startup'");
} catch {
  /* no runner_setting table yet — nothing to switch off */
}
copy.close();
