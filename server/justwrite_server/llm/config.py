"""JustWrite's LLM config — the boundary between JW's stored settings and the
shared `llm_runner.llm` dispatch (mirror of JustVoice's `engines/llm/config.py`).

Holds the two genuinely app-specific things the shared dispatch needs:
  1. JW's **feature catalog → default role** (which features exist, quick vs
     accuracy) — per-app data the shared dispatch is parameterized on.
  2. The **mapping** from JW's stored settings to the shared `LLMConfig`:
     providers from the `LlmProvider` table, and feature pins + the global
     default provider from the renderer's `ai` settings blob (which the client
     already persists via `/v1/settings`, so nothing new to store server-side).
"""

from __future__ import annotations

import json

from llm_runner.llm import LLMConfig
from llm_runner.llm.schema import FeaturePinConfig, LLMRolesSettings, LLMRoleTarget

from .. import database as _db
from ..feature_catalog import FEATURE_CATALOG
from ..models import Setting
from .provider_store import get_provider_store

# JW feature catalog → default role, derived from the single catalog source
# (feature_catalog.py) so labels/hints/roles never drift across the routing
# endpoint and the dispatch fallback. Used only when a feature has no production
# config / pin: the feature falls back to this role, which resolves through
# `llm_roles` (set in the Features tab, or both → the default provider).
DEFAULT_FEATURE_ROLES: dict[str, str] = {e.key: e.role for e in FEATURE_CATALOG}


def _ai_settings() -> dict:
    """The renderer's `ai` settings section (defaultLlmId, featurePins, …) — one
    row in the settings table, written by the client via PATCH /v1/settings."""
    if _db.SessionLocal is None:
        return {}
    db = _db.SessionLocal()
    try:
        row = db.get(Setting, "ai")
        if row is None:
            return {}
        val = json.loads(row.value or "null")
        return val if isinstance(val, dict) else {}
    finally:
        db.close()


def _roles_from(blob, default_id: str) -> LLMRolesSettings | None:
    """Build the Quick/Accuracy role pair. A role set in the Features tab
    (`ai.llmRoles.{quick,accuracy}` with a providerId) wins; an unset role falls
    back to the global default provider so unpinned features still resolve."""
    blob = blob if isinstance(blob, dict) else {}

    def target(role: str) -> LLMRoleTarget | None:
        entry = blob.get(role)
        if isinstance(entry, dict) and entry.get("providerId"):
            return LLMRoleTarget(providerId=str(entry["providerId"]), model=str(entry.get("model") or ""))
        return LLMRoleTarget(providerId=default_id) if default_id else None

    quick, accuracy = target("quick"), target("accuracy")
    if quick is None and accuracy is None:
        return None
    return LLMRolesSettings(quick=quick, accuracy=accuracy)


def llm_config() -> LLMConfig:
    """Build the shared dispatch's `LLMConfig` from JustWrite's stored settings."""
    ai = _ai_settings()
    default_id = str(ai.get("defaultLlmId") or "")
    pins_blob = ai.get("featurePins") or {}
    # A pin routes via an explicit provider OR an inherited role ("quick"/
    # "accuracy"); keep any pin that carries one of those.
    feature_pins = [
        FeaturePinConfig(
            feature=k,
            providerId=str(v.get("providerId") or ""),
            model=str(v.get("model") or ""),
            role=(str(v.get("role")) or None) if v.get("role") else None,
        )
        for k, v in pins_blob.items()
        if isinstance(v, dict) and (v.get("providerId") or v.get("role"))
    ]
    # Quick/Accuracy roles from the Features tab if set; otherwise both roles
    # resolve to the user's single default provider, so any unpinned feature
    # still falls back to it.
    roles = _roles_from(ai.get("llmRoles"), default_id)
    return LLMConfig(
        providers=list(get_provider_store().list()),
        feature_pins=feature_pins,
        llm_roles=roles,
        default_feature_roles=DEFAULT_FEATURE_ROLES,
    )
