// Thin async wrapper over the W3C WebDriver HTTP protocol exposed by
// tauri-driver. Avoids WebdriverIO's quirks (UND_ERR_INVALID_ARG on
// session creation in v9, ESM friction in v8). Spawns tauri-driver on
// the configured port, exposes a Driver instance, cleans up on close.

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_BIN  = path.resolve(__dirname, "../../src-tauri/target/release/justwrite.exe");
const EDGE_DRV = path.resolve(__dirname, "../drivers/msedgedriver.exe");

const BASE = "http://127.0.0.1:4444";

async function http(method, urlPath, body) {
  const res = await fetch(BASE + urlPath, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok) {
    const err = new Error(`${method} ${urlPath} → ${res.status}: ${text.slice(0, 400)}`);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json.value;
}

async function waitForPort(timeoutMs = 15_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(BASE + "/status");
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("tauri-driver didn't come up on :4444");
}

export class Driver {
  constructor() {
    this.driverProc = null;
    this.sessionId = null;
  }

  async launch() {
    this.driverProc = spawn(
      "tauri-driver",
      ["--native-driver", EDGE_DRV, "--port", "4444"],
      { stdio: ["ignore", "inherit", "inherit"], shell: true },
    );
    process.once("exit", () => this.killDriver());
    process.once("SIGINT", () => { this.killDriver(); process.exit(130); });

    await waitForPort();
    const v = await http("POST", "/session", {
      capabilities: {
        alwaysMatch: {
          "tauri:options": { application: APP_BIN },
        },
      },
    });
    this.sessionId = v.sessionId;
    // Give the app a moment to mount Vue + hydrate stores from IDB.
    await this.sleep(3_500);
    return this;
  }

  killDriver() {
    if (this.driverProc && !this.driverProc.killed) {
      try { this.driverProc.kill(); } catch {}
    }
  }

  async close() {
    if (this.sessionId) {
      try { await http("DELETE", `/session/${this.sessionId}`); } catch {}
      this.sessionId = null;
    }
    this.killDriver();
  }

  // ── primitives ──────────────────────────────────────────
  sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

  exec(script, args = []) {
    return http("POST", `/session/${this.sessionId}/execute/sync`, { script, args });
  }

  async navigate(hash) {
    await this.exec("window.location.hash = arguments[0];", [hash]);
  }

  async reload() {
    await http("POST", `/session/${this.sessionId}/refresh`, {});
    await this.sleep(2_000);
  }

  async screenshot(file) {
    const fs = await import("node:fs");
    const v = await http("GET", `/session/${this.sessionId}/screenshot`);
    fs.writeFileSync(file, Buffer.from(v, "base64"));
  }

  async maximize() {
    try { await http("POST", `/session/${this.sessionId}/window/maximize`, {}); } catch {}
  }

  async title() {
    return http("GET", `/session/${this.sessionId}/title`);
  }

  async url() {
    return http("GET", `/session/${this.sessionId}/url`);
  }

  // ── DOM helpers driven via execute so we sidestep CSS-selector
  //   gotchas around element handles in the WebView. ─────────
  async textOf(css) {
    return this.exec(
      "const el = document.querySelector(arguments[0]); return el ? el.textContent.trim() : null;",
      [css],
    );
  }

  async exists(css) {
    return this.exec(
      "return !!document.querySelector(arguments[0]);",
      [css],
    );
  }

  async count(css) {
    return this.exec(
      "return document.querySelectorAll(arguments[0]).length;",
      [css],
    );
  }

  async click(css) {
    return this.exec(
      "const el = document.querySelector(arguments[0]); if (!el) throw new Error('no match: ' + arguments[0]); el.click();",
      [css],
    );
  }

  async attr(css, name) {
    return this.exec(
      "const el = document.querySelector(arguments[0]); return el ? el.getAttribute(arguments[1]) : null;",
      [css, name],
    );
  }

  async htmlAttr(name) {
    return this.exec(
      "return document.documentElement.getAttribute(arguments[0]);",
      [name],
    );
  }

  /**
   * Poll until predicate returns truthy. predicate is a string of JS
   * executed in the app; should return a value. Resolves with that
   * value, or rejects on timeout.
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

/**
 * One-shot helper: launch, run callback, always close.
 */
export async function withDriver(fn) {
  const d = new Driver();
  await d.launch();
  try { return await fn(d); } finally { await d.close(); }
}
