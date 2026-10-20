// SPDX-License-Identifier: MIT
// The packaged app, started as a user starts it on a fresh data folder, must load its window's page
// (the shell's "[shell] window loaded") and answer on its own port with its own version — the release run's check on every runner, before anything is attached (the
// macOS and Linux builds are never opened by hand; just-house-paint RESEARCH §12). Run after
// `quasar build -m electron` (dist/electron/Packaged/<platform>-unpacked); on Linux under a display
// (`xvfb-run -a node scripts/start-packaged.js` — the release workflow does).
// The port and the data folder's variable are read from src-electron/electron-main.js (runDesktopApp's
// `port` and `dataDirEnv`), the version from package.json. Paths given as arguments are asked after
// /v1/health answers and must answer 2xx too — an app's own checks (just-house-paint: its part
// finder's runtime loads, `node scripts/start-packaged.js v1/segment/runtime`; written without the
// leading slash, which Git Bash on Windows turns into a file path). `--appimage` (Linux)
// runs the .AppImage file itself with no flags, as a user opens it — the sandbox and FUSE as they are on
// that machine — instead of the unpacked folder. `--headless` starts the server on its own through the
// app's launcher instead (build/launcher: `<name>-server.cmd` beside the Windows exe, `<name>-server`
// beside the Linux one and in the Mac app's Resources; with `--appimage`, the AppImage extracted as its
// help says) — no window, no display: it must answer with its version and serve the UI at `/`.
// `--default-data` names no data folder: the app's own default is used and printed ("data folder
// used: …"), and on macOS and Linux it must lie outside the app (the release compares the window's
// and the launcher's). Exit 0 = it answered; 1 = it didn't.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const main = readFileSync(path.join(root, "src-electron", "electron-main.js"), "utf8");
const port = Number(main.match(/\bport:\s*(\d+)/)?.[1]);
const dataDirEnv = main.match(/\bdataDirEnv:\s*"([A-Z0-9_]+)"/)?.[1];
if (!port || !dataDirEnv) throw new Error("src-electron/electron-main.js names no `port` or `dataDirEnv`");
const out = path.join(root, "dist", "electron", "Packaged");
const TIMEOUT_MS = 120_000;
const asUser = process.argv.includes("--appimage");
const headless = process.argv.includes("--headless");
// no data folder named: the app's own default, which the health answer names (printed as "data folder used:"),
// never inside a Mac app's bundle or an AppImage's folder (the kit's data_paths bundledInstall)
const defaultData = process.argv.includes("--default-data");
const launcherName = `${pkg.name}-server`;
const extraPaths = process.argv
  .slice(2)
  .filter((a) => !a.startsWith("--"))
  .map((a) => `/${a.replace(/^\/+/, "")}`);

/** The packaged app's own executable in electron-builder's unpacked folder for this platform. */
function findExecutable(dir = out, platform = process.platform) {
  const sub = readdirSync(dir).find((d) => (platform === "darwin" ? /^mac/.test(d) : d === `${platform === "win32" ? "win" : "linux"}-unpacked`));
  if (!sub) throw new Error(`no unpacked ${platform} build in ${dir}`);
  const at = path.join(dir, sub);
  if (platform === "darwin") {
    const app = readdirSync(at).find((f) => f.endsWith(".app"));
    if (!app) throw new Error(`no .app in ${at}`);
    return path.join(at, app, "Contents", "MacOS", app.slice(0, -4));
  }
  if (platform === "win32") {
    const exe = readdirSync(at).find((f) => f.endsWith(".exe") && !/^uninstall/i.test(f));
    if (!exe) throw new Error(`no .exe in ${at}`);
    return path.join(at, exe);
  }
  // Linux: the one executable file that isn't Chromium's helpers, a library or a script (the headless launcher)
  const helpers = new Set(["chrome-sandbox", "chrome_crashpad_handler"]);
  const isScript = (f) => readFileSync(path.join(at, f)).subarray(0, 2).toString() === "#!";
  const exe = readdirSync(at).find((f) => !helpers.has(f) && !f.includes(".") && statSync(path.join(at, f)).isFile() && statSync(path.join(at, f)).mode & 0o111 && !isScript(f));
  if (!exe) throw new Error(`no executable in ${at}`);
  return path.join(at, exe);
}

/** The headless launcher of the unpacked build for this platform (`dir`: the build's folder, or an extracted
 *  AppImage's squashfs-root). */
function findLauncher(dir = out, platform = process.platform) {
  let file;
  if (platform === "darwin") file = path.join(path.dirname(findExecutable(dir, platform)), "..", "Resources", launcherName);
  else if (path.basename(dir) === "squashfs-root") file = path.join(dir, launcherName);
  else file = path.join(path.dirname(findExecutable(dir, platform)), platform === "win32" ? `${launcherName}.cmd` : launcherName);
  if (!existsSync(file)) throw new Error(`no headless launcher at ${file}`);
  return file;
}

async function health() {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/v1/health`, { signal: AbortSignal.timeout(2000) });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

function stop(child) {
  if (child.exitCode != null) return;
  if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  else {
    try {
      process.kill(-child.pid, "SIGKILL"); // its whole group: the window, the server, their helpers
    } catch {
      child.kill("SIGKILL");
    }
  }
}

/** The headless launcher to start: the unpacked build's, or the AppImage's after `--appimage-extract` into
 *  `scratch` (as the help tells a Linux user). */
function headlessLauncher(appImage, scratch) {
  if (!appImage) return findLauncher();
  const r = spawnSync(path.join(out, appImage), ["--appimage-extract"], { cwd: scratch, stdio: "ignore" });
  if (r.status !== 0) throw new Error(`the AppImage didn't extract (exit ${r.status ?? r.error?.code})`);
  return findLauncher(path.join(scratch, "squashfs-root"));
}

async function run() {
  if (await health()) throw new Error(`something already answers on port ${port} — stop it first`);
  const appImage = asUser ? readdirSync(out).find((f) => f.endsWith(".AppImage")) : null;
  if (asUser && !appImage) throw new Error(`no .AppImage in ${out}`);
  const dataDir = defaultData ? null : mkdtempSync(path.join(os.tmpdir(), "start-packaged-"));
  const scratch = headless && appImage ? mkdtempSync(path.join(os.tmpdir(), "start-packaged-appimage-")) : null;
  const exe = headless ? headlessLauncher(appImage, scratch) : appImage ? path.join(out, appImage) : findExecutable();
  // the unpacked folder on Linux: chrome-sandbox isn't setuid there, so Chromium's sandbox can't start;
  // the AppImage runs exactly as a user's double-click runs it; the launcher takes the server's own command
  const args = headless ? ["serve"] : process.platform === "linux" && !appImage ? ["--no-sandbox"] : [];
  console.log(`starting ${exe}${headless ? " serve" : ""} (data folder ${dataDir ?? "its own default"}, port ${port})`);
  const t0 = Date.now();
  const env = { ...process.env };
  if (dataDir) env[dataDirEnv] = dataDir;
  else delete env[dataDirEnv];
  // started from the temp folder, not the checkout: the server's UI fallback (a dist/spa beside the working
  // folder) must not stand in for the packaged UI
  const options = { env, cwd: os.tmpdir(), stdio: ["ignore", "pipe", "inherit"], detached: process.platform !== "win32" };
  // a .cmd runs only through the shell on Windows (Node refuses to spawn it directly): one command line
  const child = headless && process.platform === "win32" ? spawn(`"${exe}" ${args.join(" ")}`, { ...options, shell: true }) : spawn(exe, args, options);
  // the shell says when its window drew the app, or why it didn't (the kit's runDesktopApp) — read as one
  // running text, so a line split across two reads still counts
  let windowLoaded = false;
  let windowFailed = null;
  let seen = "";
  child.stdout.on("data", (chunk) => {
    process.stdout.write(chunk);
    seen = (seen + String(chunk)).slice(-4000);
    if (seen.includes("[shell] window loaded")) windowLoaded = true;
    const failed = seen.match(/\[shell\] window failed: ([^\r\n]*)/);
    if (failed) windowFailed = failed[1];
  });
  let exited = null;
  child.on("exit", (code, signal) => {
    exited = { code, signal };
  });
  child.on("error", (e) => {
    exited = { code: e.code || e.message, signal: null }; // it couldn't be started at all
  });
  let answered = false;
  try {
    for (;;) {
      if (exited) throw new Error(`the app quit before ${answered ? "its window drew" : "it answered"} (exit ${exited.code ?? exited.signal})`);
      if (windowFailed) throw new Error(`its window didn't draw: ${windowFailed}`);
      const h = await health();
      if (h) answered = true;
      if (h && (windowLoaded || headless)) {
        if (h.version !== pkg.version) throw new Error(`it answered as version ${h.version}, not ${pkg.version}`);
        console.log(`it answered in ${((Date.now() - t0) / 1000).toFixed(1)} s: ${h.product} ${h.version}`);
        if (defaultData) {
          if (!h.dataDir) throw new Error("its health answer names no data folder (--default-data needs one)");
          // never inside a bundle — a Mac app, the AppImage's mount or its extracted folder, which an update replaces
          // whole; Windows' and the unpacked Linux build's are beside the executable by design (the kit's data_paths)
          const bundle = exe.includes(".app/Contents/") || asUser;
          const app = exe.includes(".app/Contents/") ? exe.slice(0, exe.indexOf(".app/Contents/") + 4) : path.dirname(exe);
          const rel = path.relative(app, h.dataDir);
          if (bundle && (!rel.startsWith("..") || /\/\.mount_/.test(h.dataDir))) throw new Error(`its data folder ${h.dataDir} is inside the app (${app})`);
          console.log(`data folder used: ${h.dataDir}`);
        }
        if (headless) {
          // the whole app with no window: the server serves its UI too
          const page = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(10_000) });
          if (!page.ok || !/text\/html/.test(page.headers.get("content-type") || "")) throw new Error(`/ answered ${page.status} ${page.headers.get("content-type")}, not the app's page`);
          // and the page's own script — a blank page answers 200 too
          const src = (await page.text()).match(/<script[^>]+src="([^"]+)"/)?.[1];
          if (!src) throw new Error("/ has no script: not the app's page");
          const script = await fetch(new URL(src, `http://127.0.0.1:${port}/`), { signal: AbortSignal.timeout(10_000) });
          if (!script.ok || !/javascript/.test(script.headers.get("content-type") || "")) throw new Error(`the page's script ${src} answered ${script.status} ${script.headers.get("content-type")}`);
          console.log(`/: ${page.status} ${page.headers.get("content-type")}; its script ${script.status}`);
          // what the app's own engines say of this runner (an app with none answers 404 — nothing to say): read inside
          // the packaged server, the system versions they go by (the AppImage's glibc — the thirteenth review)
          for (const engine of ["aiphoto", "segment"]) {
            const st = await fetch(`http://127.0.0.1:${port}/v1/${engine}/status`, { signal: AbortSignal.timeout(10_000) }).catch(() => null);
            if (st?.ok) {
              const j = await st.json();
              console.log(`${engine} status: ${JSON.stringify({ available: j.available, backend: j.backend, need: j.need, runtime: j.runtime })}`);
            }
          }
        }
        for (const p of extraPaths) {
          const r = await fetch(`http://127.0.0.1:${port}${p}`, { signal: AbortSignal.timeout(60_000) });
          const body = await r.text();
          if (!r.ok) throw new Error(`${p} answered ${r.status}: ${body.slice(0, 400)}`);
          console.log(`${p}: ${r.status} ${body.slice(0, 200)}`);
        }
        return;
      }
      if (Date.now() - t0 > TIMEOUT_MS) throw new Error(h ? `the server answered, but the window never loaded its page in ${TIMEOUT_MS / 1000} s` : `no answer on port ${port} in ${TIMEOUT_MS / 1000} s`);
      await new Promise((r) => setTimeout(r, 500));
    }
  } finally {
    stop(child);
    await new Promise((r) => setTimeout(r, 1500)); // let the files go before the folder is removed
    for (const dir of [dataDir, scratch].filter(Boolean)) {
      try {
        rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
      } catch (e) {
        console.warn(`the folder ${dir} stays (${e.code || e.message})`); // the check's answer stands
      }
    }
  }
}

run().catch((e) => {
  console.error(`the packaged app didn't start: ${e.message}`);
  process.exit(1);
});
