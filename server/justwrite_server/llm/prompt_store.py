"""JustWrite's FeaturePromptStore — the per-feature prompt rows in the
`feature_prompts` SQLite table (DB-seeded, Lab-editable; the source of truth).

Mirrors `provider_store.py`: a short-lived session per call. The seed module
(`seed_feature_prompts.py`) populates defaults on boot/reset; the server reads
prompts from here at request time — no hardcoded prompt text, no runtime code
fallback (a missing key is a 404, not a silent default). See
docs/plans/2026-06-21-feature-prompts-db-seed.md.
"""

from __future__ import annotations

from llm_runner.llm import FeaturePromptRow

from .. import database as _db
from ..models import FeaturePrompt


def _to_row(r: FeaturePrompt) -> FeaturePromptRow:
    return FeaturePromptRow(
        key=r.key,
        feature=r.feature,
        system=r.system,
        user_template=r.user_template,
        temperature=r.temperature,
        think=r.think,
        built_in=r.built_in,
        description=r.description,
        group=r.subgroup,  # wire field `group` ↔ DB column `subgroup` (GROUP is reserved)
    )


class FeaturePromptStore:
    """JustWrite's host adapter for the shared `PromptStore` Protocol — CRUD over
    the `feature_prompts` table. Each method opens a short-lived session (mirrors
    `LlmProviderStore`). The editor + execution routers live in `llm_runner.llm`;
    this just persists."""

    def _session(self):
        if _db.SessionLocal is None:
            raise RuntimeError("Database not initialized — call init_db() during boot")
        return _db.SessionLocal()

    def get(self, key: str) -> FeaturePromptRow | None:
        db = self._session()
        try:
            row = db.get(FeaturePrompt, key)
            return _to_row(row) if row is not None else None
        finally:
            db.close()

    def list(self) -> list[FeaturePromptRow]:
        db = self._session()
        try:
            rows = db.query(FeaturePrompt).order_by(FeaturePrompt.key).all()
            return [_to_row(r) for r in rows]
        finally:
            db.close()

    def upsert(self, row: FeaturePromptRow) -> None:
        """Lab edit — create or update a row. `built_in` is preserved on update
        (only the seed sets it)."""
        db = self._session()
        try:
            existing = db.get(FeaturePrompt, row.key)
            if existing is None:
                db.add(FeaturePrompt(
                    key=row.key,
                    feature=row.feature,
                    system=row.system,
                    user_template=row.user_template,
                    temperature=row.temperature,
                    think=row.think,
                    built_in=row.built_in,
                    description=row.description,
                    subgroup=row.group,
                ))
            else:
                existing.feature = row.feature
                existing.system = row.system
                existing.user_template = row.user_template
                existing.temperature = row.temperature
                existing.think = row.think
                existing.description = row.description
                existing.subgroup = row.group
            db.commit()
        finally:
            db.close()

_store = FeaturePromptStore()


def get_prompt_store() -> FeaturePromptStore:
    return _store
