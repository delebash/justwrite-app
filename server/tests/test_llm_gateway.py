"""/v1/llm/{providerId}/... — server-side LLM gateway (the call path pivot).

Uses httpx.MockTransport as the upstream provider so the full proxy (routing +
server-held-key injection + streaming passthrough) is exercised without a real
LLM endpoint.
"""

import json

import httpx
from fastapi.testclient import TestClient

from justwrite_server.api import llm
from justwrite_server.app import create_app


def _mock_client(handler):
    def factory():
        return httpx.AsyncClient(transport=httpx.MockTransport(handler))
    return factory


def _seed(c, pid, base, key=None):
    p = {"id": pid, "name": pid, "kind": "llm", "baseUrl": base}
    if key:
        p["apiKey"] = key
    assert c.put("/v1/llm-providers", json={"providers": [p]}).status_code == 204


def test_chat_proxies_and_injects_server_key(tmp_path, monkeypatch):
    c = TestClient(create_app(tmp_path))
    _seed(c, "openai", "https://api.openai.com/v1", key="sk-secret")
    seen = {}

    def handler(request):
        seen["url"] = str(request.url)
        seen["auth"] = request.headers.get("authorization")
        seen["body"] = json.loads(request.content)
        return httpx.Response(200, json={"choices": [{"message": {"content": "hi"}}]})

    monkeypatch.setattr(llm, "_client", _mock_client(handler))
    r = c.post("/v1/llm/openai/chat/completions",
               json={"model": "gpt-4o-mini", "messages": [{"role": "user", "content": "yo"}]})
    assert r.status_code == 200
    assert r.json()["choices"][0]["message"]["content"] == "hi"
    assert seen["url"] == "https://api.openai.com/v1/chat/completions"
    assert seen["auth"] == "Bearer sk-secret"  # key lives on the server, injected here
    assert seen["body"]["model"] == "gpt-4o-mini"


def test_local_provider_gets_no_auth(tmp_path, monkeypatch):
    c = TestClient(create_app(tmp_path))
    _seed(c, "local-llamacpp", "http://127.0.0.1:8080/v1")  # local runner, no key
    seen = {}

    def handler(request):
        seen["auth"] = request.headers.get("authorization")
        return httpx.Response(200, json={"ok": True})

    monkeypatch.setattr(llm, "_client", _mock_client(handler))
    c.post("/v1/llm/local-llamacpp/chat/completions", json={"messages": []})
    assert seen["auth"] is None


def test_embeddings_proxy(tmp_path, monkeypatch):
    c = TestClient(create_app(tmp_path))
    _seed(c, "openai", "https://api.openai.com/v1", key="sk-x")

    def handler(request):
        assert str(request.url).endswith("/embeddings")
        return httpx.Response(200, json={"data": [{"embedding": [0.1, 0.2]}]})

    monkeypatch.setattr(llm, "_client", _mock_client(handler))
    r = c.post("/v1/llm/openai/embeddings", json={"model": "text-embedding-3-small", "input": "x"})
    assert r.json()["data"][0]["embedding"] == [0.1, 0.2]


def test_stream_passthrough(tmp_path, monkeypatch):
    # MockTransport buffers content= responses, so stream through a REAL
    # streaming upstream (an ASGI app behind httpx.ASGITransport).
    from starlette.applications import Starlette
    from starlette.responses import StreamingResponse
    from starlette.routing import Route

    c = TestClient(create_app(tmp_path))
    _seed(c, "openai", "http://up", key="sk-x")  # no /v1 -> upstream path is /chat/completions

    async def up_chat(_request):
        async def gen():
            yield b'data: {"choices":[{"delta":{"content":"he"}}]}\n\n'
            yield b'data: {"choices":[{"delta":{"content":"llo"}}]}\n\n'
            yield b"data: [DONE]\n\n"
        return StreamingResponse(gen(), media_type="text/event-stream")

    upstream = Starlette(routes=[Route("/chat/completions", up_chat, methods=["POST"])])
    monkeypatch.setattr(llm, "_client",
                        lambda: httpx.AsyncClient(transport=httpx.ASGITransport(app=upstream)))
    r = c.post("/v1/llm/openai/chat/completions", json={"stream": True, "messages": []})
    assert r.status_code == 200
    assert b"[DONE]" in r.content
    assert b'"delta"' in r.content


def test_unknown_provider_404(tmp_path):
    c = TestClient(create_app(tmp_path))
    assert c.post("/v1/llm/nope/chat/completions", json={}).status_code == 404
