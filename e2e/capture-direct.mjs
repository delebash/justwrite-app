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

const TARGETS = [
  { name: "studio",          hash: "#/studio",         wait: 2500 },
  { name: "settings-ai",     hash: "#/settings/audio", wait: 2500 },
  { name: "analysis-tauri",  hash: "#/analysis",       wait: 3000 },
  { name: "worldbuilding",   hash: "#/worldbuilding",  wait: 2500 },
  { name: "timeline",        hash: "#/timeline",       wait: 2500 },
  { name: "plotboard-tauri", hash: "#/plot",           wait: 2500 },
  { name: "characters",      hash: "#/characters",     wait: 2500 },
  { name: "relations",       hash: "#/relations",      wait: 3000 },
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

  try {
    for (const t of TARGETS) {
      console.log(`→ ${t.name} (${t.hash})`);
      await execute(sid, "window.location.hash = arguments[0];", [t.hash]);
      await new Promise((r) => setTimeout(r, t.wait));
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
