"""/v1/versions — per-chapter version history (real rows, not a kv blob)."""

from fastapi.testclient import TestClient

from justwrite_server.app import create_app


def _c(tmp_path):
    return TestClient(create_app(tmp_path))


def _make_project(c, pid="prj1"):
    # chapter_versions.project_id FKs projects(id), so a version needs a book.
    assert c.put(f"/v1/projects/{pid}", json={"project": {"title": "Book"}}).status_code == 204


def _v(vid, **kw):
    base = {"id": vid, "label": "", "savedAt": f"2026-06-18T0{vid[-1]}:00:00", "words": 10,
            "scenes": [{"id": "s1", "title": "", "body": "<p>hi</p>"}]}
    base.update(kw)
    return base


def test_empty(tmp_path):
    assert _c(tmp_path).get("/v1/versions", params={"projectId": "prj1"}).json() == {}


def test_put_get_roundtrip_grouped_and_ordered(tmp_path):
    c = _c(tmp_path)
    _make_project(c)
    # Newest-first list for ch1, plus a separate ch2 thread.
    c.put("/v1/versions", json={"projectId": "prj1", "chapterId": "ch1",
                                "versions": [_v("v3"), _v("v2"), _v("v1")]})
    c.put("/v1/versions", json={"projectId": "prj1", "chapterId": "ch2", "versions": [_v("v9", label="cut")]})

    doc = c.get("/v1/versions", params={"projectId": "prj1"}).json()
    assert [v["id"] for v in doc["ch1"]] == ["v3", "v2", "v1"]  # position order preserved
    assert doc["ch1"][0]["scenes"][0]["body"] == "<p>hi</p>"
    assert doc["ch2"][0]["label"] == "cut"


def test_replace_is_wholesale_per_chapter(tmp_path):
    c = _c(tmp_path)
    _make_project(c)
    c.put("/v1/versions", json={"projectId": "prj1", "chapterId": "ch1", "versions": [_v("v1"), _v("v2")]})
    # A shorter list replaces the chapter entirely (delete of v2 + keep v1).
    c.put("/v1/versions", json={"projectId": "prj1", "chapterId": "ch1", "versions": [_v("v1")]})
    doc = c.get("/v1/versions", params={"projectId": "prj1"}).json()
    assert [v["id"] for v in doc["ch1"]] == ["v1"]
    # Empty list clears the chapter.
    c.put("/v1/versions", json={"projectId": "prj1", "chapterId": "ch1", "versions": []})
    assert c.get("/v1/versions", params={"projectId": "prj1"}).json() == {}


def test_persist_across_instances_and_project_delete_cascade(tmp_path):
    c = _c(tmp_path)
    _make_project(c)
    c.put("/v1/versions", json={"projectId": "prj1", "chapterId": "ch1", "versions": [_v("v1")]})

    c2 = _c(tmp_path)  # new server instance, same SQLite file
    assert c2.get("/v1/versions", params={"projectId": "prj1"}).json()["ch1"][0]["id"] == "v1"

    assert c2.delete("/v1/projects/prj1").status_code == 204
    assert c2.get("/v1/versions", params={"projectId": "prj1"}).json() == {}
