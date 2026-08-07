"""/v1/sessions — the writing-activity log (daily word counts).

Replaces the renderer's `justwrite:sessions` kv blob with real tables: a row
per day (the log), a per-chapter checkpoint for delta attribution, and a
singleton pointer for "today's chapter". Global (per install), not project
scoped — it tracks the writer's daily output across every project. The server
owns the authoritative delta (diffs its stored checkpoint), so a debounced
POST of only the latest count can't double-count.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from ..database.models import SessionChapterWord, SessionDay, SessionMeta

router = APIRouter(tags=["sessions"], prefix="/v1/sessions")

_META_ID = "singleton"


class RecordBody(BaseModel):
    chapterId: str
    words: int
    day: str  # yyyy-mm-dd in the client's local time


@router.get("", summary="The full session log (days, per-chapter checkpoints, last-write pointer)")
async def get_sessions(db: Session = Depends(get_db)) -> dict:
    days = {r.day: r.words for r in db.query(SessionDay).all()}
    chapter_words = {r.chapter_id: r.words for r in db.query(SessionChapterWord).all()}
    meta = db.get(SessionMeta, _META_ID)
    last_write = (
        {"chapterId": meta.last_write_chapter, "day": meta.last_write_day}
        if meta and meta.last_write_chapter
        else None
    )
    return {"days": days, "chapterWords": chapter_words, "lastWrite": last_write}


@router.post("/record", status_code=204, summary="Attribute a chapter's new word count to a day")
async def record(body: RecordBody, db: Session = Depends(get_db)) -> Response:
    cw = db.get(SessionChapterWord, body.chapterId)
    prev = cw.words if cw else 0
    delta = max(0, body.words - prev)  # deletions never subtract recorded progress

    if cw is None:
        db.add(SessionChapterWord(chapter_id=body.chapterId, words=body.words))
    else:
        cw.words = body.words

    if delta > 0:
        row = db.get(SessionDay, body.day)
        if row is None:
            db.add(SessionDay(day=body.day, words=delta))
        else:
            row.words += delta
        meta = db.get(SessionMeta, _META_ID)
        if meta is None:
            db.add(SessionMeta(id=_META_ID, last_write_chapter=body.chapterId, last_write_day=body.day))
        else:
            meta.last_write_chapter = body.chapterId
            meta.last_write_day = body.day

    db.commit()
    return Response(status_code=204)


@router.delete("", status_code=204, summary="Clear the whole session log (reset)")
async def clear(db: Session = Depends(get_db)) -> Response:
    db.query(SessionDay).delete(synchronize_session=False)
    db.query(SessionChapterWord).delete(synchronize_session=False)
    db.query(SessionMeta).delete(synchronize_session=False)
    db.commit()
    return Response(status_code=204)
