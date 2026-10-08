// Loads the real Locations page and the two library pages of the UI-library test (fresh
// browser context each — a library's global CSS must not leak into another page), records
// console/page errors and screenshots list + detail at desktop and phone width.
// usage (from justwrite-app): node <this> <outDir> [width,height ...]
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { chromeLaunchOptions } from "file:///E:/Dev/Web/just-llm-runner/scripts/lib/exec-resolve.js";

const require = createRequire(path.join(process.cwd(), "package.json"));
const { chromium } = require("playwright");

const BASE = process.env.JW_UI || "http://localhost:1420";
const out = process.argv[2];
mkdirSync(out, { recursive: true });
const sizes = (process.argv.slice(3).length ? process.argv.slice(3) : ["1280,820", "390,844"]).map((s) => s.split(",").map(Number));

const PAGES = {
  real: "/#/locations",
  quasar: "/#/ui-test/quasar/locations",
  element: "/#/ui-test/element/locations",
};

async function skipBoot(page) {
  const link = page.getByText("Continue without waiting");
  if (await link.isVisible().catch(() => false)) await link.click();
  await page.waitForTimeout(1500);
}

const browser = await chromium.launch(chromeLaunchOptions());
const report = {};
let detailId = process.env.JW_LOC_ID || "";

for (const [name, route] of Object.entries(PAGES)) {
  for (const [w, h] of sizes) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    const errors = [];
    page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    await page.goto(BASE + route, { waitUntil: "networkidle" });
    await skipBoot(page);
    await page.screenshot({ path: path.join(out, `${name}-list-${w}.png`) });
    if (!detailId && name === "real") {
      detailId = await page.evaluate(async () => {
        const m = await import("/src/stores/project.js");
        return m.useProjectStore().locations[0]?.id || "";
      });
    }
    if (detailId) {
      await page.goto(`${BASE}${route}/${detailId}`, { waitUntil: "networkidle" });
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(out, `${name}-detail-${w}.png`) });
    }
    report[`${name}@${w}`] = errors;
    await ctx.close();
  }
}
await browser.close();
writeFileSync(path.join(out, "report.json"), JSON.stringify({ detailId, report }, null, 2));
console.log(JSON.stringify({ detailId, report }, null, 2));
