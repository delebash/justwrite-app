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


def test_ai_artifact_maps_roundtrip_and_legacy_lift(tmp_path):
    """#235: the four per-entity AI artifacts travel as top-level keyed maps
    (chapterCritiques / chapterReaderKnowledge / chapterMultiReader /
    characterAudits) and never come back embedded on the entity objects.
    A legacy snapshot that still embeds them ingests into the same columns."""
    c = _c(tmp_path)

    # New wire shape: maps in, maps out, entities clean.
    snap = {
        "project": {"title": "Artifacts"},
        "parts": [{"id": "p1", "title": "P", "chapters": [
            {"id": "ch1", "num": 1, "title": "A", "words": 0, "status": "draft", "strands": []},
        ]}],
        "scenes": {"ch1": []},
        "characters": [{"id": "c1", "name": "Mira"}],
        "chapterCritiques": {"ch1": {"notes": [{"message": "tighten"}]}},
        "chapterReaderKnowledge": {"ch1": {"status": "ok"}},
        "chapterMultiReader": {"ch1": {"panel": [1, 2]}},
        "characterAudits": {"c1": {"noteCount": 2}},
    }
    assert c.put("/v1/projects/prj_art", json=snap).status_code == 204
    got = c.get("/v1/projects/prj_art").json()
    assert got["chapterCritiques"] == {"ch1": {"notes": [{"message": "tighten"}]}}
    assert got["chapterReaderKnowledge"] == {"ch1": {"status": "ok"}}
    assert got["chapterMultiReader"] == {"ch1": {"panel": [1, 2]}}
    assert got["characterAudits"] == {"c1": {"noteCount": 2}}
    assert "critique" not in got["parts"][0]["chapters"][0]
    assert "audit" not in got["characters"][0]

    # Legacy shape: embedded on the entities (an old export/backup) — the
    # decompose fallback lifts them into the same columns, so the GET emits
    # the map shape.
    legacy = {
        "project": {"title": "Legacy"},
        "parts": [{"id": "p1", "title": "P", "chapters": [
            {"id": "chL", "num": 1, "title": "Old", "words": 0, "status": "draft", "strands": [],
             "critique": {"notes": [{"message": "legacy"}]}},
        ]}],
        "scenes": {"chL": []},
        "characters": [{"id": "cL", "name": "N", "audit": {"noteCount": 1}}],
    }
    assert c.put("/v1/projects/prj_leg", json=legacy).status_code == 204
    got = c.get("/v1/projects/prj_leg").json()
    assert got["chapterCritiques"] == {"chL": {"notes": [{"message": "legacy"}]}}
    assert got["characterAudits"] == {"cL": {"noteCount": 1}}
    assert "critique" not in got["parts"][0]["chapters"][0]


def test_trashed_entity_artifact_rides_the_tombstone(tmp_path):
    """#235 checker catch: a TRASHED chapter's artifact travels inside its
    opaque trash payload (the durable carrier) — the live maps only cover
    live ids, so a map entry for a non-live id is dropped, not resurrected."""
    c = _c(tmp_path)
    snap = {
        "project": {"title": "Trashed"},
        "parts": [{"id": "p1", "title": "P", "chapters": []}],
        "scenes": {},
        "characters": [],
        "trash": {
            "chapters": [{"id": "chT", "num": 1, "title": "Gone", "words": 0, "status": "draft",
                          "strands": [], "scenes": [], "partId": "p1", "deletedAt": 1,
                          "critique": {"notes": [{"message": "carried"}]}}],
            "scenes": [], "characters": [], "locations": [], "objects": [], "groups": [],
            "notes": [], "strands": [], "worldbuilding": [], "events": [], "statuses": [], "tagVocab": [],
        },
        # A stale live-map entry for the trashed id — must NOT survive
        # (the tombstone copy is the one source for non-live entities).
        "chapterCritiques": {"chT": {"notes": [{"message": "stale-live-copy"}]}},
    }
    assert c.put("/v1/projects/prj_tomb", json=snap).status_code == 204
    got = c.get("/v1/projects/prj_tomb").json()
    assert got["trash"]["chapters"][0]["critique"] == {"notes": [{"message": "carried"}]}
    assert got["chapterCritiques"] == {}
