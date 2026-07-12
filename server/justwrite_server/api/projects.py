"""/v1/projects — the JustWrite book domain API.

The book lives in the **normalized per-entity tables** (parts/chapters/scenes/
characters/…); `book_io.assemble`/`decompose` convert between those rows and the
renderer's snapshot JSON. See docs/plans/2026-06-18-jw-p2-normalization-design.md.

The aggregate seam the renderer uses is `GET/PUT /v1/projects/{id}/book`
(assemble / decompose). The bare `/{id}` GET/PUT are back-compat aliases of it,
and the per-entity reads (`/chapters`, `/characters`, …) are extracted from the
assembled book so other clients (e.g. a future mobile app) get granular JSON.
Everything reads/writes the same tables — there is no separate snapshot blob
(`Project.data` is retired once a project is normalized; the one-time blob
migration lives in migrations.py).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from .. import book_io
from ..database import get_db
from ..models import Project

router = APIRouter(tags=["projects"], prefix="/v1/projects")


def _assemble_or_404(db: Session, project_id: str) -> dict:
    snap = book_io.assemble(db, project_id)
    if snap is None:
        raise HTTPException(status_code=404, detail="project not found")
    return snap


@router.get("", summary="List books (metadata only)")
async def list_projects(db: Session = Depends(get_db)) -> list[dict]:
    rows = db.query(Project).order_by(Project.updated_at.desc()).all()
    return [
        {"id": p.id, "title": p.title, "author": p.author, "updatedAt": p.updated_at}
        for p in rows
    ]


@router.post("/demo", summary="Create (or return) the tutorial demo book on demand")
async def create_demo(db: Session = Depends(get_db)) -> dict:
    """QC-40: the sample book — "The Ninth Facet" — is no longer
    seeded at boot; the renderer's "Try tutorial project" button creates it HERE
    on demand. Fixed id: never duplicated, and re-creatable after the user
    deletes it. Returns the metadata the renderer needs to register + open it."""
    from ..demo_seed import DEMO_PROJECT_ID
    from ..seed import create_demo_project

    created = create_demo_project(db)
    if created:
        db.commit()
    row = db.get(Project, DEMO_PROJECT_ID)
    return {"id": row.id, "title": row.title, "author": row.author, "created": created}


@router.get("/{project_id}", summary="The full book as structured JSON (alias of /book)")
async def get_project(project_id: str, db: Session = Depends(get_db)) -> dict:
    return _assemble_or_404(db, project_id)


@router.put("/{project_id}", status_code=204, summary="Create or replace a book (alias of /book)")
async def put_project(project_id: str, snapshot: dict, db: Session = Depends(get_db)) -> Response:
    book_io.decompose(db, project_id, snapshot or {})
    db.commit()
    return Response(status_code=204)


@router.delete("/{project_id}", status_code=204, summary="Delete a book")
async def delete_project(project_id: str, db: Session = Depends(get_db)) -> Response:
    row = db.get(Project, project_id)
    if row is not None:
        db.delete(row)  # child rows cascade via the project_id FK
        db.commit()
    return Response(status_code=204)


@router.get("/{project_id}/book", summary="The full book assembled from the normalized tables")
async def get_book(project_id: str, db: Session = Depends(get_db)) -> dict:
    return _assemble_or_404(db, project_id)


@router.put(
    "/{project_id}/book",
    status_code=204,
    summary="Replace the book — decompose a snapshot into the normalized tables",
)
async def put_book(project_id: str, snapshot: dict, db: Session = Depends(get_db)) -> Response:
    book_io.decompose(db, project_id, snapshot or {})
    db.commit()
    return Response(status_code=204)


@router.get("/{project_id}/chapters", summary="Flattened chapter list (from the normalized tables)")
async def get_chapters(project_id: str, db: Session = Depends(get_db)) -> list[dict]:
    snap = _assemble_or_404(db, project_id)
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


@router.get("/{project_id}/characters", summary="Character list (from the normalized tables)")
async def get_characters(project_id: str, db: Session = Depends(get_db)) -> list:
    return _assemble_or_404(db, project_id).get("characters") or []
