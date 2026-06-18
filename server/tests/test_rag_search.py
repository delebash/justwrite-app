"""Unit tests for the pure retrieval math (rag_search.py) — the BM25 + cosine
+ RRF port of the renderer's rag/{bm25,hybrid,vectorStore}.js. Verifies the
port matches the JS behavior without going through HTTP."""

from justwrite_server.rag_search import (
    bm25_scores,
    cosine_scores,
    hybrid_rank,
    tokenize,
)


def test_tokenize_drops_stopwords_and_singletons():
    # "what"/"is"/"the" are stop words; single chars are dropped. (NB: the JS
    # stop list this is ported from does NOT include "about" — the comment in
    # bm25.js claiming otherwise is wrong; this port stays faithful to the list.)
    assert tokenize("What is the brass key") == ["brass", "key"]
    assert tokenize("") == []
    assert tokenize("a I") == []  # both too short / stop words


def test_bm25_ranks_term_matches_and_omits_zero_rows():
    docs = [
        ("a", "the brass key on the table"),
        ("b", "a quiet morning with nothing"),
        ("c", "brass"),
    ]
    scores = bm25_scores(docs, "brass key")
    assert "b" not in scores  # shares no query terms -> omitted (no zero rows)
    assert "a" in scores and "c" in scores
    assert scores["a"] > scores["c"]  # two term matches beat one


def test_bm25_empty_query_returns_nothing():
    assert bm25_scores([("a", "brass key")], "") == {}
    assert bm25_scores([("a", "brass key")], "the and of") == {}  # all stop words


def test_cosine_skips_mismatched_dims():
    docs = [("a", [1.0, 0.0]), ("b", [1.0, 0.0, 0.0])]
    scores = cosine_scores(docs, [1.0, 0.0])
    assert set(scores) == {"a"}  # b is 3-dim, skipped against a 2-dim query
    assert abs(scores["a"] - 1.0) < 1e-9


def test_cosine_zero_query_returns_nothing():
    assert cosine_scores([("a", [1.0, 0.0])], [0.0, 0.0]) == {}


def test_hybrid_blend_lets_keyword_override_vector():
    # Vector points at b; the keyword points at a. RRF should surface a first
    # because a wins the BM25 ranking AND places second on cosine.
    items = [
        {"id": "a", "vector": [1.0, 0.0], "text": "the brass key", "chunk": {"id": "a"}},
        {"id": "b", "vector": [0.0, 1.0], "text": "a quiet morning", "chunk": {"id": "b"}},
    ]
    res = hybrid_rank(items, query_vec=[0.0, 1.0], query_text="brass key", k=2)
    assert [h["chunk"]["id"] for h in res] == ["a", "b"]
    assert res[0]["cosScore"] == 0.0  # a's cosine vs [0,1]
    assert res[0]["bmScore"] > 0
    assert abs(res[1]["cosScore"] - 1.0) < 1e-9  # b's cosine vs [0,1]
    assert res[1]["bmScore"] == 0


def test_hybrid_surfaces_keyword_hit_even_with_mismatched_vector_dims():
    # A chunk whose vector dims don't match the query is skipped by cosine but
    # can still surface via BM25 — cosScore is None there (matches the JS path).
    items = [{"id": "a", "vector": [1.0, 0.0, 0.0], "text": "brass key", "chunk": {"id": "a"}}]
    res = hybrid_rank(items, query_vec=[1.0, 0.0], query_text="brass", k=5)
    assert len(res) == 1
    assert res[0]["cosScore"] is None
    assert res[0]["bmScore"] > 0


def test_hybrid_pure_vector_ranks_by_cosine():
    items = [
        {"id": "a", "vector": [1.0, 0.0], "text": "", "chunk": {"id": "a"}},
        {"id": "b", "vector": [0.0, 1.0], "text": "", "chunk": {"id": "b"}},
        {"id": "c", "vector": [0.7, 0.7], "text": "", "chunk": {"id": "c"}},
    ]
    res = hybrid_rank(items, query_vec=[1.0, 0.0], query_text="", k=2)
    assert res[0]["chunk"]["id"] == "a"  # identical direction
    assert res[0]["score"] >= res[1]["score"]
