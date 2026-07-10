// Chip-staleness probe (2026-07-10 — user: "i ran quick setup and it still is
// not shwoing corerectly"). Asserts the fix END-TO-END in headless Chromium:
//   C1  not-configured chips read "No model set · open AI settings" (the
//       user's copy pick "b" — the local-only "run Quick Setup" push is gone);
//   C2  an API-side write the APP DIDN'T MAKE leaves the chip stale (honest
//       cache semantics — nothing invalidated);
//   C3  ONE real in-app routing write (the Routing-by-task Reset, which PUTs
//       through the kit client) invalidates the chip cache, and navigating
//       back shows the configured provider · model WITHOUT any page reload;
//   C4  zero page errors.
// Every write is restored via API snapshots — DB left as found. findChrome
// copied from scripts/headless-smoke.mjs per JW CLAUDE.md.
import { existsSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire("/home/user/justwrite-app/scripts/headless-smoke.mjs");
const { chromium } = require("playwright");
const API = "http://127.0.0.1:17495";

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

const results = [];
const check = (name, ok, note = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "✓" : "✗"} ${name}${note ? ` — ${note}` : ""}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const api = async (path, opts = {}) => {
  const r = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!r.ok && r.status !== 204) throw new Error(`${path} → ${r.status}`);
  try { return await r.json(); } catch { return {}; }
};

// ── Snapshots (restored at the end). ──────────────────────────────────────────
const origPresets = (await api("/v1/ai/engine-presets")).presets || [];
const origAssignments = await api("/v1/ai/preset-assignments");
if (!origPresets.length) { console.error("no presets on this DB — cannot probe"); process.exit(1); }

// Blank every preset's provider/model → resolved-route reports configured:false.
for (const p of origPresets) {
  await api(`/v1/ai/engine-presets/${p.id}`, { method: "PUT", body: { ...p, providerId: "", model: "" } });
}

const browser = await chromium.launch({ executablePath: findChrome(), headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1400, height: 980 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message.slice(0, 200)));

async function chipText() {
  return page.evaluate(() => document.querySelector(".afc-chip")?.textContent?.trim() || "(no chip)");
}

try {
  await page.goto("http://localhost:1420", { waitUntil: "networkidle" });
  await sleep(1500);
  try { await page.click('button:has-text("Got it")', { timeout: 1500 }); } catch { /* none */ }

  // C1 — a feature surface's chip in the not-configured state (Analysis view).
  await page.evaluate(() => { window.location.hash = "#/analysis"; });
  await sleep(1800);
  let t = await chipText();
  check("C1 copy (user pick b): 'No model set · open AI settings' — no Quick-Setup push",
    t.includes("No model set") && t.includes("open AI settings") && !/quick setup/i.test(t), t);

  // C2 — configure a real provider+model pair via the API (a write the APP
  // didn't make; this dev DB is factory-state — seeded presets ship with
  // EMPTY models — so the probe supplies its own pair): the mounted chip
  // must stay stale — nothing told the cache.
  const providers = (await api("/v1/llm-providers")).providers || [];
  const builtin = providers.find((p) => p.providerType === "local-llamacpp") || providers[0];
  for (const p of origPresets) {
    await api(`/v1/ai/engine-presets/${p.id}`, {
      method: "PUT", body: { ...p, providerId: builtin.id, model: "chip-probe-model" },
    });
  }
  await sleep(800);
  t = await chipText();
  check("C2 honest cache: an out-of-app write leaves the chip stale (no invalidation)",
    t.includes("No model set"), t);

  // C3 — ONE real in-app routing write: Routing by task → open a task → Reset
  // (QC-27; PUTs/POSTs through the kit client → the write listener fires).
  await page.evaluate(() => { window.location.hash = "#/ai"; });
  await sleep(1500);
  await page.evaluate(() => {
    [...document.querySelectorAll(".lu-subnav a")].find((a) => a.textContent.trim() === "Routing by task")?.click();
  });
  await sleep(2000);
  await page.evaluate(() => {
    document.querySelector(".lu-fw-card")?.click();
  });
  await sleep(1500);
  // EXACT "Reset" = the per-task reset (QC-27: repoints the assignment, keeps
  // preset CONTENTS). "Reset all to defaults" would re-seed the presets to the
  // factory empty-model state and the server would honestly stay unconfigured
  // (the first probe run clicked that one — debug-capture-caught).
  const clickedReset = await page.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Reset");
    if (!btn) return false;
    btn.click();
    return true;
  });
  await sleep(600);
  // Confirm dialog if one opened (the QC-27 reset confirms).
  await page.evaluate(() => {
    const dlg = document.querySelector('[role="dialog"]');
    if (!dlg) return;
    const yes = [...dlg.querySelectorAll("button")].find((b) => /reset|confirm|ok|yes/i.test(b.textContent));
    yes?.click();
  });
  await sleep(1500);
  check("C3a: an in-app routing write was made (task Reset clicked)", clickedReset);

  // …and back to the chip surface — SPA navigation, NO reload.
  await page.evaluate(() => { window.location.hash = "#/analysis"; });
  await sleep(1800);
  t = await chipText();
  check("C3b: chip now shows the configured provider · model WITHOUT a reload",
    t.includes("chip-probe-model") && !t.includes("No model set"), t);

  check("C4: zero page errors", errors.length === 0, errors.join(" | ").slice(0, 200));
} finally {
  await browser.close();
  // Restore: presets to the snapshot (again — Reset may have repointed
  // assignments), then the assignment map.
  for (const p of origPresets) {
    await api(`/v1/ai/engine-presets/${p.id}`, { method: "PUT", body: p }).catch(() => {});
  }
  for (const [taskKind, presetId] of Object.entries(origAssignments.taskKinds || {})) {
    await api("/v1/ai/preset-assignments/task-kind", { method: "PUT", body: { taskKind, presetId } }).catch(() => {});
  }
}

const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
