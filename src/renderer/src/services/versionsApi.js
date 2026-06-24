// Client for per-chapter version history (/v1/versions). The versions store
// hydrates a project's versions on demand and replaces a chapter's list
// wholesale on any change (save / delete / restore-undo) — the same replace-all
// shape as chat threads. Replaces the justwrite:versions kv blob.
// HTTP via the shared kit transport.

import { get, put } from "@delebash/llm-ui";

export async function getVersions(projectId) {
  return get(`/v1/versions?projectId=${encodeURIComponent(projectId)}`);
}

export function putChapterVersions(projectId, chapterId, versions) {
  return put("/v1/versions", { projectId, chapterId, versions }, { keepalive: true }).catch((err) =>
    console.error("versionsApi.putChapterVersions failed:", err),
  );
}
