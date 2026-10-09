// SPDX-License-Identifier: MIT
// Builds the phone's in-app server — JustWrite's server (server/src/phone.js) for a web worker —
// into src/phone/worker-bundle/ (git-ignored): esbuild with the kit's worker plugin (Node's
// built-ins → browser stand-ins, better-sqlite3 → SQLite WASM, the `.phone.js` twins) and the
// polyfills of Node's built-ins, with SQLite's WASM binary beside it. quasar.config.js runs it
// before a Capacitor (phone) build, and before a dev run with the in-app server
// (JUSTWRITE_IN_APP_SERVER=1); `node scripts/phone-worker.js` builds it alone. The plan: the kit's
// docs/plans/2026-10-08-the-phone.md.
import { copyFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WORKER_GLOBALS, workerShims } from "@delebash/llm-runner/platform/worker/esbuild";
import { build } from "esbuild";
import { nodeModulesPolyfillPlugin } from "esbuild-plugins-node-modules-polyfill";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const PHONE_WORKER_DIR = path.join(root, "src", "phone", "worker-bundle");

export async function buildPhoneWorker() {
  mkdirSync(PHONE_WORKER_DIR, { recursive: true });
  copyFileSync(path.join(root, "node_modules", "@sqlite.org", "sqlite-wasm", "dist", "sqlite3.wasm"), path.join(PHONE_WORKER_DIR, "sqlite3.wasm"));
  const t0 = Date.now();
  const result = await build({
    entryPoints: [path.join(root, "src", "phone", "server-worker.js")],
    outfile: path.join(PHONE_WORKER_DIR, "server-worker.js"),
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    inject: [WORKER_GLOBALS],
    plugins: [workerShims({ appRoot: root, dedupe: ["yjs"] }), nodeModulesPolyfillPlugin({ globals: { Buffer: true, process: true }, fallback: "empty" })],
    logLevel: "warning",
    metafile: true,
  });
  const bytes = Object.values(result.metafile.outputs).reduce((n, o) => n + o.bytes, 0);
  console.log(`[phone] in-app server built: ${(bytes / 1024 / 1024).toFixed(1)} MB in ${Date.now() - t0} ms`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await buildPhoneWorker();
