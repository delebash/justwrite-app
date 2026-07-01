"""Boot-time + reset-time workspace seeding for the JustWrite server.

The LLM seed (providers, catalog, switches, recommendations, routing, and feature
prompts) is SHARED — `llm_runner.llm.seed_llm()` seeds it, including the feature
DATA JustWrite registered via `install_llm` (its feature catalog + prompts). This
module owns only JustWrite's NON-LLM seed: the demo project.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from . import book_io
from . import database as _db
from .demo_seed import DEMO_PROJECT_ID, demo_book_snapshot
from .models import Setting

log = logging.getLogger(__name__)


def seed_demo_project(db: Session) -> bool:
    """Create the demo project once (gated by the `demoSeeded` flag) and point
    `activeProjectId` at it on a fresh workspace. Does NOT commit. Returns True
    if it seeded, False if the gate said it was already done."""
    if db.get(Setting, "demoSeeded") is not None:
        return False
    snap = demo_book_snapshot()
    snap["savedAt"] = datetime.now(timezone.utc).isoformat()
    book_io.decompose(db, DEMO_PROJECT_ID, snap)
    db.add(Setting(key="demoSeeded", value=json.dumps(True)))
    if db.get(Setting, "activeProjectId") is None:
        db.add(Setting(key="activeProjectId", value=json.dumps(DEMO_PROJECT_ID)))
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
    """Run the SHARED LLM seed + JustWrite's demo seed, and commit. Opens its own
    session when none is given (the `serve` entrypoint); reuses the caller's
    session when one is passed (the workspace-reset handler, after its wipe).

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
        seed_llm(db)           # shared: providers/catalog/switches/recs/routing/prompts
        seed_demo_project(db)  # JustWrite domain
        db.commit()
    except Exception as e:  # never let a seed failure crash boot / reset
        log.warning("workspace seed failed: %s", e)
        db.rollback()
    finally:
        if own:
            db.close()
    # After providers are committed, register them with the shared adapter registry.
    _register_seeded_providers()
