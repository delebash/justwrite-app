"""JustWrite's FeaturePresetStore — named per-action AI configs in the
`feature_presets` table, behind the shared `llm_runner.llm.feature_presets_api`
router factory (the genuine persistence boundary RULE #8 allows). Both apps
mount the same `/v1/ai/feature-presets*` surface the shared Feature Workbench
drives; only this persistence differs per app.

Pure CRUD + set-active: applying the active preset to the live config (the
action's prompt + routing pin) is the workbench's job via the existing
/v1/ai/prompts + /v1/ai/routing endpoints, so there's no dispatch wiring here.
"""

from __future__ import annotations

from llm_runner.llm import FeaturePreset
from llm_runner.llm.feature_presets_api import FeaturePresetStore

from .. import database as _db
from ..models import FeaturePreset as Row


def _to_model(r: Row) -> FeaturePreset:
    return FeaturePreset(
        id=r.id, action=r.action, name=r.name, active=r.is_active,
        providerId=r.provider_id, role=r.role, model=r.model,
        system=r.system, userTemplate=r.user_template,
        temperature=r.temperature, think=r.think,
    )


def _apply(row: Row, p: FeaturePreset) -> None:
    row.action = p.action
    row.name = p.name
    row.provider_id = p.providerId
    row.role = p.role
    row.model = p.model
    row.system = p.system
    row.user_template = p.userTemplate
    row.temperature = p.temperature
    row.think = p.think


class JwFeaturePresetStore:
    """FeaturePresetStore over the `feature_presets` table (short-lived session
    per call, like the provider/routing stores)."""

    def _session(self):
        if _db.SessionLocal is None:
            raise RuntimeError("Database not initialized — call init_db() during boot")
        return _db.SessionLocal()

    def list_presets(self) -> list[FeaturePreset]:
        db = self._session()
        try:
            rows = db.query(Row).order_by(Row.action, Row.position).all()
            return [_to_model(r) for r in rows]
        finally:
            db.close()

    def save_preset(self, preset: FeaturePreset) -> FeaturePreset:
        db = self._session()
        try:
            row = db.get(Row, preset.id) if preset.id else None
            if row is None:
                row = Row(id=preset.id, is_active=False,
                          position=db.query(Row).filter(Row.action == preset.action).count())
                _apply(row, preset)
                db.add(row)
            else:
                _apply(row, preset)
            db.commit()
            return _to_model(row)
        finally:
            db.close()

    def delete_preset(self, preset_id: str) -> None:
        db = self._session()
        try:
            row = db.get(Row, preset_id)
            if row is not None:
                db.delete(row)
                db.commit()
        finally:
            db.close()

    def set_active(self, preset_id: str) -> None:
        """Mark this preset active (production) and clear the action's others."""
        db = self._session()
        try:
            row = db.get(Row, preset_id)
            if row is None:
                return
            for other in db.query(Row).filter(Row.action == row.action, Row.is_active.is_(True)).all():
                other.is_active = False
            row.is_active = True
            db.commit()
        finally:
            db.close()


_store = JwFeaturePresetStore()


def get_feature_preset_store() -> FeaturePresetStore:
    return _store
