"""/v1/settings — the renderer's preferences document (real rows, not kv blobs).

One row per top-level section (ui / ai / hardwarePresets / activeProjectId / …);
GET assembles them into a single document, PATCH upserts the sections it's given.
Each section has a single renderer-side owner that writes it wholesale, so a
shallow per-section upsert is the right merge — a deep merge would fail to
propagate key DELETIONS (e.g. clearing a model-tier override drops a key from
the `ai` section). Mirrors JustVoice's GET/PATCH /v1/settings shape; values are
real JSON the server parses, not the opaque strings the old `justwrite:*` kv
blobs held.
"""

from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Setting

router = APIRouter(tags=["settings"], prefix="/v1/settings")


def _read_all(db: Session) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for row in db.query(Setting).all():
        try:
            out[row.key] = json.loads(row.value)
        except (ValueError, TypeError):
            out[row.key] = None
    return out


@router.get("", summary="The full settings document")
async def get_settings(db: Session = Depends(get_db)) -> dict:
    return _read_all(db)


@router.patch("", summary="Upsert the given top-level sections; returns the merged document")
async def patch_settings(patch: dict[str, Any], db: Session = Depends(get_db)) -> dict:
    for key, value in patch.items():
        encoded = json.dumps(value)
        row = db.get(Setting, key)
        if row is None:
            db.add(Setting(key=key, value=encoded))
        else:
            row.value = encoded
    db.commit()
    return _read_all(db)


@router.delete("", status_code=204, summary="Clear the whole settings document (reset workspace)")
async def clear_settings(db: Session = Depends(get_db)) -> Response:
    db.query(Setting).delete(synchronize_session=False)
    db.commit()
    return Response(status_code=204)
