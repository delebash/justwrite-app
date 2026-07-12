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


def _stop_runner_best_effort() -> None:
    """Full runner teardown (unload every child + clear the VRAM ledger). A reset or
    restore is a CLEAN SLATE (2026-07-11, user decision): children spawned under
    pre-reset tunes/routing must not keep running while the UI claims the new config
    is loaded. Best-effort — a reset must never fail on teardown."""
    try:
        from llm_runner.runner.lifecycle import get_service

        get_service().stop()
    except Exception:  # noqa: BLE001
        pass


def _reset() -> None:
    if _db.engine is None or _db.SessionLocal is None:
        return
    from .seed import seed_workspace

    # Unload models FIRST, while the config they were spawned from still exists.
    _stop_runner_best_effort()

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
        # A restore replaces routing/tunes under the live app — same clean-slate rule
        # as reset: no child keeps running under the pre-restore config.
        on_replaced=_stop_runner_best_effort,
    )
