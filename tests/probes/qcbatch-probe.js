// QC-39/40/41/42 batch probe — asserts the USER'S DECISIONS (2026-07-10, the
// queue doc's TWELFTH-COMPACT POINT + addendum) on the live surfaces:
//
// QC-39 (b): the BUILT-IN provider is promoted OUT of the accordion into its own
//   permanent top section (Quick-Setup band at the top · identity header with the
//   Default affordance · the full Edit contents rendered bare); every OTHER
//   provider stays in the grouped list below; the page-scale accent-soft washes
//   are GONE (.lu-pform + .lu-msection are neutral); the engine panel carries the
//   full action cluster (Uninstall + Reinstall/Update — the deleted row's
//   affordances live on).
// QC-42: "For the Local built-in provider" sits right of Run Quick Setup, BIGGER
//   than the description text (the user's exact copy).
// QC-41 (option 1): the scene editor's right-click menu ALWAYS opens; items
//   enable/disable by the AI-menu scope-law (selection-only rows disabled + the
//   "Highlight text first to enable" hint); Windows-11 row grammar (icons +
//   shortcut hints); the bottom "Show browser menu" row arms a ONE-SHOT native
//   passthrough (the next right-click is the browser's own menu).
// QC-40 (option 1): the sidebar project menu offers exactly "New project…" +
//   "Try tutorial project"; clicking the tutorial creates (on demand) and OPENS
//   "The Ninth Facet". The probe restores the active project and
//   leaves the demo in the state it found it (modulo pristine re-creation).
//
// Run: JW server :17495 + vite :1420 up, then `node scripts/qcbatch-probe.js`.
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

const pageErrors = [];
const browser = await chromium.launch({ executablePath: findChrome(), headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.on("pageerror", (e) => pageErrors.push(String(e)));

const DEMO_ID = "prj_sample_ninth_facet";
const origSettings = await api("/v1/settings");
const demoWasPresent = ((await api("/v1/projects")) || []).some((p) => p.id === DEMO_ID);

try {
  await page.goto(BASE, { waitUntil: "networkidle" });
  await sleep(1500);
  try { await page.click('button:has-text("Got it")', { timeout: 1500 }); } catch { /* none */ }

  // ── QC-39: the promoted built-in section + neutral surfaces ────────────────
  await page.evaluate(() => { window.location.hash = "#/ai"; });
  await sleep(1800);

  const q39 = await page.evaluate(() => {
    const sec = document.querySelector(".lu-builtin");
    if (!sec) return { found: false };
    const title = sec.querySelector(".lu-builtin-title")?.textContent.trim() || "";
    const qsBand = sec.querySelector(".lu-builtin-qs .lu-qs");
    const form = sec.querySelector(".lu-pform");
    const formBg = form ? getComputedStyle(form).backgroundColor : "";
    const listedBuiltin = [...document.querySelectorAll(".lu-prow")]
      .some((r) => r.textContent.includes("Built-in provider"));
    const engBtns = [...(sec.querySelectorAll(".lu-eng-actions button") || [])].map((b) => b.textContent.trim());
    const cancel = [...(sec.querySelectorAll(".lu-pf-foot button") || [])].some((b) => b.textContent.trim() === "Cancel");
    const msec = document.querySelector(".lu-msection td");
    const msecBg = msec ? getComputedStyle(msec).backgroundColor : "";
    return {
      found: true, title, hasQs: !!qsBand, formBg, listedBuiltin, engBtns, cancel, msecBg,
      qsFirst: sec.firstElementChild?.classList.contains("lu-builtin-qs"),
    };
  });
  check("QC-39: the built-in provider renders as the permanent top section (its Edit contents ARE the page)",
    q39.found && /llama\.cpp \(your machine\)/.test(q39.title), q39.title);
  check("QC-39: the Quick-Setup band sits at the section's TOP (#4 law preserved)", q39.hasQs && q39.qsFirst);
  check("QC-39: the built-in no longer appears as a row in the provider list", q39.found && !q39.listedBuiltin);
  check("QC-39: the engine panel carries the row's old cluster (Uninstall + Reinstall/Update or Install)",
    q39.engBtns.some((t) => t.includes("Uninstall")) && q39.engBtns.some((t) => t.includes("Reinstall") || t.includes("Update available"))
    || q39.engBtns.some((t) => t.includes("Install engine")), JSON.stringify(q39.engBtns));
  check("QC-39: the permanent form has no Cancel (nothing to collapse back to)", q39.found && !q39.cancel);
  // Neutral surfaces: the theme's accent-soft is a colored tint — assert the
  // wash is a NEUTRAL surface tone instead. Computed colors arrive as rgb() or
  // (when the token resolves to oklch) verbatim oklch(L C H) — neutral means
  // r≈g≈b, or chroma ≈ 0.
  const neutral = (c) => {
    const rgb = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (rgb) {
      const [r, g, b] = [+rgb[1], +rgb[2], +rgb[3]];
      return Math.abs(r - g) <= 10 && Math.abs(g - b) <= 10 && Math.abs(r - b) <= 12;
    }
    const ok = c.match(/oklch\(\s*[\d.]+\s+([\d.]+)/);
    if (ok) return parseFloat(ok[1]) <= 0.02;
    return false;
  };
  check("QC-39: the form wash is neutral (accent-soft pink GONE)",
    q39.formBg === "rgba(0, 0, 0, 0)" || neutral(q39.formBg), q39.formBg);
  check("QC-39: the catalog section band is neutral surface-2 (accent stays at the 3px edge)",
    neutral(q39.msecBg), q39.msecBg);

  // Other providers still listed with their grouping + inline Edit.
  const q39b = await page.evaluate(() => ({
    eyebrows: [...document.querySelectorAll(".lu-eyebrow")].map((e) => e.textContent.trim()),
    rows: document.querySelectorAll(".lu-prow").length,
    rowEdit: [...document.querySelectorAll(".lu-prow .lu-prow-actions button")].some((b) => b.textContent.trim() === "Edit"),
  }));
  check("QC-39: the provider list below keeps the Local·free / Cloud·metered grouping + row Edit",
    q39b.eyebrows.includes("Local · free") && q39b.eyebrows.includes("Cloud · metered") && q39b.rows > 0 && q39b.rowEdit,
    JSON.stringify(q39b));

  // ── QC-42: the built-in-only label on the band ─────────────────────────────
  const q42 = await page.evaluate(() => {
    const band = document.querySelector(".lu-builtin-qs .lu-qs");
    const label = band?.querySelector(".lu-qs-barefor");
    const sub = band?.querySelector(".lu-qs-baresub");
    return {
      label: label?.textContent.trim() || "",
      labelPx: label ? parseFloat(getComputedStyle(label).fontSize) : 0,
      subPx: sub ? parseFloat(getComputedStyle(sub).fontSize) : 0,
      afterButton: !!label && !!band?.querySelector("button") &&
        band.querySelector("button").compareDocumentPosition(label) & Node.DOCUMENT_POSITION_FOLLOWING,
    };
  });
  check("QC-42: 'For the Local built-in provider' sits right of the Run Quick Setup button",
    q42.label === "For the Local built-in provider" && !!q42.afterButton, q42.label);
  check("QC-42: the label reads BIGGER than the description", q42.labelPx > q42.subPx,
    `${q42.labelPx}px vs ${q42.subPx}px`);

  // ── QC-41: the always-open scoped context menu + native passthrough ────────
  // Open the active book's first chapter (the b5-probe route grammar: the
  // chapter route lands on the scene editor or the overview — enter a scene).
  const activeId = (await api("/v1/settings"))?.activeProjectId;
  const book = activeId ? await api(`/v1/projects/${activeId}/book`) : null;
  const ch0 = (book?.parts || []).flatMap((p) => p.chapters || [])[0];
  check("QC-41 precondition: the active book has a chapter to open", !!ch0, activeId || "no active project");
  await page.evaluate((chId) => { window.location.hash = `#/chapters/${chId}`; }, ch0.id);
  await sleep(1500);
  const either = page.locator(".overview-scene-card, .manuscript-inner").first();
  await either.waitFor({ timeout: 10000 });
  const card = page.locator(".overview-scene-card").first();
  if (await card.count()) { await card.click(); await sleep(800); }
  const para = page.locator(".manuscript-inner p").first();
  await para.waitFor({ timeout: 8000 });

  // (a) no selection → menu opens, scope-law states, W11 grammar
  await para.click();
  await sleep(250);
  await para.click({ button: "right" });
  await sleep(400);
  const q41a = await page.evaluate(() => {
    const menu = document.querySelector(".ctx-menu");
    if (!menu) return { open: false };
    const item = (t) => [...menu.querySelectorAll(".ctx-item")].find((b) => b.textContent.includes(t));
    return {
      open: true,
      rewriteDisabled: !!item("Rewrite")?.disabled,
      tightenEnabled: !!item("Tighten") && !item("Tighten").disabled,
      cutDisabled: !!item("Cut")?.disabled,
      copyDisabled: !!item("Copy")?.disabled,
      pasteEnabled: !!item("Paste") && !item("Paste").disabled,
      commentDisabled: !!item("Add comment")?.disabled,
      hint: !!menu.querySelector(".ctx-section-hint"),
      icons: menu.querySelectorAll(".ctx-item .ctx-ic").length,
      kbds: [...menu.querySelectorAll(".ctx-kbd")].map((k) => k.textContent.trim()),
      passthrough: !!item("Show browser menu"),
    };
  });
  check("QC-41: right-click with NO selection OPENS the menu (the old gate is gone)", q41a.open);
  check("QC-41 scope law: selection-only rows disabled (Rewrite/Cut/Copy/comment) + hint shown",
    q41a.rewriteDisabled && q41a.cutDisabled && q41a.copyDisabled && q41a.commentDisabled && q41a.hint,
    JSON.stringify(q41a));
  check("QC-41 scope law: whole-scene rows stay enabled (Tighten, Paste)",
    q41a.tightenEnabled && q41a.pasteEnabled);
  check("QC-41 W11 grammar: row icons + shortcut hints render",
    q41a.icons >= 8 && q41a.kbds.some((k) => /X$/.test(k)) && q41a.kbds.some((k) => /V$/.test(k)),
    JSON.stringify({ icons: q41a.icons, kbds: q41a.kbds }));
  check("QC-41: the bottom 'Show browser menu' passthrough row exists", q41a.passthrough);

  // (b) passthrough: click the row → the NEXT right-click must NOT open our menu.
  await page.locator('.ctx-item:has-text("Show browser menu")').click();
  await sleep(300);
  await para.click({ button: "right" });
  await sleep(400);
  const afterPassthrough = await page.locator(".ctx-menu").count();
  check("QC-41: after 'Show browser menu', the next right-click passes through (no app menu — native)",
    afterPassthrough === 0);
  // …and the one AFTER that opens ours again (one-shot only).
  await para.click({ button: "right" });
  await sleep(400);
  check("QC-41: the passthrough is ONE-SHOT — the following right-click opens the app menu again",
    (await page.locator(".ctx-menu").count()) === 1);
  await page.keyboard.press("Escape");
  await sleep(200);

  // (c) with a selection the selection-only rows enable.
  await para.click({ clickCount: 3 });
  await sleep(250);
  await para.click({ button: "right" });
  await sleep(400);
  const q41c = await page.evaluate(() => {
    const menu = document.querySelector(".ctx-menu");
    const item = (t) => [...(menu?.querySelectorAll(".ctx-item") || [])].find((b) => b.textContent.includes(t));
    return { rewriteEnabled: !!item("Rewrite") && !item("Rewrite").disabled, cutEnabled: !!item("Cut") && !item("Cut").disabled };
  });
  check("QC-41: with a selection, Rewrite + Cut enable", q41c.rewriteEnabled && q41c.cutEnabled);
  await page.keyboard.press("Escape");
  await sleep(200);

  // ── QC-40: the project menu entries + on-demand tutorial open ──────────────
  // Exercise the CREATE path deterministically: remove the demo first if
  // present. If the demo is the ACTIVE project, repoint the pointer to a temp
  // project first — the in-app delete flow always switches away, and deleting
  // the active book out-of-band would leave the client on a dangling id (a
  // state no user flow produces).
  if (demoWasPresent) {
    if (origSettings?.activeProjectId === DEMO_ID) {
      await api("/v1/projects/qcbatch-tmp", { method: "PUT", body: { project: { title: "QC Batch Tmp" } } });
      await api("/v1/settings", { method: "PATCH", body: { activeProjectId: "qcbatch-tmp" } });
    }
    await api(`/v1/projects/${DEMO_ID}`, { method: "DELETE" });
  }
  await page.reload({ waitUntil: "networkidle" });
  await sleep(1500);
  await page.locator(".project-switcher").click();
  await sleep(400);
  const q40menu = await page.evaluate(() => ({
    newButtons: [...document.querySelectorAll(".project-menu-new")].map((b) => b.textContent.trim()),
  }));
  check("QC-40: the menu offers exactly 'New project…' + 'Try tutorial project'",
    q40menu.newButtons.length === 2
    && q40menu.newButtons.some((t) => t.includes("New project"))
    && q40menu.newButtons.some((t) => t === "Try tutorial project"),
    JSON.stringify(q40menu.newButtons));

  await page.locator('.project-menu-new:has-text("Try tutorial project")').click();
  await sleep(2500);
  const q40open = await page.evaluate(() => ({
    title: document.querySelector(".project-switcher .ttl")?.textContent.trim() || "",
  }));
  check("QC-40: the tutorial button creates + OPENS 'The Ninth Facet' (on demand, no boot seed)",
    q40open.title === "The Ninth Facet", q40open.title);
  const serverHasDemo = ((await api("/v1/projects")) || []).some((p) => p.id === DEMO_ID);
  check("QC-40: the demo book exists server-side under its fixed id", serverHasDemo);
} finally {
  // ── Restore: original active project; demo back to as-found presence. ──────
  try {
    if (origSettings?.activeProjectId) {
      await api("/v1/settings", { method: "PATCH", body: { activeProjectId: origSettings.activeProjectId } });
    }
    await api("/v1/projects/qcbatch-tmp", { method: "DELETE" });
    if (!demoWasPresent) await api(`/v1/projects/${DEMO_ID}`, { method: "DELETE" });
    // (If it WAS present, the button re-created it pristine — same fixed id.)
  } catch { /* best effort */ }
  await browser.close();
}

console.log(`\npage errors: ${pageErrors.length}`);
for (const e of pageErrors) console.log("  ", e.slice(0, 200));
console.log(`\n${pass + fail} checks: ${pass} passed, ${fail} failed`);
console.log(fail === 0 && pageErrors.length === 0 ? "QC-BATCH PROBE PASSED" : "QC-BATCH PROBE FAILED");
process.exit(fail === 0 && pageErrors.length === 0 ? 0 : 1);
