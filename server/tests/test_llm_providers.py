"""/v1/llm-providers — JustWrite mounts the SHARED provider-CRUD router
(llm_runner.llm.provider_api) over its LlmProvider-table ProviderStore, the
same router JustVoice mounts. This proves JW's store + mount end-to-end through
its app (the per-provider CRUD that replaced the old bulk GET/PUT). The router's
own unit tests live in just-llm-runner/tests/test_provider_api.py.
"""

from fastapi.testclient import TestClient

from justwrite_server import database
from justwrite_server.app import create_app
from llm_runner.llm import get_llm_registry
from llm_runner.llm.db import LlmProvider


def _c(tmp_path):
    # The registry is a process singleton; reset it so a leaked registration
    # from another test can't make `registered` flaky.
    get_llm_registry()._adapters = {}
    return TestClient(create_app(tmp_path))


def test_list_starts_empty(tmp_path):
    body = _c(tmp_path).get("/v1/llm-providers").json()
    assert body["providers"] == []
    assert "openai" in body["providerTypes"] and "ollama" in body["providerTypes"]


def test_crud_lifecycle(tmp_path):
    c = _c(tmp_path)

    # create — persisted + registered live; the key is never echoed.
    r = c.post("/v1/llm-providers", json={
        "id": "openai", "name": "OpenAI", "providerType": "openai",
        "apiKey": "sk-x", "defaultModel": "gpt-4o-mini",
    })
    assert r.status_code == 201
    body = r.json()
    assert body["hasApiKey"] is True and "apiKey" not in body
    assert body["registered"] is True and body["providerType"] == "openai"
    assert "openai" in get_llm_registry().ids()

    # list round-trips the camel shape, incl. the stored Local/Online flag.
    lst = c.get("/v1/llm-providers").json()
    assert [p["id"] for p in lst["providers"]] == ["openai"]
    assert lst["providers"][0]["defaultModel"] == "gpt-4o-mini"
    assert lst["providers"][0]["local"] is True

    # duplicate id + unknown providerType rejected.
    assert c.post("/v1/llm-providers", json={
        "id": "openai", "name": "x", "providerType": "openai"}).status_code == 400
    assert c.post("/v1/llm-providers", json={
        "id": "z", "name": "x", "providerType": "nope"}).status_code == 400

    # patch — empty apiKey preserves the stored key (write-only field).
    r = c.patch("/v1/llm-providers/openai", json={
        "id": "openai", "name": "OpenAI 2", "providerType": "openai",
        "apiKey": "", "defaultModel": "gpt-4o",
    })
    assert r.status_code == 200 and r.json()["name"] == "OpenAI 2"
    assert r.json()["hasApiKey"] is True and r.json()["defaultModel"] == "gpt-4o"

    # patch missing -> 404.
    assert c.patch("/v1/llm-providers/nope", json={
        "id": "nope", "name": "x", "providerType": "openai"}).status_code == 404

    # delete -> removed + deregistered; second delete -> 404.
    assert c.delete("/v1/llm-providers/openai").json() == {"deleted": True}
    assert c.get("/v1/llm-providers").json()["providers"] == []
    assert "openai" not in get_llm_registry().ids()
    assert c.delete("/v1/llm-providers/openai").status_code == 404


def test_provider_columns_persist(tmp_path):
    """Provider config lands in REAL columns (no JSON blob): base URL, provider
    type, the write-only key, and the Local/Online flag. The id is derived from
    the name when the client doesn't send one (#6)."""
    c = _c(tmp_path)
    c.post("/v1/llm-providers", json={
        "name": "My Ollama", "providerType": "ollama",
        "baseUrl": "http://example.test:11434/v1", "apiKey": "sk-1", "local": True,
    })
    db = database.SessionLocal()
    try:
        row = db.query(LlmProvider).filter(LlmProvider.id == "my-ollama").one()
        assert row.base_url == "http://example.test:11434/v1"
        assert row.provider_type == "ollama"
        assert row.api_key == "sk-1"
        assert row.local is True
        assert not hasattr(row, "data")  # the JSON blob column is gone
    finally:
        db.close()
