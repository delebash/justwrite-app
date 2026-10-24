// /book round-trip smoke (Playwright + Chrome). Proves the renderer
// uses the NORMALIZED book backend end-to-end:
//   LOAD — pre-seed a book via PUT /v1/projects/{id}/book and make it the open
//          book (PATCH /v1/settings activeProjectId — the registry is derived
//          from the projects table), boot the app, assert the seeded chapter renders.
//   SAVE — drive a real edit through the dev store hook (window.__jwProject,
//          DEV-only), assert it lands in the tables via GET /book.
//
// Assumes server + vite are already running, on a fresh data dir — never the
// user's live :1420 / :17495 (CLAUDE.md):
//   server: node scripts/node24.js server/src/serve.js serve --port <P> --data-dir <fresh tmp>
//   vite:   npx quasar dev --port <Q>   (the DEV build carries the store hook)
// Off :1420 the renderer takes its own origin for the server (the kit's
// origin-aware resolver), so the page's /v1 calls are forwarded to JW_SERVER here.
// Env: JW_APP, JW_SERVER, JW_CHROME.

import { chromium } from "playwright";
// Shared with headless-smoke + the bench harness (extracted 2026-07-19) — one
// findChrome(), never a hardcoded browser path (the CLAUDE.md law).
import { findChrome, sleep, waitReady } from "../lib/smoke-common.js";


const APP = process.env.JW_APP || "http://localhost:1420";
const SERVER = process.env.JW_SERVER || "http://127.0.0.1:17495";
const put = (path, body) =>
  fetch(`${SERVER}${path}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

const seedId = "prj_booksmoke";
const book = {
  project: { title: "Book Smoke", author: "Harness", subtitle: "", genre: "", wordsGoal: 0,
             dailyTarget: 0, wordsWritten: 0, startedOn: "", deadline: "", premise: "", coverImage: null },
  parts: [{ id: "p1", title: "Part One", chapters: [
    { id: "ch1", num: 1, title: "BOOK SMOKE CHAPTER", words: 1, status: "draft", strands: [] }] }],
  scenes: { ch1: [{ id: "scn1", title: "", body: "<p>seed body</p>",
                    characters: [], locations: [], objects: [], strands: [] }] },
  characters: [], characterExtras: {}, locations: [], objects: [], groups: [], strands: [], notes: [],
  architecture: {}, worldbuilding: [], worldbuildingCategories: [],
  tagVocabularies: { characters: [], locations: [], objects: [], worldbuilding: [] },
  images: {}, events: {}, statuses: [],
  trash: { chapters: [], scenes: [], characters: [], locations: [], objects: [], groups: [],
           notes: [], strands: [], worldbuilding: [], events: [], statuses: [], tagVocab: [] },
  dailyRecaps: {}, reverseOutline: null, beatSheets: {}, plotHoles: null, voiceCanonChapterIds: [],
  relationshipArcs: {}, marketingPack: null, worldRules: "", savedAt: new Date().toISOString(),
};

await waitReady(`${SERVER}/v1/health`);
await waitReady(APP);

await put(`/v1/projects/${seedId}/book`, book);
await fetch(`${SERVER}/v1/settings`, {
  method: "PATCH",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ activeProjectId: seedId }),
});

const exe = findChrome();
const browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}), headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message.slice(0, 200)));
page.on("console", (m) => {
  if (m.type() === "error" && !/ERR_CERT|404|favicon|Failed to load resource/.test(m.text())) errors.push("CONSOLE: " + m.text().slice(0, 200));
});

// Off :1420 the page calls its own origin: hand those calls to the server, without
// the page's Origin (the server's CSRF guard allows only the app's own origins).
const appOrigin = new URL(APP).origin;
if (new URL(APP).port !== "1420") {
  await page.route(`${appOrigin}/v1/**`, async (route) => {
    const req = route.request();
    const { origin: _origin, referer: _referer, ...headers } = req.headers();
    const response = await route.fetch({ url: req.url().replace(appOrigin, SERVER), headers });
    await route.fulfill({ response });
  });
}

let failed = 0;
try {
  await page.goto(APP, { waitUntil: "networkidle" });
  // Booted = the dev store hook is installed (a cold dev server compiles on first load).
  await page.waitForFunction(() => !!window.__jwProject, null, { timeout: 60000 }).catch(() => {});
  await page.evaluate(() => { window.location.hash = "#/chapters"; });
  await sleep(900);
  const text = await page.evaluate(() => document.body?.innerText || "");
  const loadOk = text.includes("BOOK SMOKE CHAPTER");
  console.log(`LOAD  (GET /book -> store -> render): ${loadOk ? "PASS" : "FAIL"}`);
  if (!loadOk) failed++;

  const hookOk = await page.evaluate(() => !!window.__jwProject);
  if (!hookOk) { failed++; console.log("SAVE  dev store hook missing — cannot drive edit"); }
  else {
    await page.evaluate(() => { window.__jwProject.addCharacter({ name: "BOOK SMOKE CHAR" }); });
    await sleep(1300); // 400ms PUT debounce + margin
    const after = await (await fetch(`${SERVER}/v1/projects/${seedId}/book`)).json();
    const names = (after.characters || []).map((c) => c.name);
    const saveOk = names.includes("BOOK SMOKE CHAR") && after.characters.length === 1;
    console.log(`SAVE  (store edit -> PUT /book -> tables): ${saveOk ? "PASS" : "FAIL"}  characters=${JSON.stringify(names)}`);
    if (!saveOk) failed++;
  }
  if (errors.length) { failed++; console.log("JS errors:", errors.slice(0, 6)); }
} catch (e) {
  failed++;
  console.log("FAIL " + String(e.message || e).slice(0, 200));
} finally {
  await browser.close();
}
console.log(failed ? "\nBOOK SMOKE FAILED" : "\nBOOK SMOKE PASSED: renderer loads from and saves to the normalized /book backend");
process.exit(failed ? 1 : 0);
