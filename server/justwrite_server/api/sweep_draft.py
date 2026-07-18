"""/v1/projects/*/sweep-draft — the entity sweep's per-project working draft.

A (2026-07-18): the sweep writes each chapter's raw extraction result here as
it finishes, so a crash/cancel/close never loses an hour-long run — reopening
the sweep modal resumes from the draft and only re-scans pending, failed, or
text-changed chapters. The draft is working state, NOT the book: nothing lands
in the story bible until the user accepts proposals, and the draft is cleared
on accept or Start-over.

Shape is renderer-owned (services/analysis/sweepDraft.js is the one writer);
the server stores the document opaquely, like the autosave mirror. GET returns
{"draft": null} rather than 404 when absent — absence is the normal first-run
state, not an error.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Project, SweepDraft

router = APIRouter(tags=["sweep-draft"], prefix="/v1/projects")


@router.get("/{project_id}/sweep-draft", summary="The sweep draft for a project (null when absent)")
async def get_sweep_draft(project_id: str, db: Session = Depends(get_db)) -> dict:
    row = db.get(SweepDraft, project_id)
    if row is None:
        return {"draft": None, "updatedAt": ""}
    try:
        draft = json.loads(row.data)
    except (ValueError, TypeError):
        draft = None
    return {"draft": draft, "updatedAt": row.updated_at}


@router.put("/{project_id}/sweep-draft", summary="Create or replace the sweep draft")
async def put_sweep_draft(project_id: str, draft: dict, db: Session = Depends(get_db)) -> dict:
    # The FK to projects.id makes an orphan draft impossible — surface a clean
    # 404 instead of an IntegrityError when the project doesn't exist.
    if db.get(Project, project_id) is None:
        raise HTTPException(status_code=404, detail="project not found")
    now = datetime.now(timezone.utc).isoformat()
    row = db.get(SweepDraft, project_id)
    if row is None:
        db.add(SweepDraft(project_id=project_id, data=json.dumps(draft or {}), updated_at=now))
    else:
        row.data = json.dumps(draft or {})
        row.updated_at = now
    db.commit()
    return {"ok": True, "updatedAt": now}


@router.delete("/{project_id}/sweep-draft", status_code=204, summary="Delete the sweep draft")
async def delete_sweep_draft(project_id: str, db: Session = Depends(get_db)) -> Response:
    row = db.get(SweepDraft, project_id)
    if row is not None:
        db.delete(row)
        db.commit()
    return Response(status_code=204)
