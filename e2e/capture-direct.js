// The marketing screenshots: the REAL desktop app (Electron, the built UI, the dev data
// folder — your real data), driven through e2e/lib/driver.js (Playwright's Electron driver;
// it replaced tauri-driver + msedgedriver on 2026-10-08), saving PNGs straight into the
// website's public/screenshots/ folder.
//
// Run with: node capture-direct.js   (from e2e/; `npm run build` at the app root first)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Driver } from "./lib/driver.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR  = path.resolve(__dirname, "../../justwrite-website/public/screenshots");

// Each target may set `scroll` (CSS pixels) — applied to the inner
// `.scrollarea` element if one exists, falling back to window.scrollTo.
// Used to push past KPI strips on long pages so the screenshot lands
// on the more visually interesting body sections.
const TARGETS = [
  // Manuscript
  { name: "home-light",         hash: "#/",                    wait: 2500 },
  { name: "editor",             hash: "#/chapters/ch4",        wait: 3000 },

  // Story world
  { name: "characters-list",    hash: "#/characters",          wait: 2500 },
  { name: "characters",         hash: "#/characters/c1",       wait: 3000 },
  { name: "locations",          hash: "#/locations",           wait: 2500 },
  { name: "objects",            hash: "#/objects",             wait: 2500 },
  { name: "groups",             hash: "#/groups/g1",           wait: 2500 },
  { name: "architecture",       hash: "#/architecture",        wait: 2500 },
  { name: "worldbuilding",      hash: "#/worldbuilding",       wait: 2500 },
  { name: "relations",          hash: "#/relations",           wait: 3000 },

  // Planning / structure
  { name: "strands",            hash: "#/strands",             wait: 2500 },
  { name: "plotboard",          hash: "#/plot",                wait: 2500 },
  { name: "timeline",           hash: "#/timeline",            wait: 2500 },
  { name: "notes",              hash: "#/notes",               wait: 2500 },
  { name: "brainstorm",         hash: "#/brainstorm",          wait: 2500 },

  // Analysis / reflection
  { name: "analysis",           hash: "#/analysis",            wait: 3500, scroll: 340 },
  // the file names are the website's; the old Writer Lab is the AI page's Writing AI tab now
  { name: "writer-lab",         hash: "#/ai?tab=app",          wait: 2500 },

  // Settings
  { name: "settings-project",   hash: "#/settings/project",    wait: 2500 },
  { name: "settings-ai",        hash: "#/ai",                  wait: 2500 },
  { name: "settings-appearance", hash: "#/settings/appearance", wait: 2500 },
  { name: "settings-usage",     hash: "#/ai?tab=usage",        wait: 2500 },
  { name: "settings-backups",   hash: "#/settings/backups",    wait: 2500 },

  // Import / export
  { name: "import",             hash: "#/import",              wait: 2500 },
  { name: "export",             hash: "#/export",              wait: 2500 },
];

async function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log("→ launching the app");
  const d = new Driver();
  await d.launch();
  await d.maximize();
  // Let the app boot fully — the stores hydrate from the server on mount.
  await d.sleep(4000);

  try {
    // Switch the active theme preset BEFORE running the capture loop, so
    // every shot reflects that look. Navigates to Settings → Appearance
    // and clicks the named preset tile, then jumps to a neutral route so
    // the first real target doesn't have to undo the settings page.
    const THEME = process.env.JW_THEME || "Fine Press";
    console.log(`→ setting theme preset: ${THEME}`);
    await d.navigate("#/settings/appearance");
    await d.sleep(1500);
    const clicked = await d.exec(
      `const tile = [...document.querySelectorAll('.preset-tile')]
         .find((el) => el.querySelector('b') && el.querySelector('b').textContent.trim() === arguments[0]);
       if (!tile) return false;
       tile.click();
       return true;`,
      [THEME],
    );
    if (!clicked) throw new Error(`Theme preset "${THEME}" tile not found.`);
    // Give applyAppearance() time to push CSS custom properties + swap fonts.
    await d.sleep(1200);
    await d.navigate("#/");
    await d.sleep(800);

    for (const t of TARGETS) {
      console.log(`→ ${t.name} (${t.hash})`);
      await d.navigate(t.hash);
      await d.sleep(t.wait);
      if (t.scroll) {
        await d.exec(
          "const el = document.querySelector('.scrollarea'); if (el) el.scrollTop = arguments[0]; else window.scrollTo(0, arguments[0]);",
          [t.scroll],
        );
        await d.sleep(400);
      }
      const file = path.join(OUT_DIR, `${t.name}.png`);
      await d.screenshot(file);
      console.log(`   saved ${path.basename(file)}`);
    }
  } finally {
    console.log("→ closing the app");
    await d.close();
  }
  console.log("done.");
}

main().catch((e) => {
  console.error("FAIL:", e.message);
  process.exit(1);
});
