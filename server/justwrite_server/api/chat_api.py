"""/v1/chat/sessions — manuscript-RAG chat SESSIONS (real rows, not a kv blob).

2026-07-20: chat is now a per-project LIST of sessions (the claude.ai / ChatGPT
History pattern) instead of one thread per (project, mode, character). "New chat"
mints a new session; the previous one stays in History (the destructive-New-chat
defect this fixes). A session's turns are ordered rows (project_id, session_id,
position); the renderer loads a session on open and replaces its turns wholesale
when a turn settles, so PUT is a delete-all-then-insert for that session's
messages. Sessions are STORAGE only — per-request LLM cost is unchanged
(rag/chat.js still sends the last 8 turns + retrieval per ask).

Migration (zero data loss): a pre-sessions thread in the legacy `chat_messages`
table is lifted into one session per (mode, character_id) — lazily, on the first
`GET /v1/chat/sessions` for its project — then the legacy rows are deleted, so it
runs once. A pre-sessions thread therefore appears in the History list after
upgrade. (The project follows a NO-migrations decree for SCHEMA drift — drop the
dev DB + reseed — but user chat data is real content, so this DATA lift is
explicit and idempotent, in the endpoint's own idiom.)
"""

from __future__ import annotations

import json
import secrets
import time

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..database import get_db
from ..database.models import ChatMessage, ChatSession, ChatSessionMessage

router = APIRouter(tags=["chat"], prefix="/v1/chat")

# Per-session message cap — long threads waste storage and the model already
# truncates history to the last few turns (rag/chat.js MAX_HISTORY_MESSAGES).
MAX_MESSAGES = 30
# Session-title length — first user question, single line, ~60 chars.
TITLE_MAX = 60


class ChatMessageIO(BaseModel):
    role: str
    content: str = ""
    citations: list = []
    error: str | None = None


class SaveSessionBody(BaseModel):
    projectId: str
    mode: str = "book"
    characterId: str = ""
    title: str = ""
    updatedAt: str | None = None
    # None → meta-only update (a rename): leave the stored turns untouched. A list
    # (even empty) → replace-all. Creating a session REQUIRES ≥1 message (empty
    # sessions are never persisted).
    messages: list[ChatMessageIO] | None = None


def _now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime()) + "Z"


def _mint_id() -> str:
    """A session id in the app's `<prefix>_<base36 time>_<rand>` style (see the
    renderer's `uid()` in stores/project.js) so migrated ids look native."""
    stamp = _base36(int(time.time() * 1000))
    return f"chat_{stamp}_{secrets.token_hex(2)}"


def _base36(n: int) -> str:
    if n == 0:
        return "0"
    digits = "0123456789abcdefghijklmnopqrstuvwxyz"
    out = ""
    while n:
        n, r = divmod(n, 36)
        out = digits[r] + out
    return out


def _derive_title(messages: list) -> str:
    """First user turn, collapsed to one line and truncated to TITLE_MAX."""
    for m in messages:
        role = m.get("role") if isinstance(m, dict) else getattr(m, "role", None)
        content = m.get("content") if isinstance(m, dict) else getattr(m, "content", "")
        if role == "user" and (content or "").strip():
            line = " ".join((content or "").split())
            return line[:TITLE_MAX]
    return "New chat"


def _session_out(row: ChatSession, message_count: int) -> dict:
    return {
        "id": row.id,
        "projectId": row.project_id,
        "mode": row.mode,
        "characterId": row.character_id,
        "title": row.title,
        "updatedAt": row.updated_at,
        "messageCount": message_count,
    }


def _messages_out(db: Session, project_id: str, session_id: str) -> list[dict]:
    rows = (
        db.query(ChatSessionMessage)
        .filter(
            ChatSessionMessage.project_id == project_id,
            ChatSessionMessage.session_id == session_id,
        )
        .order_by(ChatSessionMessage.position)
        .all()
    )
    return [
        {
            "role": r.role,
            "content": r.content,
            "citations": json.loads(r.citations or "[]"),
            **({"error": r.error} if r.error else {}),
        }
        for r in rows
    ]


def _migrate_legacy_threads(db: Session, project_id: str) -> None:
    """One-time, idempotent lift of the legacy single-thread rows for a project
    into sessions. Each distinct (mode, character_id) thread becomes one session
    (title from its first user turn, updated_at = now — best-effort), then the
    legacy rows are deleted so this never runs twice for that thread."""
    legacy = (
        db.query(ChatMessage)
        .filter(ChatMessage.project_id == project_id)
        .order_by(ChatMessage.mode, ChatMessage.character_id, ChatMessage.position)
        .all()
    )
    if not legacy:
        return

    groups: dict[tuple[str, str], list[ChatMessage]] = {}
    for r in legacy:
        groups.setdefault((r.mode, r.character_id or ""), []).append(r)

    for (mode, character_id), rows in groups.items():
        session_id = _mint_id()
        title = _derive_title([{"role": r.role, "content": r.content} for r in rows])
        db.add(
            ChatSession(
                project_id=project_id,
                id=session_id,
                mode=mode,
                character_id=character_id,
                title=title,
                updated_at=_now_iso(),
            )
        )
        for i, r in enumerate(rows):
            db.add(
                ChatSessionMessage(
                    project_id=project_id,
                    session_id=session_id,
                    position=i,
                    role=r.role,
                    content=r.content,
                    citations=r.citations,
                    error=r.error,
                )
            )

    db.query(ChatMessage).filter(ChatMessage.project_id == project_id).delete(
        synchronize_session=False
    )
    db.commit()


@router.get("/sessions", summary="List a project's chat sessions (no messages)")
async def list_sessions(projectId: str, db: Session = Depends(get_db)) -> list[dict]:
    # Lift any pre-sessions thread into the list on first read (see the module
    # docstring). Runs once — migrated threads' legacy rows are gone afterwards.
    _migrate_legacy_threads(db, projectId)

    counts = dict(
        db.query(ChatSessionMessage.session_id, func.count())
        .filter(ChatSessionMessage.project_id == projectId)
        .group_by(ChatSessionMessage.session_id)
        .all()
    )
    rows = (
        db.query(ChatSession)
        .filter(ChatSession.project_id == projectId)
        .order_by(ChatSession.updated_at.desc())
        .all()
    )
    return [_session_out(r, counts.get(r.id, 0)) for r in rows]


@router.get("/sessions/{session_id}", summary="One session with its messages")
async def get_session(session_id: str, db: Session = Depends(get_db)) -> dict:
    row = db.query(ChatSession).filter(ChatSession.id == session_id).first()
    if row is None:
        raise HTTPException(status_code=404, detail="session not found")
    out = _session_out(row, 0)
    out["messages"] = _messages_out(db, row.project_id, row.id)
    out["messageCount"] = len(out["messages"])
    return out


@router.put("/sessions/{session_id}", status_code=204, summary="Upsert a session")
async def save_session(
    session_id: str, body: SaveSessionBody, db: Session = Depends(get_db)
) -> Response:
    row = db.get(ChatSession, (body.projectId, session_id))

    if row is None:
        # Creating: an empty session is never persisted (a rename of a session
        # that doesn't exist is a no-op, not an empty row).
        if not body.messages:
            return Response(status_code=204)
        row = ChatSession(project_id=body.projectId, id=session_id)
        db.add(row)

    row.mode = body.mode
    row.character_id = body.characterId or ""
    if body.title:  # empty never clobbers a stored title
        row.title = body.title
    row.updated_at = body.updatedAt or row.updated_at or _now_iso()

    # None → meta-only (rename). A list (even empty) → replace-all the turns.
    if body.messages is not None:
        db.query(ChatSessionMessage).filter(
            ChatSessionMessage.project_id == body.projectId,
            ChatSessionMessage.session_id == session_id,
        ).delete(synchronize_session=False)
        for i, m in enumerate(body.messages[-MAX_MESSAGES:]):
            db.add(
                ChatSessionMessage(
                    project_id=body.projectId,
                    session_id=session_id,
                    position=i,
                    role=m.role,
                    content=m.content,
                    citations=json.dumps(m.citations or []),
                    error=m.error,
                )
            )

    db.commit()
    return Response(status_code=204)


@router.delete("/sessions/{session_id}", status_code=204, summary="Delete a session")
async def delete_session(session_id: str, db: Session = Depends(get_db)) -> Response:
    row = db.query(ChatSession).filter(ChatSession.id == session_id).first()
    if row is not None:
        db.query(ChatSessionMessage).filter(
            ChatSessionMessage.project_id == row.project_id,
            ChatSessionMessage.session_id == session_id,
        ).delete(synchronize_session=False)
        db.delete(row)
        db.commit()
    return Response(status_code=204)
