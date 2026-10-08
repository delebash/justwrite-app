// SPDX-License-Identifier: MIT
// The database package's surface — the port of justwrite_server/database/__init__.py.
// (Python forwarded `SessionLocal` / `engine` lazily because init_db REBINDS them; here they
// live on `session.state`, read at call time, so plain re-exports are enough.)

export { getDb, getEngine, initDb, state } from "./session.js";
