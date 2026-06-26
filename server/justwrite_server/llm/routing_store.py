"""JustWrite's RoutingStore + RoutingPresetStore — the default LLM/embedding,
Quick/Accuracy roles, per-feature pins, and named presets, all in REAL tables
(`routing_configs` + `routing_pins`), not a JSON blob.

Host side of the shared `llm_runner.llm.routing_api` router factory (the genuine
persistence boundary RULE #8 allows — the GET/PUT logic lives in the shared
router). The live routing is the `routing_configs` row id='active'; presets are
the other rows. `llm/config.py` reads the active row to drive dispatch, so what
the Features tab (or the renderer's AI store) saves here immediately routes.
"""

from __future__ import annotations

import uuid

from llm_runner.llm import RoutingConfig, RoutingPreset
from llm_runner.llm.routing_api import FeaturePin, RoleTarget, RoutingDefaults

from .. import database as _db
from ..models import JobRoute, RoutingConfigRow, RoutingPin

_ACTIVE_ID = "active"


def _session():
    if _db.SessionLocal is None:
        raise RuntimeError("Database not initialized — call init_db() during boot")
    return _db.SessionLocal()


def _row_to_config(db, row: RoutingConfigRow) -> RoutingConfig:
    pins = {
        p.feature: FeaturePin(providerId=p.provider_id, model=p.model, role=p.role)
        for p in db.query(RoutingPin).filter(RoutingPin.config_id == row.id).all()
    }
    jobs = {
        jr.job_id: RoleTarget(providerId=jr.provider_id, model=jr.model)
        for jr in db.query(JobRoute).filter(JobRoute.config_id == row.id).all()
    }
    return RoutingConfig(
        default=RoutingDefaults(
            llmId=row.default_llm_id,
            model=row.default_model,
            embeddingId=row.default_embedding_id,
            embeddingModel=row.default_embedding_model,
        ),
        quick=RoleTarget(providerId=row.quick_provider_id, model=row.quick_model),
        accuracy=RoleTarget(providerId=row.accuracy_provider_id, model=row.accuracy_model),
        pins=pins,
        jobs=jobs,
    )


def _apply_config(db, row: RoutingConfigRow, cfg: RoutingConfig) -> None:
    """Write a RoutingConfig onto a row + replace its pins. Caller commits."""
    row.default_llm_id = cfg.default.llmId
    row.default_model = cfg.default.model
    row.default_embedding_id = cfg.default.embeddingId
    row.default_embedding_model = cfg.default.embeddingModel
    row.quick_provider_id = cfg.quick.providerId
    row.quick_model = cfg.quick.model
    row.accuracy_provider_id = cfg.accuracy.providerId
    row.accuracy_model = cfg.accuracy.model
    db.query(RoutingPin).filter(RoutingPin.config_id == row.id).delete()
    for feature, p in cfg.pins.items():
        # Only persist a pin that routes somewhere — "inherit default" is no row.
        if p.providerId or p.role:
            db.add(RoutingPin(config_id=row.id, feature=feature, provider_id=p.providerId, model=p.model, role=p.role))
    # Replace the job→model map (the jobs architecture); only rows that route.
    db.query(JobRoute).filter(JobRoute.config_id == row.id).delete()
    for job_id, t in cfg.jobs.items():
        if t.providerId:
            db.add(JobRoute(config_id=row.id, job_id=job_id, provider_id=t.providerId, model=t.model))


class JwRoutingStore:
    """RoutingStore over the `routing_configs` row id='active' + its pins."""

    def get_routing(self) -> RoutingConfig:
        db = _session()
        try:
            row = db.get(RoutingConfigRow, _ACTIVE_ID)
            return _row_to_config(db, row) if row is not None else RoutingConfig()
        finally:
            db.close()

    def set_routing(self, cfg: RoutingConfig) -> None:
        db = _session()
        try:
            row = db.get(RoutingConfigRow, _ACTIVE_ID)
            if row is None:
                row = RoutingConfigRow(id=_ACTIVE_ID, is_active=True, position=0)
                db.add(row)
            _apply_config(db, row, cfg)
            db.commit()
        finally:
            db.close()


_store = JwRoutingStore()


def get_routing_store() -> JwRoutingStore:
    return _store


class JwRoutingPresetStore:
    """RoutingPresetStore over the non-active `routing_configs` rows + their pins."""

    def list_presets(self) -> list[RoutingPreset]:
        db = _session()
        try:
            rows = (
                db.query(RoutingConfigRow)
                .filter(RoutingConfigRow.is_active.is_(False))
                .order_by(RoutingConfigRow.position)
                .all()
            )
            return [RoutingPreset(id=r.id, name=r.name, routing=_row_to_config(db, r)) for r in rows]
        finally:
            db.close()

    def save_preset(self, preset: RoutingPreset) -> None:
        db = _session()
        try:
            row = db.get(RoutingConfigRow, preset.id)
            if row is None or row.is_active:
                pos = db.query(RoutingConfigRow).filter(RoutingConfigRow.is_active.is_(False)).count()
                row = RoutingConfigRow(id=preset.id or uuid.uuid4().hex[:12], is_active=False, position=pos)
                db.add(row)
            row.name = preset.name
            _apply_config(db, row, preset.routing)
            db.commit()
        finally:
            db.close()

    def delete_preset(self, preset_id: str) -> None:
        db = _session()
        try:
            row = db.get(RoutingConfigRow, preset_id)
            if row is not None and not row.is_active:
                db.query(RoutingPin).filter(RoutingPin.config_id == preset_id).delete()
                db.delete(row)
                db.commit()
        finally:
            db.close()


_preset_store = JwRoutingPresetStore()


def get_routing_preset_store() -> JwRoutingPresetStore:
    return _preset_store
