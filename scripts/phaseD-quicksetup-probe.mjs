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

// Stub the model-load leg so Apply doesn't try to fetch/spawn a real model. Everything
// else (preset PUTs, routing PUT) hits the real server so we can verify the writes.
await page.route("**/v1/llm-runner/load", (route) =>
  route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) }),
);
await page.route("**/v1/llm-runner/status", (route) =>
  route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "running", detail: "stubbed" }) }),
);

let failed = false;
const check = (label, ok, extra = "") => {
  console.log(`${ok ? "✓" : "✗"} ${label}${extra ? "   " + extra : ""}`);
  if (!ok) failed = true;
};

try {
  await page.goto(`${APP}/#/ai`, { waitUntil: "networkidle" });
  // The Providers & models tab is the default; QuickSetup's trigger sits at its top.
  await page.getByRole("button", { name: "Run Quick Setup" }).click();

  // Wait for the confirm step (detect → confirm once hardware/catalog load).
  await page.waitForSelector('button:has-text("Apply setup")', { timeout: 12000 });
  check("wizard opened + reached the confirm step (loadAll ran)", true);

  const confirmHtml = await page.content();
  check("confirm shows the 'Default model' pick section", /Default model/.test(confirmHtml));
  check("confirm shows the 'What happens' summary", /What happens when you click Apply/.test(confirmHtml));
  check("confirm shows the embed line (nomic prefilled)", /Nomic Embed Text/i.test(confirmHtml),
    "embedding prefill from the catalog's /embed/i model (shown by display name)");
  // The pick on a CPU box is qwen3-14b (best quality that fits); its name carries "14B".
  check("confirm references the picked model (14B best-that-fits)", /14B/.test(confirmHtml));

  // Apply — writes the model onto every task preset + sets the embedding + (stubbed) load.
  await page.getByRole("button", { name: "Apply setup" }).click();
  await page.waitForSelector(".lu-qs-summary", { timeout: 12000 });
  const doneHtml = await page.content();
  check("reached the DONE step (apply completed without error)", /Setup applied/.test(doneHtml));
  check("done summary shows the embedding", /Embedding/.test(doneHtml) && /Nomic Embed Text/i.test(doneHtml));
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
