"""/v1/kv — generic key/value persistence backing the renderer's storage.js.

P1 (Level 1) of the server migration: the renderer's localStorage-shaped
store (`justwrite:*` keys, opaque string values) is re-backed by this table
instead of IndexedDB. The renderer bulk-GETs at boot to hydrate its cache,
then PUTs/DELETEs on change. Normalized entity tables replace the blob in P2.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import KvEntry

router = APIRouter(tags=["kv"], prefix="/v1/kv")


class KvValue(BaseModel):
    value: str


@router.get("", summary="All key/value pairs (optionally filtered by prefix)")
async def list_kv(prefix: str | None = None, db: Session = Depends(get_db)) -> dict[str, str]:
    q = db.query(KvEntry)
    if prefix:
        q = q.filter(KvEntry.key.like(f"{prefix}%"))
    return {row.key: row.value for row in q.all()}


@router.put("/{key:path}", status_code=204, summary="Upsert one key")
async def put_kv(key: str, body: KvValue, db: Session = Depends(get_db)) -> Response:
    row = db.get(KvEntry, key)
    if row is None:
        db.add(KvEntry(key=key, value=body.value))
    else:
        row.value = body.value
    db.commit()
    return Response(status_code=204)


@router.delete("/{key:path}", status_code=204, summary="Delete one key")
async def delete_kv(key: str, db: Session = Depends(get_db)) -> Response:
    row = db.get(KvEntry, key)
    if row is not None:
        db.delete(row)
        db.commit()
    return Response(status_code=204)


@router.delete("", status_code=204, summary="Clear every key under a prefix")
async def clear_kv(prefix: str, db: Session = Depends(get_db)) -> Response:
    # `prefix` is required — no accidental wipe-all.
    db.query(KvEntry).filter(KvEntry.key.like(f"{prefix}%")).delete(synchronize_session=False)
    db.commit()
    return Response(status_code=204)
