"""SQLite via SQLAlchemy — primary persistence layer (the family package shape).

`session.py` owns the engine/session bootstrap, `models.py` the entity tables,
`seed.py` + `demo_seed.py` the workspace seeding (target-tree P5 — mirrors
JustVoice's `database/`).

`SessionLocal` and `engine` are module globals REBOUND by init_db, so this
package forwards them lazily (PEP 562) — a plain re-export here would freeze
the pre-boot None forever. Import them late (or via `from . import session`)
exactly as before; the stable callables are re-exported directly.
"""

from __future__ import annotations

from .session import get_db, get_engine, init_db

__all__ = ["SessionLocal", "engine", "get_db", "get_engine", "init_db"]


def __getattr__(name: str):
    if name in ("SessionLocal", "engine"):
        from . import session

        return getattr(session, name)
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
