"""/v1/llm/{providerId}/... — the server-side LLM gateway.

The architectural pivot (see docs/plans/2026-06-18-server-side-llm-architecture.md):
the SERVER is the LLM client. The renderer (or a phone) sends a provider id + an
OpenAI-shaped body; the server looks the provider up in the /v1/llm-providers
table, injects the server-held API key, forwards to the provider's baseUrl (a
cloud endpoint, or the local runner's llama-server), and streams the response
straight back. Clients never hold keys or call providers directly — so a thin
client works and both apps share one shape.

Every JW provider is OpenAI-compatible at `{baseUrl}/chat/completions` etc.
(cloud endpoints + the local runner), so this is a generic transparent proxy.
"""

from __future__ import annotations

import json

import httpx
from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import LlmProvider

router = APIRouter(tags=["llm"], prefix="/v1/llm")


def _client() -> httpx.AsyncClient:
    """The httpx client used to reach providers. A factory so tests can inject
    an httpx.MockTransport without a real upstream."""
    return httpx.AsyncClient(timeout=None)


def resolve_target(db: Session, provider_id: str, suffix: str) -> tuple[str, dict]:
    """(url, headers) for a provider + path suffix, or 404. Injects the
    server-held key as a Bearer token; local providers (no key) get none."""
    row = db.get(LlmProvider, provider_id)
    if row is None:
        raise HTTPException(status_code=404, detail=f"provider {provider_id!r} not configured")
    cfg = json.loads(row.data)
    base = str(cfg.get("baseUrl") or "").rstrip("/")
    if not base:
        raise HTTPException(status_code=400, detail=f"provider {provider_id!r} has no baseUrl")
    headers = {"Content-Type": "application/json"}
    key = cfg.get("apiKey")
    if key:
        headers["Authorization"] = f"Bearer {key}"
    return f"{base}/{suffix.lstrip('/')}", headers


async def _proxy_json(url: str, headers: dict, body: dict) -> Response:
    async with _client() as client:
        try:
            r = await client.post(url, json=body, headers=headers)
        except httpx.HTTPError as exc:
            raise HTTPException(status_code=502, detail=f"provider unreachable: {exc}") from exc
    return Response(content=r.content, status_code=r.status_code,
                    media_type=r.headers.get("content-type", "application/json"))


async def _proxy_stream(url: str, headers: dict, body: dict) -> StreamingResponse:
    async def gen():
        async with _client() as client:
            async with client.stream("POST", url, json=body, headers=headers) as r:
                async for chunk in r.aiter_raw():
                    yield chunk

    return StreamingResponse(gen(), media_type="text/event-stream")


@router.post("/{provider_id}/chat/completions", summary="Chat completion (streams when stream=true)")
async def chat_completions(provider_id: str, body: dict, db: Session = Depends(get_db)):
    url, headers = resolve_target(db, provider_id, "chat/completions")
    if body.get("stream"):
        return await _proxy_stream(url, headers, body)
    return await _proxy_json(url, headers, body)


@router.post("/{provider_id}/embeddings", summary="Embeddings")
async def embeddings(provider_id: str, body: dict, db: Session = Depends(get_db)) -> Response:
    url, headers = resolve_target(db, provider_id, "embeddings")
    return await _proxy_json(url, headers, body)


@router.get("/{provider_id}/models", summary="List the provider's models (fetch-models)")
async def models(provider_id: str, db: Session = Depends(get_db)) -> Response:
    url, headers = resolve_target(db, provider_id, "models")
    async with _client() as client:
        try:
            r = await client.get(url, headers=headers)
        except httpx.HTTPError as exc:
            raise HTTPException(status_code=502, detail=f"provider unreachable: {exc}") from exc
    return Response(content=r.content, status_code=r.status_code,
                    media_type=r.headers.get("content-type", "application/json"))
