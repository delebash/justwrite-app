// SPDX-License-Identifier: MIT
// JustWrite on the iOS simulator (the phone plan's slice 6, `.github/workflows/phone-ios.yml`),
// driven through Appium's XCUITest driver with WebdriverIO as the client: a fresh install opens on
// the welcome screen; "Try the tutorial project" makes the tutorial book through the app's own
// in-app server (the web worker, on SQLite WASM over OPFS); the key screens are photographed from
// the simulator's display (`simctl io screenshot` — the screen itself, not the web inspector's
// capture); then the app is quit and opened again, and the book must still be there.
// Exits 1 when a check fails.
//   SIM_UDID — the booted simulator; APP_PATH — the built App.app; Appium on 127.0.0.1:4723.
// Usage: node phone-ios.js <outDir>
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { remote } from "webdriverio";

const UDID = process.env.SIM_UDID;
const APP_PATH = process.env.APP_PATH;
const BUNDLE = "com.justwrite.app";
const out = process.argv[2];
if (!UDID || !APP_PATH || !out) throw new Error("set SIM_UDID and APP_PATH, and name an output folder");
mkdirSync(out, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const simctl = (...args) => spawnSync("xcrun", ["simctl", ...args], { encoding: "utf8" });
const shot = (name) => simctl("io", UDID, "screenshot", path.join(out, `${name}.png`));

simctl("uninstall", UDID, BUNDLE); // a fresh install: the welcome screen, no books
const driver = await remote({
  hostname: "127.0.0.1",
  port: 4723,
  logLevel: "warn",
  connectionRetryTimeout: 600000, // the first session builds WebDriverAgent
  connectionRetryCount: 0,
  capabilities: {
    platformName: "iOS",
    "appium:automationName": "XCUITest",
    "appium:udid": UDID,
    "appium:app": APP_PATH,
    "appium:bundleId": BUNDLE,
    "appium:newCommandTimeout": 600,
    "appium:wdaLaunchTimeout": 480000,
    "appium:wdaConnectionTimeout": 480000,
    "appium:showSafariConsoleLog": true,
    "appium:webviewConnectTimeout": 60000,
  },
});

const report = { checks: [], consoleErrors: [], pageErrors: [] };
const check = (name, ok, detail = "") => {
  report.checks.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

async function webview() {
  for (let i = 0; i < 90; i++) {
    const ids = (await driver.getContexts()).map((c) => (typeof c === "string" ? c : c.id));
    const wv = ids.find((c) => c.startsWith("WEBVIEW"));
    if (wv) {
      await driver.switchContext(wv);
      // errors from here on; the boot's own come through the console log below
      await driver.execute(`
        if (!window.__jwErrors) {
          window.__jwErrors = [];
          addEventListener("error", (e) => window.__jwErrors.push(String(e.message)));
          addEventListener("unhandledrejection", (e) => window.__jwErrors.push(String(e.reason)));
        }`);
      return wv;
    }
    await sleep(1000);
  }
  throw new Error("the app's web view never appeared");
}
const text = () => driver.execute(`return document.body.innerText.replace(/\\s+/g, " ")`);
async function waitFor(re, ms = 90000) {
  const t0 = Date.now();
  for (;;) {
    const t = await text().catch(() => "");
    if (re.test(t)) return t;
    if (Date.now() - t0 > ms) return null;
    await sleep(750);
  }
}
// click the first VISIBLE element whose own text matches (the innermost match wins)
const click = (re) =>
  driver.execute(
    `const re = new RegExp(arguments[0], "i");
     const els = [...document.querySelectorAll("button, a, [role=button], .q-item, td, span, div, h3, .q-btn")]
       .filter((e) => re.test(e.textContent.trim()) && e.getBoundingClientRect().width > 0 && getComputedStyle(e).visibility !== "hidden");
     const el = els.filter((e) => !els.some((o) => o !== e && e.contains(o)))[0];
     if (!el) return false;
     el.click();
     return el.textContent.trim().slice(0, 40);`,
    re,
  );
async function skipAiOffer() {
  if (/Skip for now/i.test(await text())) {
    await click("^Skip for now$");
    await sleep(800);
  }
}
async function go(hash) {
  await driver.execute(`location.hash = arguments[0]`, hash);
  await sleep(2500);
  await skipAiOffer();
}
async function collectConsole() {
  const logs = await driver.getLogs("safariConsole").catch(() => []);
  for (const l of logs) {
    const level = String(l.level || "").toUpperCase();
    if (level === "SEVERE" || level === "ERROR") report.consoleErrors.push(String(l.message).slice(0, 300));
  }
}

try {
  // ── a fresh install ──
  await webview();
  const welcome = await waitFor(/Try the tutorial project|Ninth Facet/);
  shot("01-welcome");
  check("the welcome screen, served by the in-app server", !!welcome && /Try the tutorial project/i.test(welcome), (welcome || "").slice(0, 120));

  // ── the tutorial book, made through the app ──
  await click("^Try the tutorial project");
  const book = await waitFor(/Ninth Facet[\s\S]*Brass Rank|Brass Rank[\s\S]*Ninth Facet/);
  await skipAiOffer();
  shot("02-home");
  check("the tutorial book opens", !!book);

  // ── the key screens ──
  await driver.execute(`document.querySelector('[aria-label*="sidebar" i], [aria-label*="menu" i], .q-header button')?.click()`);
  await sleep(1200);
  shot("03-drawer");
  await go("#/chapters");
  shot("04-chapters");
  check("Chapters lists the book's chapters", /Bigger Inside/.test(await text()));
  await click("^Bigger Inside$");
  await sleep(2500);
  await click("^The road to the Nine$");
  await sleep(3000);
  shot("05-scene-editor");
  check("a scene opens in the editor", /The Ash District/.test(await text()));
  await go("#/characters");
  shot("06-characters");
  await go("#/ai");
  shot("07-ai");
  await go("#/settings/sync");
  shot("08-sync");
  await collectConsole();
  report.pageErrors.push(...(await driver.execute(`return window.__jwErrors || []`)));

  // ── quit and open again: the book is kept (SQLite on OPFS inside WKWebView) ──
  await driver.switchContext("NATIVE_APP");
  await driver.execute("mobile: terminateApp", { bundleId: BUNDLE });
  await sleep(2000);
  await driver.execute("mobile: activateApp", { bundleId: BUNDLE });
  await webview();
  const again = await waitFor(/Ninth Facet/);
  await skipAiOffer();
  shot("09-reopened");
  check("the book is still there after the app is quit and reopened", !!again);
  await collectConsole();
  report.pageErrors.push(...(await driver.execute(`return window.__jwErrors || []`)));
  report.userAgent = await driver.execute(`return navigator.userAgent`);
} catch (e) {
  check("the run finished", false, String(e?.message || e).slice(0, 300));
} finally {
  await driver.deleteSession().catch(() => {});
}

check("no page errors", report.pageErrors.length === 0, report.pageErrors.slice(0, 5).join(" | "));
check("no console errors", report.consoleErrors.length === 0, report.consoleErrors.slice(0, 5).join(" | "));
writeFileSync(path.join(out, "report.json"), JSON.stringify(report, null, 2));
process.exit(report.checks.every((c) => c.ok) ? 0 : 1);
