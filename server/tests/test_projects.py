"""/v1/projects — the book domain API (a real resource, not the generic kv)."""

from fastapi.testclient import TestClient

from justwrite_server.app import create_app

SNAP = {
    "project": {"title": "The Cartographer's Daughter", "author": "Mira Halden"},
    "parts": [
        {
            "id": "p1",
            "title": "Part One",
            "chapters": [
                {"id": "ch1", "num": 1, "title": "Arrival", "words": 1200, "status": "draft", "strands": []},
                {"id": "ch2", "num": 2, "title": "The Map", "words": 800, "status": "todo", "strands": []},
            ],
        }
    ],
    "scenes": {"ch1": [{"id": "s1", "title": "", "body": "<p>hi</p>"}], "ch2": []},
    "characters": [{"id": "c1", "name": "Mira"}],
}


def _c(tmp_path):
    return TestClient(create_app(tmp_path))


def test_put_get_roundtrip_and_list(tmp_path):
    c = _c(tmp_path)
    assert c.get("/v1/projects").json() == []

    assert c.put("/v1/projects/prj1", json=SNAP).status_code == 204
    # load book -> full structured JSON, byte-for-byte the snapshot we stored
    got = c.get("/v1/projects/prj1").json()
    assert got == SNAP

    lst = c.get("/v1/projects").json()
    assert len(lst) == 1
    assert lst[0]["id"] == "prj1"
    assert lst[0]["title"] == "The Cartographer's Daughter"
    assert lst[0]["author"] == "Mira Halden"
    assert lst[0]["updatedAt"]  # camelCase, populated


def test_chapters_and_characters_extracted(tmp_path):
    c = _c(tmp_path)
    c.put("/v1/projects/prj1", json=SNAP)

    chapters = c.get("/v1/projects/prj1/chapters").json()
    assert [ch["title"] for ch in chapters] == ["Arrival", "The Map"]
    assert chapters[0] == {
        "id": "ch1", "num": 1, "title": "Arrival", "words": 1200, "status": "draft",
        "partId": "p1", "partTitle": "Part One", "sceneCount": 1,
    }
    assert chapters[1]["sceneCount"] == 0

    assert c.get("/v1/projects/prj1/characters").json() == [{"id": "c1", "name": "Mira"}]


def test_get_missing_404(tmp_path):
    assert _c(tmp_path).get("/v1/projects/nope").status_code == 404
    assert _c(tmp_path).get("/v1/projects/nope/chapters").status_code == 404


def test_persist_across_instances_and_delete(tmp_path):
    _c(tmp_path).put("/v1/projects/prj1", json=SNAP)
    c2 = _c(tmp_path)
    assert c2.get("/v1/projects/prj1").json()["project"]["author"] == "Mira Halden"
    assert c2.delete("/v1/projects/prj1").status_code == 204
    assert c2.get("/v1/projects").json() == []
