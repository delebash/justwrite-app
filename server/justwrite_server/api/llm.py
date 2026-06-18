"""/v1/llm/... — the server-side LLM gateway.

The architectural pivot (see docs/plans/2026-06-18-server-side-llm-architecture.md):
the SERVER is the LLM client. The renderer (or a phone) sends a provider id + an
OpenAI-shaped body; the server looks the provider up in the /v1/llm-providers
table, injects the server-held API key, forwards to the provider's baseUrl, and
streams the response straight back. Clients never hold keys or call providers
directly — so a thin client works and both apps share one shape.

Most providers are OpenAI-compatible at `{baseUrl}/chat/completions` etc. (cloud
endpoints + the local runner), so those are a transparent proxy. Ollama is the
exception: its native `/api/chat` is the only path that honors `think: false`
(disable reasoning), so for Ollama providers the gateway translates the OpenAI
body to Ollama-native and normalizes the response back to the OpenAI shape — the
client stays OpenAI-only with a single SSE parser. The renderer's old
`_buildOllamaBody` / `enrichedModels` quirk logic moves here, server-side.
"""

from __future__ import annotations

import json
from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import LlmProvider

router = APIRouter(tags=["llm"], prefix="/v1/llm")


def _client() -> httpx.AsyncClient:
    """The httpx client used to reach providers. A factory so tests can inject
    an httpx.MockTransport/ASGITransport without a real upstream."""
    return httpx.AsyncClient(timeout=None)


# ── provider config + routing helpers ──────────────────────────────────────


def _provider_cfg(db: Session, provider_id: str) -> dict[str, Any]:
    row = db.get(LlmProvider, provider_id)
    if row is None:
        raise HTTPException(status_code=404, detail=f"provider {provider_id!r} not configured")
    return json.loads(row.data)


def _is_ollama(cfg: dict) -> bool:
    """Mirror the renderer's detectRunner: an explicit runner pin wins, else a
    URL heuristic. Only Ollama needs native routing (think:false)."""
    runner = str(cfg.get("runner") or "").lower()
    if runner == "ollama":
        return True
    if runner:  # any other explicit runner == OpenAI-compat
        return False
    url = str(cfg.get("baseUrl") or "").lower()
    return ":11434" in url or "ollama" in url


def _base_v1(cfg: dict) -> str:
    base = str(cfg.get("baseUrl") or "").rstrip("/")
    if not base:
        raise HTTPException(status_code=400, detail="provider has no baseUrl")
    return base


def _base_root(cfg: dict) -> str:
    """baseUrl with a trailing /v1 stripped, for native (non-OpenAI) endpoints
    that live at the host root (Ollama /api/*, LM Studio /api/*)."""
    base = str(cfg.get("baseUrl") or "").rstrip("/")
    if base.endswith("/v1"):
        base = base[:-3]
    return base.rstrip("/")


def _headers(cfg: dict, *, body: bool = True) -> dict:
    h: dict[str, str] = {}
    if body:
        h["Content-Type"] = "application/json"
    key = cfg.get("apiKey")
    if key:
        h["Authorization"] = f"Bearer {key}"
    return h


def _ollama_usage(j: dict) -> dict | None:
    pt = j.get("prompt_eval_count")
    ct = j.get("eval_count")
    if pt is None and ct is None:
        return None
    pt = pt or 0
    ct = ct or 0
    return {"prompt_tokens": pt, "completion_tokens": ct, "total_tokens": pt + ct}


# ── OpenAI-compat transparent proxy ─────────────────────────────────────────


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


# ── Ollama-native translation ───────────────────────────────────────────────


def _to_ollama_chat_body(body: dict) -> dict:
    """OpenAI chat body -> Ollama /api/chat body. Mirrors the renderer's old
    _buildOllamaBody: generation knobs go in `options` (num_ctx defaults to 8192
    — Ollama's own default of 4096 silently truncates long chapters); `think` is
    a first-class top-level field; unknown keys pass through for forward-compat."""
    rest = dict(body)
    messages = rest.pop("messages", [])
    model = rest.pop("model", "")
    stream = bool(rest.pop("stream", False))
    temperature = rest.pop("temperature", None)
    think = rest.pop("think", None)
    options = dict(rest.pop("options", {}) or {})
    # OpenAI-only fields with no Ollama-native equivalent.
    rest.pop("stream_options", None)
    rest.pop("response_format", None)
    if temperature is not None:
        options.setdefault("temperature", temperature)
    options.setdefault("num_ctx", 8192)
    out: dict[str, Any] = {"model": model, "messages": messages, "stream": stream, "options": options}
    if think is not None:
        out["think"] = think
    for k, v in rest.items():
        out[k] = v  # format, keep_alive, … (future Ollama params)
    return out


async def _ollama_chat(cfg: dict, body: dict) -> Response:
    ob = _to_ollama_chat_body(body)
    url = f"{_base_root(cfg)}/api/chat"
    headers = _headers(cfg)
    if ob["stream"]:
        return StreamingResponse(_ollama_chat_sse(url, headers, ob), media_type="text/event-stream")
    async with _client() as client:
        try:
            r = await client.post(url, json=ob, headers=headers)
        except httpx.HTTPError as exc:
            raise HTTPException(status_code=502, detail=f"provider unreachable: {exc}") from exc
    if r.status_code >= 400:
        return Response(content=r.content, status_code=r.status_code,
                        media_type=r.headers.get("content-type", "application/json"))
    j = r.json()
    content = (j.get("message") or {}).get("content", "")
    out: dict[str, Any] = {"choices": [{"index": 0, "message": {"role": "assistant", "content": content},
                                        "finish_reason": "stop"}]}
    usage = _ollama_usage(j)
    if usage:
        out["usage"] = usage
    return Response(content=json.dumps(out), media_type="application/json")


async def _ollama_chat_sse(url: str, headers: dict, ob: dict):
    """Stream Ollama NDJSON and re-emit OpenAI-style SSE frames so the renderer
    keeps one parser. Each Ollama line -> a `data: {choices:[{delta:{content}}]}`
    frame; the final done frame carries usage; closed with `data: [DONE]`."""
    async with _client() as client:
        async with client.stream("POST", url, json=ob, headers=headers) as r:
            if r.status_code >= 400:
                err = (await r.aread()).decode("utf-8", "replace")
                frame = {"error": {"message": f"ollama {r.status_code}: {err}"}}
                yield f"data: {json.dumps(frame)}\n\n".encode()
                yield b"data: [DONE]\n\n"
                return
            async for line in r.aiter_lines():
                line = line.strip()
                if not line:
                    continue
                try:
                    j = json.loads(line)
                except json.JSONDecodeError:
                    continue
                delta = (j.get("message") or {}).get("content", "")
                if delta:
                    frame = {"choices": [{"index": 0, "delta": {"content": delta}}]}
                    yield f"data: {json.dumps(frame)}\n\n".encode()
                if j.get("done"):
                    usage = _ollama_usage(j)
                    if usage:
                        done = {"choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}], "usage": usage}
                        yield f"data: {json.dumps(done)}\n\n".encode()
                    yield b"data: [DONE]\n\n"
                    return


async def _ollama_embed(cfg: dict, body: dict) -> Response:
    model = body.get("model", "")
    inp = body.get("input")
    arr = inp if isinstance(inp, list) else [inp]
    root = _base_root(cfg)
    headers = _headers(cfg)
    async with _client() as client:
        # Current batch API.
        try:
            r = await client.post(f"{root}/api/embed", json={"model": model, "input": arr}, headers=headers)
            if r.status_code < 400:
                embs = r.json().get("embeddings")
                if embs:
                    data = [{"object": "embedding", "index": i, "embedding": e} for i, e in enumerate(embs)]
                    return Response(content=json.dumps({"data": data}), media_type="application/json")
        except httpx.HTTPError as exc:
            raise HTTPException(status_code=502, detail=f"provider unreachable: {exc}") from exc
        # Legacy single-shot fallback.
        data = []
        for i, text in enumerate(arr):
            rr = await client.post(f"{root}/api/embeddings", json={"model": model, "prompt": text}, headers=headers)
            if rr.status_code >= 400:
                return Response(content=rr.content, status_code=rr.status_code,
                                media_type=rr.headers.get("content-type", "application/json"))
            data.append({"object": "embedding", "index": i, "embedding": rr.json().get("embedding")})
    return Response(content=json.dumps({"data": data}), media_type="application/json")


# ── enriched model discovery (ported from the renderer) ─────────────────────

_STRIP_NON_CHAT = ("embed", "embedding", "whisper", "tts")


def _keep_id(mid: str, kind: str) -> bool:
    if kind == "all":
        return True
    low = mid.lower()
    return not any(tok in low for tok in _STRIP_NON_CHAT)


async def _enriched_models(cfg: dict, kind: str) -> list[dict]:
    """Return [{id, variant, quant, state, type, publisher, arch}] for a provider.
    Tries LM Studio's native /api/v1/models (per-quant variants + load state),
    then the OpenAI /v1/models id list, then Ollama /api/tags. Mirrors the
    renderer's old enrichedModels probe order."""
    v1 = _base_v1(cfg)
    root = _base_root(cfg)
    headers = _headers(cfg, body=False)
    async with _client() as client:
        # Path 1 — LM Studio /api/v1/models (quant variants + selected state).
        try:
            r = await client.get(f"{root}/api/v1/models", headers=headers, timeout=15.0)
            if r.status_code == 200:
                j = r.json()
                arr = j.get("models") or j.get("data") or []
                out: list[dict] = []
                for m in arr:
                    mtype = m.get("type")
                    if kind != "all" and mtype and mtype not in ("llm", "vlm"):
                        continue
                    mid = m.get("key") or m.get("id")
                    if not mid:
                        continue
                    quantization = m.get("quantization")
                    qname = quantization.get("name") if isinstance(quantization, dict) else quantization
                    variants = m.get("variants") if isinstance(m.get("variants"), list) and m.get("variants") else [qname]
                    selected = m.get("selected_variant")
                    for v in variants:
                        quant = v if isinstance(v, str) else (v.get("name") if isinstance(v, dict) else None)
                        out.append({
                            "id": mid, "variant": quant, "quant": quant,
                            "state": "loaded" if quant and selected and quant == selected else "not-loaded",
                            "type": mtype, "publisher": m.get("publisher"),
                            "arch": m.get("architecture") or m.get("arch"),
                        })
                if out:
                    return out
        except httpx.HTTPError:
            pass

        # Path 2 — OpenAI-spec /v1/models (id list; quant unknown).
        try:
            r = await client.get(f"{v1}/models", headers=headers, timeout=15.0)
            if r.status_code == 200:
                j = r.json()
                rows = j.get("data") or j.get("models") or []
                ids: list[str] = []
                for x in rows:
                    mid = (x.get("id") or x.get("name")) if isinstance(x, dict) else x
                    if mid and _keep_id(str(mid), kind):
                        ids.append(str(mid))
                if ids:
                    return [{"id": i, "variant": None, "quant": None, "state": None,
                             "type": None, "publisher": None, "arch": None} for i in ids]
        except httpx.HTTPError:
            pass

        # Path 3 — Ollama /api/tags (some Ollama builds return empty /v1/models).
        try:
            r = await client.get(f"{root}/api/tags", headers=headers, timeout=15.0)
            if r.status_code == 200:
                arr = r.json().get("models") or []
                out = []
                for m in arr:
                    mid = m.get("model") or m.get("name")
                    if not mid or not _keep_id(mid, kind):
                        continue
                    quant = (m.get("details") or {}).get("quantization_level")
                    out.append({"id": mid, "variant": quant, "quant": quant, "state": None,
                                "type": None, "publisher": None,
                                "arch": (m.get("details") or {}).get("family")})
                if out:
                    return out
        except httpx.HTTPError:
            pass
    return []


# ── routes ──────────────────────────────────────────────────────────────────
# NOTE: the literal /probe/* routes are declared BEFORE the /{provider_id}/*
# routes — otherwise "/v1/llm/probe/models" matches GET /{provider_id}/models
# (provider_id="probe") and a POST to it 405s before reaching the literal route.


@router.post("/probe/models", summary="Enriched model list for an ad-hoc (unsaved) provider config")
async def probe_models(body: dict) -> Response:
    """Settings → provider editor 'Fetch models' tests an UNSAVED draft, so it
    can't resolve by id. The client posts {baseUrl, apiKey?, runner?, kind?} and
    the server probes the upstream — keeping keys server-bound and the client off
    direct provider calls."""
    cfg = {"baseUrl": body.get("baseUrl"), "apiKey": body.get("apiKey"), "runner": body.get("runner")}
    if not cfg["baseUrl"]:
        raise HTTPException(status_code=400, detail="baseUrl is required")
    out = await _enriched_models(cfg, body.get("kind") or "chat")
    return Response(content=json.dumps({"models": out}), media_type="application/json")


@router.post("/{provider_id}/chat/completions", summary="Chat completion (streams when stream=true)")
async def chat_completions(provider_id: str, body: dict, db: Session = Depends(get_db)):
    cfg = _provider_cfg(db, provider_id)
    if _is_ollama(cfg):
        return await _ollama_chat(cfg, body)
    url = f"{_base_v1(cfg)}/chat/completions"
    headers = _headers(cfg)
    if body.get("stream"):
        return await _proxy_stream(url, headers, body)
    return await _proxy_json(url, headers, body)


@router.post("/{provider_id}/embeddings", summary="Embeddings")
async def embeddings(provider_id: str, body: dict, db: Session = Depends(get_db)) -> Response:
    cfg = _provider_cfg(db, provider_id)
    if _is_ollama(cfg):
        return await _ollama_embed(cfg, body)
    url = f"{_base_v1(cfg)}/embeddings"
    return await _proxy_json(url, _headers(cfg), body)


@router.get("/{provider_id}/models", summary="Enriched model list (fetch-models for a saved provider)")
async def models(provider_id: str, kind: str = "chat", db: Session = Depends(get_db)) -> Response:
    cfg = _provider_cfg(db, provider_id)
    out = await _enriched_models(cfg, kind)
    return Response(content=json.dumps({"models": out}), media_type="application/json")


@router.get("/{provider_id}/ping", summary="Provider reachability check (server-side)")
async def ping(provider_id: str, db: Session = Depends(get_db)) -> Response:
    """One quick upstream GET (Ollama /api/tags, else /v1/models) so the client's
    'Test' button reflects PROVIDER health, not just gateway health. Always 200;
    the body's `ok` carries the verdict."""
    cfg = _provider_cfg(db, provider_id)
    url = f"{_base_root(cfg)}/api/tags" if _is_ollama(cfg) else f"{_base_v1(cfg)}/models"
    async with _client() as client:
        try:
            r = await client.get(url, headers=_headers(cfg, body=False), timeout=8.0)
        except httpx.HTTPError:
            return Response(content=json.dumps({"ok": False}), media_type="application/json")
    return Response(content=json.dumps({"ok": r.status_code < 400}), media_type="application/json")
