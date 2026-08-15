// Shared default-folder resolution for every native file/folder chooser (export,
// import, backup, the autosave-folder picker). Extracted from bookTransfer.js so
// there is ONE implementation of "where does this dialog open?" — the T3 fix — and
// so the autosave picker (SettingsView) rides the same remember-last + data-dir
// default the export/import/backup choosers already do.
//
// The default the FIRST time a chooser opens is the server's data folder (GET
// /v1/health -> dataDir), cached once per session. `chooserDir` is HARDENED to
// never return undefined/empty: passing an undefined default_path to the Rust
// dialog makes the OS open the dialog at the user's HOME dir (the "chooser opens
// at home" bug — lib.rs pick_directory only calls set_directory when the path is
// non-empty), so we always hand back a real path.

import { get } from "@delebash/llm-ui";
import { storageGetRoot } from "./native.js";
import { readSetting, writeSetting } from "./settings.js";

// The server's data folder, fetched once from /v1/health and cached for the
// session. Only a real, non-empty value is cached; a failed/offline fetch returns
// "" and leaves the cache empty so a later call retries. Concurrent callers share
// the one in-flight request.
let _dataDir = null; // cached successful result (a non-empty path string)
let _inflight = null; // the in-flight /v1/health promise (dedupe)

export async function serverDataDir() {
  if (_dataDir) return _dataDir;
  if (!_inflight) {
    _inflight = (async () => {
      try {
        const h = await get("/v1/health");
        const d = h && typeof h.dataDir === "string" ? h.dataDir : "";
        if (d) _dataDir = d; // cache only a real value
        return d;
      } catch {
        return ""; // offline — caller falls through to the next tier
      } finally {
        _inflight = null; // allow a retry after a failed/empty fetch
      }
    })();
  }
  return _inflight;
}

/**
 * The default folder for a named chooser: the folder it last landed in (remembered
 * per key in the settings doc), else the server data folder, else the Tauri storage
 * root — and GUARANTEED non-empty so the native dialog never falls back to the OS
 * home directory (an undefined default_path is exactly that bug). `key` is one of
 * "export" | "import" | "backup" | "autosave".
 */
export async function chooserDir(key) {
  const dirs = readSetting("chooserDirs") || {};
  if (dirs[key]) return dirs[key];
  const data = await serverDataDir();
  if (data) return data;
  const root = await storageGetRoot();
  if (root?.root) return root.root;
  return "."; // last resort: a non-empty path (the app CWD) — never undefined.
}

/** Remember the folder a chooser last used (persisted per key in the settings
 *  doc). Folder-path config: survives a workspace reset (server whitelist, D3b). */
export function rememberDir(key, dir) {
  if (!dir) return;
  writeSetting("chooserDirs", { ...(readSetting("chooserDirs") || {}), [key]: dir });
}
