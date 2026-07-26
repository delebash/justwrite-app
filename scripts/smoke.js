#!/usr/bin/env node
// `npm run smoke` — the renderer gate, one command, against REAL app data.
//
// WHY this script exists (the user's ruling, 2026-07-26: "why arent you using
// the app directory with its models and setup with its data db?"):
// `tests/smoke/headless-smoke.js` assumes a server and a vite are already up,
// so every run needed a hand-rolled boot — and the hand-rolled boot kept
// pointing at an EMPTY scratch data dir. An empty dir has no project, so the app
// renders the onboarding screen for every route and the sweep asserts the
// welcome screen while reporting "all routes rendered". Codifying the boot is
// what stops that from being re-invented (wrongly) every session.
//
// The data dir it boots against is a SNAPSHOT of the real one, not the real one:
//   · it carries the actual setup — providers, model catalog, presets, settings —
//     so the AI surfaces render what they render on the user's box;
//   · the smoke WRITES (activeProjectId, kv, the autosave debounce), and it must
//     never write those into the live workspace;
//   · the app is usually RUNNING while this is run, and two processes on one
//     SQLite file is not a thing to do casually.
// sqlite3's backup API is used rather than a file copy precisely because the
// source may be open and mid-write.
//
// Ports: vite MUST be 1420. services/serverApi.js:17 declares devPorts:["1420"],
// and the shared resolver (kit serverApi.js:35-44) returns the PAGE ORIGIN for
// any other port — so on :1421 the renderer would send its API calls to the vite
// server. The JW server, by contrast, is addressed explicitly via
// VITE_SERVER_URL + JW_SERVER, so it takes a free port and stays off the live
// one.
//
// Env: JW_DATA_ROOT (source root to snapshot), JW_SMOKE_PORT (server port),
// JW_KEEP (leave the servers up after the run), plus everything the smoke reads.

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { findPython, isUp, sleep, waitReady } from "../tests/lib/smoke-common.js";

const require = createRequire(import.meta.url);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const VITE_PORT = 1420;
const SERVER_PORT = Number(process.env.JW_SMOKE_PORT || 17496);
const SERVER_URL = `http://127.0.0.1:${SERVER_PORT}`;
const APP_URL = `http://localhost:${VITE_PORT}`;

const children = [];
let scratch = "";

/**
 * The data root the desktop app actually uses.
 *
 * Asking the RUNNING server is the authoritative answer and the first probe:
 * /v1/health reports its own `dataDir` (api/health.py:24), so we read the truth
 * instead of re-deriving it. The fallbacks mirror src-tauri/src/lib.rs:298
 * `resolve_data_root` — the `dataroot.txt` pointer beside the exe, else
 * `<exe_dir>/data` — for the case where the app is closed. Deliberately NOT a
 * full port of that function: it is a fallback for a dev box, and the health
 * probe covers the case that matters.
 */
async function findDataRoot() {
  if (process.env.JW_DATA_ROOT) return process.env.JW_DATA_ROOT;
  for (const port of [17495, SERVER_PORT]) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/v1/health`, { signal: AbortSignal.timeout(1500) });
      if (r.ok) {
        const { dataDir } = await r.json();
        if (dataDir && existsSync(dataDir)) return dataDir;
      }
    } catch { /* not running — try the next probe */ }
  }
  for (const profile of ["debug", "release"]) {
    const exeDir = join(ROOT, "src-tauri", "target", profile);
    const pointer = join(exeDir, "dataroot.txt");
    if (existsSync(pointer)) {
      const p = require("node:fs").readFileSync(pointer, "utf8").trim();
      if (p && existsSync(p)) return p;
    }
    if (existsSync(join(exeDir, "data", "justwrite.db"))) return join(exeDir, "data");
  }
  return "";
}

/** Snapshot <source>/justwrite.db into a fresh scratch root via sqlite3's backup
 *  API (safe against a live, mid-write source — a plain copy is not). Returns
 *  the scratch root; an empty one if there was nothing to snapshot. */
function snapshotDataRoot(source, python) {
  const dir = mkdtempSync(join(tmpdir(), "jw-smoke-"));
  const src = source ? join(source, "justwrite.db") : "";
  if (!src || !existsSync(src)) {
    console.log(`· data              EMPTY scratch dir (no DB at ${src || "<no root found>"}) — the sweep will be less realistic`);
    return dir;
  }
  const r = spawnSync(python, [
    "-c",
    "import sqlite3,sys\ns=sqlite3.connect(sys.argv[1]);d=sqlite3.connect(sys.argv[2])\ns.backup(d)\nd.close();s.close()",
    src, join(dir, "justwrite.db"),
  ], { encoding: "utf8" });
  if (r.status !== 0) {
    console.log(`· data              snapshot FAILED (${(r.stderr || "").trim().slice(0, 160)}) — continuing on an empty dir`);
    return dir;
  }
  const mb = (statSync(join(dir, "justwrite.db")).size / 1048576).toFixed(1);
  console.log(`· data              snapshot of ${source} (${mb} MB) → ${dir}`);
  return dir;
}

/** Vite's own CLI entry, resolved through its package.json `bin` map.
 *  NOT `require.resolve("vite/bin/vite.js")`: vite's "exports" field does not
 *  publish that subpath, so the resolve throws ERR_PACKAGE_PATH_NOT_EXPORTED
 *  (measured 2026-07-26, vite in this repo's node_modules). And not
 *  `node_modules/.bin/vite` either — on Windows that is a .cmd, which node
 *  refuses to spawn without a shell. The `bin` map is the published contract. */
function viteBin() {
  const pkgPath = require.resolve("vite/package.json");
  const { bin } = require(pkgPath);
  const rel = typeof bin === "string" ? bin : bin?.vite;
  if (!rel) throw new Error("vite package.json declares no `bin` entry");
  return join(dirname(pkgPath), rel);
}

function track(label, child) {
  child.on("exit", (code) => {
    if (code !== 0 && code !== null) console.log(`· ${label} exited with code ${code}`);
  });
  children.push({ label, child });
  return child;
}

/** Kill a child AND its grandchildren. `child.kill()` on Windows signals only
 *  the direct process, which strands the uvicorn/esbuild workers holding the
 *  ports — the next run then dies on "port already in use". */
function killTree(child) {
  if (!child || child.exitCode !== null) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    try { process.kill(-child.pid, "SIGTERM"); } catch { child.kill("SIGTERM"); }
  }
}

function cleanup() {
  for (const { child } of children) killTree(child);
  if (scratch && !process.env.JW_KEEP) {
    try { rmSync(scratch, { recursive: true, force: true }); } catch { /* best effort */ }
  }
}

/** Is anything holding the vite port? Probed in THREE address forms because
 *  `npm run dev`'s vite binds ::1 ONLY on this box (verified 2026-07-26:
 *  Get-NetTCPConnection showed LocalAddress ::1, LocalPort 1420), so a
 *  127.0.0.1-only probe reports the port free while the user's app is running —
 *  and the guard below would then wave the run through to a confusing
 *  strictPort bind failure. */
async function vitePortBusy() {
  for (const host of ["localhost", "127.0.0.1", "[::1]"]) {
    if (await isUp(`http://${host}:${VITE_PORT}`)) return true;
  }
  return false;
}

async function main() {
  if (await vitePortBusy()) {
    console.log(
      `✗ port ${VITE_PORT} is already serving — that is your running app.\n` +
      "  The renderer MUST be on 1420 (services/serverApi.js:17 devPorts), so this\n" +
      "  script cannot share the box with `npm run dev`. Close the app and re-run,\n" +
      "  or drive tests/smoke/headless-smoke.js yourself against your own boot.",
    );
    process.exit(2);
  }

  const python = findPython(ROOT);
  const source = await findDataRoot();
  scratch = snapshotDataRoot(source, python);

  mkdirSync(scratch, { recursive: true });
  track("server", spawn(python, ["-m", "justwrite_server.cli", "serve", "--port", String(SERVER_PORT), "--data-dir", scratch], {
    cwd: join(ROOT, "server"),
    stdio: ["ignore", "ignore", "inherit"],
    env: { ...process.env, JUSTWRITE_DATA_DIR: scratch },
  }));
  track("vite", spawn(process.execPath, [viteBin(), "--port", String(VITE_PORT), "--strictPort"], {
    cwd: ROOT,
    stdio: ["ignore", "ignore", "inherit"],
    env: { ...process.env, VITE_SERVER_URL: SERVER_URL },
  }));

  await waitReady(`${SERVER_URL}/v1/health`, "smoke server");
  await waitReady(APP_URL, "smoke vite");
  await sleep(500);

  const smoke = spawn(process.execPath, [join(ROOT, "tests", "smoke", "headless-smoke.js")], {
    cwd: ROOT,
    stdio: "inherit",
    env: { ...process.env, JW_SERVER: SERVER_URL, JW_APP: APP_URL },
  });
  const code = await new Promise((r) => smoke.on("exit", r));

  if (process.env.JW_KEEP) {
    console.log(`\n(JW_KEEP set — leaving vite on ${APP_URL}, server on ${SERVER_URL}, data at ${scratch})`);
    children.length = 0;
    scratch = "";
  }
  return code ?? 1;
}

for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => { cleanup(); process.exit(130); });

let exitCode = 1;
try {
  exitCode = await main();
} catch (e) {
  console.log(`✗ smoke orchestrator failed: ${String(e?.message || e)}`);
} finally {
  cleanup();
}
process.exit(exitCode);
