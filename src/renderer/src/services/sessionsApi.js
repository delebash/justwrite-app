// Client for the writing-activity log (/v1/sessions). Mirrors projectApi /
// providerBackend: the sessions store hydrates from getSessions() at boot,
// then records the latest per-chapter count with a debounced POST — the
// server computes the authoritative delta. HTTP via the shared kit transport.

import { get, post, del } from "@delebash/llm-ui";

export async function getSessions() {
  return get("/v1/sessions");
}

export function recordSession({ chapterId, words, day }) {
  return post("/v1/sessions/record", { chapterId, words, day }, { keepalive: true }).catch((err) =>
    console.error("sessionsApi.record failed:", err),
  );
}

export function clearSessions() {
  return del("/v1/sessions").catch((err) => console.error("sessionsApi.clear failed:", err));
}
