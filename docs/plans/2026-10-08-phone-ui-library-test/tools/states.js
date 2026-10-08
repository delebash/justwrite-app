// Screenshots of the interactive states on the real page and the two library pages: the
// Groups and Images dialogs, the status menu, the tag editor, dark mode, phone width.
// Nothing is clicked that writes: dialogs are opened and closed, menus opened, never picked.
// usage (from justwrite-app): node <this> <outDir> [locationId]
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { chromeLaunchOptions } from "file:///E:/Dev/Web/just-llm-runner/scripts/lib/exec-resolve.js";

const require = createRequire(path.join(process.cwd(), "package.json"));
const { chromium } = require("playwright");
const BASE = process.env.JW_UI || "http://localhost:1420";
const out = process.argv[2];
const locId = process.argv[3] || "l1";
mkdirSync(out, { recursive: true });
const ROUTES = { real: "/#/locations", quasar: "/#/ui-test/quasar/locations", element: "/#/ui-test/element/locations" };
const STATUS = { real: ".status-pill", quasar: ".jw-status", element: ".jw-status" };
const TAGIN = { real: ".tag-input", quasar: ".jw-tag-select input", element: ".jw-tag-select" };

const browser = await chromium.launch(chromeLaunchOptions());
const errors = {};

async function open(name, url, w, h, mode = "light") {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  const errs = (errors[`${name}@${w}:${mode}`] ??= []);
  page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  page.on("pageerror", (e) => errs.push(`pageerror: ${e.message}`));
  await page.goto(BASE + url, { waitUntil: "networkidle" });
  const skip = page.getByText("Continue without waiting");
  if (await skip.isVisible().catch(() => false)) await skip.click();
  await page.evaluate(async (mode) => {
    const m = await import("/src/services/appearance.js");
    m.applyAppearance({ ...m.DEFAULT_APPEARANCE, mode });
  }, mode);
  await page.waitForTimeout(900);
  return { ctx, page };
}
const shot = (page, f) => page.screenshot({ path: path.join(out, f) });

for (const [name, route] of Object.entries(ROUTES)) {
  for (const mode of ["light", "dark"]) {
    const { ctx, page } = await open(name, `${route}/${locId}`, 1280, 820, mode);
    await shot(page, `${name}-${mode}-detail.png`);
    await page.locator(STATUS[name]).first().click();
    await page.waitForTimeout(500);
    await shot(page, `${name}-${mode}-status-menu.png`);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    await page.locator(TAGIN[name]).first().click();
    await page.waitForTimeout(500);
    await shot(page, `${name}-${mode}-tag-focus.png`);
    await page.keyboard.press("Escape");
    await page.locator(".pane-header").first().click({ position: { x: 5, y: 5 } });
    await page.locator(".pane-actions").getByText("Groups", { exact: true }).click();
    await page.waitForTimeout(600);
    await shot(page, `${name}-${mode}-groups.png`);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
    await page.locator(".pane-actions").getByText("Images", { exact: true }).click();
    await page.waitForTimeout(600);
    await shot(page, `${name}-${mode}-images.png`);
    await page.keyboard.press("Escape");
    await ctx.close();
  }
  for (const [sub, suffix] of [["list", ""], ["detail", `/${locId}`]]) {
    const { ctx, page } = await open(name, route + suffix, 390, 844);
    await shot(page, `${name}-phone-${sub}.png`);
    await ctx.close();
  }
}
await browser.close();
writeFileSync(path.join(out, "errors.json"), JSON.stringify(errors, null, 2));
console.log(JSON.stringify(errors, null, 2));
