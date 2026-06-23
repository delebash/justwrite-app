"""Idempotent schema + data migrations (no Alembic), mirroring JustVoice's
migrations.py pattern.

- `migrate_schema(engine)` — `PRAGMA table_info` column-existence checks +
  `ALTER TABLE ADD COLUMN` for the columns `projects` gained when the
  P2-shallow blob table (id/title/author/updated_at/data) became the normalized
  root. `create_all` adds new TABLES but never new COLUMNS to an existing one,
  so an upgraded DB needs this.
- `migrate_blobs(db)` — one-time decompose of any legacy `projects.data` blob
  into the normalized tables (P2.2). Idempotent: skips projects already
  normalized (those with `parts` rows) or with no usable blob.

Both run from `init_db` after `create_all`, schema before data.
"""

from __future__ import annotations

import json
import logging

from sqlalchemy import text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

log = logging.getLogger(__name__)

# Columns added to `projects` after the P2-shallow version. name -> column DDL.
_PROJECT_COLUMNS = {
    "subtitle": "TEXT NOT NULL DEFAULT ''",
    "genre": "TEXT NOT NULL DEFAULT ''",
    "words_goal": "INTEGER NOT NULL DEFAULT 0",
    "daily_target": "INTEGER NOT NULL DEFAULT 0",
    "words_written": "INTEGER NOT NULL DEFAULT 0",
    "started_on": "TEXT NOT NULL DEFAULT ''",
    "deadline": "TEXT NOT NULL DEFAULT ''",
    "premise": "TEXT NOT NULL DEFAULT ''",
    "world_rules": "TEXT NOT NULL DEFAULT ''",
    "cover_image": "TEXT",
}


def migrate_schema(engine: Engine) -> None:
    with engine.begin() as conn:
        # The legacy app-level key/value table is gone — all renderer state has
        # its own typed table now. Drop the orphan from upgraded DBs.
        conn.execute(text("DROP TABLE IF EXISTS kv"))

        # `llm_providers` went from a JSON `data` blob to real columns. An
        # upgraded DB still has the old single-blob table; drop it and recreate
        # with the typed schema (the built-ins reseed on boot; user-added
        # providers are re-entered — acceptable, this isn't production).
        prov_cols = {row[1] for row in conn.execute(text("PRAGMA table_info(llm_providers)")).fetchall()}
        if "data" in prov_cols:
            from .models import LlmProvider

            conn.execute(text("DROP TABLE llm_providers"))
            LlmProvider.__table__.create(bind=conn)
            log.info("migrate_schema: rebuilt llm_providers blob → typed columns")

        # `feature_prompts` gained `description` + `subgroup` (the Feature
        # Workbench card nav). Rebuild the seed table so rows reseed with the new
        # metadata — same as llm_providers above (not production; any Lab prompt
        # edits reseed to defaults).
        fp_cols = {row[1] for row in conn.execute(text("PRAGMA table_info(feature_prompts)")).fetchall()}
        if fp_cols and "description" not in fp_cols:
            from .models import FeaturePrompt

            conn.execute(text("DROP TABLE feature_prompts"))
            FeaturePrompt.__table__.create(bind=conn)
            log.info("migrate_schema: rebuilt feature_prompts for description/subgroup")

        # `feature_presets` is now keyed per ACTION (was per feature). Rebuild the
        # table when the old `feature` column is present (saved presets re-created).
        fpr_cols = {row[1] for row in conn.execute(text("PRAGMA table_info(feature_presets)")).fetchall()}
        if fpr_cols and "action" not in fpr_cols:
            from .models import FeaturePreset

            conn.execute(text("DROP TABLE feature_presets"))
            FeaturePreset.__table__.create(bind=conn)
            log.info("migrate_schema: rebuilt feature_presets feature → action")

        existing = {row[1] for row in conn.execute(text("PRAGMA table_info(projects)")).fetchall()}
        if not existing:
            return  # no projects table yet (shouldn't happen post create_all)
        for name, ddl in _PROJECT_COLUMNS.items():
            if name not in existing:
                conn.execute(text(f"ALTER TABLE projects ADD COLUMN {name} {ddl}"))
                log.info("migrate_schema: added projects.%s", name)


def migrate_blobs(db: Session) -> int:
    """Decompose legacy `projects.data` blobs into the normalized tables.
    Returns the number of projects migrated."""
    # Imported here (not at module top) to avoid a database -> migrations ->
    # book_io import cycle during init.
    from .book_io import decompose
    from .models import Part, Project

    migrated = 0
    for p in db.query(Project).all():
        if not p.data or p.data == "{}":
            continue
        try:
            blob = json.loads(p.data)
        except (ValueError, TypeError):
            continue
        if not isinstance(blob, dict) or ("project" not in blob and "parts" not in blob):
            continue
        # Already normalized (has child rows) — don't clobber.
        if db.query(Part).filter(Part.project_id == p.id).first() is not None:
            continue
        decompose(db, p.id, blob)  # also clears p.data to "{}"
        migrated += 1
    if migrated:
        db.commit()
        log.info("migrate_blobs: decomposed %d legacy blob project(s)", migrated)
    return migrated
