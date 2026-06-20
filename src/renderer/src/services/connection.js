// Boot-time server reachability check.
//
// The renderer is a thin client — all data lives in the Python server (SQLite).
// With no server we must NOT boot the app: it would render seed/default data and
// silently fail to persist. main.js mounts the ConnectionError screen instead.
// Retries briefly so a server that's still starting up (e.g. the Tauri sidecar)
// isn't falsely reported as down.

import { serverUrl } from "./serverApi.js";

export async function checkServer({ tries = 6, delayMs = 500 } = {}) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(serverUrl("/v1/health"), { cache: "no-store" });
      if (res.ok) return true;
    } catch { /* server not up yet */ }
    if (i < tries - 1) await new Promise((r) => setTimeout(r, delayMs));
  }
  return false;
}
