// SPDX-License-Identifier: MIT
// The phone's twin of sync_platform.js (the kit's docs/plans/2026-10-08-the-phone.md):
// - the engine on SQLite WASM through its own adapter (tested on the Android and iOS simulators),
//   on the same connection as the app's (the kit facade's `wasmDb`);
// - the engine keeps this device's id in the database (nothing outside it identifies the phone);
// - the name a phone is known by before the user sets one, from the webview's user agent;
// - a cloud folder needs signing in to OneDrive or Dropbox, which needs the app's registrations
//   with them (the plan, §5) — until then a folder setting is refused with that reason.
import { sqliteWasmAdapter } from "@delebash/sqlite-sync";

export const syncDatabase = (raw) => sqliteWasmAdapter(raw.wasmDb);

function deviceName() {
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
  if (/iPad/.test(ua)) return "iPad";
  if (/iPhone/.test(ua)) return "iPhone";
  if (/Android/.test(ua)) return /Mobile/.test(ua) ? "Android phone" : "Android tablet";
  return "Phone";
}

export const SYNC_PLATFORM = {
  deviceId: () => undefined,
  deviceName,
  folder: () => {
    throw new Error("A cloud folder on the phone needs signing in to OneDrive or Dropbox, which isn't available yet.");
  },
};
