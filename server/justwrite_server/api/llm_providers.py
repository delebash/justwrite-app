"""/v1/llm-providers — the configured LLM/TTS provider list (P5).

Moves the provider registry off the renderer's justwrite:ai kv blob into a
real, queryable server table (mobile-ready). JW calls providers DIRECTLY from
the renderer (inference never round-trips the server), so — unlike JustVoice,
whose server is itself the LLM client and needs an adapter registry — this is a
plain list resource. Bulk GET/PUT mirror how the AI store owns the whole list
in memory; per-provider config (which varies by type) round-trips intact.
"""

from __future__ import annotations

import json

from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import LlmProvider

router = APIRouter(tags=["llm-providers"], prefix="/v1/llm-providers")


class ProviderList(BaseModel):
    providers: list[dict]


@router.get("", summary="List configured providers")
async def list_providers(db: Session = Depends(get_db)) -> dict:
    rows = db.query(LlmProvider).order_by(LlmProvider.position).all()
    return {"providers": [json.loads(r.data) for r in rows]}


@router.put("", status_code=204, summary="Replace the provider list")
async def put_providers(body: ProviderList, db: Session = Depends(get_db)) -> Response:
    db.query(LlmProvider).delete(synchronize_session=False)
    for i, p in enumerate(body.providers or []):
        db.add(LlmProvider(
            id=str(p.get("id") or f"provider-{i}"),
            name=str(p.get("name") or ""),
            kind=str(p.get("kind") or ""),
            built_in=bool(p.get("builtIn")),
            position=i,
            data=json.dumps(p),
        ))
    db.commit()
    return Response(status_code=204)
