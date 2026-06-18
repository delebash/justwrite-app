// Base URL for the JustWrite local server (FastAPI + SQLite).
//
// In the desktop app the Tauri http plugin routes these cross-origin calls
// through Rust (CORS-exempt — see tauri-bridge.js's window.fetch override);
// under `vite dev` the server's permissive CORS handles them. The default
// port matches the server (`justwrite-server serve --port 17495`); override
// with VITE_JW_SERVER_URL for non-default deployments.

const DEFAULT_BASE = "http://127.0.0.1:17495";

export const SERVER_BASE = import.meta.env?.VITE_JW_SERVER_URL || DEFAULT_BASE;

export function serverUrl(path) {
  return `${SERVER_BASE}${path}`;
}
