// Focused re-capture for Studio → Cast and Studio → Script using the user's
// real autosave bundle (the tauri-driver-launched binary boots into a fresh
// webview profile, so we inject the user's persisted snapshot + workspace
// keys into IDB before screenshotting).
//
// Source of truth on disk: %APPDATA%\com.justwrite.app\projects\<id>.autosave.json
// — the *.autosave.json file with the most cast assignments + scripts is the
// user's real project; the others are scratch.

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_BIN  = path.resolve(__dirname, "../src-tauri/target/release/justwrite.exe");
const EDGE_DRV = path.resolve(__dirname, "./drivers/msedgedriver.exe");
const OUT_DIR  = path.resolve(__dirname, "../../justwrite-website/public/screenshots");

const AUTOSAVE_PATH = path.join(
  process.env.APPDATA,
  "com.justwrite.app",
  "projects",
  "prj_mq0cm6wt_tu87.autosave.json",
);
const PROJECT_ID = "prj_mq0cm6wt_tu87";

const SCRIPT_CHAPTER = "ch2";
const THEME_PRESET = "fine-press";

const TARGETS = [
  { name: "studio",        hash: "#/studio",        wait: 4000 },
  { name: "studio-script", hash: "#/studio/script", wait: 4000 },
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
    try { const r = await fetch(BASE + "/status"); if (r.ok) return; } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("tauri-driver didn't come up on :4444");
}

async function newSession() {
  const v = await http("POST", "/session", {
    capabilities: { alwaysMatch: { "tauri:options": { application: APP_BIN } } },
  });
  return v.sessionId;
}
async function endSession(sid) { try { await http("DELETE", `/session/${sid}`); } catch {} }
async function maximize(sid) { try { await http("POST", `/session/${sid}/window/maximize`, {}); } catch {} }
async function execute(sid, script, args = []) { return http("POST", `/session/${sid}/execute/sync`, { script, args }); }
async function executeAsync(sid, script, args = []) { return http("POST", `/session/${sid}/execute/async`, { script, args }); }
async function screenshot(sid, file) {
  const v = await http("GET", `/session/${sid}/screenshot`);
  fs.writeFileSync(file, Buffer.from(v, "base64"));
}

// Injects autosave bundle into IDB. `payload` is the parsed autosave JSON,
// `projectId` is the id to register under, `theme` is the appearance preset
// to force (overrides whatever was in `_workspace.justwrite:ui`), and
// `scriptChapter` is the chapter id to set as lastScriptChapter in studio.
const INJECT_AND_RELOAD = `
  const cb = arguments[arguments.length - 1];
  const payload = arguments[0];
  const projectId = arguments[1];
  const theme = arguments[2];
  const scriptChapter = arguments[3];
  (async () => {
    try {
      const dbReq = indexedDB.open('justwrite');
      const db = await new Promise((res, rej) => {
        dbReq.onsuccess = () => res(dbReq.result);
        dbReq.onerror = () => rej(dbReq.error);
        dbReq.onupgradeneeded = () => {
          dbReq.result.createObjectStore('kv');
        };
      });
      const tx = db.transaction('kv', 'readwrite');
      const store = tx.objectStore('kv');
      const put = (k, v) => new Promise((res, rej) => {
        const r = store.put(v, k);
        r.onsuccess = () => res();
        r.onerror = () => rej(r.error);
      });

      // Split snapshot from workspace bundle.
      const { _workspace, savedAt, ...snap } = payload;

      // Write the project snapshot under the multi-project key.
      await put('justwrite:project:' + projectId, JSON.stringify(snap));

      // Registry + active pointer.
      const entry = {
        id: projectId,
        title:  snap.project?.title  || 'Untitled',
        author: snap.project?.author || '',
        savedAt: savedAt || new Date().toISOString(),
      };
      await put('justwrite:projects:registry', JSON.stringify([entry]));
      await put('justwrite:projects:active', JSON.stringify(projectId));

      // Workspace bundle (justwrite:studio, justwrite:ui, justwrite:ai, …)
      if (_workspace && typeof _workspace === 'object') {
        for (const [k, v] of Object.entries(_workspace)) {
          if (typeof v === 'string') await put(k, v);
        }
      }

      // Force appearance preset by patching justwrite:ui.appearance.
      const uiRaw = _workspace?.['justwrite:ui'];
      let ui = {};
      try { ui = uiRaw ? JSON.parse(uiRaw) : {}; } catch { ui = {}; }
      ui.appearance = { ...(ui.appearance || {}), preset: theme };
      await put('justwrite:ui', JSON.stringify(ui));

      // Pin Script tab to the requested chapter.
      const studioRaw = _workspace?.['justwrite:studio'];
      let studio = {};
      try { studio = studioRaw ? JSON.parse(studioRaw) : {}; } catch { studio = {}; }
      studio.lastScriptChapter = scriptChapter;
      await put('justwrite:studio', JSON.stringify(studio));

      await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); });

      // Verify the studio write went through.
      const rtx = db.transaction('kv', 'readonly');
      const rstore = rtx.objectStore('kv');
      const studioBack = await new Promise((res, rej) => {
        const r = rstore.get('justwrite:studio');
        r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
      });
      let parsed = null;
      try { parsed = JSON.parse(studioBack); } catch {}
      cb({ ok: true, verifyLastScriptChapter: parsed?.lastScriptChapter || null, verifyScripts: parsed?.scripts ? Object.keys(parsed.scripts) : [], verifyVoices: parsed?.voices?.length });

      // Reload after the response is sent.
      setTimeout(() => window.location.reload(), 50);
    } catch (e) {
      cb({ ok: false, error: String(e), stack: e.stack });
    }
  })();
`;

async function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  if (!fs.existsSync(AUTOSAVE_PATH)) {
    throw new Error(`Autosave not found: ${AUTOSAVE_PATH}`);
  }
  console.log(`→ loading autosave ${path.basename(AUTOSAVE_PATH)} (${(fs.statSync(AUTOSAVE_PATH).size/1024).toFixed(0)} KB)`);
  const payload = JSON.parse(fs.readFileSync(AUTOSAVE_PATH, "utf8"));

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

  console.log("→ creating session");
  const sid = await newSession();
  await maximize(sid);
  await new Promise((r) => setTimeout(r, 4000));

  // Allow up to 60s for the inject script (470KB payload).
  await http("POST", `/session/${sid}/timeouts`, { script: 60000 });

  try {
    console.log(`→ injecting bundle (${PROJECT_ID}), theme=${THEME_PRESET}, script-tab=${SCRIPT_CHAPTER}`);
    const res = await executeAsync(sid, INJECT_AND_RELOAD, [payload, PROJECT_ID, THEME_PRESET, SCRIPT_CHAPTER]);
    if (!res?.ok) throw new Error(`inject failed: ${res?.error}\n${res?.stack || ""}`);
    console.log(`   verified IDB: lastScriptChapter=${res.verifyLastScriptChapter} scripts=[${res.verifyScripts?.join(',')}] voices=${res.verifyVoices}`);
    // Wait for the post-inject reload to settle and the bootStorage cache to refill.
    await new Promise((r) => setTimeout(r, 5000));

    // Directly mutate the Pinia studio store's lastScriptChapter — the
    // hydration path doesn't reliably preserve it post-reload (something in
    // the boot sequence clobbers it back to null even though IDB has 'ch2').
    const pin = await executeAsync(sid, `
      const cb = arguments[arguments.length - 1];
      try {
        const app = document.querySelector('#app');
        const pinia = app?.__vue_app__?.config?.globalProperties?.$pinia;
        const studio = pinia?._s?.get('studio');
        if (!studio) { cb({ ok:false, why:'no studio store' }); return; }
        studio.lastScriptChapter = ${JSON.stringify(SCRIPT_CHAPTER)};
        cb({ ok:true, set: studio.lastScriptChapter });
      } catch (e) { cb({ ok:false, error: String(e) }); }
    `, []);
    console.log(`   pin studio.lastScriptChapter → ${JSON.stringify(pin)}`);

    const pinScriptChapter = async () => {
      const r = await executeAsync(sid, `
        const cb = arguments[arguments.length - 1];
        try {
          const studio = document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia?._s?.get('studio');
          if (!studio) { cb({ ok:false, why:'no studio' }); return; }
          studio.lastScriptChapter = ${JSON.stringify(SCRIPT_CHAPTER)};
          cb({ ok:true, set: studio.lastScriptChapter });
        } catch (e) { cb({ ok:false, error: String(e) }); }
      `, []);
      return r;
    };

    // Cast tab.
    console.log(`→ studio (#/studio)`);
    await execute(sid, "window.location.hash = arguments[0];", ["#/studio"]);
    await new Promise((r) => setTimeout(r, 4000));
    let castFile = path.join(OUT_DIR, "studio.png");
    await screenshot(sid, castFile);
    console.log(`   saved ${path.basename(castFile)}`);

    // Force StudioView to unmount so pickInitialScriptChapter can re-run
    // after we re-pin lastScriptChapter (the Cast-tab mount triggers
    // refreshVoices → mergeVoices → save(), which writes the current state
    // — lastScriptChapter is null at that point — back over our value).
    console.log(`→ remounting StudioView via / detour`);
    await execute(sid, "window.location.hash = '#/';", []);
    await new Promise((r) => setTimeout(r, 1500));
    const pinAfter = await pinScriptChapter();
    console.log(`   pin studio.lastScriptChapter → ${JSON.stringify(pinAfter)}`);

    // Script tab.
    console.log(`→ studio-script (#/studio/script)`);
    await execute(sid, "window.location.hash = arguments[0];", ["#/studio/script"]);
    await new Promise((r) => setTimeout(r, 4500));

    // If the dropdown didn't land on Ch.2, drive it via the W3C Actions API
    // (real synthesized input events the Reka headless components accept).
    const labelNow = await execute(sid, `
      return (document.querySelector('[role="tabpanel"][aria-label="Script"] [role="combobox"]')?.textContent || '').trim();
    `, []);
    console.log(`   dropdown shows: "${labelNow}"`);
    if (!labelNow.startsWith("Ch. 2")) {
      // Find trigger element id, get its rect, then perform actions:
      // pointer move + click → open. Then 5 × ArrowUp + Enter to select Ch.2.
      const rect = await execute(sid, `
        const el = document.querySelector('[role="tabpanel"][aria-label="Script"] [role="combobox"]');
        if (!el) return null;
        const r = el.getBoundingClientRect();
        el.focus();
        return { x: Math.round(r.left + r.width/2), y: Math.round(r.top + r.height/2) };
      `, []);
      if (rect) {
        // Open dropdown by clicking trigger via real input events.
        await http("POST", `/session/${sid}/actions`, {
          actions: [
            {
              type: "pointer", id: "mouse", parameters: { pointerType: "mouse" },
              actions: [
                { type: "pointerMove", duration: 0, x: rect.x, y: rect.y },
                { type: "pointerDown", button: 0 },
                { type: "pause", duration: 30 },
                { type: "pointerUp", button: 0 },
              ],
            },
          ],
        });
        await new Promise((r) => setTimeout(r, 500));

        // Use ArrowUp 5 times to get from Ch.7 → Ch.2, then Enter.
        // Ch.7 is selected by default (current value); ArrowUp moves to Ch.6, etc.
        const keyActions = [];
        for (let i = 0; i < 5; i++) {
          keyActions.push({ type: "keyDown", value: "" }); // ArrowUp
          keyActions.push({ type: "keyUp",   value: "" });
          keyActions.push({ type: "pause", duration: 60 });
        }
        keyActions.push({ type: "keyDown", value: "" }); // Enter
        keyActions.push({ type: "keyUp",   value: "" });
        await http("POST", `/session/${sid}/actions`, {
          actions: [{ type: "key", id: "kbd", actions: keyActions }],
        });
        await new Promise((r) => setTimeout(r, 800));
        const labelAfter = await execute(sid, `
          return (document.querySelector('[role="tabpanel"][aria-label="Script"] [role="combobox"]')?.textContent || '').trim();
        `, []);
        console.log(`   after actions: "${labelAfter}"`);
      }
    }

    let scriptFile = path.join(OUT_DIR, "studio-script.png");
    await screenshot(sid, scriptFile);
    console.log(`   saved ${path.basename(scriptFile)}`);
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
