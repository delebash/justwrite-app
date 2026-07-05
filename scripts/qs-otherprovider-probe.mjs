// Phase 3b-ii-b probe — QuickSetup "Run models with" other-provider UI. Opens the wizard and
// asserts, live in the real kit view: (a) the "Run models with" selector lists the Bundled
// runner + a REACHABLE keyed cloud provider but EXCLUDES a keyless one (the reachable filter);
// (b) switching to an external provider swaps the bundled card/model sections for the external
// Model section and flips the outcome copy to "nothing downloads" (the T5 fix); (c) the
// "+ Connect a provider" flow renders the cloud chips + reveals an API-key input on chip pick.
// Prereq: the server (:17495) has been seeded with a keyed "Test OpenAI" + keyless "Test
// Anthropic" provider (see the seeding step in the verify run). Reuses findChrome() from
// headless-smoke.mjs (never hardcode the Chromium path).
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

let failed = false;
const check = (label, ok, extra = "") => {
  console.log(`${ok ? "✓" : "✗"} ${label}${extra ? "   " + extra : ""}`);
  if (!ok) failed = true;
};

try {
  await page.goto(`${APP}/#/ai`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Run Quick Setup" }).click();
  await page.waitForSelector('button:has-text("Apply setup")', { timeout: 12000 });
  check("wizard opened + reached the confirm step", true);

  // (0) The new section + the default bundled branch.
  const html0 = await page.content();
  check("confirm shows the 'Run models with' selector", /Run models with/.test(html0));
  check("default is bundled: 'Plan for card' + 'Default model' visible", /Plan for card/.test(html0) && /Default model/.test(html0));

  // (a) Reachable filter — open the FIRST select (Run models with) and read its options.
  const runWithTrigger = page.getByRole("dialog").locator(".ui-select-trigger").first();
  await runWithTrigger.click();
  await page.waitForSelector("[role=option]", { timeout: 5000 });
  const opts = await page.getByRole("option").allInnerTexts();
  check("Run-with lists 'Bundled runner (recommended)'", opts.some((o) => /Bundled runner/.test(o)));
  check("Run-with lists the KEYED cloud provider (Test OpenAI)", opts.some((o) => /Test OpenAI/.test(o)),
    "reachable: registered && hasApiKey");
  check("Run-with EXCLUDES the KEYLESS cloud provider (Test Anthropic)", !opts.some((o) => /Test Anthropic/.test(o)),
    "keyless cloud hidden — would 501 on use");

  // (b) Switch to the external provider → the branch swaps + the outcome copy flips.
  await page.getByRole("option", { name: /Test OpenAI/ }).click();
  await sleep(900); // onRunWithChange → loadProviderModels
  const htmlExt = await page.content();
  check("external branch: the bundled 'Plan for card' section is HIDDEN", !/Plan for card/.test(htmlExt));
  check("external branch: the provider 'serves the model' hint is shown",
    await page.getByText(/serves the model/i).isVisible().catch(() => false));
  check("external What-happens copy = 'nothing downloads' (T5 outcome-copy fix)", /nothing downloads/i.test(htmlExt));

  // (c) Connect-a-provider flow: cloud chips + the API-key reveal.
  await page.getByRole("button", { name: /Connect a provider/ }).click();
  await sleep(500); // detectLocal
  const htmlConn = await page.content();
  check("connect box shows 'Connect a cloud provider'", /Connect a cloud provider/.test(htmlConn));
  check("connect chips render OpenAI / Anthropic / Gemini / OpenRouter",
    /OpenAI/.test(htmlConn) && /Anthropic/.test(htmlConn) && /Gemini/.test(htmlConn) && /OpenRouter/.test(htmlConn));
  await page.locator(".lu-qs-chips").getByRole("button", { name: "OpenAI", exact: true }).click();
  await sleep(200);
  check("picking a cloud chip reveals an API-key input",
    await page.locator(".lu-qs-cloudkey input").isVisible().catch(() => false));

  console.log(`\npage errors: ${errors.length} · non-benign failed requests: ${badUrls.length}`);
  if (errors.length) { console.log(errors.slice(0, 8).join("\n")); failed = true; }
  if (badUrls.length) { console.log("non-benign:", badUrls.slice(0, 8).join(" | ")); failed = true; }
  console.log(failed ? "\nQS OTHER-PROVIDER PROBE: FAIL" : "\nQS OTHER-PROVIDER PROBE: PASS");
} catch (e) {
  console.error("probe error:", e.message);
  failed = true;
} finally {
  await browser.close();
  process.exit(failed ? 1 : 0);
}
