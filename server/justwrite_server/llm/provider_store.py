"""JustWrite's ProviderStore — persists the LLM provider list in the
`LlmProvider` SQLite table, **every field a real column** (no JSON blob).

This is the host side of the shared `llm_runner.llm.provider_api` router
factory: it does the real persistence work (read/write the table), the genuine
boundary RULE #8 allows — the CRUD logic, validation, and adapter-registry sync
live in the shared router, not here. JustVoice supplies its own ProviderStore;
both apps mount the same router and so expose an identical `/v1/llm-providers*`
surface to the (shared) client UI.

The table columns are exactly the shared `LLMProviderConfig` fields, so the
mapping is a 1:1 column↔attribute copy — no blob serialization, no derivation.
"""

from __future__ import annotations

from llm_runner.llm.provider_api import ProviderStore
from llm_runner.llm.schema import LLMProviderConfig

from .. import database as _db
from ..models import LlmProvider


def _row_to_config(row: LlmProvider) -> LLMProviderConfig:
    return LLMProviderConfig(
        id=row.id,
        name=row.name,
        providerType=row.provider_type,
        baseUrl=row.base_url,
        apiKey=row.api_key or None,
        defaultModel=row.default_model,
        embeddingModel=row.embedding_model,
        timeoutSeconds=row.timeout_seconds,
        local=row.local,
    )


def _apply_config(row: LlmProvider, cfg: LLMProviderConfig) -> None:
    """Copy a config onto a row (name + config columns; id/kind/built_in/position
    are managed by the store, not the config)."""
    row.name = cfg.name
    row.provider_type = cfg.providerType
    row.base_url = cfg.baseUrl
    row.api_key = cfg.apiKey or None
    row.default_model = cfg.defaultModel
    row.embedding_model = cfg.embeddingModel
    row.timeout_seconds = cfg.timeoutSeconds
    row.local = cfg.local


class LlmProviderStore:
    """ProviderStore backed by the `LlmProvider` table. Each method opens a
    short-lived session (the router calls these outside the request's `get_db`
    session), mirroring `seed.py`'s own-session pattern."""

    def _session(self):
        if _db.SessionLocal is None:
            raise RuntimeError("Database not initialized — call init_db() during boot")
        return _db.SessionLocal()

    def list(self) -> list[LLMProviderConfig]:
        db = self._session()
        try:
            rows = db.query(LlmProvider).order_by(LlmProvider.position).all()
            return [_row_to_config(r) for r in rows]
        finally:
            db.close()

    def get(self, provider_id: str) -> LLMProviderConfig | None:
        db = self._session()
        try:
            row = db.get(LlmProvider, provider_id)
            return _row_to_config(row) if row is not None else None
        finally:
            db.close()

    def add(self, cfg: LLMProviderConfig) -> None:
        db = self._session()
        try:
            row = LlmProvider(id=cfg.id, kind="llm", built_in=False, position=db.query(LlmProvider).count())
            _apply_config(row, cfg)
            db.add(row)
            db.commit()
        finally:
            db.close()

    def replace(self, provider_id: str, cfg: LLMProviderConfig) -> None:
        db = self._session()
        try:
            row = db.get(LlmProvider, provider_id)
            if row is None:
                return
            # id/built_in/kind/position are immutable on edit; only the config changes.
            _apply_config(row, cfg)
            db.commit()
        finally:
            db.close()

    def remove(self, provider_id: str) -> None:
        db = self._session()
        try:
            row = db.get(LlmProvider, provider_id)
            if row is not None:
                db.delete(row)
                db.commit()
        finally:
            db.close()


_store = LlmProviderStore()


def get_provider_store() -> ProviderStore:
    return _store
