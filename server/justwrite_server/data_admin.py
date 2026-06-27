# SPDX-License-Identifier: GPL-3.0-or-later
"""Host wiring for the shared data backup/restore/reset router
(`llm_runner.platform.make_data_router`). JustWrite keeps everything in its
SQLite DB, so no extra asset dirs — a DB backup is the whole workspace. Backup +
reset cover BOTH bases: JustWrite's domain tables and the shared LLM tables
(`LlmBase`), which live on the same DB. `run_reset` wipes every table + reseeds.
"""

from __future__ import annotations

from fastapi import APIRouter

from llm_runner.llm import LlmBase
from llm_runner.platform import make_data_router

from . import database as _db
from .models import Base


def _reset() -> None:
    if _db.engine is None or _db.SessionLocal is None:
        return
    from .seed import seed_workspace

    engine = _db.engine
    # True drop + reseed (project policy: no migrations). DROP + CREATE recreates
    # the SCHEMA, not just the rows — so a reset also recovers from schema drift
    # (e.g. a column added to an LLM table since this DB was first created). A
    # row-only wipe leaves the stale schema, so the app would still 500 on the
    # missing column. Covers BOTH bases (domain + the shared LLM tables).
    Base.metadata.drop_all(bind=engine)
    LlmBase.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    LlmBase.metadata.create_all(bind=engine)

    db = _db.SessionLocal()
    try:
        seed_workspace(db)
        db.commit()
    finally:
        db.close()


def get_data_router() -> APIRouter:
    return make_data_router(
        get_db_path=lambda: _db._db_path,
        metadata=[Base.metadata, LlmBase.metadata],
        run_reset=_reset,
        asset_dirs=lambda: {},
    )
