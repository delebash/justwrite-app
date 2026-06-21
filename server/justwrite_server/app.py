"""FastAPI application factory for the JustWrite server.

Boots SQLite + AppState and mounts the domain APIs (projects, settings,
sessions, chat, versions, llm-usage, images, RAG, workspace) plus the SHARED
llm-runner router in-process (the same router JustVoice mounts — full symmetry).
All renderer state persists here in SQLite — there is no key/value or IndexedDB
seam. See docs/plans/2026-06-18-unified-storage-no-idb.md.
"""

from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Shared local-LLM runner core (own repo `just-llm-runner`, git dependency).
# Imported in-process — JustWrite now has a real Python server, so it mounts
# the same router JustVoice does instead of running it as a separate sidecar.
from llm_runner import router as llm_runner_router

from .api import (
    chat,
    health,
    images,
    llm,
    llm_usage,
    projects,
    rag,
    sessions,
    settings,
    versions,
    workspace,
)
from .app_state import AppState, set_state
from .database import init_db
from .paths import default_data_dir
from .version import PRODUCT, VERSION


def create_app(data_dir: Path | None = None) -> FastAPI:
    data_dir = data_dir or default_data_dir()
    init_db(data_dir)
    set_state(AppState(data_dir))

    app = FastAPI(title=PRODUCT, version=VERSION)
    # The Tauri webview origin is cross-origin to the localhost server; the
    # desktop shell routes HTTP through Tauri's plugin (CORS-exempt), but keep
    # this permissive for the browser-only dev path.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

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
    app.include_router(llm.router)
    app.include_router(llm_runner_router)
    # Shared LLM routers (the same ones JustVoice mounts): storage-free endpoints
    # (classify-tier / ai-usage / ping / models over the shared registry+ledger)
    # plus the provider-CRUD router backed by JustWrite's `LlmProvider`-table
    # ProviderStore. Replaces the old bulk GET/PUT `api/llm_providers.py`.
    from llm_runner.llm.api import router as llm_shared_api_router
    from llm_runner.llm.provider_api import make_provider_router

    from .llm.provider_store import get_provider_store

    app.include_router(llm_shared_api_router)
    app.include_router(make_provider_router(get_provider_store))
    return app
