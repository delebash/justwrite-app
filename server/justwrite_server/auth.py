"""JustWrite's auth SEAM — the settings read behind the family bearer-auth
middleware (`llm_runner.platform.BearerAuthMiddleware`, wired in app.py).

The POLICY (token check, loopback bypass, the 2026-08-05 lockout escape) lives
once in the kit — P2 of the target tree (2026-08-08) ended the era of three
hand-synced copies. What stays here is the only genuinely per-app part: where
this app keeps its auth config. JustWrite keeps it in the renderer-owned kv
settings doc (the `auth` section: `{ tokens: [...], requireForLoopback: bool }`),
read per /v1 request so a change applies live.
"""

from __future__ import annotations

import json
import logging

log = logging.getLogger(__name__)


def read_auth() -> tuple[list[str], bool]:
    """(tokens, require_for_loopback) from the `auth` settings row. Defaults to
    no auth on any read error so a settings glitch can't lock the user out."""
    from .database import SessionLocal
    from .database.models import Setting

    if SessionLocal is None:
        return [], False
    db = SessionLocal()
    try:
        row = db.get(Setting, "auth")
        if not row:
            return [], False
        cfg = json.loads(row.value) or {}
        tokens = [t for t in (cfg.get("tokens") or []) if isinstance(t, str) and t]
        return tokens, bool(cfg.get("requireForLoopback"))
    except Exception as e:  # noqa: BLE001 — never let an auth-config read 500
        log.warning("auth config read failed (treating as no-auth): %s", e)
        return [], False
    finally:
        db.close()
