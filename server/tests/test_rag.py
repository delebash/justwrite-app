"""/v1/rag — server-side RAG vector store + cosine search."""

from fastapi.testclient import TestClient

from justwrite_server.app import create_app


def _c(tmp_path):
    return TestClient(create_app(tmp_path))


def test_put_status_shas(tmp_path):
    c = _c(tmp_path)
    assert c.get("/v1/rag/p1/status").json() == {"exists": False, "count": 0, "model": "", "dims": 0}
    body = {
        "model": "text-embedding-3-small",
        "items": [
            {"chunkId": "a", "sha": "sha-a", "vector": [1.0, 0.0, 0.0], "chunk": {"id": "a", "text": "alpha"}},
            {"chunkId": "b", "sha": "sha-b", "vector": [0.0, 1.0, 0.0], "chunk": {"id": "b", "text": "beta"}},
        ],
    }
    assert c.put("/v1/rag/p1", json=body).status_code == 204
    assert c.get("/v1/rag/p1/status").json() == {
        "exists": True, "count": 2, "model": "text-embedding-3-small", "dims": 3,
    }
    assert c.get("/v1/rag/p1/shas").json() == {"a": "sha-a", "b": "sha-b"}


def test_search_ranks_by_cosine(tmp_path):
    c = _c(tmp_path)
    c.put("/v1/rag/p1", json={"model": "m", "items": [
        {"chunkId": "a", "sha": "1", "vector": [1.0, 0.0], "chunk": {"id": "a"}},
        {"chunkId": "b", "sha": "1", "vector": [0.0, 1.0], "chunk": {"id": "b"}},
        {"chunkId": "c", "sha": "1", "vector": [0.7, 0.7], "chunk": {"id": "c"}},
    ]})
    res = c.post("/v1/rag/p1/search", json={"vector": [1.0, 0.0], "k": 2}).json()
    assert len(res) == 2
    assert res[0]["chunk"]["id"] == "a"  # identical direction ranks first
    assert res[0]["score"] >= res[1]["score"]
    assert len(c.post("/v1/rag/p1/search", json={"vector": [1.0, 0.0], "k": 1}).json()) == 1


def test_upsert_remove_clear(tmp_path):
    c = _c(tmp_path)
    c.put("/v1/rag/p1", json={"model": "m", "items": [
        {"chunkId": "a", "sha": "1", "vector": [1.0, 0.0], "chunk": {"id": "a"}}]})
    # re-PUT the same id with a new sha → upsert, count stays 1
    c.put("/v1/rag/p1", json={"model": "m", "items": [
        {"chunkId": "a", "sha": "2", "vector": [1.0, 0.0], "chunk": {"id": "a"}}]})
    assert c.get("/v1/rag/p1/status").json()["count"] == 1
    assert c.get("/v1/rag/p1/shas").json() == {"a": "2"}
    c.put("/v1/rag/p1", json={"model": "m", "items": [
        {"chunkId": "b", "sha": "1", "vector": [0.0, 1.0], "chunk": {"id": "b"}}]})
    assert c.get("/v1/rag/p1/status").json()["count"] == 2
    c.post("/v1/rag/p1/remove", json={"ids": ["a"]})
    assert c.get("/v1/rag/p1/shas").json() == {"b": "1"}
    c.delete("/v1/rag/p1")
    assert c.get("/v1/rag/p1/status").json() == {"exists": False, "count": 0, "model": "", "dims": 0}


def test_search_skips_mismatched_dims(tmp_path):
    c = _c(tmp_path)
    c.put("/v1/rag/p1", json={"model": "m", "items": [
        {"chunkId": "a", "sha": "1", "vector": [1.0, 0.0, 0.0], "chunk": {"id": "a"}}]})
    assert c.post("/v1/rag/p1/search", json={"vector": [1.0, 0.0], "k": 5}).json() == []


def test_search_bm25_scores_scene_links(tmp_path):
    """Move 3 (RAG build): a query term that appears ONLY in a scene chunk's
    `links` line (its entity names) still ranks that chunk via the BM25 leg —
    "where is X" works even when the prose never names the place."""
    c = _c(tmp_path)
    c.put("/v1/rag/p1", json={"model": "m", "items": [
        {"chunkId": "a", "sha": "1", "vector": [1.0, 0.0],
         "chunk": {"id": "a", "text": "She waited by the desk.",
                   "links": "Characters: Aria · Location: Customs House"}},
        {"chunkId": "b", "sha": "1", "vector": [1.0, 0.0],
         "chunk": {"id": "b", "text": "A quiet morning with nothing.", "links": ""}},
    ]})
    # Identical vectors → cosine ties; only the links text can separate them.
    res = c.post("/v1/rag/p1/search", json={
        "vector": [1.0, 0.0], "queryText": "customs house", "k": 2}).json()
    assert res[0]["chunk"]["id"] == "a"
    assert res[0]["bmScore"] > 0
    # Chunks with no links field (pre-Move-3 rows, cards) still search fine.
    assert res[1]["chunk"]["id"] == "b"


def test_projects_isolated(tmp_path):
    c = _c(tmp_path)
    c.put("/v1/rag/p1", json={"model": "m", "items": [
        {"chunkId": "a", "sha": "1", "vector": [1.0], "chunk": {"id": "a"}}]})
    c.put("/v1/rag/p2", json={"model": "m", "items": [
        {"chunkId": "x", "sha": "1", "vector": [1.0], "chunk": {"id": "x"}}]})
    assert c.get("/v1/rag/p1/shas").json() == {"a": "1"}
    assert c.get("/v1/rag/p2/shas").json() == {"x": "1"}
