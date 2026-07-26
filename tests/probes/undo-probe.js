// #235 page-related-undo probe — asserts the user's law live in the renderer
// (the queue-doc QC-36/#235 decisions + docs/plans/2026-07-10-page-related-undo.md):
//
// 1. THE HAZARD SCENARIO the user named: prose typed on /chapters + a character
//    rename on /characters → ⌘Z on /chapters reverts ONLY the prose; ⌘Z on
//    /characters reverts ONLY the name; redo works per-page and SURVIVES edits
//    in other domains (F9). Leg 1c then proves the 2026-07-10 editor-echo fix:
//    redoing a PROSE undo with the scene editor OPEN works — RichEditor's
//    store→editor sync sets content with emitUpdate:false (TipTap v3) and the
//    store skips identical scene writes, so the old echo (setContent → @change
//    → re-record → redo cleared, identical pre-#235) is dead.
// 2. GLOBAL SURFACE: a find-and-replace run from /search (the ⌘⇧F modal) lands
//    in the manuscript domain — ⌘Z on /search does nothing; ⌘Z on /chapters
//    reverts it.
// 3. INERT PAGES: the TitleBar Undo/Redo buttons are disabled on /search and
//    /ai (this closes the old #233 hole where the buttons still fired the
//    global book undo from /ai), enabled on /chapters.
// 4. ARTIFACT RELOCATION RENDER: a legacy snapshot with an embedded chapter
//    critique lifts to the top-level map at load AND still RENDERS (the
//    critique pill + the modal's note text) — proving lift + getter +
//    allChapters decoration + the modal reader end-to-end.
//
// Assumes NOTHING about ambient DB state: works in its own temp project and
// restores the active pointer + deletes the temp project afterwards.
// Run: JW server :17495 + vite :1420 up, then `node scripts/undo-probe.js`.
import { existsSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
import { findChrome } from "../lib/smoke-common.js";
const { chromium } = require("playwright");


const BASE = process.env.JW_BASE || "http://localhost:1420";
const API = process.env.JW_API || "http://127.0.0.1:17495";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
function check(name, ok, extra = "") {
  if (ok) { pass++; console.log(`✓ ${name}`); }
  else { fail++; console.log(`✗ ${name}${extra ? ` — ${extra}` : ""}`); }
}
async function api(path, opts = {}) {
  const r = await fetch(`${API}${path}`, {
    method: opts.method || "GET",
    headers: { "Content-Type": "application/json" },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (r.status === 204) return null;
  return r.json().catch(() => null);
}

const PROBE_ID = "prj_undo_probe_tmp";
// Legacy-SHAPED snapshot: the critique sits ON the chapter object, the way
// pre-#235 projects stored it — the boot lift must move it to the map.
const PROBE_SNAPSHOT = {
  project: { title: "Undo Probe", author: "Probe" },
  parts: [{
    id: "p1", title: "Part One",
    chapters: [{
      id: "ch1", num: 1, title: "Probe Chapter", words: 3, status: "draft", strands: [],
      critique: { generatedAt: "2026-07-10T00:00:00Z", notes: [{ severity: "note", category: "style", message: "LEGACY-CRITIQUE-MARKER" }] },
    }],
  }],
  scenes: { ch1: [{ id: "s1", title: "Probe Chapter", body: "<p>original prose alpha</p>" }] },
  characters: [{ id: "c1", main: true, name: "Mira Probe", age: null, gender: "", pronouns: "", aliases: [], lifeStatus: "", oneLiner: "", role: "", tags: [] }],
  savedAt: new Date().toISOString(),
};

const pageErrors = [];
const browser = await chromium.launch({ executablePath: findChrome(), headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.on("pageerror", (e) => pageErrors.push(String(e)));

const origSettings = await api("/v1/settings");
const origActiveId = origSettings?.activeProjectId ?? null;

async function goto(hash) {
  await page.evaluate((h) => { window.location.hash = h; }, hash);
  await sleep(900);
}
// ⌘Z with focus safely OUTSIDE any contenteditable/input.
async function pressUndo() {
  await page.locator("main.main").click({ position: { x: 8, y: 8 }, force: true });
  await page.keyboard.press("Control+z");
  await sleep(500);
}
async function pressRedo() {
  await page.locator("main.main").click({ position: { x: 8, y: 8 }, force: true });
  await page.keyboard.press("Control+Shift+z");
  await sleep(500);
}
const editorText = () => page.locator(".ProseMirror").first().innerText();
const undoBtnDisabled = () => page.locator("[data-undo]").isDisabled();

try {
  // ── Setup: temp project + point the app at it ─────────────────────────────
  await api(`/v1/projects/${PROBE_ID}`, { method: "PUT", body: PROBE_SNAPSHOT });
  await api("/v1/settings", { method: "PATCH", body: { activeProjectId: PROBE_ID } });
  await page.goto(BASE, { waitUntil: "networkidle" });
  await sleep(1500);
  try { await page.click('button:has-text("Got it")', { timeout: 1500 }); } catch { /* none */ }

  // ── Leg 4 first (state still pristine): the lift + render assert ──────────
  await goto("#/chapters/ch1");
  await page.locator(".overview-scene-card, .manuscript-inner").first().waitFor({ timeout: 8000 });
  const pill = page.locator(".critique-pill").first();
  check("lifted legacy critique renders its pill", await pill.isVisible().catch(() => false),
    "the embedded critique should lift to the map and still decorate the chapter");
  check("critique pill shows the note count", (await pill.textContent().catch(() => "")).trim() === "1");
  // The modal reader end-to-end: open the critique modal, see the note text.
  await page.locator('button:has(.critique-pill)').first().click().catch(() => {});
  await sleep(600);
  const modalHasNote = (await page.locator("body").innerText()).includes("LEGACY-CRITIQUE-MARKER");
  check("critique modal renders the lifted note text", modalHasNote);
  await page.keyboard.press("Escape");
  await sleep(400);

  // ── Leg 1: the hazard scenario ────────────────────────────────────────────
  const card = page.locator(".overview-scene-card").first();
  if (await card.isVisible().catch(() => false)) { await card.click(); await sleep(600); }
  const editor = page.locator(".ProseMirror").first();
  await editor.waitFor({ timeout: 8000 });
  await editor.click();
  await page.keyboard.press("Control+End").catch(() => {});
  await page.keyboard.type(" typed-by-probe", { delay: 15 });
  await sleep(1000); // let the coalescing window close + the store record

  await goto("#/characters/c1");
  const nameInput = page.locator("input.entity-name");
  await nameInput.waitFor({ timeout: 8000 });
  await nameInput.fill("Renamed Probe");
  await sleep(400);

  await goto("#/chapters/ch1/s1");
  await page.locator(".ProseMirror").first().waitFor({ timeout: 8000 });
  check("TitleBar Undo enabled on /chapters", !(await undoBtnDisabled()));
  await pressUndo();
  const proseAfterUndo = await editorText();
  check("⌘Z on /chapters reverts the prose", !proseAfterUndo.includes("typed-by-probe"), proseAfterUndo.slice(0, 80));

  await goto("#/characters/c1");
  check("…and the character rename SURVIVES it",
    (await page.locator("input.entity-name").inputValue()) === "Renamed Probe");

  await pressUndo();
  check("⌘Z on /characters reverts the rename",
    (await page.locator("input.entity-name").inputValue()) === "Mira Probe");

  // ── Redo, per-domain, survives other-domain edits (F9, editor-free) ──────
  await pressRedo();
  check("⌘⇧Z on /characters redoes the rename",
    (await page.locator("input.entity-name").inputValue()) === "Renamed Probe");
  await pressUndo(); // back to "Mira Probe", characters future armed again
  await goto("#/chapters/ch1/s1");
  const ed2 = page.locator(".ProseMirror").first();
  await ed2.waitFor({ timeout: 8000 });
  await ed2.click();
  await page.keyboard.press("Control+End").catch(() => {});
  await page.keyboard.type(" second-pass", { delay: 15 }); // a fresh MANUSCRIPT entry
  await sleep(1000);
  // The first persist has now run — the lifted artifact shape reaches the DB.
  const persisted = await api(`/v1/projects/${PROBE_ID}`);
  check("persisted chapter no longer embeds the critique (lift reaches the DB)",
    persisted?.parts?.[0]?.chapters?.[0]?.critique === undefined && !!persisted?.chapterCritiques?.ch1);
  await goto("#/characters/c1");
  await pressRedo();
  check("characters redo SURVIVES the manuscript edit (per-domain futures, F9)",
    (await page.locator("input.entity-name").inputValue()) === "Renamed Probe");

  // ── Leg 1c: IN-EDITOR prose redo — the editor-echo fix ───────────────────
  // Type, undo, redo with the scene editor OPEN the whole time. Pre-fix the
  // ⌘Z content revert made the editor re-emit and re-record, clearing the
  // fresh redo; this leg is the user's exact "redoing a prose undo" QC.
  await goto("#/chapters/ch1/s1");
  const ed3 = page.locator(".ProseMirror").first();
  await ed3.waitFor({ timeout: 8000 });
  await ed3.click();
  await page.keyboard.press("Control+End").catch(() => {});
  await page.keyboard.type(" echo-check", { delay: 15 });
  await sleep(1000); // coalescing window closes
  await pressUndo();
  check("in-editor ⌘Z reverts the typing (store→editor sync still applies)",
    !(await editorText()).includes("echo-check"));
  await pressRedo();
  check("in-editor ⌘⇧Z RESTORES the typing (the editor echo is dead)",
    (await editorText()).includes("echo-check"));
  await pressUndo(); // net-zero: leave the doc as leg 2 expects
  check("…and the redo→undo round-trip stays healthy",
    !(await editorText()).includes("echo-check"));

  // ── Leg 2: global surface — find&replace from /search ─────────────────────
  await goto("#/search");
  await page.keyboard.press("Control+Shift+F");
  await sleep(600);
  await page.getByPlaceholder("Find in all chapters…").fill("alpha");
  await page.getByPlaceholder("Replace with…").fill("beta");
  await sleep(600);
  await page.locator('button:has-text("Replace all")').click();
  await sleep(800);
  await page.keyboard.press("Escape");
  await sleep(400);
  check("TitleBar Undo disabled on /search", await undoBtnDisabled());
  await pressUndo(); // must be inert here
  let snap = await api(`/v1/projects/${PROBE_ID}`);
  check("⌘Z on /search is inert (replace persists)", snap?.scenes?.ch1?.[0]?.body?.includes("beta") === true);

  await goto("#/chapters/ch1/s1");
  await page.locator(".ProseMirror").first().waitFor({ timeout: 8000 });
  await pressUndo();
  snap = await api(`/v1/projects/${PROBE_ID}`);
  check("⌘Z on /chapters reverts the /search replace (its data's page)",
    snap?.scenes?.ch1?.[0]?.body?.includes("alpha") === true);

  // ── Leg 3: /ai inert buttons (the closed #233 hole) ───────────────────────
  await goto("#/ai");
  await sleep(1200);
  check("TitleBar Undo disabled on /ai", await undoBtnDisabled());
  check("TitleBar Redo disabled on /ai", await page.locator("[data-redo]").isDisabled());

  check("zero page errors", pageErrors.length === 0, pageErrors.join(" | ").slice(0, 200));
} finally {
  // ── Full restore: original active pointer back, temp project deleted ──────
  await api("/v1/settings", { method: "PATCH", body: { activeProjectId: origActiveId } });
  await api(`/v1/projects/${PROBE_ID}`, { method: "DELETE" });
  await browser.close();
}

console.log(`\n${pass}/${pass + fail} checks passed`);
process.exit(fail ? 1 : 0);
