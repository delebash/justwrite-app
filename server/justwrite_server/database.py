"""SQLite via SQLAlchemy — primary persistence layer for the JustWrite server.

Mirrors JustVoice's session bootstrap: engine + sessionmaker + a `get_db`
FastAPI dependency, `check_same_thread=False` so uvicorn's worker threads can
share the engine, and a per-connection foreign-keys PRAGMA. Entity tables
live in models.py; init_db creates them. See
docs/plans/2026-06-18-jw-server-migration.md.
"""

from __future__ import annotations

import logging
from pathlib import Path

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from .models import Base

log = logging.getLogger(__name__)

engine: Engine | None = None
SessionLocal: sessionmaker | None = None
_db_path: Path | None = None


def init_db(data_dir: Path) -> Engine:
    """Create the engine + session factory + tables. Idempotent; re-inits when
    a DIFFERENT data_dir is requested so pytest's create_app(tmp_path) doesn't
    pin every later call to the first dir (the JustVoice guard)."""
    global engine, SessionLocal, _db_path

    if engine is not None:
        if _db_path is not None and _db_path.parent == Path(data_dir):
            return engine
        engine.dispose()
        engine = None
        SessionLocal = None

    data_dir.mkdir(parents=True, exist_ok=True)
    _db_path = data_dir / "justwrite.db"
    engine = create_engine(
        f"sqlite:///{_db_path}",
        connect_args={"check_same_thread": False},
    )

    @event.listens_for(engine, "connect")
    def _enable_foreign_keys(dbapi_connection, _record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)

    # Idempotent migrations: add columns an upgraded `projects` table lacks,
    # then decompose any legacy data blob into the normalized tables (P2.2).
    # Imported here to avoid a database -> migrations -> book_io import cycle.
    from .migrations import migrate_blobs, migrate_schema

    migrate_schema(engine)
    db = SessionLocal()
    try:
        migrate_blobs(db)
    finally:
        db.close()

    log.info("Database: %s", _db_path)
    return engine


def get_engine() -> Engine | None:
    return engine


def get_db() -> Session:
    """FastAPI dependency — yield a session, close it on exit."""
    if SessionLocal is None:
        raise RuntimeError("Database not initialized — call init_db() during boot")
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
