// Shared boot/browser helpers for every JW script that drives the renderer with
// Playwright — `headless-smoke.js`, `book-smoke.js`, and the bench harness
// (`bench/harness/`).
//
// WHY: CLAUDE.md's law is "any new Playwright script must reuse that
// findChrome() ... never hardcode the path" — a hardcoded path silently falls
// over to the missing headless-shell build and the launch fails. Until
// 2026-07-19 that rule was satisfied by COPYING findChrome() into each script,
// and an unfiltered grep found **20 copies** across `scripts/`. This file is the
// one shared version; the bench would have been the 21st.
//
// PARTIAL, and deliberately so: the two GATES (`headless-smoke.js`,
// `book-smoke.js`) plus the bench now import from here. The other **19** copies
// are one-off probe scripts for already-shipped work (`rag-probe`, `chip-probe`,
// `switch-probe`, `shot.js`, …) and still carry their own Linux-only lookup —
// so they cannot find a browser on Windows at all. Converting them is filed in
// `docs/dev/TASKS.md`, not silently assumed done. Import from this file; never re-fork.

import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Per-platform browser layout under <root>/<chromium-dir>/, in probe order.
// The Linux entry is what the dev container ships; the win64/win + mac entries
// were added at extraction time so the same helper works on the user's Windows
// box (verified 2026-07-19: chromium-1228/chrome-win64/chrome.exe).
const LAYOUTS = [
  "chrome-linux/chrome",
  "chrome-win64/chrome.exe",
  "chrome-win/chrome.exe",
  "chrome-mac/Chromium.app/Contents/MacOS/Chromium",
];

function browserRoots() {
  const home = process.env.HOME || process.env.USERPROFILE || "";
  return [
    // The dev container's PREBUILT browsers. This path is not a Playwright
    // registry location, which is the whole reason this scan exists.
    "/opt/pw-browsers",
    home ? join(home, ".cache", "ms-playwright") : "",
    process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "ms-playwright") : "",
  ].filter(Boolean);
}

/**
 * Path to a usable Chromium executable, or `undefined`.
 *
 * `undefined` is a SUCCESS value, not a failure: with `executablePath` omitted,
 * Playwright resolves the browser from its own registry, which is the normal
 * path on a stock Windows/macOS dev box. The scan below exists for installs
 * Playwright does NOT know about (the container's /opt/pw-browsers). `JW_CHROME`
 * overrides everything.
 *
 * headless_shell builds are skipped on purpose — they lack the full browser
 * surface these scripts drive, and selecting one breaks the launch.
 */
export function findChrome() {
  if (process.env.JW_CHROME && existsSync(process.env.JW_CHROME)) return process.env.JW_CHROME;
  for (const root of browserRoots()) {
    if (!existsSync(root)) continue;
    let entries;
    try {
      entries = readdirSync(root);
    } catch {
      continue; // unreadable root — try the next one
    }
    for (const dir of entries) {
      if (!dir.startsWith("chromium") || dir.includes("headless_shell")) continue;
      for (const layout of LAYOUTS) {
        const exe = join(root, dir, layout);
        if (existsSync(exe)) return exe;
      }
    }
  }
  return undefined;
}

// Project venv layouts, in probe order. Windows puts the interpreter in
// Scripts/, POSIX in bin/.
const VENV_PYTHON = [".venv/Scripts/python.exe", ".venv/bin/python"];

/**
 * Path to THIS PROJECT'S Python interpreter — the venv if there is one, else
 * whatever PATH offers. `JW_PYTHON` overrides everything.
 *
 * WHY this is not just the string "python": bare `python` resolves to whatever
 * is first on PATH, which on the user's Windows box is a stock F:\Python312 with
 * none of this project's dependencies installed. Every symptom it produced read
 * as a broken config rather than a missing install:
 *   - `npm run test:server` -> "unrecognized arguments: -n" (no pytest-xdist,
 *     which server/pyproject.toml's addopts requires), which also took
 *     `npm run test:fast` down, since it chains test:server;
 *   - the bench harness's autostart -> "No module named 'llm_runner'". That one
 *     hid for a long time: drive.js only spawns a server when nothing is already
 *     answering, so every run made while the user's app was up skipped the line
 *     entirely, and it failed the first time the bench ran against a closed app.
 *
 * The venv is PREFERRED rather than required, because the Linux dev container
 * has no .venv and runs the interpreter straight off PATH.
 */
export function findPython(repoRoot) {
  if (process.env.JW_PYTHON && existsSync(process.env.JW_PYTHON)) return process.env.JW_PYTHON;
  const root = repoRoot || join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  for (const rel of VENV_PYTHON) {
    const exe = join(root, ...rel.split("/"));
    if (existsSync(exe)) return exe;
  }
  return process.platform === "win32" ? "python" : "python3";
}

/** One probe: is something answering at `url` right now? (404 counts — the
 *  process is up, the path just isn't a route.) */
export async function isUp(url) {
  try {
    const r = await fetch(url);
    return r.ok || r.status === 404;
  } catch {
    return false;
  }
}

/** Poll `url` until it answers, or throw after `tries` attempts. */
export async function waitReady(url, label = url, tries = 60, intervalMs = 500) {
  for (let i = 0; i < tries; i++) {
    if (await isUp(url)) return true;
    await sleep(intervalMs);
  }
  throw new Error(`timed out waiting for ${label} at ${url}`);
}
