// Direct WebDriver HTTP driver — talks to tauri-driver (port 4444)
// without going through WebdriverIO. tauri-driver must already be
// running, and the path to msedgedriver.exe must be passed to it.
//
// Run with: node capture-direct.mjs
//
// tauri-driver is spawned at the top of this script; killed on exit.

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_BIN  = path.resolve(__dirname, "../src-tauri/target/release/justwrite.exe");
const EDGE_DRV = path.resolve(__dirname, "./drivers/msedgedriver.exe");
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
  { name: "writer-lab",         hash: "#/writer-lab",          wait: 2500 },

  // Studio
  { name: "studio",             hash: "#/studio",              wait: 2500 },
  { name: "studio-script",      hash: "#/studio/script",       wait: 2500 },
  { name: "studio-render",      hash: "#/studio/render",       wait: 2500 },

  // Settings
  { name: "settings-project",   hash: "#/settings/project",    wait: 2500 },
  { name: "settings-ai",        hash: "#/settings/audio",      wait: 2500 },
  { name: "settings-appearance", hash: "#/settings/appearance", wait: 2500 },
  { name: "settings-usage",     hash: "#/settings/usage",      wait: 2500 },
  { name: "settings-backups",   hash: "#/settings/backups",    wait: 2500 },

  // Import / export
  { name: "import",             hash: "#/import",              wait: 2500 },
  { name: "export",             hash: "#/export",              wait: 2500 },
];

const BASE = "http://127.0.0.1:4444";

async function http(method, urlPath, body) {
  const res = await fetch(BASE + urlPath, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok) throw new Error(`${method} ${urlPath} → ${res.status}: ${text.slice(0, 300)}`);
  return json.value;
}

async function waitForDriver() {
  for (let i = 0; i < 30; i++) {
    try {
      const r = await fetch(BASE + "/status");
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("tauri-driver didn't come up on :4444");
}

async function newSession() {
  const v = await http("POST", "/session", {
    capabilities: {
      alwaysMatch: {
        "tauri:options": { application: APP_BIN },
      },
    },
  });
  return v.sessionId;
}

async function endSession(sid) {
  try { await http("DELETE", `/session/${sid}`); } catch {}
}

async function maximize(sid) {
  try { await http("POST", `/session/${sid}/window/maximize`, {}); } catch {}
}

async function execute(sid, script, args = []) {
  return http("POST", `/session/${sid}/execute/sync`, { script, args });
}

async function screenshot(sid, file) {
  const v = await http("GET", `/session/${sid}/screenshot`);
  fs.writeFileSync(file, Buffer.from(v, "base64"));
}

async function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log("→ spawning tauri-driver");
  const driver = spawn(
    "tauri-driver",
    ["--native-driver", EDGE_DRV, "--port", "4444"],
    { stdio: ["ignore", "inherit", "inherit"], shell: true },
  );

  process.on("exit", () => { if (driver && !driver.killed) driver.kill(); });
  process.on("SIGINT", () => { driver?.kill(); process.exit(130); });

  await waitForDriver();
  console.log("→ tauri-driver listening on 4444");

  console.log("→ creating session (this launches the app)");
  const sid = await newSession();
  console.log(`   session ${sid}`);

  await maximize(sid);
  // Let the app boot fully — Pinia stores hydrate from IDB on mount.
  await new Promise((r) => setTimeout(r, 4000));

  // Switch the active theme preset BEFORE running the capture loop, so
  // every shot reflects that look. Navigates to Settings → Appearance
  // and clicks the named preset tile, then jumps to a neutral route so
  // the first real target doesn't have to undo the settings page.
  const THEME = process.env.JW_THEME || "Fine Press";
  console.log(`→ setting theme preset: ${THEME}`);
  await execute(sid, "window.location.hash = arguments[0];", ["#/settings/appearance"]);
  await new Promise((r) => setTimeout(r, 1500));
  const clicked = await execute(
    sid,
    `const tile = [...document.querySelectorAll('.preset-tile')]
       .find((el) => el.querySelector('b') && el.querySelector('b').textContent.trim() === arguments[0]);
     if (!tile) return false;
     tile.click();
     return true;`,
    [THEME],
  );
  if (!clicked) throw new Error(`Theme preset "${THEME}" tile not found.`);
  // Give applyAppearance() time to push CSS custom properties + swap fonts.
  await new Promise((r) => setTimeout(r, 1200));
  await execute(sid, "window.location.hash = '#/';", []);
  await new Promise((r) => setTimeout(r, 800));

  try {
    for (const t of TARGETS) {
      console.log(`→ ${t.name} (${t.hash})`);
      await execute(sid, "window.location.hash = arguments[0];", [t.hash]);
      await new Promise((r) => setTimeout(r, t.wait));
      if (t.scroll) {
        await execute(
          sid,
          "const el = document.querySelector('.scrollarea'); if (el) el.scrollTop = arguments[0]; else window.scrollTo(0, arguments[0]);",
          [t.scroll],
        );
        await new Promise((r) => setTimeout(r, 400));
      }
      const file = path.join(OUT_DIR, `${t.name}.png`);
      await screenshot(sid, file);
      console.log(`   saved ${path.basename(file)}`);
    }
  } finally {
    console.log("→ ending session");
    await endSession(sid);
    driver.kill();
  }
  console.log("done.");
}

main().catch((e) => {
  console.error("FAIL:", e.message);
  process.exit(1);
});
