// SPDX-License-Identifier: MIT
// SQLite — the primary persistence layer for the JustWrite server (the port of
// justwrite_server/database/session.py).
//
// Python built a SQLAlchemy engine + session factory per data dir; here the kit's database
// helper (better-sqlite3, one synchronous connection) is the handle every route uses, with
// foreign keys ON — JustWrite's per-connection `PRAGMA foreign_keys=ON` (the FK cascade is
// what deletes a book's rows). The tables are the captured DDL Python's create_all writes
// (models_schema.js). NO migrations (user decree 2026-07-06, pre-production): schema
// changes are picked up by dropping the dev DB (or POST /v1/data/reset) + reseeding.

import { mkdirSync } from "node:fs";
import path from "node:path";
import { openDatabase } from "@delebash/llm-runner/platform/sql";
import { purePath, samePath } from "@delebash/llm-runner/platform/data_paths";
import { getLogger } from "@delebash/llm-runner/platform/log";
import { RuntimeError } from "@delebash/llm-runner/platform/py";
import { TABLES } from "./models.js";

const log = getLogger("justwrite_server.database.session");

// Python's module globals `engine` / `SessionLocal` / `_db_path` (rebound by initDb).
export const state = { handle: null, dbPath: null };

/**
 * Open the database + create the tables. Idempotent; re-opens when a DIFFERENT dataDir is
 * asked for, so a test's createApp(tmp) doesn't pin every later call to the first dir
 * (the JustVoice guard).
 */
export function initDb(dataDir) {
  if (state.handle !== null) {
    if (state.dbPath !== null && samePath(path.dirname(state.dbPath), dataDir)) return state.handle;
    try {
      state.handle.close();
    } catch {
      /* already closed */
    }
    state.handle = null;
  }
  mkdirSync(dataDir, { recursive: true });
  state.dbPath = purePath(path.join(dataDir, "justwrite.db"));
  const h = openDatabase(state.dbPath, { foreignKeys: true });
  h.createTables(TABLES);
  state.handle = h;
  log.info(`Database: ${state.dbPath}`);
  return h;
}

/** The open handle, or null before boot (Python's `get_engine()`). */
export function getEngine() {
  return state.handle;
}

/** The handle every route uses (Python's `get_db` dependency). */
export function getDb() {
  if (state.handle === null) throw new RuntimeError("Database not initialized — call initDb() during boot");
  return state.handle;
}
