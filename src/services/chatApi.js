// Client for manuscript-RAG chat SESSIONS (/v1/chat/sessions). A session is one
// conversation; a project holds a flat list of them (the claude.ai / ChatGPT
// History pattern). Replaces the old one-thread-per-(project,mode,character)
// trio (fetchThread/putThread/deleteThread → /v1/chat) so "New chat" mints a new
// session instead of wiping the only thread. Sessions are STORAGE only — the
// per-request LLM cost is unchanged (rag/chat.js still sends the last 8 turns +
// retrieval per ask). HTTP via the shared kit transport.

import { get, put, del } from "@delebash/llm-ui";

// Session ids mint in the app's `<prefix>_<base36 time>_<rand>` style — the same
// shape as project entities (stores/project.js `uid()`), so a chat id reads like
// every other id in the app.
export function mintSessionId() {
  return `chat_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

// Title = first user question, one line, ~60 chars. No LLM titling; a user
// rename overrides this and is never auto-regenerated.
export function deriveSessionTitle(messages) {
  const firstUser = (messages || []).find((m) => m?.role === "user" && (m.content || "").trim());
  if (!firstUser) return "New chat";
  return firstUser.content.replace(/\s+/g, " ").trim().slice(0, 60);
}

// The project's session list — light rows, no messages:
//   [{ id, projectId, mode, characterId, title, updatedAt, messageCount }]
export async function listSessions(projectId) {
  if (!projectId) return [];
  const rows = await get(`/v1/chat/sessions?projectId=${encodeURIComponent(projectId)}`);
  return Array.isArray(rows) ? rows : [];
}

// One session with its messages.
export function fetchSession(id) {
  return get(`/v1/chat/sessions/${encodeURIComponent(id)}`);
}

// Upsert. Pass `messages` to replace the turns wholesale (a settled turn); OMIT
// `messages` for a meta-only update (a rename — the stored turns stay put).
// keepalive so a close-time flush still lands.
export function putSession({ id, projectId, mode, characterId, title, updatedAt, messages }) {
  const body = { projectId, mode, characterId: characterId || "", title, updatedAt };
  if (messages !== undefined) body.messages = messages;
  return put(`/v1/chat/sessions/${encodeURIComponent(id)}`, body, { keepalive: true }).catch((err) =>
    console.error("chatApi.putSession failed:", err),
  );
}

export function deleteSession(id) {
  return del(`/v1/chat/sessions/${encodeURIComponent(id)}`).catch((err) =>
    console.error("chatApi.deleteSession failed:", err),
  );
}
