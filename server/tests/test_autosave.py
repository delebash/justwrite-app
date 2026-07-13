"""/v1/projects/*/autosave — the server-owned rotating disk autosave.

Ported from the Rust project_autosave* commands; these lock in the behaviour the
renderer depends on: 3-generation rotation, list newest-first, read/delete/
delete-all, snapshot round-trip, id sanitization, and the autosave-dir setting.
"""

from pathlib import Path

from fastapi.testclient import TestClient

from justwrite_server.app import create_app


def _c(tmp_path):
    return TestClient(create_app(tmp_path))


def _snap(title, saved_at):
    return {"project": {"title": title}, "savedAt": saved_at, "chapters": [{"id": "c1", "body": "x"}]}


def test_write_and_roundtrip(tmp_path):
    c = _c(tmp_path)
    snap = _snap("Book One", "2026-07-13T10:00:00Z")
    r = c.post("/v1/projects/prj1/autosave", json=snap)
    assert r.status_code == 200
    assert r.json()["key"] == "prj1__current"
    # Read it back — same JSON structure (verbatim mirror, no book decomposition).
    read = c.get("/v1/projects/autosaves/prj1__current")
    assert read.status_code == 200
    assert read.json() == snap


def test_rotation_keeps_three_generations(tmp_path):
    c = _c(tmp_path)
    for i in range(4):
        c.post("/v1/projects/prj1/autosave", json=_snap(f"v{i}", f"2026-07-13T10:0{i}:00Z"))
    # After 4 writes: current=v3, prev=v2, prev2=v1 (v0 rotated out).
    assert c.get("/v1/projects/autosaves/prj1__current").json()["project"]["title"] == "v3"
    assert c.get("/v1/projects/autosaves/prj1__prev").json()["project"]["title"] == "v2"
    assert c.get("/v1/projects/autosaves/prj1__prev2").json()["project"]["title"] == "v1"
    # Exactly 3 generations survive on disk for this project.
    keys = sorted(e["key"] for e in c.get("/v1/projects/autosaves").json())
    assert keys == ["prj1__current", "prj1__prev", "prj1__prev2"]


def test_list_newest_first_and_fields(tmp_path):
    c = _c(tmp_path)
    c.post("/v1/projects/a/autosave", json=_snap("Alpha", "2026-07-13T09:00:00Z"))
    c.post("/v1/projects/b/autosave", json=_snap("Beta", "2026-07-13T11:00:00Z"))
    listed = c.get("/v1/projects/autosaves").json()
    # Newest savedAt first.
    assert listed[0]["title"] == "Beta"
    assert listed[0]["projectId"] == "b"
    assert listed[0]["generation"] == "current"
    assert listed[0]["key"] == "b__current"


def test_list_defaults_title_and_savedat(tmp_path):
    c = _c(tmp_path)
    # A snapshot with neither project.title nor savedAt still lists cleanly.
    c.post("/v1/projects/bare/autosave", json={"chapters": []})
    entry = c.get("/v1/projects/autosaves").json()[0]
    assert entry["title"] == "Untitled"
    assert entry["savedAt"] == ""


def test_delete_one(tmp_path):
    c = _c(tmp_path)
    c.post("/v1/projects/prj1/autosave", json=_snap("X", "t1"))
    c.post("/v1/projects/prj1/autosave", json=_snap("Y", "t2"))  # current=Y, prev=X
    assert c.delete("/v1/projects/autosaves/prj1__prev").status_code == 204
    assert c.get("/v1/projects/autosaves/prj1__prev").status_code == 404
    # current survives.
    assert c.get("/v1/projects/autosaves/prj1__current").status_code == 200


def test_delete_all(tmp_path):
    c = _c(tmp_path)
    c.post("/v1/projects/a/autosave", json=_snap("A", "t1"))
    c.post("/v1/projects/b/autosave", json=_snap("B", "t2"))
    assert c.delete("/v1/projects/autosaves").status_code == 204
    assert c.get("/v1/projects/autosaves").json() == []


def test_read_missing_404(tmp_path):
    assert _c(tmp_path).get("/v1/projects/autosaves/nope__current").status_code == 404


def test_read_malformed_key_404(tmp_path):
    # Unknown generation -> not a real key.
    assert _c(tmp_path).get("/v1/projects/autosaves/prj1__bogus").status_code == 404


def test_unsafe_project_id_is_sanitized(tmp_path):
    c = _c(tmp_path)
    # '.' is neither alnum nor '-'/'_', so safe_id maps it to '_': "pr.j" -> "pr_j".
    r = c.post("/v1/projects/pr.j/autosave", json=_snap("Z", "t1"))
    assert r.json()["key"] == "pr_j__current"
    assert c.get("/v1/projects/autosaves/pr_j__current").status_code == 200


def test_autosave_dir_default_and_override(tmp_path):
    c = _c(tmp_path)
    # Default = <data_dir>/projects.
    got = c.get("/v1/projects/autosave-dir").json()["dir"]
    assert got.endswith("projects")
    # Point it at a new folder; the dir is created and used by subsequent writes.
    target = tmp_path / "my-autosaves"
    put = c.put("/v1/projects/autosave-dir", json={"dir": str(target)})
    assert put.status_code == 200
    assert put.json()["dir"] == str(target)
    assert target.is_dir()
    c.post("/v1/projects/prj1/autosave", json=_snap("H", "t1"))
    assert (target / "prj1.autosave.json").is_file()
    # GET reflects the new dir.
    assert c.get("/v1/projects/autosave-dir").json()["dir"] == str(target)


def test_autosave_dir_rejects_empty(tmp_path):
    c = _c(tmp_path)
    assert c.put("/v1/projects/autosave-dir", json={"dir": "  "}).status_code == 400


def test_autosave_dir_change_migrates_existing_files(tmp_path):
    # D3a: changing the folder MOVES the existing rotating files into the new folder
    # (so a folder change never loses the user's autosaves), leaving none behind.
    c = _c(tmp_path)
    c.post("/v1/projects/prj1/autosave", json=_snap("A", "t1"))
    c.post("/v1/projects/prj1/autosave", json=_snap("B", "t2"))  # current=B, prev=A
    old_dir = Path(c.get("/v1/projects/autosave-dir").json()["dir"])
    assert (old_dir / "prj1.autosave.json").is_file()
    assert (old_dir / "prj1.autosave.prev.json").is_file()

    target = tmp_path / "moved-autosaves"
    assert c.put("/v1/projects/autosave-dir", json={"dir": str(target)}).status_code == 200
    # Files now live in the new folder...
    assert (target / "prj1.autosave.json").is_file()
    assert (target / "prj1.autosave.prev.json").is_file()
    # ...and no longer in the old one.
    assert not (old_dir / "prj1.autosave.json").exists()
    assert not (old_dir / "prj1.autosave.prev.json").exists()
    # Still readable through the API (which now reads the new folder), content intact.
    assert c.get("/v1/projects/autosaves/prj1__current").json()["project"]["title"] == "B"
    assert c.get("/v1/projects/autosaves/prj1__prev").json()["project"]["title"] == "A"


def test_autosave_dir_change_does_not_clobber(tmp_path):
    # Migration never overwrites an autosave already present in the new folder.
    c = _c(tmp_path)
    c.post("/v1/projects/prj1/autosave", json=_snap("OLD", "t1"))
    target = tmp_path / "dest"
    target.mkdir()
    (target / "prj1.autosave.json").write_text('{"project": {"title": "KEEP"}}', encoding="utf-8")
    assert c.put("/v1/projects/autosave-dir", json={"dir": str(target)}).status_code == 200
    # The pre-existing file in the new folder is preserved, not clobbered.
    assert c.get("/v1/projects/autosaves/prj1__current").json()["project"]["title"] == "KEEP"


def test_autosaves_route_not_shadowed_by_project_get(tmp_path):
    # Regression guard: /v1/projects/autosaves must hit the list endpoint, NOT
    # projects' catch-all GET /{project_id} (which would 404 "project not found").
    r = _c(tmp_path).get("/v1/projects/autosaves")
    assert r.status_code == 200
    assert r.json() == []
