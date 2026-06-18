"""/v1/projects — the JustWrite book domain API.

A real domain resource (not the generic `/v1/kv` blob store): book metadata
lives in columns, the snapshot body in a JSON column. `GET /v1/projects/{id}`
returns the book as structured JSON; sub-resources (chapters, characters) are
extracted from it so other clients (e.g. a future mobile app) get granular
reads. The renderer's project store will load/save through here, replacing the
kv blob (next step of the P2 migration).
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Project

router = APIRouter(tags=["projects"], prefix="/v1/projects")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _snapshot(p: Project) -> dict:
    try:
        return json.loads(p.data or "{}")
    except (json.JSONDecodeError, TypeError):
        return {}


@router.get("", summary="List books (metadata only)")
async def list_projects(db: Session = Depends(get_db)) -> list[dict]:
    rows = db.query(Project).order_by(Project.updated_at.desc()).all()
    return [
        {"id": p.id, "title": p.title, "author": p.author, "updatedAt": p.updated_at}
        for p in rows
    ]


@router.get("/{project_id}", summary="The full book as structured JSON")
async def get_project(project_id: str, db: Session = Depends(get_db)) -> dict:
    p = db.get(Project, project_id)
    if p is None:
        raise HTTPException(status_code=404, detail="project not found")
    return _snapshot(p)


@router.put("/{project_id}", status_code=204, summary="Create or replace a book")
async def put_project(project_id: str, snapshot: dict, db: Session = Depends(get_db)) -> Response:
    proj = (snapshot or {}).get("project") or {}
    title = proj.get("title") or "Untitled"
    author = proj.get("author") or ""
    data = json.dumps(snapshot or {})
    row = db.get(Project, project_id)
    if row is None:
        db.add(Project(id=project_id, title=title, author=author, updated_at=_now(), data=data))
    else:
        row.title, row.author, row.updated_at, row.data = title, author, _now(), data
    db.commit()
    return Response(status_code=204)


@router.delete("/{project_id}", status_code=204, summary="Delete a book")
async def delete_project(project_id: str, db: Session = Depends(get_db)) -> Response:
    row = db.get(Project, project_id)
    if row is not None:
        db.delete(row)
        db.commit()
    return Response(status_code=204)


@router.get("/{project_id}/chapters", summary="Flattened chapter list (extracted from the book)")
async def get_chapters(project_id: str, db: Session = Depends(get_db)) -> list[dict]:
    p = db.get(Project, project_id)
    if p is None:
        raise HTTPException(status_code=404, detail="project not found")
    snap = _snapshot(p)
    scenes = snap.get("scenes") or {}
    out: list[dict] = []
    for part in snap.get("parts") or []:
        for ch in part.get("chapters") or []:
            out.append(
                {
                    "id": ch.get("id"),
                    "num": ch.get("num"),
                    "title": ch.get("title"),
                    "words": ch.get("words", 0),
                    "status": ch.get("status"),
                    "partId": part.get("id"),
                    "partTitle": part.get("title"),
                    "sceneCount": len(scenes.get(ch.get("id"), []) or []),
                }
            )
    return out


@router.get("/{project_id}/characters", summary="Character list (extracted from the book)")
async def get_characters(project_id: str, db: Session = Depends(get_db)) -> list[Any]:
    p = db.get(Project, project_id)
    if p is None:
        raise HTTPException(status_code=404, detail="project not found")
    return _snapshot(p).get("characters") or []
