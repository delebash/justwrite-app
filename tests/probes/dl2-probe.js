// DL-2 probe (2026-07-09) — the segmented-download SETTINGS, live:
// the plan's §1 (the user's requirement: "usually we have settings for this like
// number of threads ect"): four DB-backed rows seeded ADDITIVELY on the existing
// DB, surfaced in the Local engine panel's Details area beside the residency
// knobs, editable through the same Save (on/off applies on flip). Every write is
// reverted — DB left as found. findChrome copied from scripts/headless-smoke.js
// per JW CLAUDE.md.
import { existsSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire("/home/user/justwrite-app/scripts/headless-smoke.js");
import { findChrome } from "../lib/smoke-common.js";
const { chromium } = require("playwright");
const API = "http://127.0.0.1:17495";


const results = [];
const check = (name, ok, note = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "✓" : "✗"} ${name}${note ? ` — ${note}` : ""}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cfg = async () => (await fetch(`${API}/v1/ai/engine-config`)).json();

// DL2-0: the four settings exist on the EXISTING dev DB (the additive boot seed —
// no reset) with the plan's defaults.
const c0 = await cfg();
check("DL2-0: four settings seeded additively with the plan's defaults",
  c0.downloadSegmentsEnabled === true && c0.downloadSegmentCount === 4
  && c0.downloadSegmentMinBytes === 64 * 1024 * 1024 && c0.downloadSegmentRetries === 3,
  JSON.stringify({ enabled: c0.downloadSegmentsEnabled, count: c0.downloadSegmentCount,
    minBytes: c0.downloadSegmentMinBytes, retries: c0.downloadSegmentRetries }));

const browser = await chromium.launch({ executablePath: findChrome(), headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1400, height: 980 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message.slice(0, 200)));

try {
  await page.goto("http://localhost:1420", { waitUntil: "networkidle" });
  await sleep(1500);
  try { await page.click('button:has-text("Got it")', { timeout: 1500 }); } catch { /* none */ }
  await page.evaluate(() => { window.location.hash = "#/ai"; });
  await sleep(1200);

  // The engine panel lives in the PERMANENT built-in section (QC-39 promoted it
  // out of the row list — no Edit click needed) → open its Details drawer.
  await page.locator(".lu-builtin .lu-eng").waitFor({ timeout: 8000 });
  await page.locator('.lu-eng button:has-text("Details")').click();
  await sleep(600);

  const toggleRow = page.locator('.lu-eng-knob:has-text("Faster downloads")');
  const countInput = page.locator('.lu-eng-knob:has-text("Connections per download") input');
  const minMbInput = page.locator('.lu-eng-knob:has-text("Split files larger than") input');
  const retriesInput = page.locator('.lu-eng-knob:has-text("Retries per connection") input');
  check("DL2-1: the four download knobs render in the engine Details beside the residency knobs",
    (await toggleRow.count()) === 1 && (await countInput.count()) === 1
    && (await minMbInput.count()) === 1 && (await retriesInput.count()) === 1,
    JSON.stringify({ count: await countInput.inputValue(), minMb: await minMbInput.inputValue(),
      retries: await retriesInput.inputValue() }));

  // DL2-2: the numbers ride the form's Save — round-trip 4 → 5 → (verify) → 4.
  await countInput.fill("5");
  await page.locator('.lu-eng-knobs button:has-text("Save")').click();
  await sleep(800);
  const c1 = await cfg();
  check("DL2-2: Save persists the segment count (4 → 5 in the DB)", c1.downloadSegmentCount === 5,
    `db=${c1.downloadSegmentCount}`);
  await countInput.fill("4");
  await page.locator('.lu-eng-knobs button:has-text("Save")').click();
  await sleep(800);

  // DL2-3: the on/off applies on flip (no Save) and hides the three numbers.
  await toggleRow.locator(".ui-toggle, [role=switch], input[type=checkbox]").first().click();
  await sleep(800);
  const c2 = await cfg();
  check("DL2-3: the toggle applies on flip — enabled false in the DB, number knobs hidden",
    c2.downloadSegmentsEnabled === false && (await countInput.count()) === 0,
    `db=${c2.downloadSegmentsEnabled}`);
  await toggleRow.locator(".ui-toggle, [role=switch], input[type=checkbox]").first().click();
  await sleep(800);
} finally {
  // Restore exactly as found (belt + braces beyond the in-flow reverts).
  await fetch(`${API}/v1/ai/engine-config`, {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ downloadSegmentsEnabled: c0.downloadSegmentsEnabled,
      downloadSegmentCount: c0.downloadSegmentCount,
      downloadSegmentMinBytes: c0.downloadSegmentMinBytes,
      downloadSegmentRetries: c0.downloadSegmentRetries }),
  });
  await browser.close();
}

const cEnd = await cfg();
check("DL2-4: settings restored exactly as found",
  cEnd.downloadSegmentsEnabled === c0.downloadSegmentsEnabled
  && cEnd.downloadSegmentCount === c0.downloadSegmentCount
  && cEnd.downloadSegmentMinBytes === c0.downloadSegmentMinBytes
  && cEnd.downloadSegmentRetries === c0.downloadSegmentRetries);

console.log(`\npage errors: ${errors.length}`);
for (const e of errors) console.log(`  ${e}`);
const failed = results.filter((r) => !r.ok).length;
console.log(failed || errors.length ? "DL2 PROBE FAILED" : "DL2 PROBE PASSED");
process.exit(failed || errors.length ? 1 : 0);
