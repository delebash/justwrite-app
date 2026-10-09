// SPDX-License-Identifier: MIT
// The phone's in-app server: JustWrite's server (server/src/phone.js) in a web worker, on SQLite
// WASM in the app's private storage (the kit's serveInWorker). Bundled by scripts/phone-worker.js
// into worker-bundle/; started by boot.js.
import { openDatabase } from "@delebash/llm-runner/platform/sql";
import { serveInWorker } from "@delebash/llm-runner/platform/worker/runtime";
import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import { createPhoneApp } from "../../server/src/phone.js";

// SQLite's .wasm: where the window says it is (boot.js — the build gives it its own name)
const wasm = new URL(self.location.href).searchParams.get("wasm");

serveInWorker({
  sqlite3InitModule,
  sqliteOptions: wasm ? { locateFile: (file) => (file.endsWith(".wasm") ? wasm : file) } : {},
  storage: "justwrite",
  build: () => createPhoneApp({ handle: openDatabase("/justwrite.db", { foreignKeys: true }) }),
});
