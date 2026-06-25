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
from .models import (
    LlmProvider, ModelCatalog, ModelRecommendation, ModelSwitch,
    RoutingConfigRow, Setting,
)
from .seed_feature_prompts import seed_feature_prompts

log = logging.getLogger(__name__)


# The built-in LLM providers, ported from the renderer's old `domain/seed.js`
# DEFAULT_PROVIDERS. Every field is a real `LlmProvider` column — no JSON blob.
# `built_in` marks them undeletable in the UI; cloud providers ship with no key
# (the user adds one in Settings), the local ones need none. Blank
# `default_model` means "hit Fetch models" — every local server uses its own ids.
# `provider_type` is the adapter discriminator; claude/gemini keep `openai-compat`
# (every JW cloud provider uses the OpenAI-compatible endpoint today — the native
# anthropic/gemini migration is plan Decision 20). `local` is the Local/Online
# choice that drives the UI grouping.
DEFAULT_PROVIDERS: list[dict] = [
    {
        # Built-in llama.cpp runner (just-llm-runner) — the recommended local
        # default. Spawned as a bundled sidecar: no external install, no key.
        "id": "local-llamacpp", "name": "Built-in (llama.cpp)",
        "provider_type": "local-llamacpp", "base_url": "http://127.0.0.1:8080/v1", "local": True,
    },
    {
        # Generic OpenAI-shaped local LLM (Ollama, LM Studio, llama.cpp, …).
        "id": "openai-compat-local", "name": "OpenAI-compatible (local)",
        "provider_type": "openai-compat", "base_url": "http://localhost:11434/v1", "local": True,
    },
    {
        "id": "openai", "name": "OpenAI",
        "provider_type": "openai", "base_url": "https://api.openai.com/v1",
        "default_model": "gpt-4o-mini", "local": False,
    },
    {
        # Claude via Anthropic's OpenAI-compatible endpoint. Default is the
        # cheapest Claude (haiku); users can swap to sonnet/opus for quality.
        "id": "claude", "name": "Claude (Anthropic)",
        "provider_type": "openai-compat", "base_url": "https://api.anthropic.com/v1",
        "default_model": "claude-haiku-4-5", "local": False,
    },
    {
        # Google's OpenAI-compatible Gemini endpoint. The `/v1beta/openai` prefix
        # is Google-specific; url() appends /chat/completions etc. after it.
        "id": "gemini", "name": "Gemini (Google)",
        "provider_type": "openai-compat",
        "base_url": "https://generativelanguage.googleapis.com/v1beta/openai",
        "default_model": "gemini-2.5-flash", "local": False,
    },
    {
        # DeepSeek's native API speaks OpenAI shape. deepseek-chat is V3.
        "id": "deepseek", "name": "DeepSeek",
        "provider_type": "deepseek", "base_url": "https://api.deepseek.com/v1",
        "default_model": "deepseek-chat", "local": False,
    },
    {
        # OpenRouter — one key, OpenAI-shaped, routes to virtually any model.
        # Model ids look like `vendor/model-name`; hit Fetch models for the list.
        "id": "openrouter", "name": "OpenRouter (aggregator)",
        "provider_type": "openrouter", "base_url": "https://openrouter.ai/api/v1", "local": False,
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
            kind="llm",
            built_in=True,
            position=pos,
            provider_type=str(p["provider_type"]),
            base_url=str(p.get("base_url") or ""),
            api_key=None,
            default_model=str(p.get("default_model") or ""),
            embedding_model=str(p.get("embedding_model") or ""),
            timeout_seconds=int(p.get("timeout_seconds") or 60),
            local=bool(p["local"]),
        ))
        pos += 1
        added += 1
    return added


# Factory llama.cpp model catalog — the DB source of truth for downloadable
# models. Replaces the `models` array that used to live in
# just-llm-runner/llm_runner/runner/runner-manifest.json (deleted as part of
# this cutover; the manifest now ships ONLY binaries + flag presets + vramFit).
# Switch override columns are nullable — null = use the base preset; a value
# REPLACES that flag at spawn (process.py:_apply_engine_overrides). Notable:
# the 35B MoE sets `spec_type="none"` to override the manifest's `mtp:true`
# auto-spec — research showed draft-mtp HURTS MoE in llama.cpp
# (docs/plans/2026-06-24-llamacpp-switches.md:201-204).
DEFAULT_CATALOG: list[dict] = [
    {"id": "qwen3.6-35b-a3b-mtp", "name": "Qwen3.6 35B-A3B (MTP)",
     "hf_repo": "unsloth/Qwen3.6-35B-A3B-MTP-GGUF", "quant": "UD-Q4_K_XL",
     "total_params": "35B", "active_params": "3.6B", "mtp": True,
     "min_vram_mb": 6000, "min_ram_mb": 24000, "tier": "low-vram-moe", "position": 0},
    {"id": "qwen3.5-9b-q4_k_s", "name": "Qwen3.5 9B · Q4_K_S",
     "hf_repo": "unsloth/Qwen3.5-9B-GGUF", "quant": "Q4_K_S",
     "total_params": "9B", "min_ram_mb": 9500, "min_vram_mb": 7000,
     "tier": "mid", "position": 1},
    {"id": "qwen3.5-9b-q4_k_m", "name": "Qwen3.5 9B · Q4_K_M",
     "hf_repo": "unsloth/Qwen3.5-9B-GGUF", "quant": "Q4_K_M",
     "total_params": "9B", "min_ram_mb": 10000, "min_vram_mb": 7500,
     "tier": "mid", "position": 2},
    {"id": "qwen3-14b-q3_k_m", "name": "Qwen3 14B · Q3_K_M",
     "hf_repo": "unsloth/Qwen3-14B-GGUF", "quant": "Q3_K_M",
     "total_params": "14B", "min_ram_mb": 12000, "min_vram_mb": 9000,
     "tier": "mid", "position": 3},
    {"id": "qwen3-14b-q4_k_m", "name": "Qwen3 14B · Q4_K_M",
     "hf_repo": "unsloth/Qwen3-14B-GGUF", "quant": "Q4_K_M",
     "total_params": "14B", "min_ram_mb": 14000, "min_vram_mb": 11000,
     "tier": "mid", "position": 4},
    {"id": "qwen3.6-27b-mtp-q4_k_m", "name": "Qwen3.6 27B (MTP) · Q4_K_M",
     "hf_repo": "unsloth/Qwen3.6-27B-MTP-GGUF", "quant": "Q4_K_M",
     "total_params": "27B", "mtp": True,
     "min_ram_mb": 26000, "min_vram_mb": 20000, "tier": "high", "position": 5},
]


# Per-model spawn-flag overrides — the variable-cardinality switches that layer
# UNDER user Overrides at /v1/llm-runner/load. flag_name maps 1:1 to fields on
# `process.Overrides` (just-llm-runner). Stored as text; the runner parses it.
DEFAULT_SWITCHES: list[dict] = [
    # 35B MoE: force draft-mtp OFF (mtp=True would auto-apply it; research says
    # draft-mtp HURTS MoE in llama.cpp) + standard MoE-offload memory residency.
    {"model_id": "qwen3.6-35b-a3b-mtp", "flag_name": "spec_type", "flag_value": "none"},
    {"model_id": "qwen3.6-35b-a3b-mtp", "flag_name": "no_mmap",   "flag_value": "true"},
    # 27B dense MTP: draft-mtp HELPS dense (the opposite of MoE).
    {"model_id": "qwen3.6-27b-mtp-q4_k_m", "flag_name": "spec_type",  "flag_value": "draft-mtp"},
    {"model_id": "qwen3.6-27b-mtp-q4_k_m", "flag_name": "spec_n_max", "flag_value": "3"},
]


def seed_default_catalog(db: Session) -> int:
    """Insert any missing built-in catalog rows (merge by id). Does NOT commit.
    Returns the number added. Never clobbers user edits or user-added rows.
    Mirrors `seed_default_providers`."""
    existing = {row.id for row in db.query(ModelCatalog.id).all()}
    added = 0
    for c in DEFAULT_CATALOG:
        if c["id"] in existing:
            continue
        db.add(ModelCatalog(
            id=c["id"], name=str(c.get("name") or ""),
            hf_repo=str(c.get("hf_repo") or ""), quant=str(c.get("quant") or ""),
            mmproj=c.get("mmproj"),
            total_params=str(c.get("total_params") or ""),
            active_params=str(c.get("active_params") or ""),
            mtp=bool(c.get("mtp") or False),
            min_vram_mb=c.get("min_vram_mb"),
            min_ram_mb=c.get("min_ram_mb"),
            tier=str(c.get("tier") or "mid"),
            built_in=True, position=int(c.get("position") or 0),
        ))
        added += 1
    return added


def seed_default_switches(db: Session) -> int:
    """Insert any missing built-in switch rows (merge by (model_id, flag_name)).
    Does NOT commit. Never clobbers user edits or user-added rows."""
    existing = {
        (r.model_id, r.flag_name)
        for r in db.query(ModelSwitch.model_id, ModelSwitch.flag_name).all()
    }
    added = 0
    for s in DEFAULT_SWITCHES:
        key = (s["model_id"], s["flag_name"])
        if key in existing:
            continue
        db.add(ModelSwitch(
            model_id=s["model_id"], flag_name=s["flag_name"],
            flag_value=str(s.get("flag_value") or ""), built_in=True,
        ))
        added += 1
    return added


# Factory model recommendations — the curated "this model is good for job Y"
# rows that pre-fill QuickSetup's role picks. Q3 only (Fit handles Q1, presets
# Q2). Job keys match dispatch's role names where they overlap ("quick" /
# "accuracy") so the wizard can lookup-by-role; other jobs are tags the wizard
# may surface ("prose", "attribution"). `rank` orders candidates within a job
# (lower = preferred). User edits drop `built_in`, so reset_to_factory restores
# these cleanly. model ids match the runner manifest (just-llm-runner
# llm_runner/runner/runner-manifest.json:48-124).
DEFAULT_RECOMMENDATIONS: list[dict] = [
    # Quick / interactive — small dense for snappy responses.
    {"model_id": "qwen3.5-9b-q4_k_s",      "job": "quick",       "rank": 10, "why": "Smallest dense — snappy interactive work."},
    {"model_id": "qwen3.5-9b-q4_k_m",      "job": "quick",       "rank": 20, "why": "Same 9B, slightly higher quant — still quick on most cards."},
    # Accuracy / careful passes — bigger dense, and the MoE for low-VRAM users.
    {"model_id": "qwen3-14b-q4_k_m",       "job": "accuracy",    "rank": 10, "why": "14B dense — best accuracy that fits ≥11 GB VRAM."},
    {"model_id": "qwen3-14b-q3_k_m",       "job": "accuracy",    "rank": 20, "why": "14B dense, lower quant — fits ≥9 GB."},
    {"model_id": "qwen3.6-27b-mtp-q4_k_m", "job": "accuracy",    "rank":  5, "why": "27B (MTP) — best accuracy at the high tier (~20 GB+ VRAM)."},
    {"model_id": "qwen3.6-35b-a3b-mtp",    "job": "accuracy",    "rank": 15, "why": "35B-A3B MoE — runs on 6 GB VRAM via CPU expert offload (needs 24 GB RAM)."},
    # Attribution — extends the manifest's existing candidateFor tag.
    {"model_id": "qwen3.6-35b-a3b-mtp",    "job": "attribution", "rank": 10, "why": "MoE 35B-A3B — strong at structured extraction; CPU-offload friendly."},
]


def seed_default_recommendations(db: Session) -> int:
    """Insert any missing built-in recommendations (merge by (model_id, job)).
    Does NOT commit. Returns the number added. Never clobbers user edits or
    user-added rows. Mirrors `seed_default_providers`."""
    existing = {
        (row.model_id, row.job)
        for row in db.query(ModelRecommendation.model_id, ModelRecommendation.job).all()
    }
    added = 0
    for r in DEFAULT_RECOMMENDATIONS:
        key = (r["model_id"], r["job"])
        if key in existing:
            continue
        db.add(ModelRecommendation(
            model_id=r["model_id"], job=r["job"],
            rank=int(r.get("rank") or 100),
            why=str(r.get("why") or ""),
            built_in=True,
        ))
        added += 1
    return added


def seed_default_routing(db: Session) -> bool:
    """Seed the live routing row (id='active') if missing — default LLM +
    embedding point at the local OpenAI-compatible provider so a fresh install
    routes to free local inference. Does NOT commit. Returns True if added."""
    if db.get(RoutingConfigRow, "active") is not None:
        return False
    db.add(RoutingConfigRow(
        id="active", is_active=True, position=0,
        default_llm_id="openai-compat-local", default_embedding_id="openai-compat-local",
    ))
    return True


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
        seed_default_routing(db)
        seed_default_catalog(db)
        seed_default_switches(db)
        seed_default_recommendations(db)
        seed_feature_prompts(db)
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
