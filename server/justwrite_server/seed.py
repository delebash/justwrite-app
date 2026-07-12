"""Boot-time + reset-time workspace seeding for the JustWrite server.

The LLM seed (providers, catalog, switches, recommendations, routing, and feature
prompts) is SHARED — `llm_runner.llm.seed_llm()` seeds it, including the feature
DATA JustWrite registered via `install_llm` (its feature catalog + prompts). This
module owns only JustWrite's NON-LLM piece: the demo book, which since QC-40
(user, 2026-07-10, option 1) is NOT seeded at boot — a fresh install has ZERO
projects and the renderer lands on its welcome screen (the old blank
"Untitled project" mint is gone since the zero-project law, same day), and the
demo is created only when the user clicks "Try tutorial project"
(POST /v1/projects/demo → the helper below). The old `demoSeeded` gate flag is
no longer written; existing DBs keep the inert row.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from . import book_io
from . import database as _db
from .demo_seed import DEMO_PROJECT_ID, demo_book_snapshot, demo_sample_images
from .models import Project

log = logging.getLogger(__name__)


def create_demo_project(db: Session) -> bool:
    """Create the demo book (fixed id — reset-safe, never duplicated) if it does
    not exist. Does NOT commit, does NOT touch `activeProjectId` (the renderer
    switches to it through its normal project flow). Returns True if it created
    the project, False if it already existed."""
    if db.get(Project, DEMO_PROJECT_ID) is not None:
        return False
    snap = demo_book_snapshot()
    snap["savedAt"] = datetime.now(timezone.utc).isoformat()
    # ONE "decompose a book (+ its image files)" core, shared with /v1/projects/import
    # (the sample ships image-less today, so demo_sample_images() is usually empty).
    book_io.import_book_snapshot(db, snap, demo_sample_images(), DEMO_PROJECT_ID)
    return True


def _register_seeded_providers() -> None:
    """Load the seeded providers into the shared LLM adapter registry so dispatch
    + the /v1/llm-providers `registered` flag work from boot."""
    try:
        from llm_runner.llm import load_from_configs, stores

        load_from_configs(stores.get_provider_store().list())
    except Exception as e:  # never let registry wiring crash boot / reset
        log.warning("LLM provider boot registration failed: %s", e)


def seed_workspace(db: Session | None = None) -> None:
    """Run the SHARED LLM seed, and commit. Opens its own session when none is
    given (the `serve` entrypoint); reuses the caller's session when one is
    passed (the workspace-reset handler, after its wipe). The demo book is NOT
    seeded here (QC-40) — a fresh/reset workspace ships with no projects and the
    renderer lands on its welcome screen (zero projects is a valid state).

    Requires `install_llm` to have run first (it registers JW's feature data the
    shared seeder reads) — true for both the `serve` boot and `create_app` tests.
    """
    from llm_runner.llm import seed_llm

    own = db is None
    if own:
        if _db.SessionLocal is None:
            return
        db = _db.SessionLocal()
    try:
        seed_llm(db)  # shared: providers/catalog/switches/recs/routing/prompts
        db.commit()
    except Exception as e:  # never let a seed failure crash boot / reset
        log.warning("workspace seed failed: %s", e)
        db.rollback()
    finally:
        if own:
            db.close()
    # After providers are committed, register them with the shared adapter registry.
    _register_seeded_providers()
