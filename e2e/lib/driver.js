// The e2e driver: the REAL desktop app (Electron) launched and driven through Playwright's
// Electron driver (the family's move to Electron, 2026-10-08 — it replaced tauri-driver +
// msedgedriver against the release binary). The test files are unchanged: this class keeps
// the old Driver's API — `exec(script, args)` runs a WebDriver-style script body
// (`arguments[0]`, `return`) in the page, and every DOM helper rides it.
//
// How a script runs: as a function expression evaluated over the debugger protocol, which
// the page's Content-Security-Policy (no eval) does not apply to — the app's real CSP stays
// on during the tests.
//
// What it launches: the built desktop app before packaging — Quasar's
// dist/electron/UnPackaged (`npm run build:unpacked` first, or `npm run build`), run by the
// checkout's Electron — loading the BUILT UI from app://, with its own server on the dev data
// folder `<repo>/data` (the user's real data; JUSTWRITE_DATA_DIR points it there, since an
// unpacked app has no checkout of its own). JUSTWRITE_DEV_NO_SERVER=1 keeps the shell from
// starting a server (the suite then talks to one you started on :17495).

import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { _electron } from "playwright-core";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");
const APP_ROOT = path.join(REPO_ROOT, "dist", "electron", "UnPackaged");
// Electron is the desktop app's dependency, installed in src-electron/ (Quasar's Electron mode).
const ELECTRON = createRequire(path.join(REPO_ROOT, "src-electron", "package.json"))("electron");

export class Driver {
  constructor() {
    this.app = null;
    this.page = null;
  }

  async launch() {
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    delete env.DEV_URL; // the built UI, from app://
    env.JUSTWRITE_DATA_DIR ??= path.join(REPO_ROOT, "data");
    this.app = await _electron.launch({ executablePath: ELECTRON, args: [APP_ROOT], cwd: REPO_ROOT, env });
    this.page = await this.app.firstWindow();
    await this.page.waitForLoadState("domcontentloaded");
    // Give the app a moment to mount Vue + hydrate stores (the old driver's wait).
    await this.sleep(3_500);
    return this;
  }

  async close() {
    if (this.app) {
      try {
        await this.app.close();
      } catch {
        /* already gone */
      }
      this.app = null;
      this.page = null;
    }
  }

  // ── primitives ──────────────────────────────────────────
  sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  exec(script, args = []) {
    return this.page.evaluate(`(function(){ ${script} \n}).apply(null, ${JSON.stringify(args)})`);
  }

  async navigate(hash) {
    await this.exec("window.location.hash = arguments[0];", [hash]);
  }

  async reload() {
    await this.page.reload();
    await this.sleep(2_000);
  }

  async screenshot(file) {
    await this.page.screenshot({ path: file });
  }

  async maximize() {
    await this.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.maximize());
  }

  async title() {
    return this.page.title();
  }

  async url() {
    return this.page.url();
  }

  // ── DOM helpers driven via exec ──────────────────────────
  async textOf(css) {
    return this.exec("const el = document.querySelector(arguments[0]); return el ? el.textContent.trim() : null;", [css]);
  }

  async exists(css) {
    return this.exec("return !!document.querySelector(arguments[0]);", [css]);
  }

  async count(css) {
    return this.exec("return document.querySelectorAll(arguments[0]).length;", [css]);
  }

  async click(css) {
    return this.exec(
      "const el = document.querySelector(arguments[0]); if (!el) throw new Error('no match: ' + arguments[0]); el.click();",
      [css],
    );
  }

  async attr(css, name) {
    return this.exec("const el = document.querySelector(arguments[0]); return el ? el.getAttribute(arguments[1]) : null;", [
      css,
      name,
    ]);
  }

  async htmlAttr(name) {
    return this.exec("return document.documentElement.getAttribute(arguments[0]);", [name]);
  }

  /**
   * Poll until predicate returns truthy. predicate is a string of JS executed in the app;
   * should return a value. Resolves with that value, or rejects on timeout.
   */
  async waitUntil(predicate, { timeout = 10_000, interval = 200 } = {}) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const v = await this.exec(`return (function(){ ${predicate} })();`);
      if (v) return v;
      await this.sleep(interval);
    }
    throw new Error(`waitUntil timed out: ${predicate.slice(0, 120)}`);
  }
}

/** One-shot helper: launch, run callback, always close. */
export async function withDriver(fn) {
  const d = new Driver();
  await d.launch();
  try {
    return await fn(d);
  } finally {
    await d.close();
  }
}
