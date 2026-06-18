// Client for per-chapter version history (/v1/versions). The versions store
// hydrates a project's versions on demand and replaces a chapter's list
// wholesale on any change (save / delete / restore-undo) — the same replace-all
// shape as chat threads. Replaces the justwrite:versions kv blob.

import { serverUrl } from "./serverApi.js";

export async function getVersions(projectId) {
  const res = await fetch(serverUrl(`/v1/versions?projectId=${encodeURIComponent(projectId)}`));
  if (!res.ok) throw new Error(`/v1/versions -> ${res.status}`);
  return res.json();
}

export function putChapterVersions(projectId, chapterId, versions) {
  return fetch(serverUrl("/v1/versions"), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId, chapterId, versions }),
    keepalive: true,
  }).catch((err) => console.error("versionsApi.putChapterVersions failed:", err));
}
