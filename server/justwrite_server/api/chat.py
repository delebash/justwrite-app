"""/v1/chat — manuscript-RAG chat threads (real rows, not a kv blob).

One thread per (project, mode, character) combo — the same keying the
ChatPanel used for its `justwrite:rag:thread:*` kv blobs. Messages are ordered
rows (project_id, mode, character_id, position); the renderer loads a thread on
open and replaces it wholesale when a turn settles, so PUT is a
delete-all-then-insert for that thread key. project_id FKs the projects table,
so deleting a book cascades its threads away.
"""

from __future__ import annotations

import json

from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel
from sqlalchemy.orm import Query, Session

from ..database import get_db
from ..models import ChatMessage

router = APIRouter(tags=["chat"], prefix="/v1/chat")


class ChatMessageIO(BaseModel):
    role: str
    content: str = ""
    citations: list = []
    error: str | None = None


class SaveThreadBody(BaseModel):
    projectId: str
    mode: str = "book"
    characterId: str = ""
    messages: list[ChatMessageIO] = []


def _thread_rows(db: Session, project_id: str, mode: str, character_id: str) -> Query:
    """The filtered (unordered) query for one thread. Unordered so callers can
    `.delete()` on it — SQLAlchemy forbids delete() after order_by()."""
    return db.query(ChatMessage).filter(
        ChatMessage.project_id == project_id,
        ChatMessage.mode == mode,
        ChatMessage.character_id == character_id,
    )


@router.get("", summary="One thread's messages (by project / mode / character)")
async def get_thread(
    projectId: str,
    mode: str = "book",
    characterId: str = "",
    db: Session = Depends(get_db),
) -> dict:
    rows = _thread_rows(db, projectId, mode, characterId).order_by(ChatMessage.position).all()
    messages = [
        {
            "role": r.role,
            "content": r.content,
            "citations": json.loads(r.citations or "[]"),
            **({"error": r.error} if r.error else {}),
        }
        for r in rows
    ]
    return {"messages": messages}


@router.put("", status_code=204, summary="Replace a thread's messages wholesale")
async def save_thread(body: SaveThreadBody, db: Session = Depends(get_db)) -> Response:
    _thread_rows(db, body.projectId, body.mode, body.characterId).delete(synchronize_session=False)
    for i, m in enumerate(body.messages):
        db.add(
            ChatMessage(
                project_id=body.projectId,
                mode=body.mode,
                character_id=body.characterId,
                position=i,
                role=m.role,
                content=m.content,
                citations=json.dumps(m.citations or []),
                error=m.error,
            )
        )
    db.commit()
    return Response(status_code=204)


@router.delete("", status_code=204, summary="Clear a thread")
async def delete_thread(
    projectId: str,
    mode: str = "book",
    characterId: str = "",
    db: Session = Depends(get_db),
) -> Response:
    _thread_rows(db, projectId, mode, characterId).delete(synchronize_session=False)
    db.commit()
    return Response(status_code=204)
