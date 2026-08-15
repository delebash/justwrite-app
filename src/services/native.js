// ============================================================
// native.js — JustWrite's calls into its own Tauri shell.
//
// Ordinary ES module exports, imported like any other service. It replaced
// `tauri-bridge.js` on 2026-08-14: that file installed a `window.justwrite`
// GLOBAL, which existed only because JustWrite's renderer was once an Electron
// app talking to preload handlers. JustVoice and i18n-docgen were born Tauri and
// have no such global — they call `invoke` from the view that needs it, and so
// does this app now. The Electron-shaped `{ ok, error, cancelled }` return has
// gone with it: these throw, like every other Tauri command, and callers use
// try/catch (the shape JustVoice's Settings already uses).
//
// The commands themselves live in `src-tauri/src/lib.rs`. Every native dialog is
// a Rust command rather than the JS dialog plugin — the family shape, so a
// dialog can't appear at two different layers in three apps.
//
// The global fetch override that shared the old file is now ONE kit
// implementation (`installTauriFetch`), installed from main.js by all three apps.
// ============================================================

import { invoke } from "@tauri-apps/api/core";
import { isTauriShell } from "@delebash/llm-ui";

/** Is a desktop shell there to answer? The kit owns the one test. */
export const hasShell = () => isTauriShell();

// ─── Native dialogs (all Rust commands — see lib.rs) ─────────────────

/** Folder picker. Resolves the chosen path, or null if the user cancelled. */
export function pickDirectory({ title, defaultPath } = {}) {
  if (!hasShell()) return Promise.resolve(null);
  return invoke("pick_directory", { title, defaultPath }).catch(() => null);
}

/**
 * "Open a file" dialog. Resolves `{ name, dir, dataBase64 }` for the picked file
 * (e.g. a <book>.zip to import), or null if the user cancelled. `dir` lets the
 * caller remember this chooser's last location.
 */
export async function pickFile({ title, filterName, filterExt, defaultDir } = {}) {
  if (!hasShell()) return null;
  try {
    const res = await invoke("pick_file", { title, filterName, filterExt, defaultDir });
    return res?.cancelled ? null : res;
  } catch (e) {
    if (String(e || "") === "cancelled") return null;
    throw e;
  }
}

/**
 * Save-as for binary blobs. WebView2 ignores `<a download>` on blob: URLs, so
 * every "Save as WAV / PDF / EPUB / …" button comes through here. Bytes ride the
 * raw IPC body (zero-copy); the suggested filename, dialog title and a single
 * file-type filter come as base64 headers so non-ASCII names survive transport.
 * Resolves `{ ok, path }`, or null if the user cancelled.
 */
export async function saveFile({ blob, suggestedName, title, filterName, filterExt, defaultDir }) {
  if (!hasShell()) return null;
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  const b64 = (s) => btoa(unescape(encodeURIComponent(s)));
  const headers = {};
  if (suggestedName) headers["x-save-name"] = b64(suggestedName);
  if (title)         headers["x-save-title"] = b64(title);
  if (filterName)    headers["x-filter-name"] = b64(filterName);
  if (filterExt)     headers["x-filter-ext"] = b64(filterExt);
  if (defaultDir)    headers["x-save-dir"] = b64(defaultDir);
  try {
    return await invoke("shell_save_file", bytes, { headers });
  } catch (e) {
    if (String(e || "") === "cancelled") return null;
    throw e;
  }
}

// ─── The portable data root ──────────────────────────────────────────

/** `{ root, default, portable }`, or null outside the shell. */
export function storageGetRoot() {
  if (!hasShell()) return Promise.resolve(null);
  return invoke("storage_get_root").catch(() => null);
}

/** MOVE all app data to `newRoot` and respawn the server. Throws on failure; the
 *  caller reloads the webview once it resolves. Pick the folder with
 *  `pickDirectory` first. */
export function storageRelocate(newRoot) {
  return invoke("storage_relocate", { newRoot });
}

// ─── The shell's own switches ────────────────────────────────────────

/** The family headless ruling (2026-08-04): keep the server up on window close. */
export function setKeepRunning(keepRunning) {
  if (!hasShell()) return Promise.resolve();
  return invoke("set_keep_server_running", { keepRunning: !!keepRunning }).catch(() => {});
}

/** The tray menu's words, fed from vue-i18n (App.vue, at boot + every locale
 *  switch) — Rust holds only pre-boot English defaults. Missing keys keep those
 *  defaults; `labels` is { show, hide, serverStart, serverStop, serverRestart,
 *  openSettings, copyUrl, openLogs, about, quit }. */
export function setTrayLabels(labels) {
  if (!hasShell()) return Promise.resolve();
  return invoke("set_tray_labels", { labels }).catch(() => {});
}
