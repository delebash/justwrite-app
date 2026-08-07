"""/v1/chat/sessions — manuscript-RAG chat SESSIONS (real rows, not a kv blob).

Covers session CRUD, list ordering (updatedAt desc), the per-session 30-message
cap, meta-only rename, and the one-time lazy migration of a pre-sessions thread
(legacy chat_messages rows) into a session that shows up in the list.
"""

from fastapi.testclient import TestClient

from justwrite_server import database
from justwrite_server.app import create_app
from justwrite_server.database.models import ChatMessage


def _c(tmp_path):
    return TestClient(create_app(tmp_path))


def _make_project(c, pid="prj1"):
    # chat_sessions.project_id FKs projects(id), so a session needs a real book.
    assert c.put(f"/v1/projects/{pid}", json={"project": {"title": "Book"}}).status_code == 204


def _put(c, sid, **body):
    return c.put(f"/v1/chat/sessions/{sid}", json={"projectId": "prj1", **body})


def test_list_empty(tmp_path):
    c = _c(tmp_path)
    _make_project(c)
    assert c.get("/v1/chat/sessions", params={"projectId": "prj1"}).json() == []


def test_create_get_and_list_roundtrip(tmp_path):
    c = _c(tmp_path)
    _make_project(c)
    msgs = [
        {"role": "user", "content": "Who is Mira?"},
        {"role": "assistant", "content": "A cartographer.", "citations": [{"sceneId": "s1"}]},
    ]
    assert _put(c, "s_a", mode="book", title="Who is Mira?", messages=msgs).status_code == 204

    lst = c.get("/v1/chat/sessions", params={"projectId": "prj1"}).json()
    assert len(lst) == 1
    assert lst[0]["id"] == "s_a"
    assert lst[0]["title"] == "Who is Mira?"
    assert lst[0]["messageCount"] == 2
    assert "messages" not in lst[0]  # the list stays light

    full = c.get("/v1/chat/sessions/s_a").json()
    assert [m["role"] for m in full["messages"]] == ["user", "assistant"]
    assert full["messages"][1]["citations"] == [{"sceneId": "s1"}]
    assert "error" not in full["messages"][0]  # absent errors omitted, not null


def test_replace_all_is_wholesale(tmp_path):
    c = _c(tmp_path)
    _make_project(c)
    _put(c, "s_a", title="T", messages=[{"role": "user", "content": "one"}, {"role": "assistant", "content": "two"}])
    # A shorter message list fully overwrites the longer one.
    _put(c, "s_a", title="T", messages=[{"role": "user", "content": "solo"}])
    full = c.get("/v1/chat/sessions/s_a").json()
    assert [m["content"] for m in full["messages"]] == ["solo"]


def test_empty_session_never_persisted(tmp_path):
    c = _c(tmp_path)
    _make_project(c)
    # Creating with no messages must NOT create a row (the empty-never-persisted rule).
    assert _put(c, "ghost", title="x", messages=[]).status_code == 204
    assert c.get("/v1/chat/sessions", params={"projectId": "prj1"}).json() == []
    assert c.get("/v1/chat/sessions/ghost").status_code == 404
    # Same for a meta-only (no messages key) create.
    assert _put(c, "ghost2", title="x").status_code == 204
    assert c.get("/v1/chat/sessions", params={"projectId": "prj1"}).json() == []


def test_message_cap_30(tmp_path):
    c = _c(tmp_path)
    _make_project(c)
    many = [{"role": "user", "content": f"m{i}"} for i in range(50)]
    _put(c, "s_a", title="T", messages=many)
    full = c.get("/v1/chat/sessions/s_a").json()
    assert len(full["messages"]) == 30
    # The tail is kept (server slices the last 30).
    assert full["messages"][0]["content"] == "m20"
    assert full["messages"][-1]["content"] == "m49"


def test_rename_is_meta_only_and_keeps_messages(tmp_path):
    c = _c(tmp_path)
    _make_project(c)
    _put(c, "s_a", title="Old title", updatedAt="2026-01-01T00:00:00Z",
         messages=[{"role": "user", "content": "keep me"}])
    # A rename sends title WITHOUT messages → turns untouched, updatedAt preserved.
    assert _put(c, "s_a", title="New title").status_code == 204
    full = c.get("/v1/chat/sessions/s_a").json()
    assert full["title"] == "New title"
    assert [m["content"] for m in full["messages"]] == ["keep me"]
    assert full["updatedAt"] == "2026-01-01T00:00:00Z"  # rename didn't bump the time


def test_list_sorted_by_updated_at_desc(tmp_path):
    c = _c(tmp_path)
    _make_project(c)
    _put(c, "older", title="older", updatedAt="2026-01-01T00:00:00Z", messages=[{"role": "user", "content": "a"}])
    _put(c, "newer", title="newer", updatedAt="2026-06-01T00:00:00Z", messages=[{"role": "user", "content": "b"}])
    _put(c, "mid", title="mid", updatedAt="2026-03-01T00:00:00Z", messages=[{"role": "user", "content": "c"}])
    ids = [s["id"] for s in c.get("/v1/chat/sessions", params={"projectId": "prj1"}).json()]
    assert ids == ["newer", "mid", "older"]


def test_scopes_coexist_in_one_list(tmp_path):
    c = _c(tmp_path)
    _make_project(c)
    _put(c, "book1", mode="book", title="book q", messages=[{"role": "user", "content": "book q"}])
    _put(c, "char1", mode="character", characterId="c1", title="char q",
         messages=[{"role": "user", "content": "char q"}])
    lst = c.get("/v1/chat/sessions", params={"projectId": "prj1"}).json()
    assert {s["mode"] for s in lst} == {"book", "character"}
    char = next(s for s in lst if s["mode"] == "character")
    assert char["characterId"] == "c1"


def test_delete_removes_session_and_messages(tmp_path):
    c = _c(tmp_path)
    _make_project(c)
    _put(c, "s_a", title="T", messages=[{"role": "user", "content": "hi"}])
    assert c.delete("/v1/chat/sessions/s_a").status_code == 204
    assert c.get("/v1/chat/sessions", params={"projectId": "prj1"}).json() == []
    assert c.get("/v1/chat/sessions/s_a").status_code == 404


def test_persist_across_instances_and_project_delete_cascade(tmp_path):
    c = _c(tmp_path)
    _make_project(c)
    _put(c, "s_a", title="T", messages=[{"role": "user", "content": "persisted"}])

    c2 = _c(tmp_path)  # new server instance, same SQLite file
    assert c2.get("/v1/chat/sessions/s_a").json()["messages"][0]["content"] == "persisted"

    # Deleting the book cascades its sessions + messages away (project_id FK CASCADE).
    assert c2.delete("/v1/projects/prj1").status_code == 204
    assert c2.get("/v1/chat/sessions", params={"projectId": "prj1"}).json() == []


def _seed_legacy_thread(project_id, mode, character_id, messages):
    """Insert pre-sessions rows straight into the legacy chat_messages table
    (the old wire format), simulating a DB upgraded from before sessions."""
    db = database.SessionLocal()
    try:
        for i, m in enumerate(messages):
            db.add(
                ChatMessage(
                    project_id=project_id,
                    mode=mode,
                    character_id=character_id,
                    position=i,
                    role=m["role"],
                    content=m["content"],
                    citations="[]",
                )
            )
        db.commit()
    finally:
        db.close()


def test_migration_legacy_thread_becomes_a_session(tmp_path):
    c = _c(tmp_path)
    _make_project(c)
    _seed_legacy_thread("prj1", "book", "", [
        {"role": "user", "content": "What did the map hide?"},
        {"role": "assistant", "content": "A door."},
    ])
    _seed_legacy_thread("prj1", "character", "c1", [
        {"role": "user", "content": "Who do you trust?"},
    ])

    # First list triggers the lazy lift.
    lst = c.get("/v1/chat/sessions", params={"projectId": "prj1"}).json()
    assert len(lst) == 2
    book = next(s for s in lst if s["mode"] == "book")
    char = next(s for s in lst if s["mode"] == "character")
    assert book["title"] == "What did the map hide?"  # title from the first user turn
    assert book["messageCount"] == 2
    assert char["characterId"] == "c1"
    assert char["title"] == "Who do you trust?"

    # The migrated turns are retrievable in order.
    full = c.get(f"/v1/chat/sessions/{book['id']}").json()
    assert [m["content"] for m in full["messages"]] == ["What did the map hide?", "A door."]

    # Idempotent: a second list neither duplicates nor re-lifts (legacy rows gone).
    again = c.get("/v1/chat/sessions", params={"projectId": "prj1"}).json()
    assert len(again) == 2
