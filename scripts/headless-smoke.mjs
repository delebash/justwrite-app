// Headless smoke / whole-app sweep for the server-backed renderer (Linux —
// Playwright + Chromium). Drives `npm run dev:vite` against a running
// justwrite-server: asserts the app boots, every top-level route renders, and
// the whole run produces ZERO JS errors. A bootStorage failure logs a console
// error, so a clean run also proves storage.js reached /v1/kv.
//
// Complements e2e/ (desktop WebDriver via tauri-driver — needs Windows + a
// built .exe). This one runs headless anywhere Node + a Chromium build exist.
//
// Assumes both are already running (the orchestrator / a local run starts them):
//   server: justwrite-server serve --port 17495
//   vite:   npm run dev:vite               (renderer on :1420)
// Env: JW_APP, JW_SERVER, JW_CHROME.

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
  return undefined;
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

// Top-level routes (hash) reachable with no required params.
const ROUTES = [
  "#/", "#/chapters", "#/search", "#/characters", "#/locations", "#/objects",
  "#/groups", "#/worldbuilding", "#/strands", "#/plot", "#/timeline", "#/notes",
  "#/brainstorm", "#/markers", "#/relations", "#/analysis",
  "#/reader-knowledge", "#/import", "#/export", "#/trash", "#/settings",
  "#/help", "#/writer-lab", "#/ai-settings", "#/ai-prompts", "#/architecture",
];

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
  if (m.type() === "error" && !/ERR_CERT|404|favicon|Failed to load resource/.test(m.text())) {
    errors.push("CONSOLE: " + m.text().slice(0, 220));
  }
});
const notFound = [];
page.on("response", (r) => {
  if (r.status() === 404) notFound.push(r.url());
});
// Failed network requests, classified after the run: to the JW server = a real
// problem; to anything else (optional external TTS/LLM backends not running
// here) = benign. Real storage failures still surface — storage.js logs its
// own console.error, which is NOT excluded above.
const failedRequests = [];
page.on("requestfailed", (req) => failedRequests.push({ url: req.url(), err: req.failure()?.errorText || "" }));

let failed = 0;
try {
  await page.goto(APP, { waitUntil: "networkidle" });
  await sleep(1500); // bootStorage + Vue mount
  let mark = errors.length;
  const bootChars = await page.evaluate(() => document.body?.innerText?.length || 0);
  let ok = bootChars > 0 && errors.length === mark;
  if (!ok) failed++;
  console.log(`${ok ? "✓" : "✗"} boot${" ".repeat(16)}chars=${bootChars} errors=${errors.length - mark}`);
  errors.slice(mark, mark + 5).forEach((e) => console.log("    " + e));

  for (const route of ROUTES) {
    mark = errors.length;
    try {
      await page.evaluate((h) => { window.location.hash = h; }, route);
      await sleep(550);
      const chars = await page.evaluate(() => document.querySelector("#app")?.innerText?.length || 0);
      const newErrs = errors.length - mark;
      const rok = chars > 0 && newErrs === 0;
      if (!rok) failed++;
      console.log(`${rok ? "✓" : "✗"} ${route.padEnd(20)}chars=${chars} errors=${newErrs}`);
      errors.slice(mark, mark + 4).forEach((e) => console.log("    " + e));
    } catch (e) {
      failed++;
      console.log(`✗ ${route.padEnd(20)}NAV-FAIL ${String(e.message || e).slice(0, 100)}`);
    }
  }

  try {
    const kv = await (await fetch(`${SERVER}/v1/kv`)).json();
    console.log(`\nserver kv keys: ${JSON.stringify(Object.keys(kv))}`);
  } catch (e) {
    console.log("kv read failed: " + String(e.message || e).slice(0, 120));
  }
  if (notFound.length) {
    console.log(`404s (benign): ${JSON.stringify([...new Set(notFound.map((u) => u.slice(0, 100)))])}`);
  }
  // ERR_ABORTED = a request cancelled by SPA navigation or page teardown
  // (e.g. a debounced keepalive write still in flight at close — delivered
  // server-side regardless, as the persisted keys above confirm). Only a real
  // network error TO THE JW SERVER (connection refused / DNS) is a problem.
  const realServerFails = [
    ...new Set(
      failedRequests
        .filter((f) => f.url.startsWith(SERVER) && !/ABORTED/.test(f.err))
        .map((f) => `${f.url} (${f.err})`),
    ),
  ];
  const external = [...new Set(failedRequests.filter((f) => !f.url.startsWith(SERVER)).map((f) => f.url))];
  if (realServerFails.length) {
    failed++;
    console.log(`✗ REAL failed requests to the JW server: ${JSON.stringify(realServerFails)}`);
  }
  if (external.length) {
    console.log(`failed requests to external/optional services (benign — not running here): ${JSON.stringify(external.map((u) => u.slice(0, 50)))}`);
  }
} finally {
  await browser.close();
}

console.log(
  failed
    ? `\nHEADLESS SMOKE FAILED: ${failed} surface(s) errored`
    : "\nHEADLESS SMOKE PASSED: all routes rendered, zero JS errors",
);
process.exit(failed ? 1 : 0);
