// SPDX-License-Identifier: MIT
// The packaged app, started as a user starts it on a fresh data folder, must load its window's page
// (the shell's "[shell] window loaded") and answer on its own port with its own version — the release run's check on every runner, before anything is attached (the
// macOS and Linux builds are never opened by hand; just-house-paint RESEARCH §12). Run after
// `quasar build -m electron` (dist/electron/Packaged/<platform>-unpacked); on Linux under a display
// (`xvfb-run -a node scripts/start-packaged.js` — the release workflow does).
// The port and the data folder's variable are read from src-electron/electron-main.js (runDesktopApp's
// `port` and `dataDirEnv`), the version from package.json. Paths given as arguments are asked after
// /v1/health answers and must answer 2xx too — an app's own checks (just-house-paint: the part finder's
// engine — the kit's ONNX runtime — runs here, `node scripts/start-packaged.js v1/ai/runtimes/onnx/engine/check`;
// written without the leading slash, which Git Bash on Windows turns into a file path). `--appimage` (Linux)
// runs the .AppImage file itself with no flags, as a user opens it — the sandbox and FUSE as they are on
// that machine — instead of the unpacked folder. `--headless` starts the server on its own through the
// app's launcher instead (build/launcher: `<name>-server.cmd` beside the Windows exe, `<name>-server`
// beside the Linux one and in the Mac app's Resources; with `--appimage`, the AppImage extracted as its
// help says) — no window, no display: it must answer with its version and serve the UI at `/`.
// `--default-data` names no data folder: the app's own default is used and printed ("data folder
// used: …"), and on macOS and Linux it must lie outside the app (the release compares the window's
// and the launcher's). `--data-dir <folder>` starts it on that data folder — your real one (the checkout's data/, which
// `npm run dev` and `npm run server` use): the acceptance start on real data, which writes no test data and NEVER
// removes the folder (docgen's ask, 2026-10-29; stop the app on that folder first — one server per data folder).
// The build is started from a copy in the system's temp folder, never inside the checkout:
// there Node's package lookup walks up out of app.asar into the repo's own node_modules and finds a package the
// build left out — JustWrite's server lacked a package on every installed computer, and only the AppImage (mounted
// under /tmp) failed the check (2026-10-20). Exit 0 = it answered; 1 = it didn't.
import { spawn, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync } from "node:fs";
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
// a data folder named: started on it, never removed (`--data-dir <folder>`)
const dataDirAt = process.argv.indexOf("--data-dir");
const givenData = dataDirAt > 0 ? path.resolve(process.argv[dataDirAt + 1] || "") : null;
if (givenData && !existsSync(givenData)) throw new Error(`--data-dir ${givenData}: no such folder`);
// the headless launcher is named for the server package (build/launcher: `<server package>.cmd`) — the root's name
// isn't always its stem (docgen: just_ai_i18n_docgen / just-ai-i18n-docgen-server)
const launcherName = JSON.parse(readFileSync(path.join(root, "server", "package.json"), "utf8")).name;
const extraPaths = process.argv
  .slice(2)
  .filter((a, i, all) => !a.startsWith("--") && all[i - 1] !== "--data-dir")
  .map((a) => `/${a.replace(/^\/+/, "")}`);

/** electron-builder's unpacked folder for this platform, by name (`mac-arm64`, `win-unpacked`, `linux-unpacked`). */
function unpackedName(dir = out, platform = process.platform) {
  const sub = readdirSync(dir).find((d) => (platform === "darwin" ? /^mac/.test(d) : d === `${platform === "win32" ? "win" : "linux"}-unpacked`));
  if (!sub) throw new Error(`no unpacked ${platform} build in ${dir}`);
  return sub;
}

/** The unpacked build copied into `into` (a temp folder), as it is — a Mac app's framework links kept links
 *  (Node's verbatimSymlinks) — so it runs with nothing of the checkout above it. Returns `into`, its real path (a
 *  Windows runner's temp folder is an 8.3 short name, RUNNER~1, that the app reports long). */
function copyUnpacked(into) {
  const sub = unpackedName();
  cpSync(path.join(out, sub), path.join(into, sub), { recursive: true, verbatimSymlinks: true });
  return realpathSync.native(into);
}

/** A data folder inside the copy, said where it is in the build itself (each start runs its own copy, and Windows'
 *  and the unpacked Linux build's default is beside the executable), and one inside the start's own home folder
 *  said under "~": the window's and the launcher's compare. */
function inBuild(dir, copy, home) {
  let real = dir;
  try {
    real = realpathSync.native(dir);
  } catch {
    // not there (any more): compared as the app named it
  }
  const under = (root) => {
    if (!root) return null;
    const rel = path.relative(root, real);
    return rel && !rel.startsWith("..") && !path.isAbsolute(rel) ? rel : null;
  };
  const inCopy = under(copy);
  if (inCopy) return path.join(out, inCopy);
  const inHome = under(home);
  return inHome ? `~/${inHome.split(path.sep).join("/")}` : dir;
}

/** The packaged app's own executable in electron-builder's unpacked folder for this platform. */
function findExecutable(dir = out, platform = process.platform) {
  const at = path.join(dir, unpackedName(dir, platform));
  if (platform === "darwin") {
    const app = readdirSync(at).find((f) => f.endsWith(".app"));
    if (!app) throw new Error(`no .app in ${at}`);
    return path.join(at, app, "Contents", "MacOS", app.slice(0, -4));
  }
  if (platform === "win32") {
    // the .exe the app's own headless launcher runs (build/launcher/<server package>.cmd names it) — never another
    // program the build ships beside it: "the first .exe" started JustVoice's audiocpp_dsp.exe in its release dry run
    // and waited 120 s for an app that never ran (2026-11-10)
    const cmd = path.join(root, "build", "launcher", `${launcherName}.cmd`);
    const named = readFileSync(cmd, "utf8").match(/%~dp0([^"\\\s]+\.exe)/i)?.[1];
    if (!named) throw new Error(`${cmd} names no .exe`);
    if (!existsSync(path.join(at, named))) throw new Error(`no ${named} in ${at}`);
    return path.join(at, named);
  }
  // Linux: the executable the launcher's shell script runs — `$here/<its own name without "-server">` — when the build
  // has it; otherwise the one executable file that isn't Chromium's helpers, a library or a script (the launcher)
  const own = path.join(at, launcherName.replace(/-server$/, ""));
  if (existsSync(own) && statSync(own).isFile()) return own;
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

/** The headless launcher to start: the unpacked build's (its copy in `copy`), or the AppImage's after
 *  `--appimage-extract` into `scratch` (as the help tells a Linux user). */
function headlessLauncher(appImage, scratch, copy) {
  if (!appImage) return findLauncher(copy);
  const r = spawnSync(path.join(out, appImage), ["--appimage-extract"], { cwd: scratch, stdio: "ignore" });
  if (r.status !== 0) throw new Error(`the AppImage didn't extract (exit ${r.status ?? r.error?.code})`);
  return findLauncher(path.join(scratch, "squashfs-root"));
}

async function run() {
  if (await health()) throw new Error(`something already answers on port ${port} — stop it first`);
  // every temp folder made before the start's own try/finally is removed if a step before it fails (a missing
  // launcher, a copy that fails) — it was left behind (the eighteenth review)
  const made = [];
  const temp = (prefix) => {
    const dir = mkdtempSync(path.join(os.tmpdir(), prefix));
    made.push(dir);
    return dir;
  };
  try {
    return await started(temp);
  } catch (e) {
    // each folder alone, and the start's own failure kept: a folder still held (EPERM) replaced the real reason
    for (const dir of made) {
      try {
        rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
      } catch (gone) {
        console.warn(`the folder ${dir} stays (${gone.code || gone.message})`);
      }
    }
    throw e;
  }
}

/** The start itself: `temp(prefix)` makes a temp folder the caller removes should this throw before its own cleanup. */
async function started(temp) {
  const appImage = asUser ? readdirSync(out).find((f) => f.endsWith(".AppImage")) : null;
  if (asUser && !appImage) throw new Error(`no .AppImage in ${out}`);
  const dataDir = givenData ?? (defaultData ? null : temp("start-packaged-"));
  // the app's own default on macOS and Linux is under the home folder (Application Support, ~/.local/share): the
  // start gets a home of its own in the temp folder, so a check run on a developer's computer never touches their
  // real data folder (Windows' default is beside the executable — in the copy)
  const home = defaultData && process.platform !== "win32" ? realpathSync.native(temp("start-packaged-home-")) : null;
  const scratch = headless && appImage ? temp("start-packaged-appimage-") : null;
  // the unpacked build runs from a copy outside the checkout (the AppImage mounts or extracts outside it already)
  const copy = appImage ? null : copyUnpacked(temp("start-packaged-app-"));
  const exe = headless ? headlessLauncher(appImage, scratch, copy) : appImage ? path.join(out, appImage) : findExecutable(copy);
  // the unpacked folder on Linux: chrome-sandbox isn't setuid there, so Chromium's sandbox can't start;
  // the AppImage runs exactly as a user's double-click runs it; the launcher takes the server's own command
  const args = headless ? ["serve"] : process.platform === "linux" && !appImage ? ["--no-sandbox"] : [];
  console.log(`starting ${exe}${headless ? " serve" : ""} (data folder ${dataDir ?? "its own default"}, port ${port})`);
  const t0 = Date.now();
  const env = { ...process.env };
  if (dataDir) env[dataDirEnv] = dataDir;
  else delete env[dataDirEnv];
  if (home) {
    env.HOME = home;
    delete env.XDG_DATA_HOME;
  }
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
          console.log(`data folder used: ${inBuild(h.dataDir, copy, home)}`);
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
          // what the kit's engines say of this runner (an app with none answers 404 — nothing to say): read inside
          // the packaged server, the system versions they go by (the AppImage's glibc — the thirteenth review). The
          // kit's runtimes route since the engines moved into the kit (house-paint 8b6b0da, 2026-10-28; this copy asked
          // house-paint's old /v1/aiphoto and /v1/segment status until 2026-11-10)
          const rts = await fetch(`http://127.0.0.1:${port}/v1/ai/runtimes`, { signal: AbortSignal.timeout(30_000) }).catch(() => null);
          if (rts?.ok) {
            for (const j of (await rts.json()).runtimes || []) {
              console.log(`${j.id} status: ${JSON.stringify({ installed: j.installed, platform: j.platform, gpu: j.gpu, need: j.need })}`);
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
    // the folders this start made — never a data folder it was given
    for (const dir of [dataDir === givenData ? null : dataDir, scratch, copy, home].filter(Boolean)) {
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
