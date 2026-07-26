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
// copied from scripts/headless-smoke.js per JW CLAUDE.md.
import { existsSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
import { findChrome } from "../lib/smoke-common.js";
const { chromium } = require("playwright");
const API = "http://127.0.0.1:17495";


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

  // C3 — ONE real in-app routing write: Routing by feature → pick an action →
  // reassign its preset (2026-07-15 one-source: PUT /preset-assignments/feature
  // through the kit client → the write listener fires). This repoints the
  // feature's REF but keeps every preset's CONTENTS (all presets still carry
  // chip-probe-model), so C3b can see the configured model. (The old surface was
  // the deleted "Routing by task" per-task Reset; a preset Reset today would
  // re-seed the empty-model factory state and honestly stay unconfigured.)
  await page.evaluate(() => { window.location.hash = "#/ai"; });
  await sleep(1500);
  await page.evaluate(() => {
    [...document.querySelectorAll(".lu-subnav a")].find((a) => a.textContent.trim() === "Routing by feature")?.click();
  });
  await sleep(2000);
  await page.evaluate(() => {
    document.querySelector(".lu-fw-list .lu-fw-card")?.click();
  });
  await sleep(1500);
  // Open the per-action Preset select and pick a named preset (not the "— default
  // preset —" sentinel) → PUT /preset-assignments/feature.
  const clickedReset = await (async () => {
    try {
      await page.click(".lu-fw-runs .ui-select-trigger");
      await sleep(500);
      return await page.evaluate(() => {
        const opt = [...document.querySelectorAll("[role=option]")]
          .find((o) => !/default preset/i.test(o.textContent));
        if (!opt) return false;
        opt.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
        opt.click();
        return true;
      });
    } catch { return false; }
  })();
  await sleep(1500);
  check("C3a: an in-app routing write was made (feature preset reassigned)", clickedReset);

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
  for (const [featureKey, presetId] of Object.entries(origAssignments.features || {})) {
    await api("/v1/ai/preset-assignments/feature", { method: "PUT", body: { featureKey, presetId } }).catch(() => {});
  }
}

const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
