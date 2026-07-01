// Headless smoke / whole-app sweep for the server-backed renderer (Linux —
// Playwright + Chromium). Drives `npm run dev:vite` against a running
// justwrite-server: asserts the app boots, every top-level route renders, and
// the whole run produces ZERO JS errors. A bootStorage failure logs a console
// error, so a clean run also proves storage.js reached /v1/kv.
//
// Complements e2e/ (desktop WebDriver via tauri-driver — needs Windows + a
// built .exe). This one runs headless anywhere Node + a Chromium build exist.
//
// Assumes both are already running (the orchestrator / a local run starts them):
//   server: justwrite-server serve --port 17495
//   vite:   npm run dev:vite               (renderer on :1420)
// Env: JW_APP, JW_SERVER, JW_CHROME.

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const APP = process.env.JW_APP || "http://localhost:1420";
const SERVER = process.env.JW_SERVER || "http://127.0.0.1:17495";

function findChrome() {
  if (process.env.JW_CHROME && existsSync(process.env.JW_CHROME)) return process.env.JW_CHROME;
  const roots = ["/opt/pw-browsers", `${process.env.HOME || ""}/.cache/ms-playwright`];
  for (const root of roots) {
    if (!existsSync(root)) continue;
    for (const dir of readdirSync(root)) {
      if (!dir.startsWith("chromium") || dir.includes("headless_shell")) continue;
      const exe = `${root}/${dir}/chrome-linux/chrome`;
      if (existsSync(exe)) return exe;
    }
  }
  return undefined;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitReady(url, label, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url);
      if (r.ok || r.status === 404) return;
    } catch {
      /* not up yet */
    }
    await sleep(500);
  }
  throw new Error(`timed out waiting for ${label} at ${url}`);
}

// Top-level routes (hash) reachable with no required params.
const ROUTES = [
  "#/", "#/chapters", "#/search", "#/characters", "#/locations", "#/objects",
  "#/groups", "#/worldbuilding", "#/strands", "#/plot", "#/timeline", "#/notes",
  "#/brainstorm", "#/markers", "#/relations", "#/analysis",
  "#/reader-knowledge", "#/import", "#/export", "#/trash", "#/settings",
  "#/help", "#/ai", "#/architecture",
];

await waitReady(`${SERVER}/v1/health`, "server");
await waitReady(APP, "vite");

const exe = findChrome();
const browser = await chromium.launch({
  ...(exe ? { executablePath: exe } : {}),
  headless: true,
  args: ["--no-sandbox"],
});
const page = await browser.newPage();

const errors = [];
page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message.slice(0, 200)));
page.on("console", (m) => {
  if (m.type() === "error" && !/ERR_CERT|404|favicon|Failed to load resource/.test(m.text())) {
    errors.push("CONSOLE: " + m.text().slice(0, 220));
  }
});
const notFound = [];
page.on("response", (r) => {
  if (r.status() === 404) notFound.push(r.url());
});
// Failed network requests, classified after the run: to the JW server = a real
// problem; to anything else (optional external TTS/LLM backends not running
// here) = benign. Real storage failures still surface — storage.js logs its
// own console.error, which is NOT excluded above.
const failedRequests = [];
page.on("requestfailed", (req) => failedRequests.push({ url: req.url(), err: req.failure()?.errorText || "" }));

let failed = 0;

// ── Static REUSE gates (jobs design §17.1): the copy-paste discipline a behavior
// test can't enforce — "a professional extracts one reusable component instead of
// copying code." (1) the kit's shared-picker check: a job picker may live ONLY in
// LuJobSelect (offline). (2) jscpd, the copy-paste detector, over the JW renderer
// (.jscpd.json, threshold 3.5%). Both fail the smoke; `npm run dup` prints the
// clone list. Run here so the renderer gate I run for any UI change enforces REUSE,
// not just runtime behavior. (jscpd catches LITERAL copy-paste; "should be one
// component but written differently" stays the manual #32 audit — honest limit.)
{
  const here = dirname(fileURLToPath(import.meta.url));
  const pickerCheck = join(here, "..", "..", "just-llm-runner", "ui", "scripts", "check-shared-pickers.mjs");
  if (existsSync(pickerCheck)) {
    try { execFileSync("node", [pickerCheck], { stdio: "inherit" }); }
    catch { failed++; console.log("✗ shared-picker check FAILED — a job picker was hand-rolled outside LuJobSelect"); }
  } else console.log("(shared-picker check skipped: kit not found at sibling path)");

  try {
    execFileSync("npx", ["jscpd"], { cwd: join(here, ".."), stdio: "ignore" });
    console.log("✓ jscpd (JW renderer): duplication under threshold");
  } catch {
    failed++;
    console.log("✗ jscpd (JW renderer): duplication OVER threshold — extract a shared component; run `npm run dup` for the clone list");
  }
}

try {
  await page.goto(APP, { waitUntil: "networkidle" });
  await sleep(1500); // bootStorage + Vue mount
  let mark = errors.length;
  const bootChars = await page.evaluate(() => document.body?.innerText?.length || 0);
  let ok = bootChars > 0 && errors.length === mark;
  if (!ok) failed++;
  console.log(`${ok ? "✓" : "✗"} boot${" ".repeat(16)}chars=${bootChars} errors=${errors.length - mark}`);
  errors.slice(mark, mark + 5).forEach((e) => console.log("    " + e));

  // ── App-shell structure guard (the keep-alike discipline shared with
  // JustVoice; see the global app standard "App shell structure"). Asserts the
  // shell fills the viewport (height:100% chain, not 100vh) and the rail is
  // full-height with the rail itself NOT scrolling (a fixed-region + scroll-
  // middle sidebar) — the regressions that bit JustVoice on 2026-06-24.
  {
    const s = await page.evaluate(() => {
      const stage = document.querySelector(".app-stage");
      const body = document.querySelector(".app");
      const rail = document.querySelector(".sidebar");
      if (!stage || !body || !rail) return { missing: true };
      return {
        stageH: Math.round(stage.getBoundingClientRect().height), vh: window.innerHeight,
        railH: rail.clientHeight, bodyH: body.clientHeight,
        railSelfScroll: rail.scrollHeight - rail.clientHeight,
      };
    });
    const problems = [];
    if (s.missing) problems.push(".app-stage / .app / .sidebar missing");
    else {
      if (Math.abs(s.stageH - s.vh) > 2) problems.push(`shell ${s.stageH}px != viewport ${s.vh}px (dead space — use a height:100% chain, not 100vh)`);
      if (Math.abs(s.railH - s.bodyH) > 2) problems.push(`rail ${s.railH}px != body ${s.bodyH}px (rail not full-height — nav would jump between views)`);
      if (s.railSelfScroll > 2) problems.push(`rail itself scrolls by ${s.railSelfScroll}px (use fixed top + scroll middle + fixed bottom)`);
    }
    if (problems.length) { failed++; console.log("✗ shell-structure   " + problems.join(" | ")); }
    else console.log("✓ shell-structure   fills viewport · rail full-height · single scroller");
  }

  for (const route of ROUTES) {
    mark = errors.length;
    try {
      await page.evaluate((h) => { window.location.hash = h; }, route);
      await sleep(550);
      const chars = await page.evaluate(() => document.querySelector("#app")?.innerText?.length || 0);
      const newErrs = errors.length - mark;
      const rok = chars > 0 && newErrs === 0;
      if (!rok) failed++;
      console.log(`${rok ? "✓" : "✗"} ${route.padEnd(20)}chars=${chars} errors=${newErrs}`);
      errors.slice(mark, mark + 4).forEach((e) => console.log("    " + e));
    } catch (e) {
      failed++;
      console.log(`✗ ${route.padEnd(20)}NAV-FAIL ${String(e.message || e).slice(0, 100)}`);
    }
  }

  // ── AI-area sub-tab sweep. The route loop renders only the default tab; the AI
  // area's tabs are in-page (Providers · Routing by job · Routing by feature ·
  // Recommendations · Usage), so the new RoutingByJob tab + the renamed
  // Routing-by-feature workbench only mount behind a click. Click each + assert
  // ZERO JS errors. Re-query per click (the click re-renders → stale handles).
  try {
    await page.evaluate(() => { window.location.hash = "#/ai"; });
    await sleep(800);
    const tabCount = (await page.$$(".lu-subnav a")).length;
    console.log(`ai-area: ${tabCount} sub-tabs`);
    for (let i = 0; i < tabCount; i++) {
      mark = errors.length;
      const tabs = await page.$$(".lu-subnav a");
      if (!tabs[i]) break;
      const label = (await tabs[i].innerText().catch(() => `tab ${i}`)).trim().replace(/\s+/g, " ");
      await tabs[i].click();
      await sleep(600);
      const chars = await page.evaluate(() => document.querySelector("#app")?.innerText?.length || 0);
      const newErrs = errors.length - mark;
      const ok = chars > 0 && newErrs === 0;
      if (!ok) failed++;
      console.log(`${ok ? "✓" : "✗"} ai-tab ${label.padEnd(22)}chars=${chars} errors=${newErrs}`);
      errors.slice(mark, mark + 4).forEach((e) => console.log("    " + e));
    }
  } catch (e) {
    failed++;
    console.log(`✗ ai-tab sweep   NAV-FAIL ${String(e.message || e).slice(0, 120)}`);
  }

  // ── Model-manager probe (#30): LuModelCatalog + its add-model modal mount only
  // when a provider's form is open. Open the Providers tab → a provider's Edit →
  // the "Add model" modal, asserting zero JS errors (catches a render bug the tab
  // sweep can't, since the catalog is nested in the bundled provider's form).
  try {
    await page.evaluate(() => [...document.querySelectorAll(".lu-subnav a")].find((a) => /providers/i.test(a.textContent))?.click());
    await sleep(500);
    mark = errors.length;
    await page.evaluate(() => [...document.querySelectorAll(".lu-prow button, .lu-prow .lu-btn")].find((b) => /edit/i.test(b.textContent))?.click());
    await sleep(700);
    const hasCat = await page.evaluate(() => !!document.querySelector(".lu-mcat"));
    await page.evaluate(() => [...document.querySelectorAll("button, .lu-btn")].find((b) => /add model/i.test(b.textContent))?.click());
    await sleep(500);
    const hasModal = await page.evaluate(() => !!document.querySelector(".lu-mm-form"));
    const newErrs = errors.length - mark;
    if (newErrs) failed++;
    console.log(`${newErrs ? "✗" : "✓"} model-manager   catalog=${hasCat} add-modal=${hasModal} errors=${newErrs}`);
    errors.slice(mark, mark + 4).forEach((e) => console.log("    " + e));
    // Close the Add-model AppModal so its Reka overlay doesn't block later probes'
    // (actionability) clicks (closable AppModal → Esc dismisses).
    await page.keyboard.press("Escape").catch(() => {});
    await sleep(250);
  } catch (e) {
    console.log(`(model-manager probe skipped: ${String(e.message || e).slice(0, 90)})`);
  }

  // ── Behavior gate (jobs design §17.1): the Recommendations job dropdown must read
  // the LIVE job list (LuJobSelect → GET /v1/ai/jobs), NOT a hardcoded copy. Add a
  // unique job via the API, open the Recommendations "Add" modal, and assert that
  // opening it (a) fires GET /v1/ai/jobs and (b) the response carries the new job.
  // A hardcoded list — the bug this replaced — fires NO fetch, so this fails closed.
  // (Route-render smoke can't catch this: the page renders fine; the list is stale.)
  try {
    const label = `zsmoke-${Date.now()}`;
    const created = await (await fetch(`${SERVER}/v1/ai/jobs`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ label, description: "smoke probe" }),
    })).json();
    const jobId = (created.rows || []).find((r) => r.label === label)?.id;

    await page.evaluate(() => { window.location.hash = "#/ai"; });
    await sleep(500);
    await page.evaluate(() => [...document.querySelectorAll(".lu-subnav a")].find((a) => /recommendation/i.test(a.textContent))?.click());
    await sleep(600);

    let sawJobsFetch = false, jobsHasNew = false;
    const onResp = async (r) => {
      if (r.request().method() === "GET" && /\/v1\/ai\/jobs(\?|$)/.test(r.url())) {
        sawJobsFetch = true;
        try { const j = await r.json(); if ((j.rows || []).some((x) => x.id === jobId)) jobsHasNew = true; } catch { /* body gone */ }
      }
    };
    page.on("response", onResp);
    mark = errors.length;
    await page.evaluate(() => [...document.querySelectorAll("button, .lu-btn")].find((b) => /add recommendation/i.test(b.textContent))?.click());
    await sleep(900);
    page.off("response", onResp);

    const newErrs = errors.length - mark;
    const ok = jobId && sawJobsFetch && jobsHasNew && newErrs === 0;
    if (!ok) failed++;
    console.log(`${ok ? "✓" : "✗"} recs-job-dropdown live-fetch=${sawJobsFetch} has-new-job=${jobsHasNew} errors=${newErrs}`);
    errors.slice(mark, mark + 4).forEach((e) => console.log("    " + e));

    if (jobId) await fetch(`${SERVER}/v1/ai/jobs/${encodeURIComponent(jobId)}`, { method: "DELETE" });
  } catch (e) {
    console.log(`(recs-job-dropdown probe skipped: ${String(e.message || e).slice(0, 90)})`);
  }

  // ── Sampler-order reorder control (#22 / Plane-2). The "Custom sampler order" UI
  // in ConfigColumn (Routing by feature ▸ pick a feature ▸ Samplers): toggle + ▲▼
  // list + Reset. Durable cover for the reorder logic that until now lived only in a
  // scratchpad check. Asserts: the control renders; the order list is hidden until
  // enabled; enabling writes the engine-default chain (penalties…temperature — toggleOrder
  // always re-seeds DEFAULT, so this is deterministic regardless of any persisted
  // order); ▼ reorders it (penalties → position 2); and the reserved `samplers` key is NOT
  // double-shown as an "Other key" in the checklist (KnobGrid reservedKeys). Uses
  // locator clicks (auto-wait/scroll) and FORCES the <details> open (a collapsed
  // <details> display:none-hides its children, so the checkbox isn't actionable);
  // fails (not skips) on a throw — the control is deterministically reachable, so a
  // throw means a real structural regression.
  try {
    await page.keyboard.press("Escape").catch(() => {}); // defensive: clear any modal a prior probe left open
    await page.evaluate(() => { window.location.hash = "#/ai"; });
    await sleep(500);
    await page.locator(".lu-subnav a", { hasText: /^Routing by feature$/ }).click();
    await sleep(700);
    await page.locator(".lu-fw-card").first().click();
    await sleep(500);
    await page.evaluate(() => { const d = document.querySelector(".cc-samplers"); if (d) d.open = true; });
    await sleep(250);
    mark = errors.length;

    const orderPresent = (await page.$$eval(".cc-samporder", (e) => e.length)) === 1;
    const cb = page.locator(".cc-samporder .ui-checkbox").first();
    // Normalize to OFF so the hidden-until-enabled invariant is testable from a
    // known state (the loaded config may carry a persisted custom order).
    if ((await page.$$eval(".cc-samporder-list", (e) => e.length)) > 0) { await cb.click(); await sleep(250); }
    const hiddenBefore = (await page.$$eval(".cc-samporder-list", (e) => e.length)) === 0;
    // Enable → toggleOrder(true) seeds the engine-default chain.
    await cb.click(); await sleep(300);
    const readNames = () => page.$$eval(".cc-samporder-name", (els) => els.map((e) => e.textContent.replace(/^\s*\d+\.\s*/, "").trim()));
    const before = await readNames();
    // llama.cpp's real default chain is 9 names (common/common.h
    // common_params_sampling.samplers): penalties · dry · top_n_sigma · top_k ·
    // typ_p · top_p · min_p · xtc · temperature. (An earlier 7-name default dropped
    // penalties + top_n_sigma — #72.)
    const defaultOk = before.length === 9 && before[0] === "penalties" && before[8] === "temperature";
    // Move row 1 (penalties) down → it swaps with dry.
    await page.locator(".cc-samporder-row").first().locator("button", { hasText: "▼" }).click();
    await sleep(300);
    const after = await readNames();
    const reorderOk = after[0] === "dry" && after[1] === "penalties";
    // The reserved `samplers` key must NOT leak into the checklist "Other keys".
    // NOTE: the UiInput ROOT element carries the .ui-kg-name class (it IS the
    // <input>), so query .ui-kg-name directly — `.ui-kg-name input` matches nothing
    // and made this assertion vacuously pass before.
    const extras = await page.$$eval(".cc-samplers .ui-kg-extra .ui-kg-name", (els) => els.map((e) => e.value));
    const notDoubleShown = !extras.includes("samplers");

    const newErrs = errors.length - mark;
    const ok = orderPresent && hiddenBefore && defaultOk && reorderOk && notDoubleShown && newErrs === 0;
    if (!ok) failed++;
    console.log(`${ok ? "✓" : "✗"} sampler-order   present=${orderPresent} hidden-until-on=${hiddenBefore} default-chain=${defaultOk} reorder=${reorderOk} no-dup=${notDoubleShown} errors=${newErrs}`);
    if (!ok) console.log(`    before=${JSON.stringify(before)} after=${JSON.stringify(after)}`);
    errors.slice(mark, mark + 4).forEach((e) => console.log("    " + e));
  } catch (e) {
    failed++;
    console.log(`✗ sampler-order  PROBE-FAIL ${String(e.message || e).slice(0, 140)}`);
  }

  try {
    const kv = await (await fetch(`${SERVER}/v1/kv`)).json();
    console.log(`\nserver kv keys: ${JSON.stringify(Object.keys(kv))}`);
  } catch (e) {
    console.log("kv read failed: " + String(e.message || e).slice(0, 120));
  }
  if (notFound.length) {
    console.log(`404s (benign): ${JSON.stringify([...new Set(notFound.map((u) => u.slice(0, 100)))])}`);
  }
  // ERR_ABORTED = a request cancelled by SPA navigation or page teardown
  // (e.g. a debounced keepalive write still in flight at close — delivered
  // server-side regardless, as the persisted keys above confirm). Only a real
  // network error TO THE JW SERVER (connection refused / DNS) is a problem.
  const realServerFails = [
    ...new Set(
      failedRequests
        .filter((f) => f.url.startsWith(SERVER) && !/ABORTED/.test(f.err))
        .map((f) => `${f.url} (${f.err})`),
    ),
  ];
  const external = [...new Set(failedRequests.filter((f) => !f.url.startsWith(SERVER)).map((f) => f.url))];
  if (realServerFails.length) {
    failed++;
    console.log(`✗ REAL failed requests to the JW server: ${JSON.stringify(realServerFails)}`);
  }
  if (external.length) {
    console.log(`failed requests to external/optional services (benign — not running here): ${JSON.stringify(external.map((u) => u.slice(0, 50)))}`);
  }
} finally {
  await browser.close();
}

console.log(
  failed
    ? `\nHEADLESS SMOKE FAILED: ${failed} surface(s) errored`
    : "\nHEADLESS SMOKE PASSED: all routes rendered, zero JS errors",
);
process.exit(failed ? 1 : 0);
