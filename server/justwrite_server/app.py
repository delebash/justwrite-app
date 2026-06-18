"""FastAPI application factory for the JustWrite server.

Boots SQLite + AppState, mounts /v1/health, /v1/kv (the key/value seam
backing the renderer's storage.js), and the SHARED llm-runner router
in-process (the same router JustVoice mounts — full symmetry). Normalized
entity APIs replace the kv blob in P2. See
docs/plans/2026-06-18-jw-server-migration.md.
"""

from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Shared local-LLM runner core (own repo `just-llm-runner`, git dependency).
# Imported in-process — JustWrite now has a real Python server, so it mounts
# the same router JustVoice does instead of running it as a separate sidecar.
from llm_runner import router as llm_runner_router

from .api import chat, health, images, kv, llm, llm_providers, projects, rag, sessions, settings
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
    app.include_router(kv.router)
    app.include_router(projects.router)
    app.include_router(sessions.router)
    app.include_router(chat.router)
    app.include_router(settings.router)
    app.include_router(rag.router)
    app.include_router(images.router)
    app.include_router(llm_providers.router)
    app.include_router(llm.router)
    app.include_router(llm_runner_router)
    return app
