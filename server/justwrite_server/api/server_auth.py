"""GET/PUT /v1/server-auth — the bearer-token door, and the lockout escape.

The family shape (docgen built it first, 2026-08-05; the apps work the same —
user ruling): auth config gets its OWN route instead of riding the generic
settings API, so the middleware can exempt exactly THIS door (plus /v1/health)
for loopback clients. Without the exemption, `requireForLoopback` + a lost
token gated even the boot probe and every way to fix it — the desktop app died
on ConnectionError forever. The tokens already sit plaintext in the app DB any
local process can read, so the loopback door exposes nothing new.
"""

from __future__ import annotations

import json

from fastapi import APIRouter, HTTPException

from ..database import SessionLocal
from ..models import Setting

router = APIRouter(tags=["system"])


def _read() -> dict:
    if SessionLocal is None:
        return {"tokens": [], "requireForLoopback": False}
    db = SessionLocal()
    try:
        row = db.get(Setting, "auth")
        cfg = json.loads(row.value) if row and row.value else {}
        return {
            "tokens": [t for t in (cfg.get("tokens") or []) if isinstance(t, str) and t],
            "requireForLoopback": bool(cfg.get("requireForLoopback")),
        }
    except Exception:  # noqa: BLE001 — an unreadable row means no auth, never a 500
        return {"tokens": [], "requireForLoopback": False}
    finally:
        db.close()


@router.get("/v1/server-auth", summary="Bearer-token config (loopback never locks out)")
async def get_server_auth() -> dict:
    return _read()


@router.put("/v1/server-auth", summary="Replace the bearer-token config")
async def put_server_auth(body: dict) -> dict:
    tokens = body.get("tokens")
    if not isinstance(tokens, list) or not all(isinstance(t, str) for t in tokens):
        raise HTTPException(400, "tokens must be a list of strings")
    cfg = {"tokens": [t for t in tokens if t.strip()],
           "requireForLoopback": bool(body.get("requireForLoopback"))}
    if SessionLocal is None:
        raise HTTPException(503, "database not ready")
    db = SessionLocal()
    try:
        row = db.get(Setting, "auth")
        if row is None:
            row = Setting(key="auth", value=json.dumps(cfg))
            db.add(row)
        else:
            row.value = json.dumps(cfg)
        db.commit()
    finally:
        db.close()
    return cfg
