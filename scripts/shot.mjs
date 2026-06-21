// Screenshot one hash route of the running renderer (Playwright + Chromium) so a
// GUI change can be eyeballed, not just smoke-tested. Boot the two processes
// first (same as the smoke): justwrite-server serve --port 17495, npm run dev:vite.
// Usage: node scripts/shot.mjs '#/ai-prompts' out.png
import { existsSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const APP = process.env.JW_APP || "http://localhost:1420";
const hash = process.argv[2] || "#/";
const out = process.argv[3] || "shot.png";

function findChrome() {
  if (process.env.JW_CHROME && existsSync(process.env.JW_CHROME)) return process.env.JW_CHROME;
  for (const root of ["/opt/pw-browsers", `${process.env.HOME || ""}/.cache/ms-playwright`]) {
    if (!existsSync(root)) continue;
    for (const dir of readdirSync(root)) {
      if (!dir.startsWith("chromium") || dir.includes("headless_shell")) continue;
      const exe = `${root}/${dir}/chrome-linux/chrome`;
      if (existsSync(exe)) return exe;
    }
  }
  return undefined;
}

const exe = findChrome();
const browser = await chromium.launch({
  ...(exe ? { executablePath: exe } : {}),
  headless: true,
  args: ["--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
const errors = [];
page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message.slice(0, 200)));
page.on("console", (m) => {
  if (m.type() === "error" && !/404|favicon|Failed to load resource/.test(m.text())) {
    errors.push("CONSOLE: " + m.text().slice(0, 200));
  }
});

await page.goto(APP, { waitUntil: "networkidle" });
await new Promise((r) => setTimeout(r, 1500));
// Dismiss any first-run dialog (e.g. the "What's new" changelog) so it doesn't
// cover the view being captured.
try { await page.click('button:has-text("Got it")', { timeout: 1500 }); } catch { /* none */ }
try { await page.keyboard.press("Escape"); } catch { /* none */ }
await new Promise((r) => setTimeout(r, 400));
await page.evaluate((h) => { window.location.hash = h; }, hash);
await new Promise((r) => setTimeout(r, 1300));
await page.screenshot({ path: out, fullPage: false });
console.log(`shot ${hash} -> ${out}  (errors=${errors.length})`);
errors.slice(0, 8).forEach((e) => console.log("  " + e));
await browser.close();
