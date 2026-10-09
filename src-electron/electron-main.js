// SPDX-License-Identifier: MIT
// The desktop app — the kit's shared Electron main module with this app's settings. Everything
// the shell does — the data folder, the window from app://, the tray, the dialogs, the server's
// life — is the kit's `runDesktopApp`; this file only says which app it is. No logic lives here.
// Quasar builds this file (its Electron mode, app-structure §Q.2) and runs it in Electron's main
// process; it replaced electron/main.js with the Quasar move (2026-10-08).
import path from "node:path";
import { runDesktopApp } from "@delebash/llm-runner/shell";
import { resolveElectronAssetsPath } from "#q-app/electron/main";

const here = import.meta.dirname;
const dev = Boolean(import.meta.env.QUASAR_DEV);

runDesktopApp({
  // The window's origin is app://justwrite — the server's CSRF guard and CORS allow it
  // (server/src/app.js DESKTOP_ORIGIN).
  id: "justwrite",
  // The data folder's name under the OS fallback (%LOCALAPPDATA%\<name>\<name>) — the same
  // name the server's data_paths ladder uses (server/src/paths.js APP_NAME).
  appName: "JustWrite",
  productName: "JustWrite",
  port: 17495, // the family port registry: this app 17495 · JV 17494 · docgen 8742 · template 17490
  // the server package (server/): its source in development, the installed copy when packaged
  serverEntry: dev ? path.resolve("server", "src", "serve.js") : path.join(here, "node_modules", "justwrite-server", "src", "serve.js"),
  dataDirEnv: "JUSTWRITE_DATA_DIR",
  repoRoot: dev ? path.resolve(".") : null, // development: the data root is <repo>/data
  distDir: here, // Quasar puts the built renderer beside this file
  devUrl: import.meta.env.QUASAR_APP_URL,
  preload: path.join(here, "electron-preload.cjs"),
  window: {
    title: "JustWrite",
    width: 1440,
    height: 900,
    minWidth: 1000,
    minHeight: 640,
    backgroundColor: "#fafaf7",
  },
  icon: resolveElectronAssetsPath(process.platform === "win32" ? "icons/icon.ico" : "icons/icon.png"),
  trayIcon: resolveElectronAssetsPath("icons/tray.png"),
  logFile: path.join("logs", "justwrite.log"),
  // Closing waits this long first, so the page's `pagehide` autosave reaches the server
  // before it stops (study §4.2; the Tauri shell held the window the same 400 ms).
  closeHoldMs: 400,
  // A manuscript can hold an image pasted from the web (an <img> with an https: source); the
  // Tauri window had no CSP and showed it, so this window keeps showing it (2026-10-08).
  cspAdd: { "img-src": ["https:"] },
});
