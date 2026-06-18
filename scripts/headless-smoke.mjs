// Headless smoke for the server-backed renderer (Linux/CI — Playwright +
// Chromium). Drives `npm run dev:vite` against a running `justwrite-server`
// and asserts the app boots, renders, and talks to the server with ZERO JS
// errors. A bootStorage failure logs a console error, so a clean run also
// proves storage.js reached GET /v1/kv (the P1 server-backed seam).
//
// This is the *headless* harness (no Tauri). The desktop WebDriver harness in
// e2e/ drives the built .exe; that one needs Windows + Edge. This one runs
// anywhere Node + a Chromium build exist.
//
// Assumes both are already running (the orchestrator in package scripts or a
// local run starts them):
//   server: justwrite-server serve --port 17495
//   vite:   npm run dev:vite               (renderer on :1420)
//
// Env: JW_APP (default http://localhost:1420), JW_SERVER (default
//      http://127.0.0.1:17495), JW_CHROME (Chromium binary override).

import { existsSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const APP = process.env.JW_APP || "http://localhost:1420";
const SERVER = process.env.JW_SERVER || "http://127.0.0.1:17495";

function findChrome() {
  if (process.env.JW_CHROME && existsSync(process.env.JW_CHROME)) return process.env.JW_CHROME;
  const roots = ["/opt/pw-browsers", `${process.env.HOME || ""}/.cache/ms-playwright`];
  for (const root of roots) {
    if (!existsSync(root)) continue;
    for (const dir of readdirSync(root)) {
      if (!dir.startsWith("chromium") || dir.includes("headless_shell")) continue;
      const exe = `${root}/${dir}/chrome-linux/chrome`;
      if (existsSync(exe)) return exe;
    }
  }
  return undefined; // let Playwright resolve its own download
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitReady(url, label, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url);
      if (r.ok || r.status === 404) return;
    } catch {
      /* not up yet */
    }
    await sleep(500);
  }
  throw new Error(`timed out waiting for ${label} at ${url}`);
}

await waitReady(`${SERVER}/v1/health`, "server");
await waitReady(APP, "vite");

const exe = findChrome();
const browser = await chromium.launch({
  ...(exe ? { executablePath: exe } : {}),
  headless: true,
  args: ["--no-sandbox"],
});
const page = await browser.newPage();

const errors = [];
page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message.slice(0, 200)));
page.on("console", (m) => {
  if (m.type() === "error" && !/ERR_CERT|404|favicon/.test(m.text())) {
    errors.push("CONSOLE: " + m.text().slice(0, 220));
  }
});
// Benign-asset 404s (favicon, optional resources) are noise, not JS errors —
// excluded above, but surfaced below so they're never silently hidden.
const notFound = [];
page.on("response", (r) => {
  if (r.status() === 404) notFound.push(r.url());
});

let failed = 0;
try {
  await page.goto(APP, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500); // let bootStorage + Vue mount settle
  const bodyChars = await page.evaluate(() => document.body?.innerText?.length || 0);
  const ok = bodyChars > 0 && errors.length === 0;
  console.log(`boot: bodyChars=${bodyChars} errors=${errors.length} -> ${ok ? "OK" : "FAIL"}`);
  errors.slice(0, 8).forEach((e) => console.log("   " + e));
  if (!ok) failed++;

  // Informational: what (if anything) the app persisted through to the server.
  try {
    const kv = await (await fetch(`${SERVER}/v1/kv`)).json();
    console.log(`server kv keys after boot: ${JSON.stringify(Object.keys(kv))}`);
  } catch (e) {
    console.log("kv read failed: " + String(e.message || e).slice(0, 120));
  }
  if (notFound.length) {
    console.log(`404s (benign, informational): ${JSON.stringify(notFound.map((u) => u.slice(0, 120)))}`);
  }
} catch (e) {
  failed++;
  console.log("NAV-FAIL " + String(e.message || e).slice(0, 200));
} finally {
  await browser.close();
}

console.log(failed ? "\nHEADLESS SMOKE FAILED" : "\nHEADLESS SMOKE PASSED");
process.exit(failed ? 1 : 0);
