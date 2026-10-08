// SPDX-License-Identifier: MIT
// Pure retrieval math for /v1/rag — cosine, BM25, and the RRF blend (the port of
// justwrite_server/rag_search.py, itself ported line for line from the renderer's
// `rag/bm25.js` + `rag/hybrid.js` + the `cosineScores` helper in `rag/vectorStore.js`), so
// hybrid retrieval runs server-side over the stored vectors + chunk text. Kept pure (plain
// objects/arrays, no DB or HTTP types) so it unit-tests without a server.
//
// Hybrid = BM25 (keyword) blended with cosine (semantic) via Reciprocal Rank Fusion. RRF is
// scale-free, so BM25 and cosine never have to be normalised to the same range:
// score(d) = sum over rankings of 1 / (RRF_K + rank(d)). The constants match the JS
// originals (K1/B from Okapi BM25; RRF_K=60 from Cormack et al.).
//
// Where the numbers can differ from Python's in the last bit: Python used numpy for the dot
// products and norms (BLAS summation order); here they are plain loops. Rankings are the
// same unless two scores tie to within an ulp.

import { pySorted } from "@delebash/llm-runner/platform/py";

export const K1 = 1.5;
export const B = 0.75;
export const RRF_K = 60;

// Tiny English stop-word list — identical to rag/bm25.js. Big enough that "what about the
// brass key" -> ["brass", "key"], small enough not to drop intentionally-used pronouns like
// "him"/"her" in entity queries.
export const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "but", "of", "to", "in", "on", "at", "for",
  "with", "by", "from", "as", "is", "are", "was", "were", "be", "been",
  "being", "have", "has", "had", "do", "does", "did", "this", "that",
  "these", "those", "it", "its", "what", "which", "when", "where", "who",
  "whom",
]);

const TOKEN_RE = /[a-z0-9']+/g;

export function tokenize(text) {
  if (!text) return [];
  return (String(text).toLowerCase().match(TOKEN_RE) || []).filter((t) => t.length > 1 && !STOP_WORDS.has(t));
}

/**
 * Score every doc against a query, returning a Map id → score. `docs` is a list of
 * [id, text]. Docs that share no query terms are omitted (no zero rows), matching the JS
 * scorer.
 */
export function bm25Scores(docs, queryText) {
  const queryTokens = tokenize(queryText);
  if (!queryTokens.length) return new Map();
  const uniqQuery = new Set(queryTokens);

  const n = docs.length;
  if (!n) return new Map();

  const docTf = new Map();
  const docLen = new Map();
  const df = new Map();
  let totalLen = 0;

  for (const [docId, text] of docs) {
    const tks = tokenize(text);
    docLen.set(docId, tks.length);
    totalLen += tks.length;

    const tf = new Map();
    for (const t of tks) if (uniqQuery.has(t)) tf.set(t, (tf.get(t) || 0) + 1);
    docTf.set(docId, tf);

    for (const t of tf.keys()) df.set(t, (df.get(t) || 0) + 1);
  }

  const avgdl = totalLen / n || 1;

  const idfMap = new Map();
  for (const t of uniqQuery) {
    const dft = df.get(t) || 0;
    if (!dft) continue;
    idfMap.set(t, Math.log((n - dft + 0.5) / (dft + 0.5) + 1));
  }

  const scores = new Map();
  for (const [docId, tf] of docTf) {
    let score = 0.0;
    const dl = docLen.get(docId) || 0;
    const lenNorm = 1 - B + B * (dl / avgdl);
    for (const [t, count] of tf) {
      const idf = idfMap.get(t);
      if (!idf) continue;
      score += (idf * (count * (K1 + 1))) / (count + K1 * lenNorm);
    }
    if (score > 0) scores.set(docId, score);
  }
  return scores;
}

/**
 * Map id → cosine similarity. Entries whose vector dimensionality doesn't match the query
 * are skipped (guard against a partial rebuild after a model switch), matching
 * `cosineScores` in vectorStore.js.
 */
export function cosineScores(docs, queryVec) {
  const q = queryVec.map(Number);
  let qq = 0;
  for (const x of q) qq += x * x;
  const qn = Math.sqrt(qq);
  if (qn === 0) return new Map();
  const scores = new Map();
  for (const [docId, vec] of docs) {
    if (vec.length !== q.length) continue;
    let vv = 0;
    let dot = 0;
    for (let i = 0; i < vec.length; i++) {
      const v = Number(vec[i]);
      vv += v * v;
      dot += q[i] * v;
    }
    const vn = Math.sqrt(vv);
    if (vn === 0) continue;
    scores.set(docId, dot / (qn * vn));
  }
  return scores;
}

/**
 * Blend BM25 + cosine via RRF and return the top-k. `items`: `[{id, vector, text, chunk}]`.
 * Returns `[{chunk, score (rrf), cosScore, bmScore}]` — the shape `topKHybrid` produced in
 * the renderer.
 *
 * Ties: Python walked `set(cos_rank) | set(bm_rank)` — string-hash order, which changes
 * from one Python process to the next — before a stable sort by score, so equal RRF scores
 * came out in no fixed order. Here the walk is cosine-ranked ids first, then the BM25-only
 * ones: one fixed order of the many Python could produce.
 */
export function hybridRank(items, queryVec, queryText, k = 8) {
  const cos = cosineScores(
    items.map((it) => [it.id, it.vector]),
    queryVec,
  );
  const bm = bm25Scores(
    items.map((it) => [it.id, it.text]),
    queryText || "",
  );

  const cosRanked = pySorted([...cos.entries()], (kv) => kv[1], true);
  const bmRanked = pySorted([...bm.entries()], (kv) => kv[1], true);

  const cosRank = new Map(cosRanked.map(([docId], i) => [docId, i + 1]));
  const bmRank = new Map(bmRanked.map(([docId], i) => [docId, i + 1]));
  const chunkById = new Map(items.map((it) => [it.id, it.chunk]));

  const blended = [];
  for (const docId of new Set([...cosRank.keys(), ...bmRank.keys()])) {
    const cr = cosRank.get(docId);
    const br = bmRank.get(docId);
    const rrf = (cr ? 1 / (RRF_K + cr) : 0) + (br ? 1 / (RRF_K + br) : 0);
    blended.push({
      id: docId,
      score: rrf,
      cosScore: cos.has(docId) ? cos.get(docId) : null,
      bmScore: bm.has(docId) ? bm.get(docId) : 0,
    });
  }
  const sorted = pySorted(blended, (r) => r.score, true);

  const kk = Math.max(1, k);
  const out = [];
  for (const r of sorted.slice(0, kk)) {
    const chunk = chunkById.has(r.id) ? chunkById.get(r.id) : null;
    if (chunk === null || chunk === undefined) continue;
    out.push({ chunk, score: r.score, cosScore: r.cosScore, bmScore: r.bmScore });
  }
  return out;
}
