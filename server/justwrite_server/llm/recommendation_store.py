"""JustWrite's RecommendationStore — per-model job-tag curation rows.

Host side of the shared `llm_runner.llm.recommendations_api` router factory.
The CRUD + reset endpoints live in the shared router; this implements the
Protocol over the `model_recommendations` table. Mirrors `JwRoutingStore`
(`routing_store.py:66-87`) — opens its own SQLite session per call, commits,
closes. `reset_to_factory` re-applies the FACTORY_RECOMMENDATIONS seed via the
host's seed module (merge-by-id pattern, never clobbers user-added rows).
"""

from __future__ import annotations

from llm_runner.llm import RecommendationRow

from .. import database as _db
from ..models import ModelRecommendation


def _session():
    if _db.SessionLocal is None:
        raise RuntimeError("Database not initialized — call init_db() during boot")
    return _db.SessionLocal()


def _row_to_wire(r: ModelRecommendation) -> RecommendationRow:
    return RecommendationRow(
        modelId=r.model_id, job=r.job, rank=r.rank, why=r.why, builtIn=r.built_in,
    )


class JwRecommendationStore:
    """RecommendationStore over the `model_recommendations` table."""

    def list(self) -> list[RecommendationRow]:
        db = _session()
        try:
            rows = (
                db.query(ModelRecommendation)
                .order_by(ModelRecommendation.job, ModelRecommendation.rank, ModelRecommendation.model_id)
                .all()
            )
            return [_row_to_wire(r) for r in rows]
        finally:
            db.close()

    def upsert(self, row: RecommendationRow) -> RecommendationRow:
        db = _session()
        try:
            existing = db.get(ModelRecommendation, (row.modelId, row.job))
            if existing is None:
                existing = ModelRecommendation(model_id=row.modelId, job=row.job)
                db.add(existing)
            existing.rank = row.rank
            existing.why = row.why
            # built_in is a SEED marker — user edits drop it; only seeders set it true.
            existing.built_in = False
            db.commit()
            return _row_to_wire(existing)
        finally:
            db.close()

    def delete(self, model_id: str, job: str) -> None:
        db = _session()
        try:
            existing = db.get(ModelRecommendation, (model_id, job))
            if existing is not None:
                db.delete(existing)
                db.commit()
        finally:
            db.close()

    def reset_to_factory(self) -> None:
        # Reset = restore the FACTORY values for every (model_id, job) pair that
        # ships in DEFAULT_RECOMMENDATIONS, whether the user has touched it or
        # not. User-ADDED rows (keys NOT in the factory list) are preserved.
        # Previous bug: filtering by built_in=True caused user-EDITED factory
        # rows to never be restored (their edit cleared built_in, so reset
        # skipped them).
        from ..seed import DEFAULT_RECOMMENDATIONS, seed_default_recommendations  # local import to avoid cycle

        db = _session()
        try:
            factory_keys = {(r["model_id"], r["job"]) for r in DEFAULT_RECOMMENDATIONS}
            for mid, job in factory_keys:
                row = db.get(ModelRecommendation, (mid, job))
                if row is not None:
                    db.delete(row)
            db.flush()
            seed_default_recommendations(db)
            db.commit()
        finally:
            db.close()


_store = JwRecommendationStore()


def get_recommendation_store() -> JwRecommendationStore:
    return _store
