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

# D3b (2026-07-13, user): a user-changed FOLDER PATH never resets. These setting
# keys are folder-path CONFIG, not workspace data — `autosaveDir` (the autosave
# folder) and `chooserDirs` (every remembered file/folder-dialog location) — and
# survive a workspace reset the way the data root already does (via the Rust
# dataroot.txt pointer kept outside the wiped root). BOTH reset paths preserve
# them: DELETE /v1/settings here, and the shared /v1/data/reset in data_admin.py
# (which imports this whitelist so there's one source of truth).
PRESERVED_FOLDER_KEYS = ("autosaveDir", "chooserDirs")


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


@router.delete("", status_code=204, summary="Clear the settings document (reset workspace), keeping folder-path config")
async def clear_settings(db: Session = Depends(get_db)) -> Response:
    # D3b: wipe every section EXCEPT the folder-path config whitelist — a
    # user-changed folder path never resets.
    db.query(Setting).filter(Setting.key.notin_(PRESERVED_FOLDER_KEYS)).delete(
        synchronize_session=False
    )
    db.commit()
    return Response(status_code=204)
