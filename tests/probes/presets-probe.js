// Preset-workflow acceptance probe (2026-07-15 one-source rewrite; REBUILT the same
// day for the user's correction: the separate Presets page was DELETED — Routing by
// feature is the ONE routing surface, and the Lab bar is the ONE preset control,
// restored to its original 1302f88 shape). Drives the live app (dev:vite :1420 +
// server :17495):
//   N1  the AI subnav has NO "Presets" tab; "Routing by feature" opens;
//   N2  the feature nav cards carry "→ <preset> · assigned/default" provenance;
//   N3  the selected action's Lab bar preselects the production preset and shows
//       the "● in production" marker; the old top assignment row is GONE;
//   N4  loading a DIFFERENT preset shows the ORIGINAL "Use in production" button
//       (the task-era + rewrite renames are dead); clicking it assigns the feature
//       (PUT ref → resolved-route says assigned) and the nav card updates;
//   N5  ＋ Save as preset creates one (adopted into the bar) and 🗑 deletes it;
//   N6  "↺ Reset presets to defaults" (relocated from the deleted page) restores
//       the 10 built-ins + 37 refs;
//   N7  THE FLATTENING PIN — Plot-hole audit's column Temp equals the PRESET's 0.3
//       (its old per-action 0.3 and critique's 0.4 are both deleted); a
//       reasoning-only Update leaves temperature at 0.3 while think/level land;
//       its SIBLING on the same preset (critique) still resolves to p_judge.
// NOTE on labels: a nav card shows the ACTION's seeded label, not its key —
// critique renders as "Notes" under the "Critique" heading. Drive by the exact
// label ("Plot-hole audit" = plotHoles) and assert the selection took.
// findChrome copied from scripts/headless-smoke.js per JW CLAUDE.md (JW_CHROME
// honored). Every write is API-restored (POST /engine-presets/reset + ref replay).
import { existsSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const APP = process.env.JW_APP || "http://localhost:1420";
const API = process.env.JW_API || "http://127.0.0.1:17495";

function findChrome() {
  if (process.env.JW_CHROME && existsSync(process.env.JW_CHROME)) return process.env.JW_CHROME;
  const roots = ["/opt/pw-browsers", `${process.env.HOME || ""}/.cache/ms-playwright`,
    `${process.env.LOCALAPPDATA || ""}/ms-playwright`];
  for (const root of roots) {
    if (!root || !existsSync(root)) continue;
    for (const dir of readdirSync(root)) {
      if (!dir.startsWith("chromium") || dir.includes("headless_shell")) continue;
      for (const sub of ["chrome-linux/chrome", "chrome-win64/chrome.exe", "chrome-win/chrome.exe"]) {
        const exe = `${root}/${dir}/${sub}`;
        if (existsSync(exe)) return exe;
      }
    }
  }
  return undefined;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, note = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "✓" : "✗"} ${name}${note ? ` — ${String(note).slice(0, 200)}` : ""}`);
};
const api = async (path, opts = {}) => {
  const r = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  try { return await r.json(); } catch { return {}; }
};

// Reka UiSelect: a real pointer click on the trigger + pointerup on the option.
async function pickReka(page, triggerSel, optionMatcher) {
  await page.click(triggerSel);
  await sleep(500);
  const hit = await page.evaluate((m) => {
    const opt = [...document.querySelectorAll("[role=option]")]
      .find((o) => o.textContent.trim().toLowerCase().includes(m.toLowerCase()));
    if (!opt) return null;
    const label = opt.textContent.trim();
    opt.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
    opt.click();
    return label;
  }, optionMatcher);
  await sleep(900);
  return hit;
}

async function confirmActiveDialog(page) {
  await sleep(500);
  await page.evaluate(() => {
    const dlg = document.querySelector('[role="dialog"], [role="alertdialog"]');
    if (!dlg) return;
    const yes = [...dlg.querySelectorAll("button")]
      .find((b) => /reset|delete|confirm|ok|yes/i.test(b.textContent) && !/cancel/i.test(b.textContent));
    yes?.click();
  });
  await sleep(1200);
}

async function selectActionCard(page, exactLabel) {
  return page.evaluate((lbl) => {
    const card = [...document.querySelectorAll(".lu-fw-list .lu-fw-card")]
      .find((c) => (c.querySelector(".lu-fw-card-label")?.textContent || "").trim() === lbl);
    if (!card) return false;
    card.click();
    return true;
  }, exactLabel);
}

// ── snapshot for restore ──
const origAssign = await api("/v1/ai/preset-assignments");
for (const p of ((await api("/v1/ai/engine-presets")).presets || []).filter((x) => !x.builtIn)) {
  await api(`/v1/ai/engine-presets/${p.id}`, { method: "DELETE" }).catch(() => {});
}
await api("/v1/ai/engine-presets/reset", { method: "POST" }).catch(() => {});

const browser = await chromium.launch({ executablePath: findChrome(), headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message.slice(0, 200)));
const writes = [];
if (process.env.PROBE_TRACE) page.on("request", (r) => { if (r.method() !== "GET" && /\/v1\//.test(r.url())) writes.push(`${r.method()} ${r.url()} :: ${String(r.postData()||"").slice(0,60)}`); });

try {
  await page.goto(APP, { waitUntil: "networkidle" });
  await sleep(1500);
  try { await page.click('button:has-text("Got it")', { timeout: 1200 }); } catch { /* none */ }

  await page.evaluate(() => { window.location.hash = "#/ai"; });
  await sleep(1500);

  // ── N1: no Presets tab; Routing by feature opens ──
  const nav = await page.evaluate(() => {
    const links = [...document.querySelectorAll(".lu-subnav a")].map((a) => a.textContent.trim());
    const rbf = [...document.querySelectorAll(".lu-subnav a")].find((a) => a.textContent.trim() === "Routing by feature");
    rbf?.click();
    return { links, opened: !!rbf };
  });
  check("N1: the Presets tab is GONE from the subnav", !nav.links.includes("Presets"), nav.links.join(" · "));
  check("N1: Routing by feature opens", nav.opened);
  await sleep(2000);

  // ── N2: nav cards carry preset provenance ──
  const n2 = await page.evaluate(() => {
    const cards = [...document.querySelectorAll(".lu-fw-list .lu-fw-card-model")].map((m) => m.textContent.trim());
    return { count: cards.length, withProv: cards.filter((t) => /· (assigned|default)$/.test(t)).length, sample: cards[0] || "" };
  });
  check("N2: every nav card shows '→ preset · assigned/default'", n2.count > 0 && n2.withProv === n2.count,
    `${n2.withProv}/${n2.count} · "${n2.sample}"`);

  // ── N3: select Plot-hole audit (plotHoles → p_judge) — the bar preselects
  // production; the old top row is gone ──
  check("N3: the Plot-hole audit action card selects", await selectActionCard(page, "Plot-hole audit"));
  await sleep(2000);
  const n3 = await page.evaluate(() => ({
    oldTopRow: !!document.querySelector(".lu-fw-runs"),
    barPreset: document.querySelector(".cc-presets .ui-select-trigger")?.textContent.trim() || "",
    inProd: !!document.querySelector(".cc-presets .cc-inprod"),
    useInProdVisible: [...document.querySelectorAll(".cc-presets button")].some((b) => b.textContent.trim() === "Use in production"),
  }));
  check("N3: the old top assignment row is GONE", !n3.oldTopRow);
  check("N3: the Lab bar preselects the production preset (Judgment & scoring)",
    /Judgment & scoring/.test(n3.barPreset), n3.barPreset);
  check("N3: the '● in production' marker shows (original 1302f88 state)", n3.inProd);
  check("N3: 'Use in production' is hidden while the loaded preset IS production", !n3.useInProdVisible);

  // ── N7 first half: THE FLATTENING PIN (Plot-hole audit is on p_judge) ──
  const presetBefore = (await api("/v1/ai/engine-presets")).presets.find((p) => p.id === "p_judge");
  check("N7: p_judge seeds at temperature 0.3 (the mint)", presetBefore?.temperature === 0.3, `temp=${presetBefore?.temperature}`);
  const colTemp = await page.evaluate(() => {
    const field = [...document.querySelectorAll(".cc-params .cc-num")]
      .find((f) => f.querySelector("label")?.textContent.trim().startsWith("Temp"));
    return field?.querySelector("input")?.value ?? null;
  });
  check("N7: the column's Temp equals the PRESET's 0.3 (the per-action tunables are dead)",
    String(colTemp) === "0.3", `column Temp=${colTemp}`);
  const rrBefore = await api("/v1/ai/resolved-route?feature=critique");
  const pickedLevel = await pickReka(page, ".cc-reason .ui-select-trigger", "Medium");
  check("N7: Reasoning set to Medium in the column", /medium/i.test(pickedLevel || ""), pickedLevel);
  const updateClicked = await page.evaluate(() => {
    const btn = [...document.querySelectorAll(".cc-presets button")].find((b) => b.textContent.trim() === "Update");
    if (!btn) return false;
    btn.click();
    return true;
  });
  check("N7: 'Update' (write THIS preset) was clicked", updateClicked);
  await sleep(1500);
  const presetAfter = (await api("/v1/ai/engine-presets")).presets.find((p) => p.id === "p_judge");
  check("N7 (THE PIN): a reasoning-only Update left p_judge.temperature at 0.3 — no flattening",
    presetAfter?.temperature === 0.3, `temp after=${presetAfter?.temperature}`);
  check("N7: the reasoning edit DID land (think on, level medium)",
    presetAfter?.think === true && presetAfter?.reasoningEffort === "medium",
    `think=${presetAfter?.think} level=${presetAfter?.reasoningEffort}`);
  const rrAfterEdit = await api("/v1/ai/resolved-route?feature=critique");
  check("N7: the SIBLING (critique) still resolves to p_judge (assigned), routing untouched",
    rrAfterEdit.presetId === "p_judge" && rrAfterEdit.presetSource === "assigned"
      && rrAfterEdit.model === rrBefore.model && rrAfterEdit.providerId === rrBefore.providerId,
    `presetId=${rrAfterEdit.presetId} source=${rrAfterEdit.presetSource}`);

  // ── N4: reassign via THE original control — load another preset → Use in production ──
  const loaded = await pickReka(page, ".cc-presets .ui-select-trigger", "Generate prose");
  check("N4: a different preset loads into the column", /Generate prose/.test(loaded || ""), loaded);
  const n4state = await page.evaluate(() => ({
    inProd: !!document.querySelector(".cc-presets .cc-inprod"),
    btn: [...document.querySelectorAll(".cc-presets button")].find((b) => b.textContent.trim() === "Use in production")?.textContent.trim() || "",
  }));
  check("N4: the ORIGINAL 'Use in production' button appears (renames dead)", n4state.btn === "Use in production");
  check("N4: the '● in production' marker cleared (loaded ≠ production)", !n4state.inProd);
  await page.evaluate(() => {
    [...document.querySelectorAll(".cc-presets button")].find((b) => b.textContent.trim() === "Use in production")?.click();
  });
  await sleep(1500);
  const rrPh = await api("/v1/ai/resolved-route?feature=plotHoles");
  check("N4: clicking it ASSIGNS the feature (resolved-route: p_prose_voiced · assigned)",
    rrPh.presetId === "p_prose_voiced" && rrPh.presetSource === "assigned",
    `presetId=${rrPh.presetId} source=${rrPh.presetSource}`);
  const n4after = await page.evaluate(() => ({
    inProd: !!document.querySelector(".cc-presets .cc-inprod"),
    card: [...document.querySelectorAll(".lu-fw-list .lu-fw-card")]
      .find((c) => (c.querySelector(".lu-fw-card-label")?.textContent || "").trim() === "Plot-hole audit")
      ?.querySelector(".lu-fw-card-model")?.textContent.trim() || "",
  }));
  check("N4: the marker returns (loaded preset IS now production)", n4after.inProd);
  check("N4: the nav card updates to 'Generate prose · assigned'", /Generate prose · assigned/.test(n4after.card), n4after.card);
  // restore plotHoles → Judgment & scoring through the same control
  await pickReka(page, ".cc-presets .ui-select-trigger", "Judgment & scoring");
  await page.evaluate(() => {
    [...document.querySelectorAll(".cc-presets button")].find((b) => b.textContent.trim() === "Use in production")?.click();
  });
  await sleep(1200);

  // ── N4b: the labeled per-feature "Reset to default" (the original affordance;
  // the user's 2026-07-15 word: a real button, resets the WHOLE form) ──
  const resetFeatBtn = await page.evaluate(() => {
    const btn = [...document.querySelectorAll(".lu-fw-h button")].find((b) => b.textContent.trim() === "Reset to default");
    if (!btn) return false;
    btn.click();
    return true;
  });
  check("N4b: a labeled 'Reset to default' button sits in the action header", resetFeatBtn);
  await sleep(1800); // ref clears + FeatureLab remounts (labEpoch)
  const rrReset = await api("/v1/ai/resolved-route?feature=plotHoles");
  check("N4b: it clears the assignment (plotHoles → the default preset, source=default)",
    rrReset.presetSource === "default", `presetId=${rrReset.presetId} source=${rrReset.presetSource}`);
  const n4b = await page.evaluate(() => ({
    barPreset: document.querySelector(".cc-presets .ui-select-trigger")?.textContent.trim() || "",
    inProd: !!document.querySelector(".cc-presets .cc-inprod"),
    resetGone: ![...document.querySelectorAll(".lu-fw-h button")].some((b) => b.textContent.trim() === "Reset to default"),
  }));
  check("N4b: the form RELOADED onto the default preset (bar + ● marker; button gone)",
    n4b.inProd && n4b.resetGone && n4b.barPreset.length > 0, JSON.stringify(n4b));
  // restore critique's seeded assignment for the rest of the run
  await api("/v1/ai/preset-assignments/feature", { method: "PUT", body: { featureKey: "plotHoles", presetId: "p_judge" } });
  await sleep(600);

  // ── N5: ＋ Save as preset creates; 🗑 deletes ──
  await page.evaluate(() => {
    [...document.querySelectorAll(".cc-presets button")].find((b) => b.textContent.trim() === "＋ Save as preset")?.click();
  });
  await sleep(400);
  await page.fill(".cc-presets .cc-name-in input, .cc-presets input", "Probe preset Z");
  await page.keyboard.press("Enter");
  await sleep(1500);
  const created = ((await api("/v1/ai/engine-presets")).presets || []).find((p) => p.name === "Probe preset Z");
  check("N5: ＋ Save as preset created it", !!created, created?.id || "not found");
  const adopted = await page.evaluate(() => document.querySelector(".cc-presets .ui-select-trigger")?.textContent.trim() || "");
  check("N5: the bar adopted the new preset (#27)", /Probe preset Z/.test(adopted), adopted);
  await page.evaluate(() => {
    [...document.querySelectorAll(".cc-presets button")].find((b) => b.title === "Delete this preset")?.click();
  });
  await sleep(1500);
  const goneAfterDelete = !((await api("/v1/ai/engine-presets")).presets || []).some((p) => p.name === "Probe preset Z");
  check("N5: 🗑 deleted it", goneAfterDelete);

  // ── N6: the relocated Reset (aside footer) ──
  const resetBtn = await page.evaluate(() => {
    const btn = document.querySelector(".lu-fw-aside-foot button");
    if (!btn) return "";
    const t = btn.textContent.trim();
    btn.click();
    return t;
  });
  check("N6: '↺ Reset presets to defaults' lives at the list footer", /Reset presets to defaults/.test(resetBtn), resetBtn);
  await confirmActiveDialog(page);
  await sleep(1500);
  const p6presets = (await api("/v1/ai/engine-presets")).presets || [];
  const asg = await api("/v1/ai/preset-assignments");
  check("N6: Reset restores the 10 built-ins", p6presets.filter((p) => p.builtIn).length === 10,
    `builtIns=${p6presets.filter((p) => p.builtIn).length}`);
  check("N6: Reset restores 37 seeded feature refs", Object.keys(asg.features || {}).length === 37,
    `refs=${Object.keys(asg.features || {}).length}`);

  check("zero page errors", errors.length === 0, errors.join(" | ").slice(0, 300));
} finally {
  if (process.env.PROBE_TRACE) console.log(`\n--- WRITES ---\n${writes.join("\n")}`);
  await browser.close();
  await api("/v1/ai/engine-presets/reset", { method: "POST" }).catch(() => {});
  for (const [k, pid] of Object.entries(origAssign.features || {})) {
    await api("/v1/ai/preset-assignments/feature", { method: "PUT", body: { featureKey: k, presetId: pid } }).catch(() => {});
  }
}

const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
