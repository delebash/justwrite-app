// Base URL for the JustWrite local server (FastAPI + SQLite).
//
// The origin-aware resolver is shared (kit `makeOriginAwareResolver`): when the
// server hosts the UI at its own origin, use that origin (same-origin, no CORS);
// otherwise — the Tauri webview (tauri://localhost) or `vite dev` (port 1420) —
// fall back to the fixed loopback port. This file supplies JustWrite's dev port +
// fallback and is what main.js hands to configureServerApi() at boot. JustWrite
// has no auth, so no authToken is configured.
//
// `serverUrl()`/`SERVER_BASE` stay exported for back-compat with call sites that
// still build URLs directly; new code should use the kit transport (request/
// get/post/...) instead.
import { makeOriginAwareResolver } from "@delebash/llm-ui";

const FALLBACK = import.meta.env?.VITE_SERVER_URL || "http://127.0.0.1:17495";

export const resolveBase = makeOriginAwareResolver({ devPorts: ["1420"], fallback: FALLBACK });

export const SERVER_BASE = resolveBase();

export function serverUrl(path) {
  return `${SERVER_BASE}${path}`;
}
