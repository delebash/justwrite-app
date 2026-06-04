// Drives the real Tauri JustWrite app through each target view,
// captures a PNG of the WebView client area, and writes it into the
// website project's public/screenshots/ folder.
//
// Run with: npm run capture (from the e2e directory)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(
  __dirname,
  "../../../justwrite-website/public/screenshots",
);

const TARGETS = [
  { name: "studio",         hash: "#/studio",          wait: 2000 },
  { name: "settings-ai",    hash: "#/settings/audio",  wait: 2000 },
  { name: "analysis-tauri", hash: "#/analysis",        wait: 2500 },
  { name: "worldbuilding",  hash: "#/worldbuilding",   wait: 2000 },
  { name: "timeline",       hash: "#/timeline",        wait: 2000 },
  { name: "plotboard-tauri", hash: "#/plot",           wait: 2000 },
  { name: "characters",     hash: "#/characters",      wait: 2000 },
  { name: "relations",      hash: "#/relations",       wait: 2500 },
];

describe("JustWrite screenshot capture", () => {
  before(async () => {
    if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
    // Maximize so screenshots have generous breathing room.
    try {
      await browser.maximizeWindow();
    } catch (e) {
      // Some drivers don't expose maximize; ignore.
    }
    // Give the app a moment after launch.
    await browser.pause(2500);
  });

  for (const t of TARGETS) {
    it(`captures ${t.name}`, async () => {
      // Hash-route in-place; the Vue hash-router will swap views.
      await browser.execute((hash) => {
        window.location.hash = hash;
      }, t.hash);

      await browser.pause(t.wait);

      const file = path.join(OUT_DIR, `${t.name}.png`);
      await browser.saveScreenshot(file);
      console.log(`  saved ${file}`);
    });
  }
});
