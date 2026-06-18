// Client for manuscript-RAG chat threads (/v1/chat). One thread per
// (project, mode, character) combo; the ChatPanel fetches a thread on open and
// replaces it wholesale when a turn settles. Replaces the justwrite:rag:thread:*
// kv blobs — threads are now real server rows, fetched async (no storage.js).

import { serverUrl } from "./serverApi.js";

function threadQuery({ projectId, mode, characterId }) {
  const p = new URLSearchParams({ projectId, mode });
  if (characterId) p.set("characterId", characterId);
  return p.toString();
}

export async function fetchThread({ projectId, mode, characterId }) {
  const res = await fetch(serverUrl(`/v1/chat?${threadQuery({ projectId, mode, characterId })}`));
  if (!res.ok) throw new Error(`/v1/chat -> ${res.status}`);
  const { messages } = await res.json();
  return Array.isArray(messages) ? messages : [];
}

export function putThread({ projectId, mode, characterId, messages }) {
  return fetch(serverUrl("/v1/chat"), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId, mode, characterId: characterId || "", messages }),
    keepalive: true,
  }).catch((err) => console.error("chatApi.putThread failed:", err));
}

export function deleteThread({ projectId, mode, characterId }) {
  return fetch(serverUrl(`/v1/chat?${threadQuery({ projectId, mode, characterId })}`), {
    method: "DELETE",
  }).catch((err) => console.error("chatApi.deleteThread failed:", err));
}
