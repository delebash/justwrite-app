"""JwDbUsageSink — the host persistence sink for the shared LLM usage ledger.

Plugged in at boot via `llm_runner.llm.usage.set_ledger` so server-side
`dispatch.chat` usage persists to JustWrite's `LlmUsage` table (joining the
existing cost ledger behind `/v1/llm-usage`) instead of the shared in-memory
ring that's lost on restart. JustVoice keeps the default in-memory ledger; this
is the genuine persistence boundary RULE #8 allows (real work, one of it).
"""

from __future__ import annotations

import json
import time
import uuid

from .. import database as _db
from ..models import LlmUsage
from .pricing import cost_for


class JwDbUsageSink:
    """UsageSink (record/snapshot/clear) over the LlmUsage table."""

    def record(self, entry) -> None:  # entry: llm_runner.llm.usage.UsageEntry
        if _db.SessionLocal is None:
            return
        meta = {"durationMs": entry.duration_ms, "ok": entry.ok}
        if entry.error:
            meta["error"] = entry.error
        db = _db.SessionLocal()
        try:
            db.add(LlmUsage(
                id=f"u_{uuid.uuid4().hex[:12]}",
                at=int((entry.at or time.time()) * 1000),  # JW stores epoch ms
                feature=entry.feature,
                provider_id=entry.provider_id,
                model=entry.model,
                prompt_tokens=max(0, entry.prompt_tokens),
                completion_tokens=max(0, entry.completion_tokens),
                cost=cost_for(entry.model, entry.prompt_tokens, entry.completion_tokens),
                meta=json.dumps(meta),
            ))
            db.commit()
        except Exception:  # never let a usage write break a feature call
            db.rollback()
        finally:
            db.close()

    def snapshot(self) -> dict:
        """Shared-shape snapshot (powers the shared `/v1/ai-usage`). JustWrite's
        own usage UI reads `/v1/llm-usage` (SQL aggregates with cost); this is
        the cross-app parity view — calls + tokens per feature, recent log."""
        empty = {"by_feature": {}, "recent": [], "total_calls": 0}
        if _db.SessionLocal is None:
            return empty
        db = _db.SessionLocal()
        try:
            rows = db.query(LlmUsage).order_by(LlmUsage.at.desc()).all()
        finally:
            db.close()
        by_feature: dict[str, dict] = {}
        for r in rows:
            agg = by_feature.setdefault(
                r.feature,
                {"calls": 0, "errors": 0, "prompt_tokens": 0, "completion_tokens": 0, "duration_ms": 0},
            )
            agg["calls"] += 1
            agg["prompt_tokens"] += r.prompt_tokens or 0
            agg["completion_tokens"] += r.completion_tokens or 0
        recent = [
            {
                "feature": r.feature, "model": r.model, "provider_id": r.provider_id,
                "prompt_tokens": r.prompt_tokens, "completion_tokens": r.completion_tokens,
                "at": (r.at or 0) / 1000,
            }
            for r in rows[:30]
        ]
        return {"by_feature": by_feature, "recent": recent, "total_calls": len(rows)}

    def clear(self) -> None:
        if _db.SessionLocal is None:
            return
        db = _db.SessionLocal()
        try:
            db.query(LlmUsage).delete(synchronize_session=False)
            db.commit()
        finally:
            db.close()
