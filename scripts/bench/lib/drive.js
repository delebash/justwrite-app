// The three drive modes. All three end up holding a Playwright `page` whose
// window has `window.__jwBench` on it; the orchestrator doesn't care which.
//
//   headless  — Playwright Chromium against the vite dev server (default; the
//               overnight mode).
//   headed    — the same, visible, so the user can watch a run.
//   tauri     — the REAL desktop app. Tauri 2 renders in WebView2 on Windows,
//               and Playwright attaches to any WebView2 over CDP when the app
//               is launched with WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=
//               --remote-debugging-port=<port> (Playwright's own webview2 doc,
//               fetched 2026-07-19). This is the mode where the Bench preset is
//               visible in the user's actual GUI while the script drives it.
//
// The browser launch reuses the SHARED findChrome() (scripts/lib) — never a
// hardcoded path.

import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { findChrome, isUp, sleep, waitReady } from "../../lib/smoke-common.js";

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
    "window.__jwBench never appeared — the bench hook is DEV-only (import.meta.env.DEV). " +
    "In --tauri mode the app must be running `npm run dev`, not a production build.",
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
  if (!(await isUp(`${server}/v1/health`))) {
    if (!autostart) throw new Error(`no JustWrite server at ${server} (start it, or pass --autostart)`);
    onLog?.(`starting server (nothing answering at ${server})`);
    started.push(startProcess("server", "python", ["-m", "justwrite_server.cli", "serve", "--port", new URL(server).port || "17495"], { cwd: `${repoRoot}/server`, onLog }));
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
  return started;
}

/**
 * Open a driven page in the requested mode.
 * Returns { page, hookVersion, close() }.
 */
export async function openDriver({
  mode = "headless",
  app = process.env.JW_APP || "http://localhost:1420",
  server = process.env.JW_SERVER || "http://127.0.0.1:17495",
  cdpPort = Number(process.env.JW_CDP_PORT) || 9223,
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

  if (mode === "tauri") {
    // The dev app, with WebView2's remote debugging turned on. `npm run dev`
    // compiles/starts vite itself, so we do NOT pre-start one here.
    if (!(await isUp(`${server}/v1/health`))) {
      onLog?.(`note: no server at ${server} — the Tauri app normally spawns its own; continuing`);
    }
    onLog?.(`launching the Tauri dev app with CDP on :${cdpPort}`);
    spawned.push(startProcess("tauri", "npm", ["run", "dev"], {
      cwd: repoRoot,
      env: {
        WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${cdpPort}`,
      },
      onLog,
    }));

    // A dev build compiles the Rust crate first — that can be minutes, and the
    // CDP port only opens once the webview exists. Poll the port rather than
    // scraping stdout for a marker the dev server does not promise to print.
    let browser = null;
    const deadline = Date.now() + 900000;
    while (Date.now() < deadline && !browser) {
      await sleep(2000);
      browser = await chromium.connectOverCDP(`http://127.0.0.1:${cdpPort}`).catch(() => null);
    }
    if (!browser) {
      closeSpawned();
      throw new Error(`could not attach to the Tauri webview on :${cdpPort} within 15 min`);
    }
    const context = browser.contexts()[0];
    const page = context.pages()[0] || (await context.waitForEvent("page"));
    const hookVersion = await waitForHook(page);
    return {
      page, hookVersion, mode,
      async close() {
        await browser.close().catch(() => {});
        closeSpawned();
      },
    };
  }

  // Browser modes.
  spawned.push(...(await ensureBrowserStack({ app, server, autostart, repoRoot, onLog })));
  const exe = findChrome();
  onLog?.(`launching Chromium (${mode})${exe ? ` at ${exe}` : " — Playwright's own build"}`);
  const browser = await chromium.launch({
    ...(exe ? { executablePath: exe } : {}),
    headless: mode !== "headed",
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e.message).slice(0, 200)));
  await page.goto(app, { waitUntil: "networkidle" });
  const hookVersion = await waitForHook(page);
  return {
    page, hookVersion, mode, pageErrors: errors,
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
