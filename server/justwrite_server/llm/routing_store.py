"""JustWrite's RoutingStore — the default LLM/embedding, Quick/Accuracy roles,
and per-feature pins, persisted in the `ai` section of the settings document.

Host side of the shared `llm_runner.llm.routing_api` router factory (the genuine
persistence boundary RULE #8 allows — the GET/PUT logic lives in the shared
router). The `ai` settings row is the same blob `llm/config.py` reads to build
the dispatch `LLMConfig`, so what the Features tab saves here immediately drives
routing. Read-modify-write preserves any other keys the renderer owns in `ai`.
"""

from __future__ import annotations

import json

from llm_runner.llm import RoutingConfig
from llm_runner.llm.routing_api import FeaturePin, RoleTarget, RoutingDefaults

from .. import database as _db
from ..models import Setting

_AI_KEY = "ai"


def _read_ai() -> dict:
    if _db.SessionLocal is None:
        return {}
    db = _db.SessionLocal()
    try:
        row = db.get(Setting, _AI_KEY)
        if row is None:
            return {}
        val = json.loads(row.value or "null")
        return val if isinstance(val, dict) else {}
    finally:
        db.close()


def _write_ai(blob: dict) -> None:
    if _db.SessionLocal is None:
        raise RuntimeError("Database not initialized — call init_db() during boot")
    db = _db.SessionLocal()
    try:
        encoded = json.dumps(blob)
        row = db.get(Setting, _AI_KEY)
        if row is None:
            db.add(Setting(key=_AI_KEY, value=encoded))
        else:
            row.value = encoded
        db.commit()
    finally:
        db.close()


def _role(d) -> RoleTarget:
    if not isinstance(d, dict):
        return RoleTarget()
    return RoleTarget(providerId=str(d.get("providerId") or ""), model=str(d.get("model") or ""))


class JwRoutingStore:
    """RoutingStore over the `ai` settings blob."""

    def get_routing(self) -> RoutingConfig:
        ai = _read_ai()
        roles = ai.get("llmRoles") or {}
        pins = {}
        for k, v in (ai.get("featurePins") or {}).items():
            if isinstance(v, dict):
                pins[k] = FeaturePin(
                    providerId=str(v.get("providerId") or ""),
                    model=str(v.get("model") or ""),
                    role=str(v.get("role") or ""),
                )
        return RoutingConfig(
            default=RoutingDefaults(
                llmId=str(ai.get("defaultLlmId") or ""),
                embeddingId=str(ai.get("defaultEmbeddingId") or ""),
            ),
            quick=_role(roles.get("quick")),
            accuracy=_role(roles.get("accuracy")),
            pins=pins,
        )

    def set_routing(self, cfg: RoutingConfig) -> None:
        ai = _read_ai()  # preserve other renderer-owned keys in the `ai` section
        ai["defaultLlmId"] = cfg.default.llmId
        ai["defaultEmbeddingId"] = cfg.default.embeddingId
        ai["llmRoles"] = {
            "quick": {"providerId": cfg.quick.providerId, "model": cfg.quick.model},
            "accuracy": {"providerId": cfg.accuracy.providerId, "model": cfg.accuracy.model},
        }
        # Only persist a pin that actually routes somewhere (explicit provider or
        # an inherited role); "inherit default" is the absence of a pin.
        ai["featurePins"] = {
            k: {"providerId": p.providerId, "model": p.model, "role": p.role}
            for k, p in cfg.pins.items()
            if p.providerId or p.role
        }
        _write_ai(ai)


_store = JwRoutingStore()


def get_routing_store() -> JwRoutingStore:
    return _store
