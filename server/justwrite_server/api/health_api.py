"""GET /v1/health — liveness + version + persistence status."""

from __future__ import annotations

from fastapi import APIRouter

from ..app_state import get_state
from ..database import get_engine
from ..version import API_VERSION, PRODUCT, VERSION

router = APIRouter(tags=["system"])


@router.get("/v1/health", summary="Liveness, version, and persistence status")
async def health() -> dict:
    # camelCase wire (shared cross-app convention). Keys are hand-written
    # here because P0 has no Pydantic models yet — those adopt a CamelModel
    # base (like the runner's schema) when entity APIs land.
    return {
        "status": "ok",
        "product": PRODUCT,
        "version": VERSION,
        "apiVersion": API_VERSION,
        "dataDir": str(get_state().data_dir),
        "dbReady": get_engine() is not None,
    }
