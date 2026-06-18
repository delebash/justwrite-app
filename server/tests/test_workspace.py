"""/v1/workspace — the reset-workspace wipe across every table."""

from fastapi.testclient import TestClient

from justwrite_server.app import create_app


def _c(tmp_path):
    return TestClient(create_app(tmp_path))


def test_reset_clears_every_table(tmp_path):
    c = _c(tmp_path)
    # Populate a spread of tables: a project (+ cascaded book rows), settings,
    # a session, a usage row, a chat thread, a chapter version.
    c.put("/v1/projects/prj1", json={"project": {"title": "Book"}})
    c.patch("/v1/settings", json={"ui": {"x": 1}})
    c.post("/v1/sessions/record", json={"chapterId": "ch1", "words": 100, "day": "2026-06-18"})
    c.post("/v1/llm-usage", json={"feature": "rewrite", "promptTokens": 10, "completionTokens": 5, "cost": 0.01, "at": 1})
    c.put("/v1/chat", json={"projectId": "prj1", "mode": "book", "messages": [{"role": "user", "content": "hi"}]})
    c.put("/v1/versions", json={"projectId": "prj1", "chapterId": "ch1",
                                "versions": [{"id": "v1", "savedAt": "x", "scenes": []}]})

    assert c.delete("/v1/workspace").status_code == 204

    assert c.get("/v1/projects").json() == []
    assert c.get("/v1/settings").json() == {}
    assert c.get("/v1/sessions").json() == {"days": {}, "chapterWords": {}, "lastWrite": None}
    assert c.get("/v1/llm-usage").json()["totals"]["calls"] == 0
    assert c.get("/v1/chat", params={"projectId": "prj1", "mode": "book"}).json() == {"messages": []}
    assert c.get("/v1/versions", params={"projectId": "prj1"}).json() == {}


def test_reset_is_idempotent_on_empty(tmp_path):
    c = _c(tmp_path)
    assert c.delete("/v1/workspace").status_code == 204
    assert c.delete("/v1/workspace").status_code == 204
