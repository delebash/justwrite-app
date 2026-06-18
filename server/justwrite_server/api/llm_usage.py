"""/v1/llm-usage — the LLM cost/token ledger (real rows, not a kv blob).

Replaces the renderer's `justwrite:ai:usage` blob. Every routed LLM call POSTs a
row; the settings Usage page GETs the recent log plus lifetime totals. Totals are
computed from the rows with SQL aggregates (overall + grouped by feature /
provider), so they always reflect the full history — the old design kept totals
in a side object precisely because its in-memory log was capped at 1000 and lost
older rows. Here nothing is lost.
"""

from __future__ import annotations

import json
import uuid

from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import LlmUsage

router = APIRouter(tags=["llm-usage"], prefix="/v1/llm-usage")


class UsageRow(BaseModel):
    id: str | None = None
    at: int = 0
    feature: str = "unknown"
    providerId: str | None = None
    model: str | None = None
    promptTokens: int = 0
    completionTokens: int = 0
    cost: float = 0.0
    meta: dict = {}


def _row_to_dict(r: LlmUsage) -> dict:
    return {
        "id": r.id,
        "at": r.at,
        "feature": r.feature,
        "providerId": r.provider_id,
        "model": r.model,
        "promptTokens": r.prompt_tokens,
        "completionTokens": r.completion_tokens,
        "cost": r.cost,
        "meta": json.loads(r.meta or "{}"),
    }


def _bucket(row) -> dict:
    return {
        "calls": row[1],
        "promptTokens": int(row[2]),
        "completionTokens": int(row[3]),
        "cost": float(row[4]),
    }


def _totals(db: Session) -> dict:
    overall = db.query(
        func.count(LlmUsage.id),
        func.coalesce(func.sum(LlmUsage.prompt_tokens), 0),
        func.coalesce(func.sum(LlmUsage.completion_tokens), 0),
        func.coalesce(func.sum(LlmUsage.cost), 0.0),
    ).one()
    totals = {
        "calls": overall[0],
        "promptTokens": int(overall[1]),
        "completionTokens": int(overall[2]),
        "cost": float(overall[3]),
        "byFeature": {},
        "byProvider": {},
    }
    for col, key in ((LlmUsage.feature, "byFeature"), (LlmUsage.provider_id, "byProvider")):
        rows = db.query(
            col,
            func.count(LlmUsage.id),
            func.coalesce(func.sum(LlmUsage.prompt_tokens), 0),
            func.coalesce(func.sum(LlmUsage.completion_tokens), 0),
            func.coalesce(func.sum(LlmUsage.cost), 0.0),
        ).group_by(col).all()
        for r in rows:
            if r[0] is not None:
                totals[key][r[0]] = _bucket(r)
    return totals


@router.get("", summary="Recent ledger rows (oldest-first) + lifetime totals")
async def get_usage(limit: int = 1000, db: Session = Depends(get_db)) -> dict:
    rows = db.query(LlmUsage).order_by(LlmUsage.at.desc()).limit(limit).all()
    # Oldest-first so the renderer can append new rows at the end (it reverses
    # for the newest-first display).
    log = [_row_to_dict(r) for r in reversed(rows)]
    return {"log": log, "totals": _totals(db)}


@router.post("", status_code=204, summary="Append one recorded call")
async def add_usage(body: UsageRow, db: Session = Depends(get_db)) -> Response:
    db.add(
        LlmUsage(
            id=body.id or f"u_{uuid.uuid4().hex[:12]}",
            at=body.at,
            feature=body.feature,
            provider_id=body.providerId,
            model=body.model,
            prompt_tokens=max(0, body.promptTokens),
            completion_tokens=max(0, body.completionTokens),
            cost=body.cost,
            meta=json.dumps(body.meta or {}),
        )
    )
    db.commit()
    return Response(status_code=204)


@router.delete("", status_code=204, summary="Clear the whole ledger")
async def clear_usage(db: Session = Depends(get_db)) -> Response:
    db.query(LlmUsage).delete(synchronize_session=False)
    db.commit()
    return Response(status_code=204)
