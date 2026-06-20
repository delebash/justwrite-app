"""/v1/workspace — the reset-workspace wipe across every table.

Reset wipes every table, then re-seeds the demo project + default providers so
the renderer reloads into a first-run-shaped workspace (the server owns the seed
now — see test_seed.py). These tests assert the USER's data is gone; the seeded
demo coming back is covered by test_seed.test_reset_reseeds_workspace.
"""

from fastapi.testclient import TestClient

from justwrite_server.app import create_app
from justwrite_server.demo_seed import DEMO_PROJECT_ID


def _c(tmp_path):
    return TestClient(create_app(tmp_path))


def test_reset_clears_user_data(tmp_path):
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

    # The user's own rows are gone (the demo is re-seeded in its place).
    assert [p["id"] for p in c.get("/v1/projects").json()] == [DEMO_PROJECT_ID]
    assert "ui" not in c.get("/v1/settings").json()
    assert c.get("/v1/sessions").json() == {"days": {}, "chapterWords": {}, "lastWrite": None}
    assert c.get("/v1/llm-usage").json()["totals"]["calls"] == 0
    assert c.get("/v1/chat", params={"projectId": "prj1", "mode": "book"}).json() == {"messages": []}
    assert c.get("/v1/versions", params={"projectId": "prj1"}).json() == {}


def test_reset_is_idempotent_on_empty(tmp_path):
    c = _c(tmp_path)
    assert c.delete("/v1/workspace").status_code == 204
    assert c.delete("/v1/workspace").status_code == 204
    # Re-seed stays a single demo across repeated resets.
    assert [p["id"] for p in c.get("/v1/projects").json()] == [DEMO_PROJECT_ID]
