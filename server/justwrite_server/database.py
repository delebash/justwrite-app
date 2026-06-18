"""SQLite persistence — SQLAlchemy engine + session factory.

Mirrors JustVoice's database bootstrap: init_db(data_dir) creates the engine
at <data_dir>/justwrite.db and the schema. Entity tables (projects, chapters,
RAG vectors, …) arrive in later phases of the server migration — see
docs/plans/2026-06-18-jw-server-migration.md.
"""

from __future__ import annotations

from pathlib import Path

from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker


class Base(DeclarativeBase):
    """Declarative base for all ORM models (none yet — added in P2)."""


_engine: Engine | None = None
SessionLocal: sessionmaker | None = None


def init_db(data_dir: Path) -> Engine:
    """Create the SQLite engine + session factory + schema. Idempotent."""
    global _engine, SessionLocal
    data_dir.mkdir(parents=True, exist_ok=True)
    db_path = data_dir / "justwrite.db"
    _engine = create_engine(f"sqlite:///{db_path}", future=True)
    SessionLocal = sessionmaker(
        bind=_engine, autoflush=False, expire_on_commit=False, future=True
    )
    Base.metadata.create_all(_engine)
    return _engine


def get_engine() -> Engine | None:
    return _engine
