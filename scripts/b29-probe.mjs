// B2-9 probe (§7.2, 2026-07-09) — asserts the USER'S DECISIONS live:
// "shouldn't the model setting be the same flow for local and online" → the SAME
//   "Set as default" button on every provider row, one dialog.
// "give users a choice on set as a default overwrite, so they can choose to
//   overwrite or set it for all but ones already set" → the checkbox OFF keeps a
//   hand-customized preset; ON repoints every task preset.
// Embedding small print ("small print and confim your rec") → the dialog names the
//   embedding move when the row has one; the routing embedding default follows.
// Built-in guard ("requires assigned default models first, else offer 'pick
//   manually or run Quick Setup'") → the guard branch renders when no local pick.
// The probe is a REAL round-trip on the live API + UI; every write is restored and
// the temp provider deleted (DB left as found). findChrome copied from
// scripts/headless-smoke.mjs per JW CLAUDE.md.
import { existsSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
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

// ── Snapshot everything the flow writes (restored at the end). ────────────────
const origPresets = (await api("/v1/ai/engine-presets")).presets || [];
const origAssignments = await api("/v1/ai/preset-assignments");
const origRouting = await api("/v1/ai/routing");
// 2026-07-15 one-source: the assignment map is `features` (action→presetId); the
// task tier is gone. The presets the cascade can resolve to = the assigned ones + default.
const assignedIds = new Set(Object.values(origAssignments.features || {}).filter(Boolean));
if (origAssignments.defaultPresetId) assignedIds.add(origAssignments.defaultPresetId);
const taskPresets = origPresets.filter((p) => assignedIds.has(p.id));
if (!taskPresets.length) { console.error("no assigned presets on this DB — cannot probe"); process.exit(1); }
// The current default pair = the dominant across the assigned presets (the writer's rule).
const counts = {};
for (const p of taskPresets) counts[p.model] = (counts[p.model] || 0) + 1;
const dominant = taskPresets.slice().sort((a, b) => a.position - b.position)
  .reduce((best, p) => (counts[p.model] > (counts[best?.model] ?? -1) ? p : best), null);
const onDefaultPair = taskPresets.filter(
  (p) => p.model === dominant.model && (p.providerId || "") === (dominant.providerId || ""),
);
// The hand-customized guinea pig: a task preset we point at a DIFFERENT model so the
// keep-mode must skip it (§7.2 "all but ones already set"). Prefer one already on the
// default pair (so the customization is OURS and restorable).
const guinea = onDefaultPair.length > 1 ? onDefaultPair[onDefaultPair.length - 1] : null;
if (!guinea) { console.error("need ≥2 presets on the default pair to probe keep-mode"); process.exit(1); }

// ── Temp provider (no chat model yet → the guard branch first). ───────────────
const temp = await api("/v1/llm-providers", {
  method: "POST",
  body: { name: "B29 Probe", providerType: "openai-compat", baseUrl: "http://127.0.0.1:9", local: false },
});

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

  const row = page.locator('.lu-prow:has-text("B29 Probe")');
  const rowBtn = row.locator('button:has-text("Set as default")');
  check("B29-1 §7.2: every provider row carries Set as default (temp cloud row has it)",
    (await rowBtn.count()) === 1);

  // Guard branch: no chat model on the row yet.
  await rowBtn.click();
  await sleep(400);
  const guardText = await page.locator(".ui-modal").textContent();
  check("B29-2 guard: no chat model → 'set the chat model first' + Edit affordance",
    /chat model first/i.test(guardText) && (await page.locator('.ui-modal button:has-text("Edit provider")').count()) === 1);
  await page.locator('.ui-modal button:has-text("Close")').click();
  await sleep(300);

  // Give the row its models (API), reload so the list re-fetches.
  await api(`/v1/llm-providers/${encodeURIComponent(temp.id)}`, {
    method: "PATCH",
    body: { name: "B29 Probe", providerType: "openai-compat", baseUrl: "http://127.0.0.1:9",
            local: false, defaultModel: "b29-chat", embeddingModel: "b29-embed" },
  });
  // Hand-customize the guinea preset (a task the user pointed elsewhere).
  await api(`/v1/ai/engine-presets/${guinea.id}`, { method: "PUT", body: { ...guinea, model: "b29-hand" } });

  await page.reload({ waitUntil: "networkidle" });
  await sleep(1200);
  await page.evaluate(() => { window.location.hash = "#/ai"; });
  await sleep(1200);

  // Keep-my-customized apply (checkbox OFF is the default).
  await page.locator('.lu-prow:has-text("B29 Probe")').locator('button:has-text("Set as default")').click();
  await sleep(400);
  const dlg = await page.locator(".ui-modal").textContent();
  check("B29-3 dialog: names the provider + chat model, embedding line present, overwrite choice present",
    /B29 Probe/.test(dlg) && /b29-chat/.test(dlg) && /embeddings \(search\) provider/i.test(dlg)
    && /b29-embed/.test(dlg) && /overwrite presets I customized/i.test(dlg));
  await page.locator('.ui-modal button:has-text("Set as default")').click();
  await sleep(1500);

  const afterKeep = (await api("/v1/ai/engine-presets")).presets || [];
  const keptHand = afterKeep.find((p) => p.id === guinea.id);
  const movedKeep = onDefaultPair.filter((p) => p.id !== guinea.id)
    .every((p) => { const n = afterKeep.find((x) => x.id === p.id); return n.providerId === temp.id && n.model === "b29-chat"; });
  check("B29-4 §7.2 keep-mode: default-pair tasks repoint; the customized one keeps its own",
    movedKeep && keptHand.model === "b29-hand" && keptHand.providerId === (guinea.providerId || ""),
    JSON.stringify({ movedKeep, hand: `${keptHand.providerId}/${keptHand.model}` }));

  const routingAfter = await api("/v1/ai/routing");
  check("B29-5 §7.2 embed leg: routing embedding default follows the row's embedding model",
    routingAfter.default?.embeddingId === temp.id && routingAfter.default?.embeddingModel === "b29-embed",
    JSON.stringify(routingAfter.default));

  // Overwrite apply: the customized task moves too. (QC-20: after the keep-mode
  // apply the temp row IS the default — its button now reads "Default ✓", still
  // clickable; the overwrite checkbox in the dialog is exactly this path.)
  await page.locator('.lu-prow:has-text("B29 Probe")').locator('button:has-text("Default ✓")').click();
  await sleep(400);
  await page.locator('.ui-modal :text("Also overwrite presets I customized")').click();
  await page.locator('.ui-modal button:has-text("Set as default")').click();
  await sleep(1500);
  const afterOver = (await api("/v1/ai/engine-presets")).presets || [];
  const allMoved = [...onDefaultPair.map((p) => p.id)]
    .every((id) => { const n = afterOver.find((x) => x.id === id); return n.providerId === temp.id && n.model === "b29-chat"; });
  check("B29-6 §7.2 overwrite: EVERY task preset repoints, customized included", allMoved);

  // Built-in guard: the dominant is now the temp provider → no local pick → the
  // recorded offer "pick manually or run Quick Setup". (QC-39 promoted the
  // built-in out of the row list — its Set-as-default lives in the permanent
  // section header now.)
  await page.locator('.lu-builtin .lu-builtin-head').locator('button:has-text("Set as default")').click();
  await sleep(600);
  const biText = await page.locator(".ui-modal").textContent();
  check("B29-7 built-in guard: 'Assign a chat model first' + Run Quick Setup offered",
    /assign a chat model first/i.test(biText) && (await page.locator('.ui-modal button:has-text("Run Quick Setup")').count()) === 1);
  await page.locator('.ui-modal button:has-text("Close")').click();
} finally {
  // ── Restore the DB exactly as found. ─────────────────────────────────────────
  for (const p of origPresets) {
    try { await api(`/v1/ai/engine-presets/${p.id}`, { method: "PUT", body: p }); } catch { /* keep going */ }
  }
  try { await api("/v1/ai/routing", { method: "PUT", body: { default: origRouting.default, pins: origRouting.pins || {} } }); } catch { /* */ }
  try { await api(`/v1/llm-providers/${encodeURIComponent(temp.id)}`, { method: "DELETE" }); } catch { /* */ }
  await browser.close();
}

const restored = (await api("/v1/ai/engine-presets")).presets || [];
const backToOrig = origPresets.every((p) => {
  const n = restored.find((x) => x.id === p.id);
  return n && n.providerId === p.providerId && n.model === p.model;
});
const provGone = !((await api("/v1/llm-providers")).providers || []).some((p) => p.id === temp.id);
check("B29-8 cleanup: presets + routing restored, temp provider deleted", backToOrig && provGone);

console.log(`\npage errors: ${errors.length}`);
for (const e of errors) console.log(`  ${e}`);
const failed = results.filter((r) => !r.ok).length;
console.log(failed || errors.length ? "B29 PROBE FAILED" : "B29 PROBE PASSED");
process.exit(failed || errors.length ? 1 : 0);
