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

// GPU-shaped hardware for the wizard (2026-07-06: chat models REQUIRE a GPU — CPU-only
// prose is unsupported; this container has no GPU, so the page sees a probe 8 GB card
// and the /models fits are lifted to what that card would report; embeds unchanged).
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
// Phase-2 sweep stubs: the container has no engine, so the auto-tune job is faked.
// cancelled flips the GET payload so Skip's post-cancel poll shows the terminal state.
let optCancelled = false;
await page.route("**/v1/llm-runner/auto-tune/cancel", (route) => {
  optCancelled = true;
  return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
});
await page.route("**/v1/llm-runner/auto-tune", (route) => {
  const body = optCancelled
    ? { status: "cancelled", detail: "cancelled", trials: [] }
    : { ok: true, status: "running", detail: "trying baseline…", trials: [] };
  return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
});
// Scenario switch: when tunedPick is armed, the PICK's model-tunes read returns rows —
// the tuned-machine path (Re-optimize + confirm). Otherwise tunes read EMPTY: since the
// wizard preselects the APPLIED model (2026-07-06 — post-reset that's the seeded gemma,
// whose seeded tune rows would suppress auto-start by design), the auto-start scenario
// stubs "no tunes for this machine" so the sweep path stays testable.
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
  // overrides the prefill), else the lowest-quality_rank FITTING embed (bestEmbedId).
  const API = process.env.JW_API || "http://127.0.0.1:17495";
  // Deterministic start: reset to the SEEDED state (pre-production decree) — the D4-1
  // "configured box" assertions depend on it (all presets on the seeded gemma + this
  // container's gemma tune rows), and earlier probe runs mutate the presets.
  await fetch(`${API}/v1/data/reset`, { method: "POST" });
  const routing = await (await fetch(`${API}/v1/ai/routing`)).json();
  const catalog = (await (await fetch(`${API}/v1/ai/model-catalog`)).json()).rows || [];
  const fitById = Object.fromEntries(
    ((await (await fetch(`${API}/v1/llm-runner/models`)).json()).models || []).map((m) => [m.id, m.fit]),
  );
  const RUNNABLE = new Set(["ok", "tight", "cpu"]);
  const fittingEmbeds = catalog.filter((r) => r.embedding && RUNNABLE.has(fitById[r.id]));
  const bestEmbed = fittingEmbeds.sort((a, b) => (a.qualityRank ?? 100) - (b.qualityRank ?? 100))[0];
  const expectedEmbedId = routing.default?.embeddingModel || bestEmbed?.id || "";
  const expectedEmbedName = catalog.find((r) => r.id === expectedEmbedId)?.name || expectedEmbedId;

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
  // Phase 2 opt-out sweep: the pick (14b) has NO tunes on this box → the sweep
  // AUTO-STARTS on Apply; the done step shows it running with a Skip button.
  check("untuned pick AUTO-STARTS the sweep (running state renders)", /Optimizing —/.test(doneHtml));
  check("the running sweep offers Skip", /Skip/.test(doneHtml));
  await page.getByRole("button", { name: "Skip" }).click();
  await sleep(400);
  const skippedHtml = await page.content();
  check("Skip cancels the sweep (terminal state renders)", /Optimize cancelled/.test(skippedHtml));
  await page.getByRole("contentinfo").getByRole("button", { name: "Close" }).click();
  await sleep(300);

  // ── Scenario 2: the TUNED machine — no auto-start; Re-optimize behind a confirm ──
  tunedPick = true;
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
  check("tuned pick does NOT auto-start (no running sweep)", !/Optimizing —/.test(doneHtml2));
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
