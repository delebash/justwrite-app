"""/v1/chat — manuscript-RAG chat threads (real rows, not a kv blob)."""

from fastapi.testclient import TestClient

from justwrite_server.app import create_app


def _c(tmp_path):
    return TestClient(create_app(tmp_path))


def _make_project(c, pid="prj1"):
    # chat_messages.project_id FKs projects(id), so a thread needs a real book.
    assert c.put(f"/v1/projects/{pid}", json={"project": {"title": "Book"}}).status_code == 204


def test_empty(tmp_path):
    c = _c(tmp_path)
    assert c.get("/v1/chat", params={"projectId": "prj1", "mode": "book"}).json() == {"messages": []}


def test_replace_and_get_roundtrip(tmp_path):
    c = _c(tmp_path)
    _make_project(c)
    msgs = [
        {"role": "user", "content": "Who is Mira?"},
        {"role": "assistant", "content": "A cartographer.", "citations": [{"sceneId": "s1"}]},
    ]
    assert c.put("/v1/chat", json={"projectId": "prj1", "mode": "book", "messages": msgs}).status_code == 204

    got = c.get("/v1/chat", params={"projectId": "prj1", "mode": "book"}).json()["messages"]
    assert [m["role"] for m in got] == ["user", "assistant"]
    assert got[1]["content"] == "A cartographer."
    assert got[1]["citations"] == [{"sceneId": "s1"}]
    assert "error" not in got[0]  # absent errors are omitted, not null

    # Replace is wholesale: a shorter thread fully overwrites the longer one.
    assert c.put("/v1/chat", json={
        "projectId": "prj1", "mode": "book",
        "messages": [{"role": "user", "content": "new thread"}],
    }).status_code == 204
    got = c.get("/v1/chat", params={"projectId": "prj1", "mode": "book"}).json()["messages"]
    assert len(got) == 1 and got[0]["content"] == "new thread"


def test_threads_are_isolated_by_mode_and_character(tmp_path):
    c = _c(tmp_path)
    _make_project(c)
    c.put("/v1/chat", json={"projectId": "prj1", "mode": "book", "messages": [{"role": "user", "content": "book q"}]})
    c.put("/v1/chat", json={"projectId": "prj1", "mode": "character", "characterId": "c1",
                            "messages": [{"role": "user", "content": "char q"}]})

    book = c.get("/v1/chat", params={"projectId": "prj1", "mode": "book"}).json()["messages"]
    char = c.get("/v1/chat", params={"projectId": "prj1", "mode": "character", "characterId": "c1"}).json()["messages"]
    assert book[0]["content"] == "book q"
    assert char[0]["content"] == "char q"
    # A different character is its own (empty) thread.
    assert c.get("/v1/chat", params={"projectId": "prj1", "mode": "character", "characterId": "c2"}).json() == {"messages": []}


def test_delete_clears_thread(tmp_path):
    c = _c(tmp_path)
    _make_project(c)
    c.put("/v1/chat", json={"projectId": "prj1", "mode": "book", "messages": [{"role": "user", "content": "hi"}]})
    assert c.delete("/v1/chat", params={"projectId": "prj1", "mode": "book"}).status_code == 204
    assert c.get("/v1/chat", params={"projectId": "prj1", "mode": "book"}).json() == {"messages": []}


def test_persist_across_instances_and_project_delete_cascade(tmp_path):
    c = _c(tmp_path)
    _make_project(c)
    c.put("/v1/chat", json={"projectId": "prj1", "mode": "book", "messages": [{"role": "user", "content": "persisted"}]})

    c2 = _c(tmp_path)  # new server instance, same SQLite file
    assert c2.get("/v1/chat", params={"projectId": "prj1", "mode": "book"}).json()["messages"][0]["content"] == "persisted"

    # Deleting the book cascades its threads away (project_id FK ON DELETE CASCADE).
    assert c2.delete("/v1/projects/prj1").status_code == 204
    assert c2.get("/v1/chat", params={"projectId": "prj1", "mode": "book"}).json() == {"messages": []}
