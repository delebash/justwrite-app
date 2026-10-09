// SPDX-License-Identifier: MIT
// The phone's twin of sync_platform.js (the kit's docs/plans/2026-10-08-the-phone.md):
// - the engine on SQLite WASM through its own adapter (tested on the Android and iOS simulators),
//   on the same connection as the app's (the kit facade's `wasmDb`);
// - this device's id is kept in the app's own files, outside the database (the window keeps it —
//   src/phone/plugins.js `device.id`; the worker entry hands it over with `useDevice`), so a phone
//   whose database was lost is still the same device and rebuilds from its storage guard;
// - the name a phone is known by before the user sets one, from the webview's user agent;
// - a cloud folder needs signing in to OneDrive or Dropbox, which needs the app's registrations
//   with them (the plan, §5) — until then a folder setting is refused with that reason;
// - the storage guard (JustWrite's TASKS, Sync decision 7: "the phone also saves its outgoing
//   changes to the app's own native folder and rebuilds from them if needed"): after each write
//   this device's changes go to the app's own folder (the window's `guard.*` calls), and a database
//   found empty at start is rebuilt from them.
import { folderSync, sqliteWasmAdapter } from "@delebash/sqlite-sync";
import { callWindow } from "@delebash/llm-runner/platform/worker/runtime";

export const syncDatabase = (raw) => sqliteWasmAdapter(raw.wasmDb);

function deviceName() {
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
  if (/iPad/.test(ua)) return "iPad";
  if (/iPhone/.test(ua)) return "iPhone";
  if (/Android/.test(ua)) return /Mobile/.test(ua) ? "Android phone" : "Android tablet";
  return "Phone";
}

let device; // set by useDevice before sync opens

export const SYNC_PLATFORM = {
  useDevice(id) {
    device = id;
  },
  deviceId: () => device,
  deviceName,
  folder: () => {
    throw new Error("A cloud folder on the phone needs signing in to OneDrive or Dropbox, which isn't available yet.");
  },
};

/** The storage guard's folder: the app's own files, through the window (a `folderSync` store). */
const guardStore = {
  list: (dir) => callWindow("guard.list", { dir }),
  read: (path) => callWindow("guard.read", { path }),
  write: (path, bytes) => callWindow("guard.write", { path, bytes }),
  remove: (path) => callWindow("guard.remove", { path }),
};

/**
 * Start the storage guard on the open engine: rebuild an empty database from this device's own
 * files, then keep them current — `changed()` after each write (debounced; the pushes run one at a
 * time). The files stay in the app's private storage, so they aren't encrypted.
 */
export async function startGuard({ sync, isEmpty, log }) {
  const guard = folderSync(sync, guardStore, { name: "this phone's own copy", state: "guard" });
  if (isEmpty()) {
    try {
      const r = await guard.restore();
      if (r) log.info(`storage guard: rebuilt the database from this phone's own files (${JSON.stringify(r)})`);
    } catch (e) {
      log.warning(`storage guard: rebuilding failed: ${e?.message ?? e}`);
    }
  }
  let timer = null;
  let queue = Promise.resolve();
  const push = () => {
    queue = queue.then(() => guard.push()).catch((e) => log.warning(`storage guard: saving failed: ${e?.message ?? e}`));
  };
  push(); // what the phone holds now (a first run, or changes from before the guard)
  return {
    changed() {
      clearTimeout(timer);
      timer = setTimeout(push, 1500);
    },
  };
}
