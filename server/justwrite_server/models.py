"""ORM model definitions for the JustWrite SQLite database.

P1 (Level 1 of the server migration): a generic key/value table backs the
renderer's `storage.js` seam — the localStorage-shaped `justwrite:*` keys
move off IndexedDB into SQLite with minimal store changes. Normalized entity
tables (chapters, characters, …) replace the blob model in P2. Mirrors
JustVoice's model conventions (declarative_base, String/Text columns).
See docs/plans/2026-06-18-jw-server-migration.md.
"""

from __future__ import annotations

from sqlalchemy import Column, String, Text
from sqlalchemy.orm import declarative_base

Base = declarative_base()


class KvEntry(Base):
    """One localStorage-shaped key/value pair.

    `key` is the renderer's storage key (e.g. `justwrite:project`); `value`
    is the opaque string the renderer wrote (a JSON blob today).
    """

    __tablename__ = "kv"

    key = Column(String, primary_key=True)
    value = Column(Text, nullable=False)
