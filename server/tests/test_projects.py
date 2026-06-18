"""/v1/projects — the book domain API (normalized tables, not a blob).

PUT /{id} and PUT /{id}/book both decompose into the per-entity tables; the
GETs assemble them back. The legacy `Project.data` blob is no longer read or
written by these endpoints.
"""

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

    # PUT /{id} is an alias of PUT /book: it decomposes into the normalized
    # tables. GET /{id} assembles them back. assemble emits the canonical shape
    # (extra default keys), so assert the meaningful data survived rather than
    # byte-equality with the minimal input.
    assert c.put("/v1/projects/prj1", json=SNAP).status_code == 204
    got = c.get("/v1/projects/prj1").json()
    assert got["project"]["title"] == "The Cartographer's Daughter"
    assert got["project"]["author"] == "Mira Halden"
    assert [p["title"] for p in got["parts"]] == ["Part One"]
    assert [ch["title"] for ch in got["parts"][0]["chapters"]] == ["Arrival", "The Map"]
    assert got["scenes"]["ch1"][0]["body"] == "<p>hi</p>"
    assert [ch["name"] for ch in got["characters"]] == ["Mira"]
    # /book returns the same assembled snapshot as the /{id} alias.
    assert c.get("/v1/projects/prj1/book").json() == got

    lst = c.get("/v1/projects").json()
    assert len(lst) == 1
    assert lst[0]["id"] == "prj1"
    assert lst[0]["title"] == "The Cartographer's Daughter"
    assert lst[0]["author"] == "Mira Halden"
    assert lst[0]["updatedAt"] is not None  # camelCase key present


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

    chars = c.get("/v1/projects/prj1/characters").json()
    assert len(chars) == 1
    assert chars[0]["id"] == "c1"
    assert chars[0]["name"] == "Mira"


def test_get_missing_404(tmp_path):
    assert _c(tmp_path).get("/v1/projects/nope").status_code == 404
    assert _c(tmp_path).get("/v1/projects/nope/chapters").status_code == 404


def test_persist_across_instances_and_delete(tmp_path):
    _c(tmp_path).put("/v1/projects/prj1", json=SNAP)
    c2 = _c(tmp_path)
    # A second server instance reads the same SQLite file → the normalized
    # rows, not the (retired) blob column.
    assert c2.get("/v1/projects/prj1").json()["project"]["author"] == "Mira Halden"
    assert c2.delete("/v1/projects/prj1").status_code == 204
    assert c2.get("/v1/projects").json() == []
