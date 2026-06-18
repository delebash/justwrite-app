"""Pure retrieval math for /v1/rag — cosine, BM25, and the RRF blend.

Ported line-for-line from the renderer's `rag/bm25.js` + `rag/hybrid.js` +
the `cosineScores` helper in `rag/vectorStore.js`, so hybrid retrieval now
runs server-side over the stored vectors + chunk text instead of loading the
whole index into the browser. Kept pure (operates on plain dicts/lists, no DB
or HTTP types) so it unit-tests without a server, and dependency-light (numpy
only for the dot products).

Hybrid = BM25 (keyword) blended with cosine (semantic) via Reciprocal Rank
Fusion. RRF is scale-free, so BM25 and cosine never have to be normalised to
the same range: score(d) = sum over rankings of 1 / (RRF_K + rank(d)). The
constants match the JS originals (K1/B from Okapi BM25; RRF_K=60 from Cormack
et al.) so retrieval ranking is identical to the pre-migration client path.
"""

from __future__ import annotations

import math
import re

import numpy as np

K1 = 1.5
B = 0.75
RRF_K = 60

# Tiny English stop-word list — identical to rag/bm25.js. Big enough that
# "what about the brass key" -> ["brass", "key"], small enough not to drop
# intentionally-used pronouns like "him"/"her" in entity queries.
STOP_WORDS = frozenset(
    {
        "the", "a", "an", "and", "or", "but", "of", "to", "in", "on", "at", "for",
        "with", "by", "from", "as", "is", "are", "was", "were", "be", "been",
        "being", "have", "has", "had", "do", "does", "did", "this", "that",
        "these", "those", "it", "its", "what", "which", "when", "where", "who",
        "whom",
    }
)

_TOKEN_RE = re.compile(r"[a-z0-9']+")


def tokenize(text: str) -> list[str]:
    if not text:
        return []
    return [t for t in _TOKEN_RE.findall(str(text).lower()) if len(t) > 1 and t not in STOP_WORDS]


def bm25_scores(docs: list[tuple[str, str]], query_text: str) -> dict[str, float]:
    """Score every doc against a query, returning id -> score.

    `docs` is a list of (id, text). Docs that share no query terms are omitted
    (no zero rows), matching the JS scorer.
    """
    query_tokens = tokenize(query_text)
    if not query_tokens:
        return {}
    uniq_query = set(query_tokens)

    n = len(docs)
    if not n:
        return {}

    doc_tf: dict[str, dict[str, int]] = {}
    doc_len: dict[str, int] = {}
    df: dict[str, int] = {}
    total_len = 0

    for doc_id, text in docs:
        tks = tokenize(text)
        doc_len[doc_id] = len(tks)
        total_len += len(tks)

        tf: dict[str, int] = {}
        for t in tks:
            if t in uniq_query:
                tf[t] = tf.get(t, 0) + 1
        doc_tf[doc_id] = tf

        for t in tf:
            df[t] = df.get(t, 0) + 1

    avgdl = (total_len / n) or 1

    idf_map: dict[str, float] = {}
    for t in uniq_query:
        dft = df.get(t, 0)
        if not dft:
            continue
        idf_map[t] = math.log((n - dft + 0.5) / (dft + 0.5) + 1)

    scores: dict[str, float] = {}
    for doc_id, tf in doc_tf.items():
        score = 0.0
        dl = doc_len.get(doc_id, 0)
        len_norm = 1 - B + B * (dl / avgdl)
        for t, count in tf.items():
            idf = idf_map.get(t)
            if not idf:
                continue
            score += idf * (count * (K1 + 1)) / (count + K1 * len_norm)
        if score > 0:
            scores[doc_id] = score
    return scores


def cosine_scores(docs: list[tuple[str, list[float]]], query_vec: list[float]) -> dict[str, float]:
    """id -> cosine similarity. Entries whose vector dimensionality doesn't
    match the query are skipped (guard against a partial rebuild after a model
    switch), matching `cosineScores` in vectorStore.js."""
    q = np.asarray(query_vec, dtype=float)
    qn = float(np.linalg.norm(q))
    if qn == 0:
        return {}
    q_dim = q.shape[0]
    scores: dict[str, float] = {}
    for doc_id, vec in docs:
        v = np.asarray(vec, dtype=float)
        if v.shape[0] != q_dim:
            continue
        vn = float(np.linalg.norm(v))
        if vn == 0:
            continue
        scores[doc_id] = float(np.dot(q, v) / (qn * vn))
    return scores


def hybrid_rank(items: list[dict], query_vec: list[float], query_text: str, k: int = 8) -> list[dict]:
    """Blend BM25 + cosine via RRF and return the top-k.

    `items` is a list of dicts, each `{ "id", "vector", "text", "chunk" }`.
    Returns `[{ "chunk", "score" (rrf), "cosScore", "bmScore" }]` — the same
    shape `topKHybrid` produced in the renderer, so callers are unchanged.
    """
    cos = cosine_scores([(it["id"], it["vector"]) for it in items], query_vec)
    bm = bm25_scores([(it["id"], it["text"]) for it in items], query_text or "")

    cos_ranked = sorted(cos.items(), key=lambda kv: kv[1], reverse=True)
    bm_ranked = sorted(bm.items(), key=lambda kv: kv[1], reverse=True)

    cos_rank = {doc_id: i + 1 for i, (doc_id, _) in enumerate(cos_ranked)}
    bm_rank = {doc_id: i + 1 for i, (doc_id, _) in enumerate(bm_ranked)}
    chunk_by_id = {it["id"]: it["chunk"] for it in items}

    blended = []
    for doc_id in set(cos_rank) | set(bm_rank):
        cr = cos_rank.get(doc_id)
        br = bm_rank.get(doc_id)
        rrf = (1 / (RRF_K + cr) if cr else 0) + (1 / (RRF_K + br) if br else 0)
        blended.append(
            {
                "id": doc_id,
                "score": rrf,
                "cosScore": cos.get(doc_id),
                "bmScore": bm.get(doc_id, 0),
            }
        )
    blended.sort(key=lambda r: r["score"], reverse=True)

    k = max(1, k)
    out = []
    for r in blended[:k]:
        chunk = chunk_by_id.get(r["id"])
        if chunk is None:
            continue
        out.append(
            {
                "chunk": chunk,
                "score": r["score"],
                "cosScore": r["cosScore"],
                "bmScore": r["bmScore"],
            }
        )
    return out
