"""Round-trip tests for the book assemble/decompose mapper (P2.1).

The contract: on a canonical snapshot, `GET /book` after `PUT /book` returns
exactly what went in (no data loss across the normalized tables). The fixture
exercises every entity, relationship, polymorphic attachment, AI artifact, and
trash bucket.
"""

from fastapi.testclient import TestClient

from justwrite_server.app import create_app


def _client(tmp_path):
    return TestClient(create_app(tmp_path))


def _canonical_book() -> dict:
    return {
        "project": {
            "title": "The Cartographer's Daughter", "author": "Mira Halden",
            "subtitle": "A novel", "genre": "Literary speculative fiction",
            "wordsGoal": 90000, "dailyTarget": 1200, "wordsWritten": 41280,
            "startedOn": "March 11, 2026", "deadline": "December 1, 2026",
            "premise": "A mapmaker's daughter inherits a ledger.", "coverImage": None,
        },
        "parts": [
            {"id": "p1", "title": "The Inheritance", "chapters": [
                {"id": "ch1", "num": 1, "title": "What the door remembers", "words": 120,
                 "status": "done", "strands": ["s1", "s2"],
                 "critique": {"generatedAt": "x", "notes": [{"severity": "low", "message": "tighten"}]}},
                {"id": "ch2", "num": 2, "title": "An inventory", "words": 0, "status": "todo", "strands": []},
            ]},
        ],
        "scenes": {
            "ch1": [
                {"id": "scn1", "title": "The key", "body": "<p>The key turned.</p>",
                 "characters": ["c1"], "locations": ["l1"], "objects": ["o1"], "strands": ["s1"]},
                {"id": "scn2", "title": "", "body": "<p>Cedar and ash.</p>",
                 "characters": ["c1", "c2"], "locations": [], "objects": [], "strands": ["s2"]},
            ],
            "ch2": [],
        },
        "characters": [
            {"id": "c1", "main": True, "age": 31, "gender": "", "pronouns": "she/her",
             "aliases": ["El"], "lifeStatus": "alive", "oneLiner": "Cartographer's daughter.",
             "role": "Protagonist", "name": "Elen Vael", "tags": ["lead"],
             "audit": {"verdict": "consistent", "concerns": []}},
            {"id": "c2", "main": False, "age": None, "gender": "m", "pronouns": "he/him",
             "aliases": [], "lifeStatus": "deceased", "oneLiner": "Left a ledger.",
             "role": "Father", "name": "Idris Vael", "tags": []},
        ],
        "characterExtras": {
            "c1": {"voice": {"accent": "north"}, "motivation": {"want": "freedom"}, "quotes": ["..."]},
        },
        "locations": [{"id": "l1", "name": "Halden House", "kind": "Home", "note": "Cliff road.", "tags": ["setting"]}],
        "objects": [{"id": "o1", "name": "The Ledger", "kind": "Manuscript", "note": "84 pages.", "tags": []}],
        "groups": [
            {"id": "g1", "name": "The Vael family", "blurb": "Three generations.", "color": "red", "members": [
                {"kind": "character", "id": "c1", "name": "Elen Vael"},
                {"kind": "character", "id": "c2", "name": "Idris Vael"},
                {"kind": "location", "id": "l1", "name": "Halden House"},
            ]},
        ],
        "notes": [
            {"id": "n1", "title": "Story-wide", "body": "x", "tag": "note", "updated": "May 22", "anchor": None},
            {"id": "n2", "title": "Chapter note", "body": "y", "tag": "plot", "updated": "May 21", "anchor": {"chapterId": "ch1"}},
            {"id": "n3", "title": "Scene note", "body": "z", "tag": "research", "updated": "May 20", "anchor": {"chapterId": "ch1", "sceneId": "scn1"}},
        ],
        "strands": [
            {"id": "s1", "name": "Inheritance", "color": "gold", "blurb": "b", "body": "", "status": "open",
             "beats": [{"id": "b1", "chapterId": "ch1", "sceneId": "scn1", "label": "Inciting", "note": "finds it"}]},
            {"id": "s2", "name": "The Ledger", "color": "blue", "blurb": "b2", "body": "", "status": "open", "beats": []},
        ],
        "architecture": {
            "premise": {"id": "premise", "title": "Premise", "blurb": "one line", "status": "done", "words": 18, "body": "..."},
            "setting": {"id": "setting", "title": "Setting", "blurb": "world", "status": "draft", "words": 90, "body": "..."},
        },
        "worldbuilding": [
            {"id": "wb1", "category": "geography", "title": "North Coast", "tags": ["setting"], "status": "done",
             "words": 540, "summary": "s", "body": "b", "related": ["wb2"]},
            {"id": "wb2", "category": "geography", "title": "Brackish Cove", "tags": ["disputed"], "status": "draft",
             "words": 230, "summary": "s2", "body": "b2", "related": ["wb1"]},
        ],
        "worldbuildingCategories": [
            {"id": "geography", "label": "Geography", "icon": "Pin", "hue": 130},
            {"id": "history", "label": "History", "icon": "Calendar", "hue": 30},
        ],
        "tagVocabularies": {
            "characters": [{"id": "tv1", "label": "lead"}],
            "locations": [], "objects": [], "worldbuilding": [{"id": "tv2", "label": "setting"}],
        },
        "images": {
            "c1": [{"id": "img1", "addedAt": 1700000000000, "kind": "file",
                    "path": "/x/a.png", "name": "a.png", "mime": "image/png"}],
        },
        "events": {
            "setting": [{"id": "ev1", "when": "1881-06-15T09:00", "title": "First survey", "note": "n"}],
            "c1": [{"id": "ev2", "when": "1995-11-04T03:14", "title": "Born", "note": "storm"}],
        },
        "statuses": [
            {"id": "todo", "label": "To do", "color": "var(--status-todo)"},
            {"id": "done", "label": "Done", "color": "var(--status-done)"},
        ],
        "trash": {
            "chapters": [], "scenes": [],
            "characters": [{"id": "c9", "name": "Cut character", "deletedAt": 1700000001000}],
            "locations": [], "objects": [], "groups": [], "notes": [], "strands": [],
            "worldbuilding": [], "events": [], "statuses": [],
            "tagVocab": [{"id": "tvx", "kind": "characters", "label": "old", "deletedAt": 1700000002000}],
        },
        "dailyRecaps": {"2026-06-18": {"text": "wrote", "day": "2026-06-18", "totalWords": 1200}},
        "reverseOutline": {"structureName": "3-act", "summary": "s", "generatedAt": "x"},
        "beatSheets": {"save-the-cat": {"templateKey": "save-the-cat", "templateName": "Save the Cat", "mapping": {}}},
        "plotHoles": {"summary": "none", "findings": [], "generatedAt": "x"},
        "voiceCanonChapterIds": ["ch1"],
        "relationshipArcs": {"c1::c2": {"summary": "father-daughter"}},
        "marketingPack": {"logline": "a ledger", "blurbs": ["a", "b", "c"]},
        "worldRules": "Maps can be wrong.",
        "savedAt": "2026-06-18T10:00:00.000Z",
    }


def test_book_round_trips(tmp_path):
    c = _client(tmp_path)
    book = _canonical_book()
    assert c.put("/v1/projects/prj1/book", json=book).status_code == 204
    assert c.get("/v1/projects/prj1/book").json() == book


def test_book_404_when_absent(tmp_path):
    assert _client(tmp_path).get("/v1/projects/nope/book").status_code == 404


def test_book_appears_in_project_list(tmp_path):
    c = _client(tmp_path)
    c.put("/v1/projects/prj1/book", json=_canonical_book())
    listing = c.get("/v1/projects").json()
    assert any(p["id"] == "prj1" and p["title"] == "The Cartographer's Daughter" for p in listing)


def test_projects_isolated(tmp_path):
    c = _client(tmp_path)
    b = _canonical_book()
    b["project"]["title"] = "Other"
    b["characters"] = []
    b["characterExtras"] = {}
    c.put("/v1/projects/prjA/book", json=_canonical_book())
    c.put("/v1/projects/prjB/book", json=b)
    assert c.get("/v1/projects/prjA/book").json()["project"]["title"] == "The Cartographer's Daughter"
    got_b = c.get("/v1/projects/prjB/book").json()
    assert got_b["project"]["title"] == "Other"
    assert got_b["characters"] == []  # B's emptiness didn't pull in A's rows


def test_reput_replaces_not_merges(tmp_path):
    c = _client(tmp_path)
    c.put("/v1/projects/prj1/book", json=_canonical_book())
    smaller = _canonical_book()
    smaller["characters"] = [smaller["characters"][0]]            # drop c2
    smaller["groups"][0]["members"] = [m for m in smaller["groups"][0]["members"] if m["id"] != "c2"]
    smaller["scenes"]["ch1"][1]["characters"] = ["c1"]            # scn2 no longer references c2
    assert c.put("/v1/projects/prj1/book", json=smaller).status_code == 204
    got = c.get("/v1/projects/prj1/book").json()
    assert [ch["id"] for ch in got["characters"]] == ["c1"]
    assert got == smaller
