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
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
// findChrome/waitReady/sleep are SHARED (extracted 2026-07-19) — this script,
// book-smoke, and the bench harness all launch Chromium the same way, and
// CLAUDE.md forbids a hand-rolled/hardcoded browser path. One copy: scripts/lib.
import { findChrome, sleep, waitReady } from "../lib/smoke-common.js";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const APP = process.env.JW_APP || "http://localhost:1420";
const SERVER = process.env.JW_SERVER || "http://127.0.0.1:17495";

// Top-level routes (hash) reachable with no required params.
const ROUTES = [
  "#/", "#/chapters", "#/search", "#/characters", "#/locations", "#/objects",
  "#/groups", "#/worldbuilding", "#/strands", "#/plot", "#/timeline", "#/notes",
  "#/brainstorm", "#/markers", "#/relations", "#/analysis",
  "#/reader-knowledge", "#/import", "#/export", "#/trash", "#/settings",
  "#/help", "#/ai", "#/architecture", "#/welcome",
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

// ── Seed a REAL project before the sweep (the user's ruling, 2026-07-26: "just
// call the api to load the tutorial project same as me clicking it").
//
// WHY this is load-bearing, not a convenience: with no project open the app
// renders OnboardingShell for EVERY hash route, so every ✓ in the sweep below
// was asserting the WELCOME SCREEN, not the view named on the line — measured
// 2026-07-26, an identical chars=1024 route after route, while the run reported
// "all routes rendered". A gate that green-lights the wrong page is worse than
// no gate, because it is trusted.
//
// This is exactly what clicking "Try the tutorial project" does, minus the UI:
// projectApi.createDemoProject() (projectApi.js:106) → POST /v1/projects/demo
// (projects.py:44 — a FIXED id, idempotent: the server returns the existing book
// instead of duplicating it), then project.switchProject() (project.js:2260) →
// writeSetting("activeProjectId", id) (settings.js:42) → PATCH /v1/settings. The
// registry needs no write: it is DERIVED from the projects table (CLAUDE.md,
// "State"). JW_SEED=0 sweeps the no-project onboarding state instead.
async function seedTutorialProject() {
  const call = async (path, init) => {
    const r = await fetch(`${SERVER}${path}`, {
      headers: { "content-type": "application/json" },
      ...init,
    });
    if (!r.ok) throw new Error(`${init?.method || "GET"} ${path} → HTTP ${r.status}`);
    return r.status === 204 ? null : r.json();
  };
  const meta = await call("/v1/projects/demo", { method: "POST", body: "{}" });
  if (!meta?.id) throw new Error("demo response carried no id");
  await call("/v1/settings", { method: "PATCH", body: JSON.stringify({ activeProjectId: meta.id }) });
  return meta;
}

let seeded = false;
if (process.env.JW_SEED === "0") {
  console.log("· seed              skipped (JW_SEED=0) — sweeping the no-project onboarding state");
} else {
  try {
    const meta = await seedTutorialProject();
    seeded = true;
    console.log(`✓ seed              open: ${meta.title || meta.id}`);
  } catch (e) {
    // FAIL, never warn: a silent seed failure sends the whole sweep back to
    // asserting the welcome screen, which is the exact blind spot this closes.
    failed++;
    console.log(`✗ seed              FAILED (${String(e.message || e).slice(0, 140)}) — the sweep below would assert the welcome screen`);
  }
}

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
  const pickerCheck = join(here, "..", "..", "just-llm-runner", "ui", "scripts", "check-shared-pickers.js");
  if (existsSync(pickerCheck)) {
    try { execFileSync("node", [pickerCheck], { stdio: "inherit" }); }
    catch { failed++; console.log("✗ shared-picker check FAILED — a job picker was hand-rolled outside LuJobSelect"); }
  } else console.log("(shared-picker check skipped: kit not found at sibling path)");

  try {
    // Run jscpd's own JS entry with THIS node, rather than through `npx`.
    // Measured on Windows 2026-07-19: `npx` throws ENOENT (it is npx.cmd) and
    // `npx.cmd` throws EINVAL (node refuses to spawn .cmd without a shell) — and
    // this catch reported BOTH as "duplication OVER threshold", so the gate
    // failed identically whether the code was clean or not. A gate that fails
    // for a reason it doesn't name is worse than no gate. Resolving the bin
    // keeps it shell-free (no DEP0190) and works on every platform.
    execFileSync(process.execPath, [require.resolve("jscpd/run-jscpd.js")], {
      cwd: join(here, ".."), stdio: "ignore",
    });
    console.log("✓ jscpd (JW renderer): duplication under threshold");
  } catch (e) {
    failed++;
    console.log(
      e?.code === "ENOENT"
        ? "✗ jscpd could not be SPAWNED (npx not resolvable) — duplication was NOT checked"
        : "✗ jscpd (JW renderer): duplication OVER threshold — extract a shared component; run `npm run dup` for the clone list",
    );
  }
}

// Wait for a REAL boot signal instead of a blind sleep (2026-07-26 — the "splash-aware
// wait"). The old `sleep(1500)` raced the boot: bootStorage + hydrate + mount can exceed
// it, and since 2026-07-24 the boot SPLASH (`.jw-bootwarm`) overlays the shell while a
// warm model load runs — so the shell-structure guard below could look for `.app` before
// it existed and report a FALSE failure. Resolves as soon as the app reaches EITHER
// settled state: the shell (`.app`, a project is open) or the onboarding view
// (`.onboarding`, no project — what the smoke's isolated empty data dir produces). If the
// splash is up it takes the splash's OWN always-present escape ("Continue without
// waiting" — it never traps), then keeps waiting. Returns which state it reached so the
// log tells the truth rather than hiding a stall behind a timeout.
async function waitForBoot(timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  let last = { shell: false, onboarding: false, splash: false };
  while (Date.now() < deadline) {
    last = await page.evaluate(() => ({
      shell: !!document.querySelector(".app"),
      onboarding: !!document.querySelector(".ob-stage"),   // OnboardingShell's root
      splash: !!document.querySelector(".jw-bootwarm"),
    }));
    if ((last.shell || last.onboarding) && !last.splash) return last;
    if (last.splash) await page.evaluate(() => document.querySelector(".jw-bw-skip")?.click());
    await sleep(200);
  }
  return { ...last, timedOut: true };
}

try {
  await page.goto(APP, { waitUntil: "networkidle" });
  const boot = await waitForBoot();
  let mark = errors.length;
  const bootChars = await page.evaluate(() => document.body?.innerText?.length || 0);
  // When the seed succeeded, landing on ONBOARDING is a failure, not a state:
  // it means the project the seed opened did not survive to the renderer, and
  // every route assertion below would be measuring the welcome screen again.
  let ok = bootChars > 0 && errors.length === mark && !boot.timedOut && (!seeded || boot.shell);
  if (!ok) failed++;
  const bootState = boot.timedOut
    ? `TIMED OUT (shell=${boot.shell} onboarding=${boot.onboarding} splash=${boot.splash})`
    : boot.shell ? "shell" : seeded ? "ONBOARDING despite a seeded project — routes below are the welcome screen" : "onboarding (no project)";
  console.log(`${ok ? "✓" : "✗"} boot${" ".repeat(16)}${bootState} chars=${bootChars} errors=${errors.length - mark}`);
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
    // No project open ⇒ OnboardingShell renders instead of the shell, so `.app`/`.sidebar`
    // are legitimately absent — that is a STATE, not a regression (2026-07-26: this is the
    // false failure the smoke reported every run in its isolated empty data dir). The
    // structure guard only applies to the shell it exists to guard.
    if (!boot.shell) console.log("· shell-structure   skipped (onboarding — no project open)");
    else if (s.missing) problems.push(".app-stage / .app / .sidebar missing");
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
  // area's tabs are in-page (Providers & models · Tasks · Routing by feature · Usage ·
  // [app]), so the non-default tabs only mount behind a click. Click each + assert
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

  // ── Provider-form + catalog probe: the built-in provider form (Providers tab → Edit the
  // built-in provider) hosts the Local-engine panel + the model catalog, which moved here
  // (Phase B — the standalone Models tab was dissolved; the recommendation grid was deleted
  // in Phase A). Assert the engine panel + the fit-grouped catalog render, the search + sort
  // toolbar + Add-model modal work, the old Models-tab pointer is gone, 0 errors.
  try {
    await page.evaluate(() => [...document.querySelectorAll(".lu-subnav a")].find((a) => /providers/i.test(a.textContent))?.click());
    await sleep(500);
    mark = errors.length;
    await page.evaluate(() => [...document.querySelectorAll(".lu-prow button, .lu-prow .lu-btn")].find((b) => /edit/i.test(b.textContent))?.click());
    await sleep(700);
    const pf = await page.evaluate(() => ({
      engine: !!document.querySelector(".lu-eng"),
      catalog: !!document.querySelector(".lu-mcat"),
      // Search box + the sortable column headers. The header selector was `.lu-th-btn`
      // (the hand-rolled click-to-sort buttons of 2026-07-22) and went STALE on
      // 2026-07-24, when the grid moved to the shared UiTable — which owns the header
      // markup and renders `<th class="is-sortable">`. `.lu-th-btn` exists nowhere in the
      // kit any more (grep: zero hits), so this half was permanently false and the whole
      // provider-form line had been red for a reason that was not a defect. Measured
      // 2026-07-26: `.lu-mcat-bar input` present, `.lu-th-btn` count 0, `th.is-sortable`
      // present. A gate that cries wolf gets ignored, which is the actual damage.
      search: !!document.querySelector(".lu-mcat-bar input") && !!document.querySelector(".lu-mgrid th.is-sortable"),
      noPointer: !document.querySelector(".lu-pf-modelsptr"),
    }));
    await page.evaluate(() => [...document.querySelectorAll(".lu-mcat button, .lu-mcat .lu-btn")].find((b) => /add model/i.test(b.textContent))?.click());
    await sleep(500);
    const hasModal = await page.evaluate(() => !!document.querySelector(".lu-mm-form"));
    const newErrs = errors.length - mark;
    const bad = newErrs || !pf.engine || !pf.catalog || !pf.search || !pf.noPointer || !hasModal;
    if (bad) failed++;
    console.log(`${bad ? "✗" : "✓"} provider-form   engine=${pf.engine} catalog=${pf.catalog} search=${pf.search} no-pointer=${pf.noPointer} add-modal=${hasModal} errors=${newErrs}`);
    errors.slice(mark, mark + 4).forEach((e) => console.log("    " + e));
    await page.keyboard.press("Escape").catch(() => {});
    await sleep(250);
  } catch (e) {
    console.log(`(provider-form probe skipped: ${String(e.message || e).slice(0, 90)})`);
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
    // Stop sequences (#73) — a reserved `stop` key riding the samplers array,
    // surfaced as a dedicated one-per-line field and hidden from the checklist.
    const stopField = (await page.$$eval(".cc-stops-ta", (e) => e.length)) === 1;
    await page.fill(".cc-stops-ta", "END\nUSER:");
    await sleep(150);
    const stopRoundtrip = (await page.$eval(".cc-stops-ta", (e) => e.value)) === "END\nUSER:";
    const stopNotDup = !(await page.$$eval(".cc-samplers .ui-kg-extra .ui-kg-name", (els) => els.map((e) => e.value))).includes("stop");
    const stopOk = stopField && stopRoundtrip && stopNotDup;

    const newErrs = errors.length - mark;
    const ok = orderPresent && hiddenBefore && defaultOk && reorderOk && notDoubleShown && stopOk && newErrs === 0;
    if (!ok) failed++;
    console.log(`${ok ? "✓" : "✗"} sampler-order   present=${orderPresent} hidden-until-on=${hiddenBefore} default-chain=${defaultOk} reorder=${reorderOk} no-dup=${notDoubleShown} stop=${stopOk} errors=${newErrs}`);
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
