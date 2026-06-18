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


def _seed(c, pid, base, key=None, runner=None):
    p = {"id": pid, "name": pid, "kind": "llm", "baseUrl": base}
    if key:
        p["apiKey"] = key
    if runner:
        p["runner"] = runner
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


# ── Ollama-native routing (the gateway translates; the client stays OpenAI) ──


def test_ollama_chat_translates_and_wraps(tmp_path, monkeypatch):
    c = TestClient(create_app(tmp_path))
    _seed(c, "ollama", "http://127.0.0.1:11434")  # :11434 -> detected as Ollama
    seen = {}

    def handler(request):
        seen["url"] = str(request.url)
        seen["body"] = json.loads(request.content)
        return httpx.Response(200, json={
            "message": {"role": "assistant", "content": "hey"},
            "done": True, "prompt_eval_count": 5, "eval_count": 3,
        })

    monkeypatch.setattr(llm, "_client", _mock_client(handler))
    r = c.post("/v1/llm/ollama/chat/completions", json={
        "model": "qwen3:8b", "messages": [{"role": "user", "content": "hi"}],
        "temperature": 0.3, "think": False, "stream": False,
    })
    assert r.status_code == 200
    j = r.json()
    assert j["choices"][0]["message"]["content"] == "hey"          # wrapped to OpenAI shape
    assert j["usage"]["total_tokens"] == 8
    assert seen["url"].endswith("/api/chat")                        # native endpoint
    assert seen["body"]["think"] is False                          # lifted top-level
    assert seen["body"]["options"]["temperature"] == 0.3           # knobs in options
    assert seen["body"]["options"]["num_ctx"] == 8192              # long-context default
    assert "messages" not in seen["body"].get("options", {})


def test_ollama_embeddings_normalized(tmp_path, monkeypatch):
    c = TestClient(create_app(tmp_path))
    _seed(c, "ollama", "http://127.0.0.1:11434")

    def handler(request):
        assert str(request.url).endswith("/api/embed")
        body = json.loads(request.content)
        return httpx.Response(200, json={"embeddings": [[0.1, 0.2], [0.3, 0.4]][: len(body["input"])]})

    monkeypatch.setattr(llm, "_client", _mock_client(handler))
    r = c.post("/v1/llm/ollama/embeddings", json={"model": "nomic-embed-text", "input": ["a", "b"]})
    assert [d["embedding"] for d in r.json()["data"]] == [[0.1, 0.2], [0.3, 0.4]]


def test_ollama_stream_to_sse(tmp_path, monkeypatch):
    from starlette.applications import Starlette
    from starlette.responses import StreamingResponse as SR
    from starlette.routing import Route

    c = TestClient(create_app(tmp_path))
    _seed(c, "ollama", "http://up", runner="ollama")  # explicit runner pin

    async def up_chat(_request):
        async def gen():
            yield b'{"message":{"content":"he"},"done":false}\n'
            yield b'{"message":{"content":"llo"},"done":false}\n'
            yield b'{"message":{"content":""},"done":true,"prompt_eval_count":4,"eval_count":2}\n'
        return SR(gen(), media_type="application/x-ndjson")

    upstream = Starlette(routes=[Route("/api/chat", up_chat, methods=["POST"])])
    monkeypatch.setattr(llm, "_client",
                        lambda: httpx.AsyncClient(transport=httpx.ASGITransport(app=upstream)))
    r = c.post("/v1/llm/ollama/chat/completions", json={"stream": True, "messages": [], "model": "x"})
    assert r.status_code == 200
    body = r.content.decode()
    assert "data: [DONE]" in body
    assert '"content": "he"' in body          # NDJSON delta re-emitted as OpenAI SSE
    assert '"usage"' in body                  # final frame carries token counts


# ── enriched model discovery (ported from the renderer) ─────────────────────


def test_models_openai_v1_strips_embedding_for_chat(tmp_path, monkeypatch):
    c = TestClient(create_app(tmp_path))
    _seed(c, "openai", "https://api.openai.com/v1", key="sk-x")

    def handler(request):
        u = str(request.url)
        if u.endswith("/api/v1/models"):
            return httpx.Response(404)                              # not LM Studio
        if u.endswith("/v1/models"):
            return httpx.Response(200, json={"data": [{"id": "gpt-4o-mini"},
                                                      {"id": "text-embedding-3-small"}]})
        return httpx.Response(404)

    monkeypatch.setattr(llm, "_client", _mock_client(handler))
    ids = [m["id"] for m in c.get("/v1/llm/openai/models").json()["models"]]
    assert "gpt-4o-mini" in ids
    assert "text-embedding-3-small" not in ids                      # stripped for kind=chat
    ids_all = [m["id"] for m in c.get("/v1/llm/openai/models?kind=all").json()["models"]]
    assert "text-embedding-3-small" in ids_all


def test_models_lmstudio_variants(tmp_path, monkeypatch):
    c = TestClient(create_app(tmp_path))
    _seed(c, "lms", "http://127.0.0.1:1234/v1")

    def handler(request):
        if str(request.url).endswith("/api/v1/models"):
            return httpx.Response(200, json={"models": [{
                "key": "qwen/qwen3-8b", "type": "llm", "publisher": "qwen",
                "variants": ["Q4_K_M", "Q6_K"], "selected_variant": "Q4_K_M",
            }]})
        return httpx.Response(404)

    monkeypatch.setattr(llm, "_client", _mock_client(handler))
    ms = c.get("/v1/llm/lms/models").json()["models"]
    assert len(ms) == 2                                             # one row per quant variant
    loaded = [m for m in ms if m["state"] == "loaded"]
    assert loaded and loaded[0]["quant"] == "Q4_K_M"


def test_models_ollama_tags_fallback(tmp_path, monkeypatch):
    c = TestClient(create_app(tmp_path))
    _seed(c, "ollama", "http://127.0.0.1:11434")

    def handler(request):
        u = str(request.url)
        if u.endswith("/api/v1/models"):
            return httpx.Response(404)
        if u.endswith("/models") and "/api/" not in u:
            return httpx.Response(200, json={"data": []})           # empty /v1 (Ollama quirk)
        if u.endswith("/api/tags"):
            return httpx.Response(200, json={"models": [
                {"model": "qwen3:8b", "details": {"quantization_level": "Q4_K_M", "family": "qwen"}}]})
        return httpx.Response(404)

    monkeypatch.setattr(llm, "_client", _mock_client(handler))
    ms = c.get("/v1/llm/ollama/models").json()["models"]
    assert ms[0]["id"] == "qwen3:8b" and ms[0]["quant"] == "Q4_K_M"


def test_ping_reports_reachability(tmp_path, monkeypatch):
    c = TestClient(create_app(tmp_path))
    _seed(c, "openai", "https://api.openai.com/v1", key="sk-x")

    monkeypatch.setattr(llm, "_client", _mock_client(lambda req: httpx.Response(200, json={"data": []})))
    assert c.get("/v1/llm/openai/ping").json()["ok"] is True

    def refuse(_req):
        raise httpx.ConnectError("refused")

    monkeypatch.setattr(llm, "_client", _mock_client(refuse))
    assert c.get("/v1/llm/openai/ping").json()["ok"] is False


def test_probe_models_adhoc_config(tmp_path, monkeypatch):
    # The provider editor's "Fetch models" tests an UNSAVED draft — no row to
    # resolve by id, so the config rides in the POST body.
    c = TestClient(create_app(tmp_path))

    def handler(request):
        if str(request.url) == "https://api.openai.com/v1/models":
            assert request.headers.get("authorization") == "Bearer sk-draft"
            return httpx.Response(200, json={"data": [{"id": "gpt-4o-mini"}]})
        return httpx.Response(404)

    monkeypatch.setattr(llm, "_client", _mock_client(handler))
    r = c.post("/v1/llm/probe/models",
               json={"baseUrl": "https://api.openai.com/v1", "apiKey": "sk-draft", "kind": "all"})
    assert r.status_code == 200
    assert [m["id"] for m in r.json()["models"]] == ["gpt-4o-mini"]
    assert c.post("/v1/llm/probe/models", json={}).status_code == 400  # baseUrl required
