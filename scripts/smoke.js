#!/usr/bin/env node
// `npm run smoke` — the renderer gate, one command, against REAL app data.
//
// WHY this script exists (the user's ruling, 2026-07-26: "why arent you using
// the app directory with its models and setup with its data db?"):
// `tests/smoke/headless-smoke.js` assumes a server and the UI are already up,
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
// SQLite's backup API (scripts/snapshot-db.js) is used rather than a file copy
// precisely because the source may be open and mid-write.
//
// The UI it drives is the BUILT one (Quasar's browser build, dist/spa — built fresh at the start
// of every run), served by the scratch server itself, as the headless app serves it. Same origin,
// so the renderer talks to the server it was served from, and nothing needs the renderer's dev
// port 1420 — the run can share the box with a running app. (Before the Quasar move it ran
// Vite's dev server on 1420, which is why it used to refuse to run beside `npm run dev`.)
//
// Env: JW_DATA_ROOT (source root to snapshot), JW_SMOKE_PORT (server port),
// JW_KEEP (leave the servers up after the run), plus everything the smoke reads.

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveAppDataRoot } from "../bench/harness/lib/dataRoot.js";
import { sleep, waitReady } from "../tests/lib/smoke-common.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SERVER_PORT = Number(process.env.JW_SMOKE_PORT || 17496);
const SERVER_URL = `http://127.0.0.1:${SERVER_PORT}`;
const APP_URL = SERVER_URL; // the scratch server serves the built UI at /

const children = [];
let scratch = "";

/**
 * The data root the desktop app actually uses.
 *
 * Asking the RUNNING server is the authoritative answer and the first probe:
 * /v1/health reports its own `dataDir` (server/src/api/health_api.js), so we read the
 * truth instead of re-deriving it. With the app closed, the fallback is the kit's one
 * ladder — the same one the desktop shell and the server use (`<repo>/data` in a
 * checkout, unless JUSTWRITE_DATA_DIR or a Change-folder pointer says otherwise).
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
  const root = resolveAppDataRoot(ROOT);
  return existsSync(join(root, "justwrite.db")) ? root : "";
}

/** Snapshot <source>/justwrite.db into a fresh scratch root via SQLite's backup
 *  API (safe against a live, mid-write source — a plain copy is not). Returns
 *  the scratch root; an empty one if there was nothing to snapshot.
 *
 *  The snapshot then switches warm_default_on_startup OFF in the scratch copy: a
 *  configured source DB carries a default model + warm-on-boot, so the scratch
 *  server otherwise spends every gate run downloading a ~500 MB llama.cpp build
 *  into %TEMP% (measured 2026-08-08) for a sweep that never generates a token. */
function snapshotDataRoot(source) {
  const dir = mkdtempSync(join(tmpdir(), "jw-smoke-"));
  const src = source ? join(source, "justwrite.db") : "";
  if (!src || !existsSync(src)) {
    console.log(`· data              EMPTY scratch dir (no DB at ${src || "<no root found>"}) — the sweep will be less realistic`);
    return dir;
  }
  const r = spawnSync(process.execPath, [
    join(ROOT, "scripts", "node24.js"), join(ROOT, "scripts", "snapshot-db.js"), src, join(dir, "justwrite.db"),
  ], { encoding: "utf8" });
  if (r.status !== 0) {
    console.log(`· data              snapshot FAILED (${(r.stderr || "").trim().slice(0, 160)}) — continuing on an empty dir`);
    return dir;
  }
  const mb = (statSync(join(dir, "justwrite.db")).size / 1048576).toFixed(1);
  console.log(`· data              snapshot of ${source} (${mb} MB) → ${dir}`);
  return dir;
}

/** Quasar's CLI entry (app-structure §Q.6: run as node, never through npm's .cmd shims). */
const QUASAR = join(ROOT, "node_modules", "@quasar", "app-vite", "bin", "quasar.js");
const UI_DIR = join(ROOT, "dist", "spa");

function track(label, child) {
  child.on("exit", (code) => {
    if (code !== 0 && code !== null) console.log(`· ${label} exited with code ${code}`);
  });
  children.push({ label, child });
  return child;
}

/** Kill a child AND its grandchildren. `child.kill()` on Windows signals only
 *  the direct process, which strands the server/esbuild children holding the
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

async function main() {
  // The UI under test is built from the current source, every run.
  console.log("· ui                building dist/spa (quasar build)…");
  const built = spawnSync(process.execPath, [QUASAR, "build"], { cwd: ROOT, stdio: ["ignore", "ignore", "inherit"] });
  if (built.status !== 0 || !existsSync(join(UI_DIR, "index.html"))) {
    console.log("✗ quasar build failed — see the output above");
    process.exit(2);
  }

  const source = await findDataRoot();
  scratch = snapshotDataRoot(source);

  mkdirSync(scratch, { recursive: true });
  // The server on Electron's own Node (scripts/node24.js) — the runtime it ships on.
  track("server", spawn(process.execPath, [join(ROOT, "scripts", "node24.js"), join(ROOT, "server", "src", "serve.js"), "serve", "--port", String(SERVER_PORT), "--data-dir", scratch], {
    cwd: ROOT,
    stdio: ["ignore", "ignore", "inherit"],
    // JUST_AI_HOME confines the scratch server's family registrations to the scratch
    // itself. Without it, this boot writes "JustWrite Server → <scratch>/ai-cache"
    // into the MACHINE-WIDE %LOCALAPPDATA%/just-ai registry, and a scratch that
    // outlives cleanup becomes a Quick Setup cache offer (the 2026-08-08 ghost —
    // one proceed click repointed the real install's cache at %TEMP%). The kit now
    // also refuses temp-dir roots, but this harness should not rely on that net.
    env: { ...process.env, JUSTWRITE_DATA_DIR: scratch, JUST_AI_HOME: scratch, JUSTWRITE_UI_DIR: UI_DIR },
  }));
  await waitReady(`${SERVER_URL}/v1/health`, "smoke server");
  await sleep(500);

  const smoke = spawn(process.execPath, [join(ROOT, "tests", "smoke", "headless-smoke.js")], {
    cwd: ROOT,
    stdio: "inherit",
    env: { ...process.env, JW_SERVER: SERVER_URL, JW_APP: APP_URL },
  });
  const code = await new Promise((r) => smoke.on("exit", r));

  if (process.env.JW_KEEP) {
    console.log(`\n(JW_KEEP set — leaving the server (and the UI) on ${SERVER_URL}, data at ${scratch})`);
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
