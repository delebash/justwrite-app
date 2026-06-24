# SPDX-License-Identifier: GPL-3.0-or-later
"""Host wiring for the shared data backup/restore/reset router
(`llm_runner.platform.make_data_router`). JustWrite keeps everything in its
SQLite DB (images are inline data-URLs or Tauri-client files), so no extra
asset dirs — a DB backup is the whole workspace. `run_reset` is the old
`DELETE /v1/workspace` body: wipe every table + reseed to first-run state.
"""

from __future__ import annotations

from fastapi import APIRouter

from llm_runner.platform import make_data_router

from . import database as _db
from .models import Base


def _reset() -> None:
    if _db.SessionLocal is None:
        return
    from .seed import seed_workspace

    db = _db.SessionLocal()
    try:
        for table in reversed(Base.metadata.sorted_tables):
            db.execute(table.delete())
        db.commit()
        seed_workspace(db)
        db.commit()
    finally:
        db.close()


def get_data_router() -> APIRouter:
    return make_data_router(
        get_db_path=lambda: _db._db_path,
        metadata=Base.metadata,
        run_reset=_reset,
        asset_dirs=lambda: {},
    )
