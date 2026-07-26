// Switch-cluster probe (QC-17/18/10/11/12, 2026-07-09) — asserts the USER'S WORDS:
// QC-18 "switches are text text for name text or number for vule" + "the help will
//   explain … what the currect accepts values are" → no value dropdowns anywhere a
//   plane-1 switch is edited.
// QC-17 "the tune and measure works like global and hardware you have an x by each
//   row so if you dont want cache_type_k to be set to anything you just click the x
//   to remove the row" → only set rows render, ✕ removes, no engine-default claims.
// QC-10 "in fact see how you have this niceely layed out grouped with a header easy
//   seperation" → section headings per source layer; "dont add a save button on
//   each group … for tune and measure" → no per-section Save (one Apply).
// QC-11 "remove from catalog" → context_shift + cache_reuse gone from the knob
//   catalog on the EXISTING dev DB (the seeder curation, not a reset).
// QC-12 the samplers line below the lede's Apply.
// findChrome copied from scripts/headless-smoke.js per JW CLAUDE.md.
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
import { findChrome } from "../lib/smoke-common.js";
const { chromium } = require("playwright");
const OUT = "/tmp/claude-0/-home-user/3cfd68b9-10db-5b2c-8f07-e258fb196800/scratchpad";

// The catalog row's Tune button renders only for a DOWNLOADED model
// (LuModelCatalog: status 'disk'|'loaded') — fake ONE cached GGUF on disk for the
// probe (the B3R precedent) and remove it at the end. Disk-only; the DB is never
// touched. Path shape per llm_runner cached_gguf_path + lifecycle's
// cache_root/"hf" wiring:
// <data>/ai-cache/hf/models--<org>--<name>/snapshots/**/*<quant>*.gguf
const FAKE_DIR = "/root/.local/share/JustWrite/ai-cache/hf/models--unsloth--gemma-4-12B-it-qat-GGUF/snapshots/probe";
const FAKE_GGUF = `${FAKE_DIR}/gemma-4-12b-it-qat-UD-Q4_K_XL.gguf`;
mkdirSync(FAKE_DIR, { recursive: true });
writeFileSync(FAKE_GGUF, "GGUF-probe-fake");
const cleanupFake = () => { try { rmSync(FAKE_GGUF); rmSync(FAKE_DIR, { recursive: true }); } catch { /* gone */ } };
process.on("exit", cleanupFake);


const results = [];
const check = (name, ok, note = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "✓" : "✗"} ${name}${note ? ` — ${note}` : ""}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ executablePath: findChrome(), headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1400, height: 980 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message.slice(0, 200)));

await page.goto("http://localhost:1420", { waitUntil: "networkidle" });
await sleep(1500);
try { await page.click('button:has-text("Got it")', { timeout: 1500 }); } catch { /* none */ }

// SW0 (QC-11/17 data): the knob catalog on the EXISTING dev DB — the seeder
// curation removed the two rows, every plane-1 row's stored default + options.
const sw0 = await page.evaluate(async () => {
  const r = await fetch("http://127.0.0.1:17495/v1/ai/knob-catalog");
  const knobs = (await r.json()).knobs || [];
  const p1 = knobs.filter((k) => k.plane === 1);
  return {
    total: knobs.length,
    removed: !knobs.some((k) => ["context_shift", "cache_reuse"].includes(k.flagName)),
    noDefaults: p1.every((k) => !k.default),
    noOptions: p1.every((k) => !(k.options || []).length),
    helpValues: /f32, f16, bf16, q8_0/.test(knobs.find((k) => k.flagName === "cache_type_k")?.help || ""),
  };
});
check("SW0 QC-11/17: existing DB curated — rows removed, no stored engine defaults/options, help carries values",
  sw0.removed && sw0.noDefaults && sw0.noOptions && sw0.helpValues, JSON.stringify(sw0));

// Navigate: AI area. First QC-14 on the Routing-by-feature tab, then Providers.
await page.evaluate(() => { window.location.hash = "#/ai"; });
await sleep(1200);

// QC-14 ("the tasks where very wide becuase you did not wrap the text earlier"):
// the nav COLUMN caps (≤ ~400px) so card text wraps early — one-line descriptions
// must not drag the column to 40% of the window; a long description renders on
// MULTIPLE lines.
await page.evaluate(() => [...document.querySelectorAll(".lu-subnav a")].find((a) => /routing by feature/i.test(a.textContent))?.click());
await sleep(900);
const qc14 = await page.evaluate(() => {
  const list = document.querySelector(".lu-fw-list");
  const descs = [...document.querySelectorAll(".lu-fw-card-desc")];
  const long = descs.find((d) => d.textContent.trim().length > 60);
  const lines = long ? Math.round(long.getBoundingClientRect().height / parseFloat(getComputedStyle(long).lineHeight)) : 0;
  return {
    listWidth: list ? Math.round(list.getBoundingClientRect().width) : -1,
    longDescLines: lines,
  };
});
check("QC-14: nav column ≤ 400px and a long description wraps onto multiple lines",
  qc14.listWidth > 0 && qc14.listWidth <= 400 && qc14.longDescLines >= 2, JSON.stringify(qc14));
await page.screenshot({ path: `${OUT}/qc14-routing.png` });

await page.evaluate(() => [...document.querySelectorAll(".lu-subnav a")].find((a) => /providers/i.test(a.textContent))?.click());
await sleep(600);
await page.evaluate(() => [...document.querySelectorAll(".lu-prow button, .lu-prow .lu-btn")].find((b) => /edit/i.test(b.textContent))?.click());
await sleep(900);

// QC-13: the Local-engine panel never LIES about install state — with the status
// FETCHED (this container: not installed) it says so; it must never render the
// claim without a fetched status (the pre-fetch state reads "Checking the engine…").
const qc13 = await page.evaluate(() => {
  const sub = document.querySelector(".lu-eng-sub")?.textContent.trim() || "";
  return {
    sub: sub.slice(0, 60),
    honest: /^(Installed|Not installed|Checking the engine|Installing)/.test(sub),
  };
});
check("QC-13: the engine panel shows only honest states (fetched or checking)", qc13.honest, JSON.stringify(qc13));

// Open the Tune & measure modal from the first catalog row's Tune action.
await page.evaluate(() => [...document.querySelectorAll(".lu-mcat button")].find((b) => b.textContent.trim() === "Tune")?.click());
await sleep(1600);

// SW1 (QC-17): only set rows, every row has ✕, no ledger, no engine-default claims.
const sw1 = await page.evaluate(() => {
  const modal = document.querySelector(".lu-tune");
  const rows = [...document.querySelectorAll(".lu-tune .ui-kg-row")];
  return {
    modal: !!modal,
    rows: rows.length,
    everyRowRemovable: rows.length > 0 && rows.every((r) => [...r.querySelectorAll("button")].some((b) => b.textContent.trim() === "✕")),
    ledger: !!document.querySelector(".ui-kg-ledger"),
    engineDefaultText: /engine default/i.test(modal?.textContent || ""),
    addSwitch: [...document.querySelectorAll(".lu-tune button")].some((b) => /add switch/i.test(b.textContent)),
  };
});
check("SW1 QC-17: Tune grid = only set rows, ✕ on every row, + Add switch, zero engine-default claims",
  sw1.modal && sw1.rows > 0 && sw1.everyRowRemovable && !sw1.ledger && !sw1.engineDefaultText && sw1.addSwitch,
  JSON.stringify(sw1));

// SW2 (QC-10): rows grouped under the user-named headings; NO per-section Save
// inside the grid (the modal's ONE Apply lives in the footer).
const GROUPS = ["Your applied config", "Hardware/model class default", "Global launch defaults", "Computed for this PC"];
const sw2 = await page.evaluate(() => {
  const heads = [...document.querySelectorAll(".lu-tune .ui-kg-group-h")].map((h) => h.textContent.trim());
  const gridButtons = [...document.querySelectorAll(".lu-tune-scroll button")].map((b) => b.textContent.trim());
  return { heads, saveInGrid: gridButtons.filter((t) => /^save/i.test(t)).length };
});
check("SW2 QC-10: section headings present, all from the four user-named groups, no per-section Save",
  sw2.heads.length >= 1 && sw2.heads.every((h) => GROUPS.includes(h))
    && sw2.heads.includes("Global launch defaults") && sw2.saveInGrid === 0,
  JSON.stringify(sw2));

// SW3 (QC-18): every value editor in the Tune grid is a plain input — no dropdowns.
const sw3 = await page.evaluate(() => ({
  selects: document.querySelectorAll(".lu-tune-scroll .ui-select-trigger").length,
  inputs: document.querySelectorAll(".lu-tune-scroll input.ui-input").length,
}));
check("SW3 QC-18: Tune grid values are plain inputs — zero dropdowns", sw3.selects === 0 && sw3.inputs > 0, JSON.stringify(sw3));

// SW4 (QC-17): "you just click the x to remove the row" — ✕ removes it (grid-only;
// nothing is applied/persisted in this probe).
const before = await page.evaluate(() => document.querySelectorAll(".lu-tune .ui-kg-row").length);
await page.evaluate(() => {
  const row = document.querySelector(".lu-tune .ui-kg-row");
  [...row.querySelectorAll("button")].find((b) => b.textContent.trim() === "✕")?.click();
});
await sleep(400);
const after = await page.evaluate(() => document.querySelectorAll(".lu-tune .ui-kg-row").length);
check("SW4 QC-17: ✕ removes the row", after === before - 1, `rows ${before} → ${after}`);

// SW5 (QC-28, task #226 — supersedes the under-'Your applied config' placement
// this leg once asserted): "+ Add switch" APPENDS the new blank row at the
// BOTTOM of the grid.
await page.evaluate(() => [...document.querySelectorAll(".lu-tune button")].find((b) => /add switch/i.test(b.textContent))?.click());
await sleep(400);
const sw5 = await page.evaluate(() => {
  const rows = [...document.querySelectorAll(".lu-tune .ui-kg-row")];
  const last = rows[rows.length - 1];
  const lastInputs = [...(last?.querySelectorAll("input.ui-input") || [])];
  return { rows: rows.length, lastBlank: lastInputs.some((i) => !i.value.trim()) };
});
check("SW5 QC-28: + Add switch APPENDS a blank row at the BOTTOM",
  sw5.rows === after + 1 && sw5.lastBlank, JSON.stringify(sw5));

// SW6 (QC-12): the samplers line sits below the lede's Apply — the user's copy.
const sw6 = await page.evaluate(() =>
  /Samplers like temperature are set on the Tasks or Routing by feature tabs/.test(
    document.querySelector(".lu-tune-lede")?.textContent || ""));
check("SW6 QC-12: 'Samplers like temperature are set on the Tasks or Routing by feature tabs'", sw6);
await page.screenshot({ path: `${OUT}/switch-tune.png` });

// SW7 (QC-18, the libraries): the Global launch defaults popup's value editors are
// plain inputs too — the q8_0/f16 dropdowns are gone; bundle values still there.
await page.evaluate(() => [...document.querySelectorAll(".lu-tune button")].find((b) => /global launch defaults/i.test(b.textContent))?.click());
await sleep(900);
const sw7 = await page.evaluate(() => {
  const gsw = document.querySelector(".lu-gsw");
  const values = [...(gsw?.querySelectorAll(".ui-kg-row input.ui-input") || [])].map((i) => i.value);
  return {
    open: !!gsw,
    selects: gsw ? gsw.querySelectorAll(".ui-select-trigger").length : -1,
    hasCacheValue: values.includes("q8_0"),
    perBundleSave: [...(gsw?.querySelectorAll("button") || [])].filter((b) => b.textContent.trim() === "Save").length,
  };
});
check("SW7 QC-18: Global editor — zero value dropdowns, bundle values intact (q8_0 as text), per-bundle Save stays (its own storage)",
  sw7.open && sw7.selects === 0 && sw7.hasCacheValue && sw7.perBundleSave >= 3, JSON.stringify(sw7));
await page.screenshot({ path: `${OUT}/switch-global.png` });

console.log(`\npage errors: ${errors.length}`);
errors.slice(0, 5).forEach((e) => console.log("  " + e));
const fails = results.filter((r) => !r.ok);
console.log(fails.length ? `SWITCH PROBE FAILED: ${fails.map((f) => f.name).join(", ")}` : "SWITCH PROBE PASSED");
await browser.close();
process.exit(fails.length || errors.length ? 1 : 0);
