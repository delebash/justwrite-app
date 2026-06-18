"""/v1/llm-providers — the configured provider list (P5)."""

from fastapi.testclient import TestClient

from justwrite_server.app import create_app


def _c(tmp_path):
    return TestClient(create_app(tmp_path))


def test_list_starts_empty(tmp_path):
    assert _c(tmp_path).get("/v1/llm-providers").json() == {"providers": []}


def test_replace_round_trips(tmp_path):
    c = _c(tmp_path)
    providers = [
        {"id": "openai", "name": "OpenAI", "kind": "both",
         "baseUrl": "https://api.openai.com/v1", "chatModel": "gpt-4o-mini", "builtIn": True},
        {"id": "local", "name": "Local", "kind": "llm",
         "baseUrl": "http://127.0.0.1:8080/v1", "chatModel": "", "builtIn": False, "apiKey": "sk-x"},
    ]
    assert c.put("/v1/llm-providers", json={"providers": providers}).status_code == 204
    got = c.get("/v1/llm-providers").json()["providers"]
    assert got == providers  # full config (incl. apiKey, baseUrl) round-trips, in order


def test_replace_is_not_merge(tmp_path):
    c = _c(tmp_path)
    c.put("/v1/llm-providers", json={"providers": [
        {"id": "a", "name": "A", "kind": "llm"}, {"id": "b", "name": "B", "kind": "llm"}]})
    c.put("/v1/llm-providers", json={"providers": [{"id": "a", "name": "A2", "kind": "llm"}]})
    got = c.get("/v1/llm-providers").json()["providers"]
    assert [p["id"] for p in got] == ["a"]
    assert got[0]["name"] == "A2"
