// ONE drive mode: headless Chromium against the vite dev server (2026-07-20,
// the user's ruling — "drop headed"). The bench calls the app's services
// directly through window.__jwBench, so a visible window has nothing to show;
// progress is watched in the TERMINAL (the runner logs every leg + feature
// run). The old --headed (visible browser) and --tauri (CDP attach to the real
// WebView2 window) modes were deleted here — git history holds them if a
// watch-in-the-real-app mode is ever wanted again.
//
// The browser launch reuses the SHARED findChrome() (scripts/lib) — never a
// hardcoded path.

import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { resolveAppDataRoot } from "./dataRoot.js";
import { findChrome, findPython, isUp, sleep, waitReady } from "../../../tests/lib/smoke-common.js";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

/** Wait for the bench hook to exist on the page (it installs after mount). */
async function waitForHook(page, tries = 60) {
  for (let i = 0; i < tries; i++) {
    const v = await page.evaluate(() => window.__jwBench?.version ?? null).catch(() => null);
    if (v) return v;
    await sleep(500);
  }
  throw new Error(
    "window.__jwBench never appeared — the bench hook is DEV-only (import.meta.env.DEV); " +
    "the bench needs the dev renderer (vite), never a production build.",
  );
}

/** Start a child process, streaming a labelled tail of its output. */
function startProcess(label, cmd, args, { env, cwd, onLog } = {}) {
  const child = spawn(cmd, args, {
    env: { ...process.env, ...(env || {}) },
    cwd,
    shell: process.platform === "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const pipe = (stream) => {
    stream.setEncoding("utf8");
    stream.on("data", (d) => {
      const line = String(d).trim();
      if (line) onLog?.(`[${label}] ${line.split("\n").slice(-1)[0].slice(0, 160)}`);
    });
  };
  pipe(child.stdout);
  pipe(child.stderr);
  return child;
}

/**
 * Bring up the browser-mode dependencies we're missing. The server is only
 * started if nothing answers — the user's own running stack is never disturbed
 * or duplicated (a second server on the same data root is a real hazard).
 */
async function ensureBrowserStack({ app, server, autostart, repoRoot, onLog }) {
  const started = [];
  let dataRoot = ""; // set only when WE start the server — an already-up server's root is its own
  if (!(await isUp(`${server}/v1/health`))) {
    if (!autostart) throw new Error(`no JustWrite server at ${server} — start your app (npm run dev), or pass --autostart`);
    // The autostarted server must see the APP's data root (engine + models +
    // books), not the bare-CLI platformdirs default — that mismatch is the
    // "engine is not installed" trap. resolveAppDataRoot mirrors the shell.
    dataRoot = resolveAppDataRoot(repoRoot);
    onLog?.(`starting server (nothing answering at ${server}) — data root: ${dataRoot}`);
    // findPython, not bare "python": PATH's first interpreter is a stock install
    // with none of this project's deps, so this line died with "No module named
    // 'llm_runner'". It hid for a long time because the branch above only reaches
    // here when NOTHING is already answering — every bench run made while the
    // app was up skipped it, and it broke the first time the bench ran cold.
    started.push(startProcess("server", findPython(repoRoot), ["-m", "justwrite_server.cli", "serve", "--port", new URL(server).port || "17495"], {
      cwd: `${repoRoot}/server`, env: { JUSTWRITE_DATA_DIR: dataRoot }, onLog,
    }));
    await waitReady(`${server}/v1/health`, "server", 120);
  } else {
    onLog?.(`server already up at ${server}`);
  }

  if (!(await isUp(app))) {
    if (!autostart) throw new Error(`no vite dev server at ${app} (run \`npm run dev:vite\`, or pass --autostart)`);
    onLog?.(`starting vite (nothing answering at ${app})`);
    started.push(startProcess("vite", "npm", ["run", "dev:vite"], { cwd: repoRoot, onLog }));
    await waitReady(app, "vite", 120);
  } else {
    onLog?.(`vite already up at ${app}`);
  }
  return { started, dataRoot };
}

/**
 * Open the driven page (headless Chromium on the vite renderer).
 * Returns { page, hookVersion, pageErrors, dataRoot, close() }.
 */
export async function openDriver({
  app = process.env.JW_APP || "http://localhost:1420",
  server = process.env.JW_SERVER || "http://127.0.0.1:17495",
  autostart = false,
  repoRoot = process.cwd(),
  onLog,
} = {}) {
  const spawned = [];

  const closeSpawned = () => {
    for (const child of spawned.reverse()) {
      try {
        if (process.platform === "win32") spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
        else child.kill("SIGTERM");
      } catch { /* already gone */ }
    }
  };

  const stack = await ensureBrowserStack({ app, server, autostart, repoRoot, onLog });
  spawned.push(...stack.started);
  const exe = findChrome();
  onLog?.(`launching headless Chromium${exe ? ` at ${exe}` : " — Playwright's own build"}`);
  const browser = await chromium.launch({
    ...(exe ? { executablePath: exe } : {}),
    headless: true,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage();
  // Defect F (2026-07-22 pass-1 plan T6): the driven renderer must NOT warm-boot the
  // default chat model — the warm load rode along EVERY bench leg (a 14 GB co-resident)
  // and could evict a leg's model via the arbiter. Init scripts run before any page
  // script, so warmStartup sees the flag on boot. Bench-leg loads go through the API
  // and are unaffected.
  await page.addInitScript(() => { window.__JW_BENCH__ = true; });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e.message).slice(0, 200)));
  await page.goto(app, { waitUntil: "networkidle" });
  const hookVersion = await waitForHook(page);
  return {
    page, hookVersion, pageErrors: errors, dataRoot: stack.dataRoot,
    async close() {
      await browser.close().catch(() => {});
      closeSpawned();
    },
  };
}

/** Call one bench-hook method in the page. */
export function callHook(page, method, ...args) {
  return page.evaluate(
    ({ m, a }) => window.__jwBench[m](...a),
    { m: method, a: args },
  );
}
