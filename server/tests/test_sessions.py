"""/v1/sessions — the writing-activity log (real tables, not a kv blob)."""

from fastapi.testclient import TestClient

from justwrite_server.app import create_app


def _c(tmp_path):
    return TestClient(create_app(tmp_path))


def test_empty(tmp_path):
    assert _c(tmp_path).get("/v1/sessions").json() == {"days": {}, "chapterWords": {}, "lastWrite": None}


def test_record_attributes_delta_and_pointer(tmp_path):
    c = _c(tmp_path)
    # First sighting of a chapter at 100 words -> +100 today.
    assert c.post("/v1/sessions/record", json={"chapterId": "ch1", "words": 100, "day": "2026-06-18"}).status_code == 204
    r = c.get("/v1/sessions").json()
    assert r["days"] == {"2026-06-18": 100}
    assert r["chapterWords"] == {"ch1": 100}
    assert r["lastWrite"] == {"chapterId": "ch1", "day": "2026-06-18"}

    # Grows to 150 -> +50 more on the same day.
    c.post("/v1/sessions/record", json={"chapterId": "ch1", "words": 150, "day": "2026-06-18"})
    assert c.get("/v1/sessions").json()["days"] == {"2026-06-18": 150}

    # A deletion (count drops) does NOT subtract; the checkpoint still moves.
    c.post("/v1/sessions/record", json={"chapterId": "ch1", "words": 120, "day": "2026-06-18"})
    r = c.get("/v1/sessions").json()
    assert r["days"] == {"2026-06-18": 150}
    assert r["chapterWords"] == {"ch1": 120}

    # New day, different chapter -> moves the pointer.
    c.post("/v1/sessions/record", json={"chapterId": "ch2", "words": 30, "day": "2026-06-19"})
    r = c.get("/v1/sessions").json()
    assert r["days"] == {"2026-06-18": 150, "2026-06-19": 30}
    assert r["lastWrite"] == {"chapterId": "ch2", "day": "2026-06-19"}


def test_persist_across_instances_and_clear(tmp_path):
    c = _c(tmp_path)
    c.post("/v1/sessions/record", json={"chapterId": "ch1", "words": 40, "day": "2026-06-18"})
    c2 = _c(tmp_path)  # new server instance, same SQLite file
    assert c2.get("/v1/sessions").json()["days"] == {"2026-06-18": 40}
    assert c2.delete("/v1/sessions").status_code == 204
    assert c2.get("/v1/sessions").json() == {"days": {}, "chapterWords": {}, "lastWrite": None}
