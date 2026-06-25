"""JustWrite's ModelCatalogStore + ModelSwitchStore — DB-backed source of truth
for the bundled llama.cpp catalog (replaces the deleted `runner-manifest.json`
`models` array) plus the per-model spawn-flag overrides.

Host side of the shared `llm_runner.llm.model_catalog_api` router factories.
The shared package owns CRUD endpoints + Protocols; this implements them over
the `model_catalog` + `model_switches` tables. `reset_to_factory` re-applies
the FACTORY rows for every shipped key (built_in or not) and preserves
user-added rows — fixes the recommendation-store bug where edited factory rows
silently never reset.
"""

from __future__ import annotations

from llm_runner.llm import CatalogRow, SwitchRow

from .. import database as _db
from ..models import ModelCatalog, ModelSwitch


def _session():
    if _db.SessionLocal is None:
        raise RuntimeError("Database not initialized — call init_db() during boot")
    return _db.SessionLocal()


def _catalog_to_wire(r: ModelCatalog) -> CatalogRow:
    return CatalogRow(
        id=r.id, name=r.name, hfRepo=r.hf_repo, quant=r.quant, mmproj=r.mmproj,
        totalParams=r.total_params, activeParams=r.active_params, mtp=r.mtp,
        minVramMb=r.min_vram_mb, minRamMb=r.min_ram_mb, tier=r.tier,
        position=r.position, builtIn=r.built_in,
    )


def _switch_to_wire(r: ModelSwitch) -> SwitchRow:
    return SwitchRow(
        modelId=r.model_id, flagName=r.flag_name,
        flagValue=r.flag_value, builtIn=r.built_in,
    )


class JwModelCatalogStore:
    """ModelCatalogStore over the `model_catalog` table."""

    def list(self) -> list[CatalogRow]:
        db = _session()
        try:
            rows = (
                db.query(ModelCatalog)
                .order_by(ModelCatalog.position, ModelCatalog.id)
                .all()
            )
            return [_catalog_to_wire(r) for r in rows]
        finally:
            db.close()

    def upsert(self, row: CatalogRow) -> CatalogRow:
        db = _session()
        try:
            existing = db.get(ModelCatalog, row.id)
            if existing is None:
                existing = ModelCatalog(id=row.id)
                db.add(existing)
            existing.name = row.name
            existing.hf_repo = row.hfRepo
            existing.quant = row.quant
            existing.mmproj = row.mmproj
            existing.total_params = row.totalParams
            existing.active_params = row.activeParams
            existing.mtp = row.mtp
            existing.min_vram_mb = row.minVramMb
            existing.min_ram_mb = row.minRamMb
            existing.tier = row.tier or "mid"
            existing.position = row.position
            existing.built_in = False
            db.commit()
            return _catalog_to_wire(existing)
        finally:
            db.close()

    def delete(self, model_id: str) -> None:
        db = _session()
        try:
            existing = db.get(ModelCatalog, model_id)
            if existing is not None:
                db.delete(existing)
                db.commit()
        finally:
            db.close()

    def reset_to_factory(self) -> None:
        """Restore factory values for every shipped catalog id; preserve user-added rows.
        (Mirrors the corrected JwRecommendationStore.reset_to_factory pattern —
        delete-by-key + re-seed, NOT delete-by-built_in.)"""
        from ..seed import DEFAULT_CATALOG, seed_default_catalog  # local import — avoid cycle

        db = _session()
        try:
            factory_ids = {c["id"] for c in DEFAULT_CATALOG}
            for cid in factory_ids:
                row = db.get(ModelCatalog, cid)
                if row is not None:
                    db.delete(row)
            db.flush()
            seed_default_catalog(db)
            db.commit()
        finally:
            db.close()


class JwModelSwitchStore:
    """ModelSwitchStore over the `model_switches` table."""

    def list(self) -> list[SwitchRow]:
        db = _session()
        try:
            rows = (
                db.query(ModelSwitch)
                .order_by(ModelSwitch.model_id, ModelSwitch.flag_name)
                .all()
            )
            return [_switch_to_wire(r) for r in rows]
        finally:
            db.close()

    def upsert(self, row: SwitchRow) -> SwitchRow:
        db = _session()
        try:
            existing = db.get(ModelSwitch, (row.modelId, row.flagName))
            if existing is None:
                existing = ModelSwitch(model_id=row.modelId, flag_name=row.flagName)
                db.add(existing)
            existing.flag_value = row.flagValue
            existing.built_in = False
            db.commit()
            return _switch_to_wire(existing)
        finally:
            db.close()

    def delete(self, model_id: str, flag_name: str) -> None:
        db = _session()
        try:
            existing = db.get(ModelSwitch, (model_id, flag_name))
            if existing is not None:
                db.delete(existing)
                db.commit()
        finally:
            db.close()

    def reset_to_factory(self) -> None:
        """Restore factory switches for every shipped (model_id, flag_name);
        preserve user-added switches."""
        from ..seed import DEFAULT_SWITCHES, seed_default_switches  # local import — avoid cycle

        db = _session()
        try:
            factory_keys = {(s["model_id"], s["flag_name"]) for s in DEFAULT_SWITCHES}
            for mid, fname in factory_keys:
                row = db.get(ModelSwitch, (mid, fname))
                if row is not None:
                    db.delete(row)
            db.flush()
            seed_default_switches(db)
            db.commit()
        finally:
            db.close()


_catalog_store = JwModelCatalogStore()
_switch_store = JwModelSwitchStore()


def get_model_catalog_store() -> JwModelCatalogStore:
    return _catalog_store


def get_model_switch_store() -> JwModelSwitchStore:
    return _switch_store
