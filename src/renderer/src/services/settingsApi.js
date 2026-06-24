// Client for the settings document (/v1/settings) — the renderer's preferences,
// persisted server-side. GET returns the whole document; PATCH upserts the given
// top-level sections (each section has a single owner that writes it wholesale);
// DELETE clears it (reset workspace). Mirrors JustVoice's GET/PATCH shape.
// HTTP via the shared kit transport (@delebash/llm-ui).

import { get, patch, del } from "@delebash/llm-ui";

export async function getSettings() {
  return get("/v1/settings");
}

export function patchSettings(patchBody) {
  // keepalive so a flush during pagehide still lands.
  return patch("/v1/settings", patchBody, { keepalive: true }).catch((err) =>
    console.error("settingsApi.patch failed:", err),
  );
}

export function deleteSettings() {
  return del("/v1/settings").catch((err) => console.error("settingsApi.delete failed:", err));
}
