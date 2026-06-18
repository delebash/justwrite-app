"""/v1/rag — server-side RAG vector store + hybrid retrieval, per project.

Moves the manuscript-chat index off the renderer: vectors used to load as one
big blob (justwrite:rag:<id>) and hybrid-search (BM25 + cosine via RRF) in JS.
Now the renderer embeds chunks (via its provider) and PUTs them here; diff is a
`shas` fetch; retrieval is a POST that returns the top-k chunks ranked
server-side by the same BM25 + cosine + RRF blend (see rag_search.py).
"""

from __future__ import annotations

import json

from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import RagMeta, RagVector
from ..rag_search import hybrid_rank

router = APIRouter(tags=["rag"], prefix="/v1/rag")


class RagItem(BaseModel):
    chunkId: str
    sha: str
    vector: list[float]
    chunk: dict


class RagPutBody(BaseModel):
    model: str = ""
    items: list[RagItem]


class RagSearchBody(BaseModel):
    vector: list[float]
    queryText: str = ""
    k: int = 8


class RagRemoveBody(BaseModel):
    ids: list[str]


@router.get("/{project_id}/status", summary="Index size + model + dims")
async def status(project_id: str, db: Session = Depends(get_db)) -> dict:
    meta = db.get(RagMeta, project_id)
    count = db.query(RagVector).filter(RagVector.project_id == project_id).count()
    return {
        "exists": count > 0,
        "count": count,
        "model": meta.model if meta else "",
        "dims": meta.dims if meta else 0,
    }


@router.get("/{project_id}/shas", summary="chunkId -> sha (for incremental diff)")
async def shas(project_id: str, db: Session = Depends(get_db)) -> dict:
    rows = (
        db.query(RagVector.chunk_id, RagVector.sha)
        .filter(RagVector.project_id == project_id)
        .all()
    )
    return {cid: sha for cid, sha in rows}


@router.put("/{project_id}", status_code=204, summary="Upsert a batch of embedded chunks")
async def put_vectors(project_id: str, body: RagPutBody, db: Session = Depends(get_db)) -> Response:
    dims = len(body.items[0].vector) if body.items else 0
    meta = db.get(RagMeta, project_id)
    if meta is None:
        db.add(RagMeta(project_id=project_id, model=body.model, dims=dims))
    else:
        if body.model:
            meta.model = body.model
        if dims:
            meta.dims = dims
    for it in body.items:
        db.merge(
            RagVector(
                project_id=project_id,
                chunk_id=it.chunkId,
                sha=it.sha,
                vector=json.dumps(it.vector),
                chunk=json.dumps(it.chunk),
            )
        )
    db.commit()
    return Response(status_code=204)


@router.post("/{project_id}/search", summary="Top-k chunks by hybrid BM25 + cosine (RRF)")
async def search(project_id: str, body: RagSearchBody, db: Session = Depends(get_db)) -> list[dict]:
    rows = db.query(RagVector).filter(RagVector.project_id == project_id).all()
    if not rows:
        return []
    items = []
    for r in rows:
        chunk = json.loads(r.chunk)
        items.append(
            {
                "id": r.chunk_id,
                "vector": json.loads(r.vector),
                "text": chunk.get("text", ""),
                "chunk": chunk,
            }
        )
    return hybrid_rank(items, body.vector, body.queryText, body.k)


@router.post("/{project_id}/remove", status_code=204, summary="Remove a batch of chunk ids")
async def remove(project_id: str, body: RagRemoveBody, db: Session = Depends(get_db)) -> Response:
    if body.ids:
        db.query(RagVector).filter(
            RagVector.project_id == project_id, RagVector.chunk_id.in_(body.ids)
        ).delete(synchronize_session=False)
        db.commit()
    return Response(status_code=204)


@router.delete("/{project_id}", status_code=204, summary="Clear a project's whole index")
async def clear(project_id: str, db: Session = Depends(get_db)) -> Response:
    db.query(RagVector).filter(RagVector.project_id == project_id).delete(synchronize_session=False)
    meta = db.get(RagMeta, project_id)
    if meta is not None:
        db.delete(meta)
    db.commit()
    return Response(status_code=204)
