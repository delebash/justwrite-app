// SPDX-License-Identifier: MIT
// The desktop app — the kit's shared Electron main module with this app's settings (the
// family's move to Electron, 2026-10-08; it replaced src-tauri/). Everything the shell does
// — the data folder, the window from app://, the tray, the dialogs, the server's life — is
// the kit's `runDesktopApp`; this file only says which app it is. No logic lives here.

import path from "node:path";
import { runDesktopApp } from "@delebash/llm-runner/shell";

const root = path.resolve(import.meta.dirname, "..");

runDesktopApp({
  // The window's origin is app://justwrite — the server's CSRF guard and CORS allow it
  // (server/src/app.js DESKTOP_ORIGIN).
  id: "justwrite",
  // The data folder's name under the OS fallback (%LOCALAPPDATA%\<name>\<name>) — the same
  // name the server's data_paths ladder uses (server/src/paths.js APP_NAME).
  appName: "JustWrite",
  productName: "JustWrite",
  port: 17495, // the family port registry: this app 17495 · JV 17494 · docgen 8742
  serverEntry: path.join(root, "server", "src", "serve.js"),
  dataDirEnv: "JUSTWRITE_DATA_DIR",
  repoRoot: root,
  distDir: path.join(root, "dist"),
  window: {
    title: "JustWrite",
    width: 1440,
    height: 900,
    minWidth: 1000,
    minHeight: 640,
    backgroundColor: "#fafaf7",
  },
  icon: path.join(root, "build", process.platform === "win32" ? "icon.ico" : "icon.png"),
  trayIcon: path.join(root, "build", "tray.png"),
  logFile: path.join("logs", "justwrite.log"),
  // Closing waits this long first, so the page's `pagehide` autosave reaches the server
  // before it stops (study §4.2; the Tauri shell held the window the same 400 ms).
  closeHoldMs: 400,
  // A manuscript can hold an image pasted from the web (an <img> with an https: source); the
  // Tauri window had no CSP and showed it, so this window keeps showing it (2026-10-08).
  cspAdd: { "img-src": ["https:"] },
});
