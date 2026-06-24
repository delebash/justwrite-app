"""FastAPI application factory for the JustWrite server.

Boots SQLite + AppState and mounts the domain APIs (projects, settings,
sessions, chat, versions, llm-usage, images, RAG, workspace) plus the SHARED
llm-runner router in-process (the same router JustVoice mounts — full symmetry).
All renderer state persists here in SQLite — there is no key/value or IndexedDB
seam. See docs/plans/2026-06-18-unified-storage-no-idb.md.
"""

from __future__ import annotations

import logging
import os
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

# Shared local-LLM runner core (own repo `just-llm-runner`, git dependency).
# Imported in-process — JustWrite now has a real Python server, so it mounts
# the same router JustVoice does instead of running it as a separate sidecar.
from llm_runner import router as llm_runner_router

from .api import (
    chat,
    health,
    images,
    llm_usage,
    projects,
    rag,
    sessions,
    settings,
    versions,
    workspace,
)
from .app_state import AppState, set_state
from .auth import BearerAuthMiddleware
from .database import init_db
from .errors import ApiError, api_exception_handler, http_exception_handler
from .paths import default_data_dir
from .version import PRODUCT, VERSION

log = logging.getLogger(__name__)


def _read_cors() -> dict:
    """The `cors` settings section ({origins, originRegex}) read at boot, or {}
    if unset/unavailable. CORSMiddleware is configured once at app construction
    (changing it needs a restart — same as JustVoice)."""
    from .database import SessionLocal
    from .models import Setting

    if SessionLocal is None:
        return {}
    db = SessionLocal()
    try:
        row = db.get(Setting, "cors")
        import json

        return (json.loads(row.value) or {}) if row else {}
    except Exception as e:  # noqa: BLE001
        log.warning("cors config read failed (allow-all fallback): %s", e)
        return {}
    finally:
        db.close()


def create_app(data_dir: Path | None = None) -> FastAPI:
    data_dir = data_dir or default_data_dir()
    init_db(data_dir)
    set_state(AppState(data_dir))

    # Persist server-side LLM dispatch usage to the LlmUsage table (the shared
    # ledger's host sink) so it joins JW's cost ledger instead of the in-memory
    # ring that's lost on restart. JustVoice keeps the in-memory default.
    from llm_runner.llm.usage import set_ledger

    from .llm.usage_sink import JwDbUsageSink

    set_ledger(JwDbUsageSink())

    app = FastAPI(title=PRODUCT, version=VERSION)

    # Catch-all error envelope — registered BEFORE CORSMiddleware so an
    # unhandled exception becomes a JSON 500 that flows OUT through CORS and
    # reaches the browser as a real error (a bare exception handler runs in
    # Starlette's ServerErrorMiddleware, OUTSIDE CORS, so the browser sees a
    # CORS block instead). Uniform with JustVoice's server (verified the hard
    # way there, 2026-06-12).
    @app.middleware("http")
    async def _error_envelope(request, call_next):  # noqa: ANN001
        try:
            return await call_next(request)
        except Exception as exc:  # noqa: BLE001 — envelope everything
            log.exception("unhandled error on %s %s", request.method, request.url.path)
            return JSONResponse(
                status_code=500,
                content={"title": "Internal Server Error", "detail": str(exc)[:300]},
            )

    # Bearer auth — OFF unless tokens are configured in Settings (the `auth`
    # section). Gates /v1/* only. Added BEFORE CORS so CORS ends up OUTERMOST
    # (Starlette runs last-added first): CORS then answers preflights before
    # auth sees them, and wraps auth's 401/403 with CORS headers.
    app.add_middleware(BearerAuthMiddleware)

    # CORS — settings-driven (the `cors` section: origins / originRegex) so an
    # exposed/headless server can lock origins down; falls back to allow-all for
    # the local + dev + headless paths when unset. The Tauri desktop webview
    # routes HTTP through Tauri's plugin (CORS-exempt) regardless.
    _cors = _read_cors()
    if _cors.get("origins") or _cors.get("originRegex"):
        app.add_middleware(
            CORSMiddleware,
            allow_origins=_cors.get("origins") or [],
            allow_origin_regex=_cors.get("originRegex") or None,
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )
    else:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=["*"],
            allow_methods=["*"],
            allow_headers=["*"],
        )

    # RFC 7807 problem+json for ApiError + plain HTTPException — one error shape
    # across both apps' servers (the bearer-auth middleware emits it too).
    app.add_exception_handler(ApiError, api_exception_handler)
    app.add_exception_handler(HTTPException, http_exception_handler)

    app.include_router(health.router)
    app.include_router(projects.router)
    app.include_router(sessions.router)
    app.include_router(chat.router)
    app.include_router(settings.router)
    app.include_router(versions.router)
    app.include_router(workspace.router)
    app.include_router(rag.router)
    app.include_router(images.router)
    app.include_router(llm_usage.router)
    app.include_router(llm_runner_router)
    # Shared LLM routers (the same ones JustVoice mounts): storage-free endpoints
    # (classify-tier / ai-usage / ping / models over the shared registry+ledger)
    # plus the provider-CRUD router backed by JustWrite's `LlmProvider`-table
    # ProviderStore. Replaces the old bulk GET/PUT `api/llm_providers.py`.
    from llm_runner.llm import (
        make_feature_presets_router,
        make_feature_router,
        make_prompt_router,
        make_routing_presets_router,
        make_routing_router,
    )
    from llm_runner.llm.api import router as llm_shared_api_router
    from llm_runner.llm.provider_api import make_provider_router

    from .feature_catalog import FEATURE_CATALOG
    from .llm.config import llm_config
    from .llm.feature_preset_store import get_feature_preset_store
    from .llm.prompt_store import get_prompt_store
    from .llm.provider_store import get_provider_store
    from .llm.routing_store import get_routing_preset_store, get_routing_store
    from .seed_feature_prompts import DEFAULT_FEATURE_PROMPTS

    app.include_router(llm_shared_api_router)
    app.include_router(make_provider_router(get_provider_store))
    # Shared per-feature prompt routers (the same ones JustVoice will mount):
    # the /v1/ai/prompts editor over JW's FeaturePromptStore + seed catalog, and
    # /v1/ai/run + /v1/ai/stream feature execution over the shared dispatch.
    app.include_router(make_prompt_router(get_prompt_store, DEFAULT_FEATURE_PROMPTS))
    app.include_router(make_feature_router(get_prompt_store, llm_config))
    # Shared feature-routing editor (/v1/ai/routing): default + roles + per-feature
    # pins over JW's RoutingStore (the `ai` settings blob) and JW's catalog.
    app.include_router(make_routing_router(get_routing_store, lambda: FEATURE_CATALOG))
    # Named routing presets ("hardware presets"): save/apply/edit/delete whole
    # routing snapshots, applying into the same RoutingStore.
    app.include_router(make_routing_presets_router(get_routing_preset_store, get_routing_store))
    # Per-feature presets (Feature Workbench save-as/load + use-as-production):
    # named saved configs over JW's feature_presets table.
    app.include_router(make_feature_presets_router(get_feature_preset_store))

    # Headless UI — serve the Vite build (dist/) so `justwrite-server serve` + a
    # browser at the server's origin gives the full app WITHOUT the Tauri shell
    # (the renderer's origin-aware serverApi targets window.location.origin).
    # Uniform with JustVoice. Mounted LAST so every /v1/* router wins first.
    ui_dir = _locate_ui_dir()
    if ui_dir is not None:
        @app.get("/ui", include_in_schema=False)
        @app.get("/ui/", include_in_schema=False)
        async def ui_redirect():
            return RedirectResponse("/")

        app.mount("/", StaticFiles(directory=str(ui_dir), html=True), name="ui")
        log.info("UI served from %s", ui_dir)
    else:
        log.warning(
            "UI build not found — headless UI disabled. Run `npm run build:vite` "
            "to produce dist/, or set JUSTWRITE_UI_DIR."
        )

    return app


def _locate_ui_dir() -> Path | None:
    """Find the Vite build output (dist/) across dev + packaged layouts."""
    candidates: list[Path] = []
    override = os.environ.get("JUSTWRITE_UI_DIR")
    if override:
        candidates.append(Path(override))
    # Source layout: server/justwrite_server/app.py -> parents[2] is the repo root.
    candidates.append(Path(__file__).resolve().parents[2] / "dist")
    # Packaged / cwd fallback.
    candidates.append(Path.cwd() / "dist")
    for c in candidates:
        if c.is_dir() and (c / "index.html").is_file():
            return c
    return None
