// ============================================================
// native.js — JustWrite's calls into its own desktop shell.
//
// The family shape (2026-08-15), same file, same job in all three apps: ordinary
// module exports, one per shell command, so a command's NAME as a string exists in
// exactly ONE place. Since the Electron move (2026-10-08) the shell is the kit's
// shared Electron main module (`@delebash/llm-runner/shell`); this file is the ONLY
// reader of its one preload object, `window.appShell` (`invoke(command, args)`,
// `on(event, fn)`) — the family rule that replaced the old `window.justwrite`
// global. These throw on failure and callers use try/catch; a cancelled dialog
// resolves null. Outside the desktop app (Vite dev in a browser, the headless
// `serve` UI) every call answers the browser's way: null / a no-op.
//
// Every native dialog is a shell command rather than a renderer API — the family
// shape, so a dialog can't appear at two different layers in three apps.
// ============================================================

import { isDesktopShell } from "@delebash/llm-ui";

/** Is a desktop shell there to answer? The kit owns the one test. */
export const hasShell = () => isDesktopShell() && !!window.appShell;

const call = (command, args) => window.appShell.invoke(command, args);

/** The desktop runtime's version (Electron's), or "" outside the shell — About's line. */
export const shellVersion = () => (hasShell() ? window.appShell.versions?.electron || "" : "");

// ─── Native dialogs ──────────────────────────────────────────────────

/** Folder picker. Resolves the chosen path, or null if the user cancelled. */
export function pickDirectory({ title, defaultPath } = {}) {
  if (!hasShell()) return Promise.resolve(null);
  return call("pickDirectory", { title, defaultPath }).catch(() => null);
}

/**
 * "Open a file" dialog. Resolves `{ name, dir, dataBase64 }` for the picked file
 * (e.g. a <book>.zip to import), or null if the user cancelled. `dir` lets the
 * caller remember this chooser's last location.
 */
export function pickFile({ title, filterName, filterExt, defaultDir } = {}) {
  if (!hasShell()) return Promise.resolve(null);
  return call("pickFile", { title, filterName, filterExt, defaultDir });
}

/**
 * Save-as for binary blobs — every "Save as WAV / PDF / EPUB / …" button comes
 * through here. The bytes cross to the shell as one Uint8Array (structured clone).
 * Resolves `{ ok, path }`, or null if the user cancelled.
 */
export async function saveFile({ blob, suggestedName, title, filterName, filterExt, defaultDir }) {
  if (!hasShell()) return null;
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return call("saveFile", { bytes, suggestedName, title, filterName, filterExt, defaultDir });
}

// ─── The portable data root ──────────────────────────────────────────

/** `{ root, default, portable }`, or null outside the shell. */
export function storageGetRoot() {
  if (!hasShell()) return Promise.resolve(null);
  return call("storageGetRoot").catch(() => null);
}

/** MOVE all app data to `newRoot`. Throws on failure. On success the app restarts
 *  itself (Chromium's own files live under the data root and can only move with a
 *  restart), so nothing after this call runs. Pick the folder with `pickDirectory`
 *  first. */
export function storageRelocate(newRoot) {
  return call("storageRelocate", { newRoot });
}

// ─── The shell's own switches ────────────────────────────────────────

/** The family headless ruling (2026-08-04): keep the server up on window close. */
export function setKeepRunning(keepRunning) {
  if (!hasShell()) return Promise.resolve();
  return call("setKeepRunning", { keepRunning: !!keepRunning }).catch(() => {});
}

/** The tray menu's words, fed from vue-i18n (App.vue, at boot + every locale
 *  switch) — the shell holds only pre-boot English defaults. Missing keys keep those
 *  defaults; `labels` is { show, hide, serverStart, serverStop, serverRestart,
 *  openSettings, copyUrl, openLogs, about, quit }. */
export function setTrayLabels(labels) {
  if (!hasShell()) return Promise.resolve();
  return call("setTrayLabels", { labels }).catch(() => {});
}

// ─── Openers (handed to the kit's installLlmUi as `external`) ────────

/** Open a web link in the user's browser. */
export function openUrl(url) {
  return call("openExternal", { url });
}

/** Show a local folder (or file) in the OS file manager. */
export function openPath(path) {
  return call("openPath", { path });
}

// ─── The shell's pushes (the tray) ───────────────────────────────────

/** Subscribe to a shell event (`tray:open-settings`, `tray:about`, `tray:copy-url`).
 *  Returns the unsubscribe function; outside the shell, a no-op. */
export function onShellEvent(event, fn) {
  if (!hasShell()) return () => {};
  return window.appShell.on(event, fn);
}
