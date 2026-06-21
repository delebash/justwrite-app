"""Boot-time + reset-time workspace seeding for the JustWrite server.

Mirrors JustVoice's approach — the server owns the demo + defaults; the thin
client carries none (the 2026-06-20 cross-app convergence, item #7). Two
seeders:

- `seed_default_providers` — ensure the built-in LLM providers exist (merge any
  missing by id on every boot, so an upgrade that adds a provider picks it up,
  exactly like the renderer's old append-missing-by-id did).
- `seed_demo_project` — create the "Cartographer's Daughter" demo ONCE (gated by
  the `demoSeeded` settings flag) so deleting it doesn't bring it back, and point
  `activeProjectId` at it on a fresh workspace so first run opens the demo.

Called from the `serve` entrypoint (real boots) and from the workspace-reset
handler — deliberately NOT from `create_app()`, so the pytest suite's
`create_app(tmp_path)` clients still start from a genuinely empty database.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from . import book_io
from . import database as _db
from .demo_seed import DEMO_PROJECT_ID, demo_book_snapshot
from .models import LlmProvider, Setting

log = logging.getLogger(__name__)


# The built-in LLM providers, ported from the renderer's old
# `domain/seed.js` DEFAULT_PROVIDERS. `builtIn: true` marks them undeletable in
# the UI; cloud providers ship with no key (the user adds one in Settings), the
# local ones need none. Blank `chatModel` means "hit Fetch models" — every local
# server uses its own ids. The whole object is stored as JSON in LlmProvider.data;
# id/name/kind/built_in are columns for queryability.
DEFAULT_PROVIDERS: list[dict] = [
    {
        # Built-in llama.cpp runner (just-llm-runner) — the recommended local
        # default. Spawned as a bundled sidecar: no external install, no key.
        "id": "local-llamacpp", "name": "Built-in (llama.cpp)", "kind": "llm",
        "runner": "llamacpp", "baseUrl": "http://127.0.0.1:8080/v1",
        "chatModel": "", "builtIn": True,
    },
    {
        # Generic OpenAI-shaped local LLM (Ollama, LM Studio, llama.cpp, …).
        "id": "openai-compat-local", "name": "OpenAI-compatible (local)", "kind": "llm",
        "runner": "ollama", "baseUrl": "http://localhost:11434/v1",
        "chatModel": "", "builtIn": True,
    },
    {
        "id": "openai", "name": "OpenAI", "kind": "llm",
        "baseUrl": "https://api.openai.com/v1", "chatModel": "gpt-4o-mini", "builtIn": True,
    },
    {
        # Claude via Anthropic's OpenAI-compatible endpoint. Default is the
        # cheapest Claude (haiku); users can swap to sonnet/opus for quality.
        "id": "claude", "name": "Claude (Anthropic)", "kind": "llm",
        "baseUrl": "https://api.anthropic.com/v1", "chatModel": "claude-haiku-4-5", "builtIn": True,
    },
    {
        # Google's OpenAI-compatible Gemini endpoint. The `/v1beta/openai` prefix
        # is Google-specific; url() appends /chat/completions etc. after it.
        "id": "gemini", "name": "Gemini (Google)", "kind": "llm",
        "baseUrl": "https://generativelanguage.googleapis.com/v1beta/openai",
        "chatModel": "gemini-2.5-flash", "builtIn": True,
    },
    {
        # DeepSeek's native API speaks OpenAI shape. deepseek-chat is V3.
        "id": "deepseek", "name": "DeepSeek", "kind": "llm",
        "baseUrl": "https://api.deepseek.com/v1", "chatModel": "deepseek-chat", "builtIn": True,
    },
    {
        # OpenRouter — one key, OpenAI-shaped, routes to virtually any model.
        # Model ids look like `vendor/model-name`; hit Fetch models for the list.
        "id": "openrouter", "name": "OpenRouter (aggregator)", "kind": "llm",
        "baseUrl": "https://openrouter.ai/api/v1", "chatModel": "", "builtIn": True,
    },
]


def seed_default_providers(db: Session) -> int:
    """Insert any missing built-in providers (merge by id). Does NOT commit.
    Returns the number added. Never clobbers user edits or user-added rows."""
    existing = {row.id for row in db.query(LlmProvider).all()}
    pos = db.query(LlmProvider).count()
    added = 0
    for p in DEFAULT_PROVIDERS:
        if p["id"] in existing:
            continue
        db.add(LlmProvider(
            id=p["id"],
            name=str(p.get("name") or ""),
            kind=str(p.get("kind") or ""),
            built_in=bool(p.get("builtIn")),
            position=pos,
            data=json.dumps(p),
        ))
        pos += 1
        added += 1
    return added


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
    # Open the demo on first run (mirrors the renderer's old first-run mint that
    # wrote activeProjectId). Only when nothing else has claimed the pointer.
    if db.get(Setting, "activeProjectId") is None:
        db.add(Setting(key="activeProjectId", value=json.dumps(DEMO_PROJECT_ID)))
    return True


def _register_seeded_providers() -> None:
    """Load the seeded providers into the shared LLM adapter registry so
    dispatch + the /v1/llm-providers `registered` flag work from boot — mirrors
    JustVoice's boot-time `load_from_configs`. `load_from_configs` swallows
    per-provider construction errors so a single bad config never blocks boot."""
    try:
        from llm_runner.llm import load_from_configs

        from .llm.provider_store import get_provider_store

        load_from_configs(get_provider_store().list())
    except Exception as e:  # never let registry wiring crash boot / reset
        log.warning("LLM provider boot registration failed: %s", e)


def seed_workspace(db: Session | None = None) -> None:
    """Run every workspace seeder and commit. Opens its own session when none is
    given (the `serve` entrypoint); reuses the caller's session when one is
    passed (the workspace-reset handler, after its wipe)."""
    own = db is None
    if own:
        if _db.SessionLocal is None:
            return
        db = _db.SessionLocal()
    try:
        seed_default_providers(db)
        seed_demo_project(db)
        db.commit()
    except Exception as e:  # never let a seed failure crash boot / reset
        log.warning("workspace seed failed: %s", e)
        db.rollback()
    finally:
        if own:
            db.close()
    # After the providers are committed, register them with the shared registry.
    _register_seeded_providers()
