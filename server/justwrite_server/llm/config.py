"""JustWrite's LLM config — the boundary between JW's stored routing and the
shared `llm_runner.llm` dispatch (mirror of JustVoice's `engines/llm/config.py`).

Holds the two genuinely app-specific things the shared dispatch needs:
  1. JW's **feature catalog → default role** (which features exist, quick vs
     accuracy) — per-app data the shared dispatch is parameterized on.
  2. The **mapping** from JW's stored config to the shared `LLMConfig`:
     providers from the `LlmProvider` table, and the default provider + roles +
     feature pins from the routing tables (the active `routing_configs` row),
     read through the same RoutingStore the /v1/ai/routing router writes — one
     source of truth, no `ai` settings blob.
"""

from __future__ import annotations

from llm_runner.llm import LLMConfig
from llm_runner.llm.schema import FeaturePinConfig, LLMRolesSettings, LLMRoleTarget

from ..feature_catalog import FEATURE_CATALOG
from .jobs_store import get_feature_job_store
from .provider_store import get_provider_store
from .routing_store import get_routing_store

# JW feature catalog → default role, derived from the single catalog source
# (feature_catalog.py) so labels/hints/roles never drift across the routing
# endpoint and the dispatch fallback. Used only when a feature has no production
# config / pin: the feature falls back to this role, which resolves through
# `llm_roles` (set in the Features tab, or both → the default provider).
DEFAULT_FEATURE_ROLES: dict[str, str] = {e.key: e.role for e in FEATURE_CATALOG}


def _roles_from(routing, default_id: str, default_model: str) -> LLMRolesSettings | None:
    """Build the Quick/Accuracy role pair from the routing config. A role with a
    providerId wins; an unset role falls back to the global default provider +
    its chosen model (so unpinned features resolve to the Default LLM picker)."""

    def target(rt) -> LLMRoleTarget | None:
        if rt and rt.providerId:
            return LLMRoleTarget(providerId=rt.providerId, model=rt.model or "")
        return LLMRoleTarget(providerId=default_id, model=default_model) if default_id else None

    quick, accuracy = target(routing.quick), target(routing.accuracy)
    if quick is None and accuracy is None:
        return None
    return LLMRolesSettings(quick=quick, accuracy=accuracy)


def llm_config() -> LLMConfig:
    """Build the shared dispatch's `LLMConfig` from JustWrite's stored config."""
    routing = get_routing_store().get_routing()
    default_id = routing.default.llmId or ""
    # A pin routes via an explicit provider OR an inherited role; keep any pin
    # that carries one of those (the store already drops "inherit default").
    explicit = {key for key, pin in routing.pins.items() if pin.providerId or pin.role}
    feature_pins = [
        FeaturePinConfig(
            feature=key,
            providerId=pin.providerId,
            model=pin.model,
            role=(pin.role or None),
        )
        for key, pin in routing.pins.items()
        if pin.providerId or pin.role
    ]
    # Jobs architecture: a feature with no explicit pin inherits its JOB's model.
    # Resolve feature → job (feature_jobs) → the job's route (routing.jobs) and
    # inject it as an explicit dispatch pin, so jobs drive routing through the
    # UNCHANGED shared dispatch (the job layer sits above the role-default
    # fallback; explicit user pins still win; a job with no route falls through to
    # the old role behavior). This logic is JW-local — JV's own config.py is
    # untouched. It MOVES to the shared config_builder in the deep-audit
    # convergence (design doc §13).
    feature_jobs = {fj.featureKey: fj.jobId for fj in get_feature_job_store().list()}
    for feature, job_id in feature_jobs.items():
        if feature in explicit:
            continue  # an explicit per-feature pin overrides the job default
        target = routing.jobs.get(job_id)
        if target and target.providerId:
            feature_pins.append(
                FeaturePinConfig(feature=feature, providerId=target.providerId, model=target.model)
            )
    # Quick/Accuracy roles if set; otherwise both resolve to the user's single
    # default provider, so any unpinned feature still falls back to it.
    roles = _roles_from(routing, default_id, routing.default.model or "")
    return LLMConfig(
        providers=list(get_provider_store().list()),
        feature_pins=feature_pins,
        llm_roles=roles,
        default_feature_roles=DEFAULT_FEATURE_ROLES,
    )
