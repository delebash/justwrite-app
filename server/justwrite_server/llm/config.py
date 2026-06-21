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
from ..models import Setting
from .provider_store import get_provider_store

# JW feature catalog → default role. Analysis features are accuracy-critical;
# interactive writing features ride quick. Used only when a feature has no
# production config / pin. Both roles currently resolve to the user's single
# default provider (JW has no quick/accuracy split yet), so the split is
# forward-looking — but it makes any unpinned feature fall back to the default.
DEFAULT_FEATURE_ROLES: dict[str, str] = {
    # analysis (non-streaming JSON — the server-migrated set)
    "critique": "accuracy",
    "plotHoles": "accuracy",
    "foreshadowing": "accuracy",
    "entitySweep": "accuracy",
    "characterAudit": "accuracy",
    "readerKnowledge": "accuracy",
    "relationshipArc": "accuracy",
    "voiceDrift": "accuracy",
    "beatSheet": "accuracy",
    "reverseOutline": "accuracy",
    "marketingPack": "accuracy",
    "multiReader": "accuracy",
    # workflow / single-action features (migrated to /v1/ai/run)
    "sensory": "quick",
    "unstuck": "quick",
    "brainstorm": "quick",
    "briefing": "quick",
    "recap": "quick",
    # interactive streaming features (writerAI/chat/rag) — migrate onto
    # /v1/ai/stream next; gateway stays until then.
    "writerAI": "quick",
    "chat": "quick",
    "characterChat": "quick",
}


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


def llm_config() -> LLMConfig:
    """Build the shared dispatch's `LLMConfig` from JustWrite's stored settings."""
    ai = _ai_settings()
    default_id = str(ai.get("defaultLlmId") or "")
    pins_blob = ai.get("featurePins") or {}
    feature_pins = [
        FeaturePinConfig(
            feature=k,
            providerId=str(v["providerId"]),
            model=str(v.get("model") or ""),
        )
        for k, v in pins_blob.items()
        if isinstance(v, dict) and v.get("providerId")
    ]
    # No quick/accuracy split yet — both roles resolve to the user's single
    # default provider, so any unpinned feature falls back to it.
    roles = None
    if default_id:
        target = LLMRoleTarget(providerId=default_id)
        roles = LLMRolesSettings(quick=target, accuracy=target)
    return LLMConfig(
        providers=list(get_provider_store().list()),
        feature_pins=feature_pins,
        llm_roles=roles,
        default_feature_roles=DEFAULT_FEATURE_ROLES,
    )
