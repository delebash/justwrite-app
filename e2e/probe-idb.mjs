// Peek at the prod binary's IDB. Reads the multi-project registry/active
// pointers and the active project's snapshot. Prints theme, cast, scripts.

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_BIN  = path.resolve(__dirname, "../src-tauri/target/release/justwrite.exe");
const EDGE_DRV = path.resolve(__dirname, "./drivers/msedgedriver.exe");
const BASE = "http://127.0.0.1:4444";

async function http(method, urlPath, body) {
  const res = await fetch(BASE + urlPath, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok) throw new Error(`${method} ${urlPath} → ${res.status}: ${text.slice(0,300)}`);
  return json.value;
}
async function waitForDriver() {
  for (let i = 0; i < 30; i++) { try { const r = await fetch(BASE + "/status"); if (r.ok) return; } catch {} await new Promise(r => setTimeout(r, 500)); }
  throw new Error("driver not up");
}
async function newSession() {
  const v = await http("POST", "/session", { capabilities: { alwaysMatch: { "tauri:options": { application: APP_BIN } } } });
  return v.sessionId;
}
async function endSession(sid) { try { await http("DELETE", `/session/${sid}`); } catch {} }
async function executeAsync(sid, script, args = []) { return http("POST", `/session/${sid}/execute/async`, { script, args }); }

const PROBE = `
  const cb = arguments[arguments.length - 1];
  (async () => {
    try {
      const dbReq = indexedDB.open('justwrite');
      const db = await new Promise((res, rej) => { dbReq.onsuccess = () => res(dbReq.result); dbReq.onerror = () => rej(dbReq.error); });
      const tx = db.transaction('kv', 'readonly');
      const store = tx.objectStore('kv');
      const keysReq = store.getAllKeys();
      const keys = await new Promise((res, rej) => { keysReq.onsuccess = () => res(keysReq.result); keysReq.onerror = () => rej(keysReq.error); });
      const getKey = (k) => new Promise((res, rej) => { const r = store.get(k); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

      const parse = (s) => { try { return JSON.parse(s); } catch { return s; } };
      const out = { keys };

      const activeId = parse(await getKey('justwrite:projects:active'));
      const registry = parse(await getKey('justwrite:projects:registry'));
      out.activeId = activeId;
      out.registry = registry;

      const snap = activeId ? parse(await getKey('justwrite:project:' + activeId)) : null;
      out.activeSnapshotPresent = !!snap;
      if (snap) {
        out.projTitle = snap?.project?.title;
        out.chapters = (snap.parts || []).flatMap(p => (p.chapters || []).map(c => ({ id: c.id, num: c.num, title: c.title }))).slice(0, 20);
        const chars = (snap.characters || []);
        out.charactersWithVoice = chars.filter(c => c.voice || c.studioVoice).map(c => ({ name: c.name, voice: c.voice || c.studioVoice }));
        out.charactersTotal = chars.length;
        // studio cast might live in a sibling key
      }

      const studioRaw = parse(await getKey('justwrite:studio'));
      if (studioRaw) {
        out.studioVoices = (studioRaw.voices?.length) ?? null;
        out.studioCastCharacters = studioRaw.cast?.characters ? Object.keys(studioRaw.cast.characters).length : null;
        out.studioCastNarrator = studioRaw.cast?.narrator || null;
        out.studioScriptKeys = studioRaw.scripts ? Object.keys(studioRaw.scripts) : [];
        out.studioLastScriptChapter = studioRaw.lastScriptChapter || null;
      }

      // Did the project snapshot land?
      const snapKey = 'justwrite:project:' + (activeId || '');
      const snap2 = parse(await getKey(snapKey));
      if (snap2) {
        out.snapChapters = (snap2.parts || []).flatMap(p => (p.chapters || []).map(c => c.id)).slice(0, 20);
      }

      const ui = parse(await getKey('justwrite:ui'));
      out.uiThemePreset = ui?.themePreset || ui?.appearancePreset || ui?.preset || null;

      cb(out);
    } catch (e) {
      cb({ error: String(e), stack: e.stack });
    }
  })();
`;

async function main() {
  const driver = spawn("tauri-driver", ["--native-driver", EDGE_DRV, "--port", "4444"], { stdio: ["ignore","inherit","inherit"], shell: true });
  process.on("exit", () => { if (driver && !driver.killed) driver.kill(); });
  process.on("SIGINT", () => { driver?.kill(); process.exit(130); });
  await waitForDriver();
  const sid = await newSession();
  await new Promise(r => setTimeout(r, 4500));
  await http("POST", `/session/${sid}/timeouts`, { script: 30000 });
  try {
    const result = await executeAsync(sid, PROBE, []);
    console.log(JSON.stringify(result, null, 2));
  } finally { await endSession(sid); driver.kill(); }
}
main().catch(e => { console.error("FAIL:", e.message); process.exit(1); });
