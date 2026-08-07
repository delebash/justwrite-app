"""/v1/versions — per-chapter version history (real rows, not a kv blob).

Replaces the renderer's `justwrite:versions` blob. A version is a named snapshot
of a chapter's scenes; the renderer keeps the last 30 per chapter and replaces a
chapter's list wholesale on any change (save / delete / restore-undo), so PUT is
a delete-all-then-insert for that (project, chapter) — the same shape as chat
threads. project_id FKs projects, so deleting a book cascades its versions away.
"""

from __future__ import annotations

import json

from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from ..database.models import ChapterVersion

router = APIRouter(tags=["versions"], prefix="/v1/versions")


class VersionIO(BaseModel):
    id: str
    label: str = ""
    savedAt: str = ""
    words: int = 0
    scenes: list = []


class SaveVersionsBody(BaseModel):
    projectId: str
    chapterId: str
    versions: list[VersionIO] = []


@router.get("", summary="A project's versions grouped by chapter (newest-first)")
async def get_versions(projectId: str, db: Session = Depends(get_db)) -> dict:
    rows = (
        db.query(ChapterVersion)
        .filter(ChapterVersion.project_id == projectId)
        .order_by(ChapterVersion.chapter_id, ChapterVersion.position)
        .all()
    )
    out: dict[str, list] = {}
    for r in rows:
        out.setdefault(r.chapter_id, []).append(
            {
                "id": r.id,
                "label": r.label,
                "savedAt": r.saved_at,
                "words": r.words,
                "scenes": json.loads(r.scenes or "[]"),
            }
        )
    return out


@router.put("", status_code=204, summary="Replace one chapter's version list wholesale")
async def save_versions(body: SaveVersionsBody, db: Session = Depends(get_db)) -> Response:
    db.query(ChapterVersion).filter(
        ChapterVersion.project_id == body.projectId,
        ChapterVersion.chapter_id == body.chapterId,
    ).delete(synchronize_session=False)
    for i, v in enumerate(body.versions):
        db.add(
            ChapterVersion(
                project_id=body.projectId,
                chapter_id=body.chapterId,
                id=v.id,
                position=i,
                saved_at=v.savedAt,
                label=v.label,
                words=v.words,
                scenes=json.dumps(v.scenes or []),
            )
        )
    db.commit()
    return Response(status_code=204)
