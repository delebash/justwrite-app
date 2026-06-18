// /book round-trip smoke (Linux — Playwright + Chromium). Proves the renderer
// uses the NORMALIZED book backend end-to-end:
//   LOAD — pre-seed a book via PUT /v1/projects/{id}/book (+ kv pointers), boot
//          the app, assert the seeded chapter renders.
//   SAVE — drive a real edit through the dev store hook (window.__jwProject,
//          DEV-only), assert it lands in the tables via GET /book.
//
// Assumes server + vite are already running (the orchestrator starts them):
//   server: justwrite-server serve --port 17495 --data-dir <fresh tmp>
//   vite:   npm run dev:vite           (renderer on :1420)
// Env: JW_APP, JW_SERVER, JW_CHROME.

import { existsSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const APP = process.env.JW_APP || "http://localhost:1420";
const SERVER = process.env.JW_SERVER || "http://127.0.0.1:17495";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitReady(url) {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(url); if (r.ok || r.status === 404) return; } catch { /* not up */ }
    await sleep(500);
  }
  throw new Error("timeout " + url);
}
function findChrome() {
  if (process.env.JW_CHROME && existsSync(process.env.JW_CHROME)) return process.env.JW_CHROME;
  for (const root of ["/opt/pw-browsers", `${process.env.HOME || ""}/.cache/ms-playwright`]) {
    if (!existsSync(root)) continue;
    for (const dir of readdirSync(root)) {
      if (!dir.startsWith("chromium") || dir.includes("headless_shell")) continue;
      const exe = `${root}/${dir}/chrome-linux/chrome`;
      if (existsSync(exe)) return exe;
    }
  }
  return undefined;
}
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
await put(`/v1/kv/justwrite:projects:active`, { value: JSON.stringify(seedId) });
await put(`/v1/kv/justwrite:projects:registry`, {
  value: JSON.stringify([{ id: seedId, title: "Book Smoke", author: "Harness", savedAt: new Date().toISOString() }]),
});

const exe = findChrome();
const browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}), headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message.slice(0, 200)));
page.on("console", (m) => {
  if (m.type() === "error" && !/ERR_CERT|404|favicon|Failed to load resource/.test(m.text())) errors.push("CONSOLE: " + m.text().slice(0, 200));
});

let failed = 0;
try {
  await page.goto(APP, { waitUntil: "networkidle" });
  await sleep(2000);
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
