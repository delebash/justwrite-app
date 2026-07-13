"""/v1/data/reset — the reset-workspace wipe across every table (shared
`make_data_router`), plus /v1/data/backup + /v1/data/restore round-trip.

Reset wipes every table, then re-seeds the default providers so the renderer
reloads into a first-run-shaped workspace (the server owns the seed now — see
test_seed.py). Since QC-40 first-run means NO projects — the demo book is
created only on demand (POST /v1/projects/demo). These tests assert the USER's
data is gone and nothing project-shaped comes back.
"""

from fastapi.testclient import TestClient

from justwrite_server.app import create_app


def _c(tmp_path):
    return TestClient(create_app(tmp_path))


def test_reset_clears_user_data(tmp_path):
    c = _c(tmp_path)
    # Populate a spread of tables: a project (+ cascaded book rows), settings,
    # a session, a usage row, a chat thread, a chapter version.
    c.put("/v1/projects/prj1", json={"project": {"title": "Book"}})
    c.patch("/v1/settings", json={"ui": {"x": 1}})
    c.post("/v1/sessions/record", json={"chapterId": "ch1", "words": 100, "day": "2026-06-18"})
    c.put("/v1/chat", json={"projectId": "prj1", "mode": "book", "messages": [{"role": "user", "content": "hi"}]})
    c.put("/v1/versions", json={"projectId": "prj1", "chapterId": "ch1",
                                "versions": [{"id": "v1", "savedAt": "x", "scenes": []}]})

    assert c.post("/v1/data/reset").status_code == 200

    # The user's own rows are gone; no project is re-seeded (QC-40).
    assert c.get("/v1/projects").json() == []
    assert "ui" not in c.get("/v1/settings").json()
    assert c.get("/v1/sessions").json() == {"days": {}, "chapterWords": {}, "lastWrite": None}
    assert c.get("/v1/chat", params={"projectId": "prj1", "mode": "book"}).json() == {"messages": []}
    assert c.get("/v1/versions", params={"projectId": "prj1"}).json() == {}


def test_reset_preserves_folder_path_config(tmp_path):
    # D3b: the workspace reset (/v1/data/reset drops + reseeds every table) must NOT
    # reset a user-changed folder path. autosaveDir + chooserDirs survive; other
    # settings are wiped.
    c = _c(tmp_path)
    target = tmp_path / "my-autosaves"
    c.put("/v1/projects/autosave-dir", json={"dir": str(target)})
    c.patch("/v1/settings", json={"chooserDirs": {"export": "/x/exports"}, "ui": {"x": 1}})

    assert c.post("/v1/data/reset").status_code == 200

    # The autosave folder still points where the user put it.
    assert c.get("/v1/projects/autosave-dir").json()["dir"] == str(target)
    doc = c.get("/v1/settings").json()
    assert doc.get("autosaveDir") == str(target)
    assert doc.get("chooserDirs") == {"export": "/x/exports"}
    assert "ui" not in doc  # non-path workspace data is gone


def test_reset_is_idempotent_on_empty(tmp_path):
    c = _c(tmp_path)
    assert c.post("/v1/data/reset").status_code == 200
    assert c.post("/v1/data/reset").status_code == 200
    # Repeated resets keep the workspace empty of projects (QC-40).
    assert c.get("/v1/projects").json() == []


def test_backup_restore_roundtrip(tmp_path):
    c = _c(tmp_path)
    c.put("/v1/projects/prj1", json={"project": {"title": "Backed up"}})
    # Back up, then mutate.
    blob = c.get("/v1/data/backup").content
    assert blob[:2] == b"PK"  # a zip
    c.put("/v1/projects/prj1", json={"project": {"title": "Changed after backup"}})
    # Restore brings the project's saved state back.
    r = c.post("/v1/data/restore", files={"file": ("backup.zip", blob, "application/zip")})
    assert r.status_code == 200
    snap = c.get("/v1/projects/prj1").json()
    assert snap["project"]["title"] == "Backed up"
