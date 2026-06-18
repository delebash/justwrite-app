// Client for the writing-activity log (/v1/sessions). Mirrors projectApi /
// providerBackend: the sessions store hydrates from getSessions() at boot,
// then records the latest per-chapter count with a debounced POST — the
// server computes the authoritative delta against its own checkpoint.

import { serverUrl } from "./serverApi.js";

export async function getSessions() {
  const res = await fetch(serverUrl("/v1/sessions"));
  if (!res.ok) throw new Error(`/v1/sessions -> ${res.status}`);
  return res.json();
}

export function recordSession({ chapterId, words, day }) {
  return fetch(serverUrl("/v1/sessions/record"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chapterId, words, day }),
    keepalive: true,
  }).catch((err) => console.error("sessionsApi.record failed:", err));
}

export function clearSessions() {
  return fetch(serverUrl("/v1/sessions"), { method: "DELETE" })
    .catch((err) => console.error("sessionsApi.clear failed:", err));
}
