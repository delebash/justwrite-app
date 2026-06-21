"""JustWrite's ProviderStore — persists the LLM provider list in the
`LlmProvider` SQLite table (the queryable provider registry from P5).

This is the host side of the shared `llm_runner.llm.provider_api` router
factory: it does the real persistence work (read/write the table), the genuine
boundary RULE #8 allows — the CRUD logic, validation, and adapter-registry sync
live in the shared router, not here. JustVoice supplies its own ProviderStore
over `settings.engines.llm`; both apps mount the same router and so expose an
identical `/v1/llm-providers*` surface to the (shared) client UI.

Shape mapping. The `LlmProvider` table predates the shared camelCase
`LLMProviderConfig`: its `data` blob held the renderer's old
`{kind, runner, chatModel, builtIn}` object, and the gateway (`api/llm.py`,
which stays until feature execution moves server-side) reads `runner` / `baseUrl`
/ `apiKey` from it. So this store maps both ways and writes a **superset** blob:
the camelCase shared fields (so GET round-trips the shared contract) plus the
keys the gateway needs. `providerType` is derived behavior-preservingly —
`claude`/`gemini` stay `openai-compat` because every JustWrite cloud provider
uses the OpenAI-compatible endpoint today (all route through the one
OpenAICompatAdapter); the native anthropic/gemini migration is a separate,
post-verification step (plan Decision 20).
"""

from __future__ import annotations

import json

from llm_runner.llm.provider_api import ProviderStore
from llm_runner.llm.schema import LLMProviderConfig

from .. import database as _db
from ..models import LlmProvider

# Legacy provider ids whose shared `providerType` is known. Everything else —
# including `claude`/`gemini` (which used Anthropic's/Google's OpenAI-compatible
# endpoints) and any user-added entry — maps to `openai-compat`, preserving
# today's behavior (one OpenAICompatAdapter serves every cloud provider).
_KNOWN_TYPES = {
    "openai": "openai",
    "deepseek": "deepseek",
    "openrouter": "openrouter",
}


def _derive_provider_type(blob: dict) -> str:
    pt = blob.get("providerType")
    if pt:
        return str(pt)
    if str(blob.get("runner") or "").lower() == "llamacpp":
        return "local-llamacpp"
    return _KNOWN_TYPES.get(str(blob.get("id") or ""), "openai-compat")


def _blob_to_config(blob: dict) -> LLMProviderConfig:
    return LLMProviderConfig(
        id=str(blob.get("id") or ""),
        name=str(blob.get("name") or ""),
        providerType=_derive_provider_type(blob),
        baseUrl=str(blob.get("baseUrl") or ""),
        apiKey=(blob.get("apiKey") or None),
        # New blobs carry `defaultModel`; legacy seed blobs carry `chatModel`.
        defaultModel=str(blob.get("defaultModel") or blob.get("chatModel") or ""),
        embeddingModel=str(blob.get("embeddingModel") or ""),
        timeoutSeconds=int(blob.get("timeoutSeconds") or 60),
    )


def _config_to_blob(cfg: LLMProviderConfig) -> dict:
    """Serialize a config to the `data` blob — camelCase shared fields plus the
    keys the gateway reads. `runner` is set for native Ollama so the gateway's
    `_is_ollama` pin keeps firing even at a non-:11434 base URL."""
    blob: dict = {
        "id": cfg.id,
        "name": cfg.name,
        "providerType": cfg.providerType,
        "baseUrl": cfg.baseUrl,
        "apiKey": cfg.apiKey or "",
        "defaultModel": cfg.defaultModel,
        "embeddingModel": cfg.embeddingModel,
        "timeoutSeconds": cfg.timeoutSeconds,
    }
    if cfg.providerType == "ollama":
        blob["runner"] = "ollama"
    elif cfg.providerType == "local-llamacpp":
        blob["runner"] = "llamacpp"
    return blob


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
            return [_blob_to_config(json.loads(r.data)) for r in rows]
        finally:
            db.close()

    def get(self, provider_id: str) -> LLMProviderConfig | None:
        db = self._session()
        try:
            row = db.get(LlmProvider, provider_id)
            return _blob_to_config(json.loads(row.data)) if row is not None else None
        finally:
            db.close()

    def add(self, cfg: LLMProviderConfig) -> None:
        db = self._session()
        try:
            pos = db.query(LlmProvider).count()
            db.add(LlmProvider(
                id=cfg.id,
                name=cfg.name,
                kind="llm",
                built_in=False,
                position=pos,
                data=json.dumps(_config_to_blob(cfg)),
            ))
            db.commit()
        finally:
            db.close()

    def replace(self, provider_id: str, cfg: LLMProviderConfig) -> None:
        db = self._session()
        try:
            row = db.get(LlmProvider, provider_id)
            if row is None:
                return
            # id/built_in/kind/position are immutable on edit; only name + the
            # config blob change.
            row.name = cfg.name
            row.data = json.dumps(_config_to_blob(cfg))
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
