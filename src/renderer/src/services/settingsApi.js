// Client for the settings document (/v1/settings) — the renderer's preferences,
// persisted server-side. GET returns the whole document; PATCH upserts the given
// top-level sections (each section has a single owner that writes it wholesale);
// DELETE clears it (reset workspace). Mirrors JustVoice's GET/PATCH shape.

import { serverUrl } from "./serverApi.js";

export async function getSettings() {
  const res = await fetch(serverUrl("/v1/settings"));
  if (!res.ok) throw new Error(`/v1/settings -> ${res.status}`);
  return res.json();
}

export function patchSettings(patch) {
  return fetch(serverUrl("/v1/settings"), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
    keepalive: true,
  }).catch((err) => console.error("settingsApi.patch failed:", err));
}

export function deleteSettings() {
  return fetch(serverUrl("/v1/settings"), { method: "DELETE" })
    .catch((err) => console.error("settingsApi.delete failed:", err));
}
