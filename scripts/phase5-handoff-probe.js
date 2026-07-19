// Phase 5 probe — Tune→Tasks Lab handoff (the consumer half). The real "Tune" button
// needs a downloaded model (none in dev), so we drive the SHARED labHandoff singleton
// directly (the same module the app imports) and assert the Tasks Lab seeds a NEW Compare
// column from it, tagged with the tuned custom switch — proving A4/A5/A6 end-to-end.
// Reuses findChrome() from headless-smoke.js (never hardcode the Chromium path).
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
// Benign in dev: external fonts (no network) + optional services not running here. A
// real regression is a JS pageerror or a 404 against OUR server/renderer.
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
  // Open the Tasks tab (subnav <a> is a @click tab with no href → not a link role).
  await page.locator(".lu-subnav a", { hasText: /^Tasks$/ }).click();
  await sleep(800);
  // The default seed's first task has members → FeatureLab + one base CompareStrip column.
  await page.waitForSelector(".lu-cmp-col", { timeout: 8000 });
  const before = await page.locator(".lu-cmp-col").count();
  check("base column mounted", before >= 1, `columns=${before}`);

  // Drive the shared handoff singleton — the SAME module instance the app loaded (vite
  // caches ESM by resolved URL). Pick a seeded runner model + a custom tuned switch.
  const drove = await page.evaluate(async () => {
    const urls = [
      "/@fs/home/user/just-llm-runner/ui/src/common/services/labHandoff.js",
      "/@id/@fs/home/user/just-llm-runner/ui/src/common/services/labHandoff.js",
    ];
    for (const u of urls) {
      try {
        const m = await import(/* @vite-ignore */ u);
        if (m?.sendToTasksLab) {
          m.sendToTasksLab({ providerId: "", model: "qwen3.5-9b-q4_k_m", switches: [{ name: "ctx_len", value: "4096" }] });
          return u;
        }
      } catch { /* try the next URL form */ }
    }
    return "";
  });
  check("resolved the shared labHandoff module", !!drove, drove || "no module URL matched");

  await sleep(1200);
  const after = await page.locator(".lu-cmp-col").count();
  check("handoff seeded a NEW compare column (compare, not clobber)", after === before + 1, `before=${before} after=${after}`);

  // The tuned custom switch (ctx_len=4096) rode into the new column's config.
  const html = await page.content();
  check("tuned custom switch present in the seeded column", html.includes("4096"), "looked for ctx_len value 4096");

  console.log(`\npage errors: ${errors.length} · non-benign failed requests: ${badUrls.length}`);
  if (errors.length) { console.log(errors.slice(0, 8).join("\n")); failed = true; }
  if (badUrls.length) { console.log("non-benign:", badUrls.slice(0, 8).join(" | ")); failed = true; }
  console.log(failed ? "\nPHASE-5 HANDOFF PROBE: FAIL" : "\nPHASE-5 HANDOFF PROBE: PASS");
} catch (e) {
  console.error("probe error:", e.message);
  failed = true;
} finally {
  await browser.close();
  process.exit(failed ? 1 : 0);
}
