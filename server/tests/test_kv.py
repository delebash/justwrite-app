"""/v1/kv — the key/value persistence that backs the renderer's storage seam."""

from fastapi.testclient import TestClient

from justwrite_server.app import create_app


def _client(tmp_path):
    return TestClient(create_app(tmp_path))


def test_put_get_update_delete_roundtrip(tmp_path):
    c = _client(tmp_path)
    assert c.get("/v1/kv").json() == {}

    assert c.put("/v1/kv/justwrite:project", json={"value": '{"a":1}'}).status_code == 204
    assert c.put("/v1/kv/justwrite:ui", json={"value": "x"}).status_code == 204
    assert c.get("/v1/kv").json() == {"justwrite:project": '{"a":1}', "justwrite:ui": "x"}

    # upsert overwrites
    c.put("/v1/kv/justwrite:ui", json={"value": "y"})
    assert c.get("/v1/kv").json()["justwrite:ui"] == "y"

    assert c.delete("/v1/kv/justwrite:ui").status_code == 204
    assert "justwrite:ui" not in c.get("/v1/kv").json()


def test_prefix_filter_and_clear(tmp_path):
    c = _client(tmp_path)
    c.put("/v1/kv/justwrite:a", json={"value": "1"})
    c.put("/v1/kv/other:b", json={"value": "2"})

    assert c.get("/v1/kv", params={"prefix": "justwrite:"}).json() == {"justwrite:a": "1"}

    assert c.delete("/v1/kv", params={"prefix": "justwrite:"}).status_code == 204
    assert c.get("/v1/kv").json() == {"other:b": "2"}


def test_persists_across_app_instances(tmp_path):
    _client(tmp_path).put("/v1/kv/justwrite:project", json={"value": "persisted"})
    # A fresh app on the SAME data dir reads the row back from SQLite.
    assert _client(tmp_path).get("/v1/kv").json() == {"justwrite:project": "persisted"}
