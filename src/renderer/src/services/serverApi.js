// Base URL for the JustWrite local server (FastAPI + SQLite).
//
// Origin-aware (shared Vue+Tauri app standard): when the server hosts the UI at
// its own origin, use that origin (same-origin, no CORS); otherwise — the Tauri
// webview (tauri://localhost) or `vite dev` (port 1420) — fall back to the fixed
// loopback port the server binds. In the desktop app the Tauri http plugin
// routes cross-origin calls through Rust (CORS-exempt — see tauri-bridge.js's
// window.fetch override); under `vite dev` the server's permissive CORS handles
// them. Override the fallback with VITE_SERVER_URL for non-default deployments.

const FALLBACK = import.meta.env?.VITE_SERVER_URL || "http://127.0.0.1:17495";

function resolveServerUrl() {
  if (typeof window === "undefined" || !window.location) return FALLBACK;
  const { protocol, origin, port, hostname } = window.location;
  const isViteDev = port === "1420";
  const isTauri = protocol === "tauri:" || hostname === "tauri.localhost";
  if (!isViteDev && !isTauri && (protocol === "http:" || protocol === "https:")) {
    return origin; // server hosts both the UI and the API
  }
  return FALLBACK;
}

export const SERVER_BASE = resolveServerUrl();

export function serverUrl(path) {
  return `${SERVER_BASE}${path}`;
}
