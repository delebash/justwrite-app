// SPDX-License-Identifier: MIT
// /v1/chat/sessions — manuscript-RAG chat SESSIONS, real rows (the port of
// justwrite_server/api/chat_api.py).
//
// 2026-07-20: chat is a per-project LIST of sessions (the claude.ai / ChatGPT History
// pattern) instead of one thread per (project, mode, character). "New chat" mints a new
// session; the previous one stays in History (the destructive-New-chat defect this fixed). A
// session's turns are ordered rows (project_id, session_id, position); the renderer loads a
// session on open and replaces its turns wholesale when a turn settles, so PUT is a
// delete-all-then-insert for that session's messages. Sessions are STORAGE only —
// per-request LLM cost is unchanged.
//
// Migration (zero data loss): a pre-sessions thread in the legacy `chat_messages` table is
// lifted into one session per (mode, character_id) — lazily, on the first
// `GET /v1/chat/sessions` for its project — then the legacy rows are deleted, so it runs
// once. (The project follows a NO-migrations decree for SCHEMA drift, but user chat data is
// real content, so this DATA lift is explicit and idempotent.)

import { randomBytes } from "node:crypto";
import { HttpError } from "@delebash/llm-runner/platform/errors";
import { nullable, opt, T } from "@delebash/llm-runner/platform/models";
import { pyJson } from "@delebash/llm-runner/platform/pyjson";
import { pyOr, splitWs, strip, truthy } from "@delebash/llm-runner/platform/py";
import { getDb } from "../database/session.js";

// Per-session message cap — long threads waste storage and the model already truncates
// history to the last few turns (rag/chat.js MAX_HISTORY_MESSAGES).
export const MAX_MESSAGES = 30;
// Session-title length — first user question, single line, ~60 chars.
export const TITLE_MAX = 60;

export const ChatMessageIO = T.Object({
  role: T.String(),
  content: opt(T.String(), ""),
  citations: opt(T.Array(T.Any()), []),
  error: opt(nullable(T.String()), null),
});

export const SaveSessionBody = T.Object({
  projectId: T.String(),
  mode: opt(T.String(), "book"),
  characterId: opt(T.String(), ""),
  title: opt(T.String(), ""),
  updatedAt: opt(nullable(T.String()), null),
  // null → meta-only update (a rename): leave the stored turns untouched. A list (even empty)
  // → replace-all. Creating a session REQUIRES ≥1 message (empty sessions are never
  // persisted).
  messages: opt(nullable(T.Array(ChatMessageIO)), null),
});

/** `time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime()) + "Z"` */
function nowIso() {
  return `${new Date().toISOString().slice(0, 19)}Z`;
}

/** A session id in the app's `<prefix>_<base36 time>_<rand>` style (see the renderer's
 * `uid()` in stores/project.js) so migrated ids look native. */
export function mintId() {
  return `chat_${Date.now().toString(36)}_${randomBytes(2).toString("hex")}`;
}

/** First user turn, collapsed to one line and truncated to TITLE_MAX (code points). */
export function deriveTitle(messages) {
  for (const m of messages) {
    if (m.role === "user" && strip(m.content || "")) {
      const line = splitWs(m.content || "").join(" ");
      return [...line].slice(0, TITLE_MAX).join("");
    }
  }
  return "New chat";
}

function sessionOut(row, messageCount) {
  return {
    id: row.id,
    projectId: row.project_id,
    mode: row.mode,
    characterId: row.character_id,
    title: row.title,
    updatedAt: row.updated_at,
    messageCount,
  };
}

function messagesOut(h, projectId, sessionId) {
  const rows = h.all(
    "SELECT * FROM chat_session_messages WHERE chat_session_messages.project_id = ? AND chat_session_messages.session_id = ? ORDER BY chat_session_messages.position",
    [projectId, sessionId],
    "chat_session_messages",
  );
  return rows.map((r) => ({
    role: r.role,
    content: r.content,
    citations: JSON.parse(r.citations || "[]"),
    ...(r.error ? { error: r.error } : {}),
  }));
}

/**
 * One-time, idempotent lift of the legacy single-thread rows for a project into sessions.
 * Each distinct (mode, character_id) thread becomes one session (title from its first user
 * turn, updated_at = now — best-effort), then the legacy rows are deleted so this never runs
 * twice for that thread.
 */
function migrateLegacyThreads(h, projectId) {
  const legacy = h.all(
    "SELECT * FROM chat_messages WHERE chat_messages.project_id = ? ORDER BY chat_messages.mode, chat_messages.character_id, chat_messages.position",
    [projectId],
    "chat_messages",
  );
  if (!legacy.length) return;

  const groups = new Map();
  for (const r of legacy) {
    const k = JSON.stringify([r.mode, r.character_id || ""]);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }

  h.tx(() => {
    for (const [k, rows] of groups) {
      const [mode, characterId] = JSON.parse(k);
      const sessionId = mintId();
      const title = deriveTitle(rows.map((r) => ({ role: r.role, content: r.content })));
      h.insert("chat_sessions", { project_id: projectId, id: sessionId, mode, character_id: characterId, title, updated_at: nowIso() });
      for (const [i, r] of rows.entries()) {
        h.insert("chat_session_messages", {
          project_id: projectId,
          session_id: sessionId,
          position: i,
          role: r.role,
          content: r.content,
          citations: r.citations,
          error: r.error,
        });
      }
    }
    h.run("DELETE FROM chat_messages WHERE chat_messages.project_id = ?", [projectId]);
  });
}

export async function router(app) {
  app.get("/v1/chat/sessions", { schema: { querystring: T.Object({ projectId: T.String() }) } }, async (req) => {
    const h = getDb();
    const projectId = req.query.projectId;
    // Lift any pre-sessions thread into the list on first read (see the header). Runs once —
    // migrated threads' legacy rows are gone afterwards.
    migrateLegacyThreads(h, projectId);

    const counts = new Map(
      h
        .all(
          "SELECT chat_session_messages.session_id AS session_id, count(*) AS n FROM chat_session_messages WHERE chat_session_messages.project_id = ? GROUP BY chat_session_messages.session_id",
          [projectId],
        )
        .map((r) => [r.session_id, r.n]),
    );
    const rows = h.all(
      "SELECT * FROM chat_sessions WHERE chat_sessions.project_id = ? ORDER BY chat_sessions.updated_at DESC",
      [projectId],
      "chat_sessions",
    );
    return rows.map((r) => sessionOut(r, counts.get(r.id) ?? 0));
  });

  app.get("/v1/chat/sessions/:session_id", async (req) => {
    const h = getDb();
    const row = h.one("SELECT * FROM chat_sessions WHERE chat_sessions.id = ? LIMIT 1", [req.params.session_id], "chat_sessions");
    if (row === null) throw new HttpError(404, "session not found");
    const out = sessionOut(row, 0);
    out.messages = messagesOut(h, row.project_id, row.id);
    out.messageCount = out.messages.length;
    return out;
  });

  app.put("/v1/chat/sessions/:session_id", { schema: { body: SaveSessionBody } }, async (req, reply) => {
    const h = getDb();
    const sessionId = req.params.session_id;
    const body = req.body;
    const key = { project_id: body.projectId, id: sessionId };
    const existing = h.get("chat_sessions", key);

    // Creating: an empty session is never persisted (a rename of a session that doesn't
    // exist is a no-op, not an empty row).
    if (existing === null && !truthy(body.messages)) return reply.code(204).send();

    h.tx(() => {
      const fields = {
        mode: body.mode,
        character_id: body.characterId || "",
        // updated_at: the client's stamp, else the stored one, else now
        updated_at: body.updatedAt || existing?.updated_at || nowIso(),
      };
      if (body.title) fields.title = body.title; // empty never clobbers a stored title
      if (existing === null) h.insert("chat_sessions", { ...key, ...fields });
      else h.update("chat_sessions", fields, key);

      // null → meta-only (rename). A list (even empty) → replace-all the turns.
      if (body.messages !== null) {
        h.delete("chat_session_messages", { project_id: body.projectId, session_id: sessionId });
        for (const [i, m] of body.messages.slice(-MAX_MESSAGES).entries()) {
          h.insert("chat_session_messages", {
            project_id: body.projectId,
            session_id: sessionId,
            position: i,
            role: m.role,
            content: m.content,
            citations: pyJson(pyOr(m.citations, [])),
            error: m.error,
          });
        }
      }
    });
    return reply.code(204).send();
  });

  app.delete("/v1/chat/sessions/:session_id", async (req, reply) => {
    const h = getDb();
    const sessionId = req.params.session_id;
    const row = h.one("SELECT * FROM chat_sessions WHERE chat_sessions.id = ? LIMIT 1", [sessionId], "chat_sessions");
    if (row !== null) {
      h.tx(() => {
        h.delete("chat_session_messages", { project_id: row.project_id, session_id: sessionId });
        h.delete("chat_sessions", { project_id: row.project_id, id: sessionId });
      });
    }
    return reply.code(204).send();
  });
}
