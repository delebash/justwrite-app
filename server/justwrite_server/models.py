"""ORM model definitions for the JustWrite SQLite database.

P1 (Level 1 of the server migration): a generic key/value table backs the
renderer's `storage.js` seam — the localStorage-shaped `justwrite:*` keys
move off IndexedDB into SQLite with minimal store changes. Normalized entity
tables (chapters, characters, …) replace the blob model in P2. Mirrors
JustVoice's model conventions (declarative_base, String/Text columns).
See docs/plans/2026-06-18-jw-server-migration.md.
"""

from __future__ import annotations

from sqlalchemy import Column, Integer, String, Text
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


class Project(Base):
    """A JustWrite book — a real domain resource, not a blob in the generic kv
    store. Metadata lives in queryable columns; the full snapshot body lives in
    the `data` JSON column. Per-entity tables (chapters, characters, …) can be
    carved out of `data` in a later pass; this already gives a domain table + a
    `load book → JSON` API and a queryable book list.
    """

    __tablename__ = "projects"

    id = Column(String, primary_key=True)
    title = Column(String, nullable=False, default="Untitled")
    author = Column(String, nullable=False, default="")
    updated_at = Column(String, nullable=False, default="")
    data = Column(Text, nullable=False, default="{}")  # full snapshot JSON


class RagMeta(Base):
    """Per-project RAG index metadata — the embedding model it was built with
    and the vector dimensionality (so the renderer can detect a model switch)."""

    __tablename__ = "rag_meta"

    project_id = Column(String, primary_key=True)
    model = Column(String, nullable=False, default="")
    dims = Column(Integer, nullable=False, default=0)


class RagVector(Base):
    """One embedded manuscript chunk. Moves the RAG index off the renderer
    (it used to load the whole vector blob and cosine-search in JS) into a
    per-project table the server searches. `vector` and `chunk` are JSON."""

    __tablename__ = "rag_vectors"

    project_id = Column(String, primary_key=True)
    chunk_id = Column(String, primary_key=True)
    sha = Column(String, nullable=False, default="")
    vector = Column(Text, nullable=False, default="[]")  # JSON number[]
    chunk = Column(Text, nullable=False, default="{}")   # JSON chunk metadata
