# SPDX-License-Identifier: MIT
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

from .database import session as _db
from .database.models import Base, Setting


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
    from .api.settings_api import PRESERVED_FOLDER_KEYS
    from .database.seed import seed_workspace

    # Unload models FIRST, while the config they were spawned from still exists.
    _stop_runner_best_effort()

    engine = _db.engine

    # D3b (2026-07-13, user): a user-changed FOLDER PATH never resets. Capture the
    # folder-path config rows (autosaveDir / chooserDirs) BEFORE the drop and
    # re-insert them AFTER the reseed, so a relocated autosave folder + remembered
    # chooser locations survive a workspace reset (the data root already survives
    # via the Rust dataroot.txt pointer). Same whitelist as DELETE /v1/settings.
    preserved: dict[str, str] = {}
    pre = _db.SessionLocal()
    try:
        for row in pre.query(Setting).filter(Setting.key.in_(PRESERVED_FOLDER_KEYS)).all():
            preserved[row.key] = row.value
    finally:
        pre.close()

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
        # Restore the preserved folder-path config (user value wins over any seed).
        for key, value in preserved.items():
            existing = db.get(Setting, key)
            if existing is None:
                db.add(Setting(key=key, value=value))
            else:
                existing.value = value
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
