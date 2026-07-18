"""/v1/projects/*/sweep-draft — the entity sweep's per-project working draft (A).

Pins: absent → {"draft": null} (first run is not an error), PUT/GET roundtrip,
replace-in-place, DELETE idempotent, 404 on a PUT for a project that doesn't
exist, and the FK cascade (deleting the project takes its draft with it).
"""

from fastapi.testclient import TestClient

from justwrite_server.app import create_app


def _c(tmp_path):
    return TestClient(create_app(tmp_path))


def _seed_project(c, pid="prj1"):
    r = c.put(f"/v1/projects/{pid}", json={"project": {"title": "Book"}})
    assert r.status_code in (200, 204)


DRAFT = {
    "version": 1,
    "chapters": {
        "ch1": {
            "chapter": {"id": "ch1", "num": 1, "title": "Chapter 1"},
            "status": "done",
            "textHash": "h1",
            "counts": {"characters": 2, "locations": 1, "objects": 0},
            "proposals": {"characters": [{"name": "Slate"}], "locations": [], "objects": []},
        },
        "ch2": {
            "chapter": {"id": "ch2", "num": 2, "title": "Chapter 2"},
            "status": "error",
            "textHash": "h2",
            "reason": "model exploded",
        },
    },
}


def test_absent_draft_is_null_not_404(tmp_path):
    c = _c(tmp_path)
    _seed_project(c)
    r = c.get("/v1/projects/prj1/sweep-draft")
    assert r.status_code == 200
    assert r.json() == {"draft": None, "updatedAt": ""}


def test_put_get_roundtrip_and_replace(tmp_path):
    c = _c(tmp_path)
    _seed_project(c)
    r = c.put("/v1/projects/prj1/sweep-draft", json=DRAFT)
    assert r.status_code == 200 and r.json()["ok"] is True
    got = c.get("/v1/projects/prj1/sweep-draft").json()
    assert got["draft"] == DRAFT
    assert got["updatedAt"]

    # Replace in place — the second PUT wins wholesale.
    smaller = {"version": 1, "chapters": {}}
    c.put("/v1/projects/prj1/sweep-draft", json=smaller)
    assert c.get("/v1/projects/prj1/sweep-draft").json()["draft"] == smaller


def test_put_for_missing_project_is_404(tmp_path):
    c = _c(tmp_path)
    r = c.put("/v1/projects/nope/sweep-draft", json=DRAFT)
    assert r.status_code == 404


def test_delete_is_idempotent(tmp_path):
    c = _c(tmp_path)
    _seed_project(c)
    c.put("/v1/projects/prj1/sweep-draft", json=DRAFT)
    assert c.delete("/v1/projects/prj1/sweep-draft").status_code == 204
    assert c.get("/v1/projects/prj1/sweep-draft").json()["draft"] is None
    # Deleting again is still 204 — no row, no error.
    assert c.delete("/v1/projects/prj1/sweep-draft").status_code == 204


def test_project_delete_cascades_the_draft(tmp_path):
    c = _c(tmp_path)
    _seed_project(c)
    c.put("/v1/projects/prj1/sweep-draft", json=DRAFT)
    assert c.delete("/v1/projects/prj1").status_code == 204
    # The draft row went with the project (FK ON DELETE CASCADE).
    _seed_project(c)  # re-create the project id fresh
    assert c.get("/v1/projects/prj1/sweep-draft").json()["draft"] is None
