"""P2.2 — one-time legacy blob -> normalized tables migration."""

import json

from fastapi.testclient import TestClient

from justwrite_server.app import create_app


def _book() -> dict:
    return {
        "project": {"title": "Legacy", "author": "Old", "subtitle": "", "genre": "",
                    "wordsGoal": 0, "dailyTarget": 0, "wordsWritten": 5, "startedOn": "",
                    "deadline": "", "premise": "p", "coverImage": None},
        "parts": [{"id": "p1", "title": "One", "chapters": [
            {"id": "ch1", "num": 1, "title": "First", "words": 5, "status": "draft", "strands": ["s1"]}]}],
        "scenes": {"ch1": [{"id": "scn1", "title": "S", "body": "<p>hi</p>",
                            "characters": ["c1"], "locations": [], "objects": [], "strands": ["s1"]}]},
        "characters": [{"id": "c1", "main": True, "age": None, "gender": "", "pronouns": "",
                        "aliases": [], "lifeStatus": "", "oneLiner": "", "role": "", "name": "Hero", "tags": []}],
        "characterExtras": {},
        "locations": [], "objects": [], "groups": [],
        "strands": [{"id": "s1", "name": "Main", "color": "red", "blurb": "", "body": "", "status": "open", "beats": []}],
        "notes": [], "architecture": {},
        "worldbuilding": [], "worldbuildingCategories": [],
        "tagVocabularies": {"characters": [], "locations": [], "objects": [], "worldbuilding": []},
        "images": {}, "events": {}, "statuses": [],
        "trash": {"chapters": [], "scenes": [], "characters": [], "locations": [], "objects": [],
                  "groups": [], "notes": [], "strands": [], "worldbuilding": [], "events": [],
                  "statuses": [], "tagVocab": []},
        "dailyRecaps": {}, "reverseOutline": None, "beatSheets": {}, "plotHoles": None,
        "voiceCanonChapterIds": [], "relationshipArcs": {}, "marketingPack": None,
        "worldRules": "", "savedAt": "2026-06-18T00:00:00Z",
    }


def test_legacy_blob_migrates_to_tables(tmp_path):
    c = TestClient(create_app(tmp_path))
    book = _book()

    # Simulate a pre-normalization DB: a Project row carrying the whole book in
    # the legacy `data` blob, with no child rows. No endpoint writes blobs
    # anymore (PUT decomposes), so seed it directly through the ORM.
    from justwrite_server.database import SessionLocal
    from justwrite_server.migrations import migrate_blobs
    from justwrite_server.models import Project

    db = SessionLocal()
    try:
        db.add(Project(id="old1", title="Legacy", author="Old", data=json.dumps(book)))
        db.commit()
    finally:
        db.close()

    # /book sees the project row but no normalized children yet.
    pre = c.get("/v1/projects/old1/book").json()
    assert pre["parts"] == []
    assert pre["characters"] == []

    db = SessionLocal()
    try:
        assert migrate_blobs(db) == 1
        assert migrate_blobs(db) == 0  # idempotent — already normalized
    finally:
        db.close()

    # Now /book is served from the normalized tables, losslessly.
    assert c.get("/v1/projects/old1/book").json() == book
