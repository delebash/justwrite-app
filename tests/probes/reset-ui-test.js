// Drive the REAL reset click-path (Settings → Backups → Reset…) and screenshot
// providers before/after, to verify what the USER sees (not just the API).
import { createRequire } from "node:module";
import { existsSync, readdirSync } from "node:fs";
const require = createRequire("/home/user/justwrite-app/");
import { findChrome } from "../lib/smoke-common.js";
const { chromium } = require("playwright");

const APP = "http://localhost:1420";
const SERVER = "http://127.0.0.1:17495";
const OUT = "/tmp/claude-0/-home-user/3cfd68b9-10db-5b2c-8f07-e258fb196800/scratchpad";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitReady(url, n = 60) { for (let i = 0; i < n; i++) { try { const r = await fetch(url); if (r.ok || r.status === 404) return; } catch {} await sleep(500); } throw new Error("timeout " + url); }

await waitReady(SERVER + "/v1/health");
await waitReady(APP);

// Auto-locate the prebuilt Chromium via the ONE shared resolver
// (tests/lib/smoke-common.js — Linux/Windows/macOS layouts, JW_CHROME override).
// Never hardcode a browser path.
const exe = findChrome();
const browser = await chromium.launch({ executablePath: exe || undefined, headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const log = [];
// Add a marker job via API BEFORE the UI reset — if it's gone afterward, the
// real reset fired AND reseeded (not a no-op click).
await fetch(SERVER + "/v1/ai/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label: "ZZ UI MARKER", description: "x" }) }).then((r) => r.json()).catch(() => null);

async function gotoProviders() {
  await page.evaluate(() => { window.location.hash = "#/ai"; });
  await sleep(1200);
  await page.evaluate(() => { const t = [...document.querySelectorAll(".lu-subnav a")].find((a) => /providers/i.test(a.textContent)); t && t.click(); });
  await sleep(1000);
  return await page.evaluate(() => {
    const txt = document.querySelector("#app")?.innerText || "";
    const m = txt.match(/Providers\s+(\d+)\s+configured/i);
    return { configured: m ? m[1] : "?", noLocal: /No local providers yet/i.test(txt), noCloud: /No cloud providers/i.test(txt) };
  });
}

await page.goto(APP, { waitUntil: "networkidle" });
await sleep(1800);

const before = await gotoProviders();
await page.screenshot({ path: OUT + "/reset-1-before.png" });
log.push(["BEFORE", JSON.stringify(before)]);

// Settings → Backups
await page.evaluate(() => { window.location.hash = "#/settings"; });
await sleep(1200);
const backupsClicked = await page.evaluate(() => {
  const el = [...document.querySelectorAll("button, a, [role=tab], .lu-subnav a, li")].find((e) => /^\s*backups\s*$/i.test(e.textContent || ""));
  if (el) { el.click(); return true; } return false;
});
await sleep(900);
// Click the "Reset…" danger button
const resetClicked = await page.evaluate(() => {
  const b = [...document.querySelectorAll("button")].find((e) => /reset/i.test(e.textContent || "") && /[….]/.test(e.textContent || ""));
  if (b) { b.click(); return b.textContent.trim(); } return null;
});
await sleep(800);
await page.screenshot({ path: OUT + "/reset-2-dialog.png" });
// Type RESET with REAL Playwright typing so Vue's v-model updates + enables the button
let typed = "", confirmClicked = null;
try {
  const dlg = page.locator('[role="dialog"], [role="alertdialog"]').first();
  const input = dlg.getByRole("textbox").first();
  await input.waitFor({ state: "visible", timeout: 5000 });
  await input.click();
  await input.fill("RESET");
  typed = await input.inputValue();
  await sleep(300);
  await dlg.getByRole("button", { name: "Reset", exact: true }).click();
  confirmClicked = "clicked";
} catch (e) { confirmClicked = "ERR:" + String(e.message).slice(0, 100); }
log.push(["backupsClicked", backupsClicked], ["resetTrigger", resetClicked], ["typedRESET", typed], ["confirm", confirmClicked]);

// Wait through POST + the 700ms reload timer + app re-boot
await sleep(5000);
await page.waitForLoadState("networkidle").catch(() => {});
await sleep(2000);

const after = await gotoProviders();
await page.screenshot({ path: OUT + "/reset-3-after.png" });
log.push(["AFTER", JSON.stringify(after)]);

const jobsAfter = await fetch(SERVER + "/v1/ai/jobs").then((r) => r.json()).catch(() => ({}));
const rows = jobsAfter.rows || jobsAfter.jobs || [];
log.push(["jobsAfterReset", rows.length], ["markerGone(reset fired+reseeded)", !rows.some((j) => /ZZ UI MARKER/.test(j.label || ""))]);
for (const [k, v] of log) console.log(k.padEnd(34), v);
await browser.close();
