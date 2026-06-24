// Client for manuscript-RAG chat threads (/v1/chat). One thread per
// (project, mode, character) combo; the ChatPanel fetches a thread on open and
// replaces it wholesale when a turn settles. Replaces the justwrite:rag:thread:*
// kv blobs — threads are now real server rows. HTTP via the shared kit transport.

import { get, put, del } from "@delebash/llm-ui";

function threadQuery({ projectId, mode, characterId }) {
  const p = new URLSearchParams({ projectId, mode });
  if (characterId) p.set("characterId", characterId);
  return p.toString();
}

export async function fetchThread({ projectId, mode, characterId }) {
  const { messages } = await get(`/v1/chat?${threadQuery({ projectId, mode, characterId })}`);
  return Array.isArray(messages) ? messages : [];
}

export function putThread({ projectId, mode, characterId, messages }) {
  return put(
    "/v1/chat",
    { projectId, mode, characterId: characterId || "", messages },
    { keepalive: true },
  ).catch((err) => console.error("chatApi.putThread failed:", err));
}

export function deleteThread({ projectId, mode, characterId }) {
  return del(`/v1/chat?${threadQuery({ projectId, mode, characterId })}`).catch((err) =>
    console.error("chatApi.deleteThread failed:", err),
  );
}
