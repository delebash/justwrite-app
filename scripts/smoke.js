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
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { sleep, waitReady } from "../tests/lib/smoke-common.js";
import { findDataRoot, killTree, ROOT, snapshotDataRoot, startServer } from "./lib/scratch-server.js";

const SERVER_PORT = Number(process.env.JW_SMOKE_PORT || 17496);
const SERVER_URL = `http://127.0.0.1:${SERVER_PORT}`;
const APP_URL = SERVER_URL; // the scratch server serves the built UI at /

const children = [];
let scratch = "";

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

function cleanup() {
  for (const { child } of children) killTree(child);
  if (scratch && !process.env.JW_KEEP) {
    try { rmSync(scratch, { recursive: true, force: true }); } catch { /* best effort */ }
  }
}

async function main() {
  // The UI under test is built from the current source, every run — with a key missing from the
  // English catalog reported as a console error, which the sweep counts (src/i18n/index.js).
  console.log("· ui                building dist/spa (quasar build)…");
  const built = spawnSync(process.execPath, [QUASAR, "build"], {
    cwd: ROOT,
    stdio: ["ignore", "ignore", "inherit"],
    env: { ...process.env, QCLI_I18N_MISSING_ERRORS: "1" },
  });
  if (built.status !== 0 || !existsSync(join(UI_DIR, "index.html"))) {
    console.log("✗ quasar build failed — see the output above");
    process.exit(2);
  }

  const source = await findDataRoot([17495, SERVER_PORT]);
  scratch = snapshotDataRoot(source);

  mkdirSync(scratch, { recursive: true });
  track("server", startServer({ port: SERVER_PORT, dataDir: scratch, uiDir: UI_DIR }));
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
