"""/v1/prefs — the family door to the renderer's preferences document.

JustWrite's `/v1/settings` (settings_api.py) has always BEEN the renderer's
preferences document — one row per section (ui / ai / hardwarePresets /
activeProjectId / …) — while also carrying rows the SERVER reads (auth, cors,
the D3b folder-path config). Target-tree P9 gives the family one renderer-prefs
wire: this router maps that same document onto the kit's `/v1/prefs` contract —
same rows, same wholesale-per-section semantics, kit-owned router. The deeper
split (operator rows to a typed /v1/settings, renderer sections here only) is
recorded future work in the target tree, not this mapping.

DELETE here = the D3b-aware clear settings_api's DELETE performs: a
user-changed folder path never resets, so the PRESERVED_FOLDER_KEYS whitelist
(one source of truth, imported from settings_api) survives.

Module-attr session access, not a from-import: `SessionLocal` is REBOUND by
init_db, so a from-import would freeze the pre-boot None (the P5 server_auth
lesson).
"""

from __future__ import annotations

import json
from typing import Any

from llm_runner.platform import make_prefs_router

from ..database import session as _db
from ..database.models import Setting
from .settings_api import PRESERVED_FOLDER_KEYS


def _read_all() -> dict[str, Any]:
    db = _db.SessionLocal()
    try:
        out: dict[str, Any] = {}
        for row in db.query(Setting).all():
            try:
                out[row.key] = json.loads(row.value)
            except (ValueError, TypeError):
                out[row.key] = None
        return out
    finally:
        db.close()


def _write_many(patch: dict[str, Any]) -> None:
    db = _db.SessionLocal()
    try:
        for key, value in patch.items():
            encoded = json.dumps(value)
            row = db.get(Setting, key)
            if row is None:
                db.add(Setting(key=key, value=encoded))
            else:
                row.value = encoded
        db.commit()
    finally:
        db.close()


def _clear() -> None:
    db = _db.SessionLocal()
    try:
        db.query(Setting).filter(Setting.key.notin_(PRESERVED_FOLDER_KEYS)).delete(
            synchronize_session=False
        )
        db.commit()
    finally:
        db.close()


router = make_prefs_router(read_all=_read_all, write_many=_write_many, clear=_clear)
