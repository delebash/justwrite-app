// Phase D probe — QuickSetup as the model front door. Opens the wizard, lets it pick the
// best-quality model that FITS this box (joins /v1/llm-runner/models fit × the catalog's
// qualityRank), asserts the confirm step renders the pick + the embed, then clicks Apply
// with the model-LOAD network calls stubbed (no 17 GB download in dev). The real assertion
// of the apply() WRITE path (every task preset rewritten to the pick, non-clobber; embedding
// set) is done by a curl of /v1/ai/engine-presets + /v1/ai/routing AFTER this probe.
// Reuses findChrome() from headless-smoke.mjs (never hardcode the Chromium path).
import { existsSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const APP = process.env.JW_APP || "http://localhost:1420";

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

const browser = await chromium.launch({ executablePath: findChrome(), args: ["--no-sandbox"] });
const page = await browser.newPage();
const BENIGN = [/fonts\.googleapis\.com/, /fonts\.gstatic\.com/, /net::ERR_CONNECTION_RESET/];
const errors = [];
const badUrls = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e}`));
page.on("requestfailed", (r) => { const u = r.url(); if (!BENIGN.some((re) => re.test(u))) badUrls.push(`failed ${u}`); });
page.on("response", (r) => { if (r.status() >= 400 && !BENIGN.some((re) => re.test(r.url()))) badUrls.push(`${r.status()} ${r.url()}`); });

// ⚠ TEST-CASE NOTE (user, 2026-07-06 "just note it in test case"): chat models REQUIRE
// a GPU in the product (CPU-only prose is unsupported; embeds stay CPU-fine) — this
// container has NO GPU, so the WIZARD flow is exercised against a stubbed 8 GB card
// below (the supported hardware class). For REAL load tests on GPU-less machines, the
// tiny CPU test model is added via just-llm-runner/scripts/dev-seed-test-model.py
// (dev/container ONLY — the real seed deliberately does not carry it; user 2026-07-06).
await page.route("**/v1/llm-runner/hardware", async (route) => {
  const real = await (await fetch(`${process.env.JW_API || "http://127.0.0.1:17495"}/v1/llm-runner/hardware`)).json();
  real.gpus = [{ vendor: "nvidia", name: "RTX probe", vramMb: 8192 }];
  real.runtimes = { ...(real.runtimes || {}), cuda: true };
  return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(real) });
});
await page.route("**/v1/llm-runner/models**", async (route) => {
  const real = await (await fetch(`${process.env.JW_API || "http://127.0.0.1:17495"}/v1/llm-runner/models`)).json();
  real.vramMb = 8192;
  for (const m of real.models || []) {
    // What an 8 GB / 32 GB box reports: the MoEs fit, the 12B is tight, big dense won't.
    if (/embedding|nomic|bge/.test(m.id)) m.fit = "ok";
    else if (/gemma-4-26b|qwen3\.6-35b|styletune|uncensored/.test(m.id)) m.fit = "ok";
    else if (/gemma-4-12b/.test(m.id)) m.fit = "tight";
    else m.fit = "no";
  }
  return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(real) });
});

// Stub the model-load leg so Apply doesn't try to fetch/spawn a real model. Everything
// else (preset PUTs, routing PUT) hits the real server so we can verify the writes.
await page.route("**/v1/llm-runner/load", (route) =>
  route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) }),
);
await page.route("**/v1/llm-runner/status", (route) =>
  route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "running", detail: "stubbed" }) }),
);
// Sweep stubs: the container has no engine, so the auto-tune job is faked — as a
// tiny STATE MACHINE (idle → running-on-POST → cancelled), because apply() itself
// GETs this endpoint as the ROUND-9 Apply-under-sweep guard: a blanket "running"
// stub would open the real "Stop it and apply?" dialog and block the probe.
let optStarted = false;
let optCancelled = false;
let optBudget = 0;
await page.route("**/v1/llm-runner/auto-tune/cancel", (route) => {
  optCancelled = true;
  return route.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify({ status: "cancelled", detail: "cancelled", trials: [] }) });
});
await page.route("**/v1/llm-runner/auto-tune", (route) => {
  if (route.request().method() === "POST") {
    optStarted = true;
    optCancelled = false;
    try { optBudget = JSON.parse(route.request().postData() || "{}").budgetSeconds || 0; } catch { optBudget = 0; }
    return route.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ status: "running", detail: "trying baseline…", trials: [], budgetSeconds: optBudget }) });
  }
  const body = !optStarted
    ? { status: "idle", trials: [] }
    : optCancelled
      ? { status: "cancelled", detail: "cancelled", trials: [] }
      : { status: "running", detail: "trying baseline…", trials: [], budgetSeconds: optBudget };
  return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
});
// Scenario switch: when tunedPick is armed, the PICK's model-tunes read returns rows —
// the tuned-machine path (Re-optimize + confirm). Otherwise tunes read EMPTY — the
// WHOLLY-UNTUNED path (ROUND 9 retired the auto-start; ROUND 14 added the done-step
// truth ladder): this container's real class (cpu|ram16) matches no seeded class tune,
// so with tunes stubbed empty the done step must offer BOTH Quick optimize (~2 min)
// and Full optimize, never a self-started sweep.
let tunedPick = false;
await page.route("**/v1/ai/model-tunes**", (route) => {
  const url = route.request().url();
  const mid = (url.match(/modelId=([^&]+)/) || [])[1] || "probe";
  if (tunedPick) {
    return route.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ modelId: decodeURIComponent(mid), hwKey: "probe", rows: [{ flagName: "n_cpu_moe", flagValue: "4" }] }) });
  }
  return route.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify({ modelId: decodeURIComponent(mid), hwKey: "probe", rows: [] }) });
});

let failed = false;
const check = (label, ok, extra = "") => {
  console.log(`${ok ? "✓" : "✗"} ${label}${extra ? "   " + extra : ""}`);
  if (!ok) failed = true;
};

try {
  // The EXPECTED embed, data-driven (fixed 2026-07-06 — the old hardcoded "Nomic" assertion
  // went stale when the embed quality ladder + the seeded routing default evolved past it).
  // Mirrors the component's real precedence: routing.default.embeddingModel wins (loadRouting
  // overrides the auto-fill), else the #274 LEFTOVER-aware pick (modelPick.pickBestEmbedId):
  // the embed CO-RESIDES with the chat model, so eligibility = tier "cpu" (always) OR
  // minVram <= the stubbed 8 GB card minus the chat pick's floor. The chat pick post-reset
  // is the APPLIED seeded Gemma default (hard-asserted at "confirm preselects the APPLIED
  // model" below). NOTE the stub marks every embed's fit "ok", so runnability never filters.
  const API = process.env.JW_API || "http://127.0.0.1:17495";
  // Deterministic start: reset to the SEEDED state (pre-production decree) — the D4-1
  // "configured box" assertions depend on it (all presets on the seeded gemma + this
  // container's gemma tune rows), and earlier probe runs mutate the presets.
  await fetch(`${API}/v1/data/reset`, { method: "POST" });
  const routing = await (await fetch(`${API}/v1/ai/routing`)).json();
  const catalog = (await (await fetch(`${API}/v1/ai/model-catalog`)).json()).rows || [];
  const chatRow = catalog.find((r) => r.id === "gemma-4-26b-a4b-qat");
  const leftoverMb = Math.max(0, 8192 - (chatRow?.minVramMb || 0));
  const embeds = catalog.filter((r) => r.embedding);
  const eligible = embeds.filter((r) => r.tier === "cpu" || (r.minVramMb || 0) <= leftoverMb);
  // Mirror both branches of the real rule: eligible → lowest quality rank; none
  // eligible → the least-minVram candidate (dormant while the CPU band is seeded).
  const bestEmbed = eligible.length
    ? eligible.sort((a, b) => (a.qualityRank ?? 100) - (b.qualityRank ?? 100))[0]
    : embeds.sort((a, b) => ((a.minVramMb || 0) - (b.minVramMb || 0)) || ((a.qualityRank ?? 100) - (b.qualityRank ?? 100)))[0];
  const expectedEmbedId = routing.default?.embeddingModel || bestEmbed?.id || "";
  const expectedEmbedName = catalog.find((r) => r.id === expectedEmbedId)?.name || expectedEmbedId;
  // Embed-ladder leg — DATA-DERIVED, no pinned model id (2026-07-12): the default embed is
  // whatever the live catalog's tier/RAM/quality selects, so changing a seed default needs NO
  // probe edit. The seed-ladder CORRECTNESS itself (the 4B leads the CPU band on a capable box;
  // a sub-8GB-RAM box falls back to the 0.6B) is asserted ONCE, data-driven, in the runner's
  // test_embed_catalog_ladder_and_the_4b_row — the single source of truth. Here we assert only
  // that the derivation produced a VALID embedding default; the wizard's rendering of it is
  // checked below via the name.
  check("embed-ladder: the 8GB stub derives a valid embedding default (data-driven, no literal)",
    !!expectedEmbedId && embeds.some((r) => r.id === expectedEmbedId),
    `derived: ${expectedEmbedId || "(none)"}`);

  await page.goto(`${APP}/#/ai`, { waitUntil: "networkidle" });
  // The Providers & models tab is the default; QuickSetup's trigger sits at its top.
  await page.getByRole("button", { name: "Run Quick Setup" }).click();

  // Wait for the confirm step (detect → confirm once hardware/catalog load).
  await page.waitForSelector('button:has-text("Apply setup")', { timeout: 12000 });
  check("wizard opened + reached the confirm step (loadAll ran)", true);

  const confirmHtml = await page.content();
  check("confirm shows the 'Default model' pick section", /Default model/.test(confirmHtml));
  check("confirm shows the 'What happens' summary", /What happens when you click Apply/.test(confirmHtml));
  check("confirm shows the embed line (expected embed prefilled)", confirmHtml.includes(expectedEmbedName),
    `expected: ${expectedEmbedName} (routing default, else best-ranked fitting embed)`);
  // The wizard PRESELECTS the APPLIED model (2026-07-06 "if model is already applied
  // then drop down should select that model") — post-reset that's the seeded Gemma
  // default, so the confirm references it and, with pick == applied and tunes stubbed
  // empty, there is honestly NOTHING to change → NO changelist panel.
  check("confirm preselects the APPLIED model (Gemma, the seeded default)", /Gemma 4 26B-A4B/.test(confirmHtml));
  check("no changelist when the pick IS the applied model (nothing to change)",
    !/what Apply will change/i.test(confirmHtml));
  // LOCAL-ONLY shape (C8, 2026-07-06): no provider selector, no in-wizard connect flow.
  check("confirm has NO 'Run models with' selector (QS is local-only)", !/Run models with/.test(confirmHtml));
  check("confirm has NO 'Connect a provider' flow (providers connect on the provider list)", !/Connect a provider/.test(confirmHtml));
  // Phase 2: the what-if card planner is gone — the wizard scores the REAL machine.
  check("confirm has NO 'Plan for card' selector (Phase 2 removal)", !/Plan for card/.test(confirmHtml));

  // Apply — writes the model onto every task preset + sets the embedding + (stubbed) load.
  await page.getByRole("button", { name: "Apply setup" }).click();
  await page.waitForSelector(".lu-qs-summary", { timeout: 12000 });
  const doneHtml = await page.content();
  check("reached the DONE step (apply completed without error)", /Setup applied/.test(doneHtml));
  check("done summary shows the embedding", /Embedding/.test(doneHtml) && doneHtml.includes(expectedEmbedName));
  // ROUND 9: Apply NEVER auto-starts the sweep. ROUND 14's truth ladder: this box has
  // no saved tune (stubbed empty) and no matching class tune (real class cpu|ram16 ≠
  // the seeded vram8|ram32), so the done step states the computed-defaults truth and
  // offers BOTH passes ("both lab and 2 min sweep") + the Tune-dialog pointer.
  check("untuned pick does NOT auto-start (no running sweep)", !/Optimizing for this PC…|Quick optimize — measuring/.test(doneHtml));
  check("untuned done step states the computed-defaults truth", /No measured settings for this PC yet/.test(doneHtml));
  check("untuned done step offers Quick optimize (~2 min)", /Quick optimize \(~2 min\)/.test(doneHtml));
  check("untuned done step offers Full optimize", /Full optimize/.test(doneHtml));
  check("the caption points at the model's Tune dialog", /Tune dialog/.test(doneHtml));
  // The quick pass (ROUND 14): explicit click → the time-boxed running copy + Skip.
  await page.getByRole("button", { name: /Quick optimize/ }).click();
  await sleep(400);
  const quickHtml = await page.content();
  check("Quick optimize renders its own running title", /Quick optimize — measuring…/.test(quickHtml));
  check("the quick pass states the ~2-minute time box", /time-boxed to about 2 minutes/.test(quickHtml));
  check("the running quick pass offers Skip", /Skip/.test(quickHtml));
  await page.getByRole("button", { name: "Skip" }).click();
  await sleep(400);
  const skippedHtml = await page.content();
  check("Skip cancels the sweep (terminal state renders)", /Optimize cancelled/.test(skippedHtml));
  await page.getByRole("contentinfo").getByRole("button", { name: "Close" }).click();
  await sleep(300);

  // ── Scenario 2: the TUNED machine — no auto-start; Re-optimize behind a confirm ──
  tunedPick = true;
  optStarted = false;
  optCancelled = false;
  await page.getByRole("button", { name: "Run Quick Setup" }).click();
  await page.waitForSelector('button:has-text("Apply setup")', { timeout: 12000 });
  // D4-1 (a)+(c): on a CONFIGURED box (tuned rows), changing the pick away from the
  // applied model renders the changelist naming every re-pointing task preset.
  await page.getByRole("combobox").first().click();
  await page.getByRole("option", { name: /Qwen3\.6 35B/ }).click();
  await sleep(300);
  const changedHtml = await page.content();
  check("confirm shows the D4-1 'what Apply will change' panel once the pick differs",
    /what Apply will change/i.test(changedHtml));
  check("changelist names a re-pointing task preset", /re-points from/.test(changedHtml));
  await page.getByRole("combobox").first().click();
  await page.getByRole("option", { name: /Gemma 4 26B-A4B \(QAT\)/ }).click();
  await sleep(200);
  await page.getByRole("button", { name: "Apply setup" }).click();
  await page.waitForSelector(".lu-qs-summary", { timeout: 12000 });
  const doneHtml2 = await page.content();
  check("tuned pick does NOT auto-start (no running sweep)", !/Optimizing for this PC…|Quick optimize — measuring/.test(doneHtml2));
  check("tuned pick offers 'Re-optimize' instead", /Re-optimize/.test(doneHtml2));
  await page.getByRole("button", { name: /Re-optimize/ }).click();
  await sleep(300);
  const confirmDlg = await page.content();
  check("Re-optimize asks the overwrite confirm first (A8)", /Overwrite this machine's tuned settings\?/.test(confirmDlg));
  await sleep(300);

  console.log(`\npage errors: ${errors.length} · non-benign failed requests: ${badUrls.length}`);
  if (errors.length) { console.log(errors.slice(0, 8).join("\n")); failed = true; }
  if (badUrls.length) { console.log("non-benign:", badUrls.slice(0, 8).join(" | ")); failed = true; }
  console.log(failed ? "\nPHASE-D QUICKSETUP PROBE: FAIL" : "\nPHASE-D QUICKSETUP PROBE: PASS");
} catch (e) {
  console.error("probe error:", e.message);
  failed = true;
} finally {
  await browser.close();
  process.exit(failed ? 1 : 0);
}
