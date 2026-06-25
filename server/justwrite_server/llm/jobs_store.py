"""JustWrite's JobStore + FeatureJobStore — the editable job list + feature→job map.

Host side of the shared `llm_runner.llm.jobs_api` router factories. CRUD + reset
live in the shared routers; this implements the Protocols over the `jobs` +
`feature_jobs` tables. Mirrors `JwRecommendationStore` (`recommendation_store.py`)
— own session per call, commit, close. `reset_to_factory` restores the FACTORY
seed for shipped keys (whether the user edited them or not) and preserves
user-added rows (merge-by-key, the corrected reset pattern).
"""

from __future__ import annotations

from llm_runner.llm import FeatureJobRow, JobRow

from .. import database as _db
from ..models import FeatureJob, Job


def _session():
    if _db.SessionLocal is None:
        raise RuntimeError("Database not initialized — call init_db() during boot")
    return _db.SessionLocal()


def _job_to_wire(r: Job) -> JobRow:
    return JobRow(
        id=r.id, label=r.label, description=r.description,
        position=r.position, builtIn=r.built_in,
    )


def _feature_job_to_wire(r: FeatureJob) -> FeatureJobRow:
    return FeatureJobRow(featureKey=r.feature_key, jobId=r.job_id, builtIn=r.built_in)


class JwJobStore:
    """JobStore over the `jobs` table."""

    def list(self) -> list[JobRow]:
        db = _session()
        try:
            rows = db.query(Job).order_by(Job.position, Job.id).all()
            return [_job_to_wire(r) for r in rows]
        finally:
            db.close()

    def upsert(self, row: JobRow) -> JobRow:
        db = _session()
        try:
            existing = db.get(Job, row.id)
            if existing is None:
                existing = Job(id=row.id)
                db.add(existing)
            existing.label = row.label
            existing.description = row.description
            existing.position = row.position
            # built_in is a SEED marker: the router preserves it for an edit to a
            # built-in (so reset restores label/desc) and clears it on create.
            existing.built_in = row.builtIn
            db.commit()
            return _job_to_wire(existing)
        finally:
            db.close()

    def delete(self, job_id: str) -> None:
        db = _session()
        try:
            existing = db.get(Job, job_id)
            if existing is not None:
                db.delete(existing)
                db.commit()
        finally:
            db.close()

    def reset_to_factory(self) -> None:
        """Restore factory values for every shipped job id; preserve user-added jobs."""
        from ..seed import DEFAULT_JOBS, seed_default_jobs  # local import — avoid cycle

        db = _session()
        try:
            for j in DEFAULT_JOBS:
                row = db.get(Job, j["id"])
                if row is not None:
                    db.delete(row)
            db.flush()
            seed_default_jobs(db)
            db.commit()
        finally:
            db.close()


class JwFeatureJobStore:
    """FeatureJobStore over the `feature_jobs` table."""

    def list(self) -> list[FeatureJobRow]:
        db = _session()
        try:
            rows = db.query(FeatureJob).order_by(FeatureJob.feature_key).all()
            return [_feature_job_to_wire(r) for r in rows]
        finally:
            db.close()

    def upsert(self, row: FeatureJobRow) -> FeatureJobRow:
        db = _session()
        try:
            existing = db.get(FeatureJob, row.featureKey)
            if existing is None:
                existing = FeatureJob(feature_key=row.featureKey)
                db.add(existing)
            existing.job_id = row.jobId
            existing.built_in = False  # user edit drops the seed marker
            db.commit()
            return _feature_job_to_wire(existing)
        finally:
            db.close()

    def delete(self, feature_key: str) -> None:
        db = _session()
        try:
            existing = db.get(FeatureJob, feature_key)
            if existing is not None:
                db.delete(existing)
                db.commit()
        finally:
            db.close()

    def reset_to_factory(self) -> None:
        """Restore the factory mapping for every shipped feature_key; preserve user-added rows."""
        from ..seed import DEFAULT_FEATURE_JOBS, seed_default_feature_jobs  # local import — avoid cycle

        db = _session()
        try:
            for fj in DEFAULT_FEATURE_JOBS:
                row = db.get(FeatureJob, fj["feature_key"])
                if row is not None:
                    db.delete(row)
            db.flush()
            seed_default_feature_jobs(db)
            db.commit()
        finally:
            db.close()


_job_store = JwJobStore()
_feature_job_store = JwFeatureJobStore()


def get_job_store() -> JwJobStore:
    return _job_store


def get_feature_job_store() -> JwFeatureJobStore:
    return _feature_job_store
