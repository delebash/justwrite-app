// Presets-page acceptance probe (2026-07-15 one-source rewrite, plan T5/T8).
// Drives the rebuilt "Presets" page END-TO-END on the live app (dev:vite :1420 +
// server :17495) and pins the flattening regression the rewrite kills:
//   P1  list shows 10 built-in presets, each with a "used by N" member count;
//   P2  create a preset (QC-15 in-pane form — Save disabled until named);
//   P3  assign a feature to it — a member row appears AND the moved-from preset's
//       "used by N" drops by one (the refs are the one source of membership);
//   P4  inline rename (the header IS the field; blur saves);
//   P5  per-preset Reset on a built-in;
//   P6  Reset all restores the 10 seeds + 37 refs (the custom preset is dropped);
//   P7  THE FLATTENING PIN — open Judgment & scoring's Lab (test against critique):
//       the column's Temp equals the PRESET's temperature (0.3, "Judgment &
//       scoring") NOT critique's old per-action 0.4; change ONLY Reasoning and
//       Update the preset; then the preset's temperature STAYS 0.3 (the flattening
//       is dead structurally — one preset, one temperature) while think/level
//       changed, and plotHoles (a sibling member) still resolves to p_judge.
// findChrome copied from scripts/headless-smoke.mjs per JW CLAUDE.md (JW_CHROME
// override honored). Every write is API-restored (POST /engine-presets/reset).
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

// ── snapshot for restore ──
const origAssign = await api("/v1/ai/preset-assignments");
// Idempotency: drop any leftover CUSTOM presets from a prior run (Reset-all keeps
// custom presets by design, so they'd accumulate on a reused DB).
for (const p of ((await api("/v1/ai/engine-presets")).presets || []).filter((x) => !x.builtIn)) {
  await api(`/v1/ai/engine-presets/${p.id}`, { method: "DELETE" }).catch(() => {});
}
await api("/v1/ai/engine-presets/reset", { method: "POST" }).catch(() => {});

const browser = await chromium.launch({ executablePath: findChrome(), headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message.slice(0, 200)));

try {
  await page.goto(APP, { waitUntil: "networkidle" });
  await sleep(1500);
  try { await page.click('button:has-text("Got it")', { timeout: 1200 }); } catch { /* none */ }

  // Open the AI area → Presets tab.
  await page.evaluate(() => { window.location.hash = "#/ai"; });
  await sleep(1500);
  const onPresets = await page.evaluate(() => {
    const a = [...document.querySelectorAll(".lu-subnav a")].find((x) => x.textContent.trim() === "Presets");
    if (a) { a.click(); return true; }
    return false;
  });
  check("Presets tab exists and opens", onPresets);
  await sleep(1800);

  // ── P1: list = 10 presets, each with a "used by N" count ──
  const p1 = await page.evaluate(() => {
    const cards = [...document.querySelectorAll(".lu-fw-list .lu-fw-card")];
    return {
      count: cards.length,
      models: cards.map((c) => c.querySelector(".lu-fw-card-model")?.textContent.trim() || ""),
    };
  });
  check("P1: the list shows 10 presets", p1.count === 10, `count=${p1.count}`);
  check("P1: every preset row shows a 'used by N' member count",
    p1.count > 0 && p1.models.every((m) => /used by \d+ feature/.test(m)),
    p1.models.slice(0, 3).join(" · "));

  // ── P2: create a preset (QC-15 in-pane form; Save disabled until named) ──
  await page.evaluate(() => document.querySelector(".lu-tk-new")?.click());
  await sleep(700);
  const saveDisabledBefore = await page.evaluate(() =>
    [...document.querySelectorAll(".lu-tk-createactions button")]
      .find((b) => b.textContent.trim() === "Save")?.disabled ?? null);
  check("P2: create form opens with Save disabled until a name is typed", saveDisabledBefore === true);
  await page.fill(".lu-tk-createform input.ui-input", "Probe preset Z");
  await sleep(300);
  const saveEnabled = await page.evaluate(() =>
    [...document.querySelectorAll(".lu-tk-createactions button")]
      .find((b) => b.textContent.trim() === "Save")?.disabled === false);
  check("P2: Save enables once a name is typed", saveEnabled);
  await page.evaluate(() =>
    [...document.querySelectorAll(".lu-tk-createactions button")].find((b) => b.textContent.trim() === "Save")?.click());
  await sleep(1200);
  const afterCreate = await page.evaluate(() => ({
    count: document.querySelectorAll(".lu-fw-list .lu-fw-card").length,
    selName: document.querySelector("input.lu-tk-name")?.value || "",
  }));
  check("P2: the new preset is added (11) and selected", afterCreate.count === 11 && afterCreate.selName === "Probe preset Z",
    `count=${afterCreate.count} name="${afterCreate.selName}"`);

  // ── P3: assign a feature to the new (empty) preset → member appears, source count drops ──
  const countsBefore = await page.evaluate(() =>
    [...document.querySelectorAll(".lu-fw-list .lu-fw-card")].map((c) => ({
      name: c.querySelector(".lu-fw-card-label")?.textContent.replace("built-in", "").trim() || "",
      n: Number((c.querySelector(".lu-fw-card-model")?.textContent.match(/used by (\d+)/) || [])[1] || 0),
    })));
  // The assign select is the only UiSelect in the empty preset's detail pane (no
  // members yet → the "Test against" row + FeatureLab are absent). Its class
  // (.lu-tk-add) merges onto the trigger itself (Reka SelectRoot is renderless),
  // so target the trigger inside the "Features using this preset" section header.
  const assignedLabel = await pickReka(page, ".lu-fw-edit .lu-tk-sec-h .ui-select-trigger", " — from ");
  check("P3: an assignable feature option was picked", assignedLabel != null, assignedLabel);
  await sleep(800);
  const p3 = await page.evaluate(() => ({
    members: document.querySelectorAll(".lu-tk-members .lu-tk-member").length,
    counts: [...document.querySelectorAll(".lu-fw-list .lu-fw-card")].map((c) => ({
      name: c.querySelector(".lu-fw-card-label")?.textContent.replace("built-in", "").trim() || "",
      n: Number((c.querySelector(".lu-fw-card-model")?.textContent.match(/used by (\d+)/) || [])[1] || 0),
    })),
  }));
  const totalBefore = countsBefore.reduce((s, c) => s + c.n, 0);
  const totalAfter = p3.counts.reduce((s, c) => s + c.n, 0);
  const someDropped = countsBefore.some((b) => {
    const a = p3.counts.find((x) => x.name === b.name);
    return a && a.n === b.n - 1;
  });
  check("P3: a member row appears in the target preset", p3.members === 1, `members=${p3.members}`);
  check("P3: the moved-from preset's 'used by' count dropped by one (total conserved)",
    someDropped && totalAfter === totalBefore, `before=${totalBefore} after=${totalAfter} dropped=${someDropped}`);

  // ── P4: inline rename (the header IS the field; blur saves) ──
  await page.fill("input.lu-tk-name", "Probe preset Z2");
  await page.evaluate(() => document.querySelector("input.lu-tk-name")?.blur());
  await sleep(1000);
  const renamed = await page.evaluate(() =>
    [...document.querySelectorAll(".lu-fw-list .lu-fw-card-label")].some((l) => l.textContent.includes("Probe preset Z2")));
  check("P4: inline rename updates the list card", renamed);

  // ── P5: per-preset Reset on a built-in ──
  await page.evaluate(() => {
    const card = [...document.querySelectorAll(".lu-fw-list .lu-fw-card")]
      .find((c) => /Judgment & scoring/.test(c.querySelector(".lu-fw-card-label")?.textContent || ""));
    card?.click();
  });
  await sleep(1000);
  const resetClicked = await page.evaluate(() => {
    const btn = [...document.querySelectorAll(".lu-fw-edit .lu-fw-h button")].find((b) => b.textContent.trim() === "Reset");
    if (!btn) return false;
    btn.click();
    return true;
  });
  await confirmActiveDialog(page);
  const p5msg = await page.evaluate(() => document.querySelector(".lu-fw-msg")?.textContent || "");
  check("P5: per-preset Reset on a built-in ran", resetClicked && /reset/i.test(p5msg), p5msg);

  // ── P6: Reset all → the 10 built-in presets + 37 refs restored (custom presets are
  // KEPT by design — the plan: "Your custom presets are kept"). ──
  await page.evaluate(() => document.querySelector(".lu-tk-resetall")?.click());
  await confirmActiveDialog(page);
  await sleep(1500);
  const p6presets = (await api("/v1/ai/engine-presets")).presets || [];
  const builtIns = p6presets.filter((p) => p.builtIn);
  const asg = await api("/v1/ai/preset-assignments");
  check("P6: Reset all restores the 10 built-in presets (custom presets kept)",
    builtIns.length === 10, `builtIns=${builtIns.length} total=${p6presets.length}`);
  check("P6: Reset all restores 37 seeded feature refs",
    Object.keys(asg.features || {}).length === 37, `refs=${Object.keys(asg.features || {}).length}`);

  // ── P7: THE FLATTENING PIN ──────────────────────────────────────────────────
  // Select Judgment & scoring (p_judge). testAgainst defaults to critique (first
  // member alphabetically). The Lab column seeds Temp FROM THE PRESET (0.3), not
  // from critique's old per-action 0.4 — that per-action tunable is deleted.
  const presetBefore = (await api("/v1/ai/engine-presets")).presets.find((p) => p.id === "p_judge");
  check("P7: p_judge seeds at temperature 0.3 (the mint)", presetBefore?.temperature === 0.3, `temp=${presetBefore?.temperature}`);
  await page.evaluate(() => {
    const card = [...document.querySelectorAll(".lu-fw-list .lu-fw-card")]
      .find((c) => /Judgment & scoring/.test(c.querySelector(".lu-fw-card-label")?.textContent || ""));
    card?.click();
  });
  await sleep(2000); // FeatureLab + ConfigColumn mount, apply-preset loads the column
  const colTemp = await page.evaluate(() => {
    const field = [...document.querySelectorAll(".cc-params .cc-num")]
      .find((f) => f.querySelector("label")?.textContent.trim().startsWith("Temp"));
    return field?.querySelector("input")?.value ?? null;
  });
  check("P7: the Lab column's Temp equals the PRESET's temperature (0.3), NOT critique's old 0.4",
    String(colTemp) === "0.3", `column Temp=${colTemp}`);

  // resolved-route for plotHoles BEFORE — routing provenance (a p_judge sibling).
  const rrBefore = await api("/v1/ai/resolved-route?feature=plotHoles");

  // Change ONLY Reasoning → Medium, then Update the preset.
  const pickedLevel = await pickReka(page, ".cc-reason .ui-select-trigger", "Medium");
  check("P7: Reasoning set to Medium in the column", /medium/i.test(pickedLevel || ""), pickedLevel);
  const updateClicked = await page.evaluate(() => {
    const btn = [...document.querySelectorAll(".cc-presets button")].find((b) => b.textContent.trim() === "Update");
    if (!btn) return false;
    btn.click();
    return true;
  });
  check("P7: 'Update' (write THIS preset) was clicked", updateClicked);
  await sleep(1500);

  // The one source: p_judge's temperature STAYED 0.3 (flattening dead), reasoning changed.
  const presetAfter = (await api("/v1/ai/engine-presets")).presets.find((p) => p.id === "p_judge");
  check("P7 (THE PIN): editing ONLY Reasoning left p_judge.temperature at 0.3 — no flattening",
    presetAfter?.temperature === 0.3, `temp after=${presetAfter?.temperature}`);
  check("P7: the reasoning edit DID land (think on, level medium)",
    presetAfter?.think === true && presetAfter?.reasoningEffort === "medium",
    `think=${presetAfter?.think} level=${presetAfter?.reasoningEffort}`);

  // plotHoles (a sibling member) still resolves to p_judge — routing intact; since it
  // shares the one preset, its temperature is structurally 0.3 (resolved-route carries
  // routing provenance, not the temp field: the temp is on the preset, the one source).
  const rrAfter = await api("/v1/ai/resolved-route?feature=plotHoles");
  check("P7: plotHoles still resolves to preset p_judge (assigned)",
    rrAfter.presetId === "p_judge" && rrAfter.presetSource === "assigned",
    `presetId=${rrAfter.presetId} source=${rrAfter.presetSource}`);
  check("P7: plotHoles' routing (preset/provider/model) is unchanged by the reasoning edit",
    rrAfter.presetId === rrBefore.presetId && rrAfter.model === rrBefore.model && rrAfter.providerId === rrBefore.providerId,
    `before=${rrBefore.presetId}/${rrBefore.model} after=${rrAfter.presetId}/${rrAfter.model}`);

  check("zero page errors", errors.length === 0, errors.join(" | ").slice(0, 300));
} finally {
  await browser.close();
  // Restore factory seeds (presets + refs + default).
  await api("/v1/ai/engine-presets/reset", { method: "POST" }).catch(() => {});
  // Belt-and-suspenders: re-assert the original refs if the snapshot had custom ones.
  for (const [k, pid] of Object.entries(origAssign.features || {})) {
    await api("/v1/ai/preset-assignments/feature", { method: "PUT", body: { featureKey: k, presetId: pid } }).catch(() => {});
  }
}

const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
