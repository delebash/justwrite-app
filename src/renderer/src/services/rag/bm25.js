// Lightweight BM25 scorer over the RAG chunk corpus. Computed on-demand
// per query — there is no persistent inverted index. For a typical
// manuscript (a few thousand scene chunks) this is fast enough; the cost
// dominates at network/embedding time, not here.

const K1 = 1.5;
const B  = 0.75;

// Tiny English stop-word list. Big enough that "what about the brass key"
// → ["brass","key"], small enough not to drop intentionally-used pronouns
// like "him"/"her" that may appear in entity queries.
const STOP_WORDS = new Set([
  "the","a","an","and","or","but","of","to","in","on","at","for","with","by","from","as",
  "is","are","was","were","be","been","being","have","has","had","do","does","did",
  "this","that","these","those","it","its","what","which","when","where","who","whom",
]);

export function tokenize(text) {
  if (!text) return [];
  const matches = String(text).toLowerCase().match(/[a-z0-9']+/g) || [];
  return matches.filter((t) => t.length > 1 && !STOP_WORDS.has(t));
}

/**
 * Score every entry in the store against a query, returning entryId → score.
 * Entries that share no query terms are omitted (no zero rows).
 *
 * @param {object} store
 * @param {string} queryText
 * @returns {Map<string, number>}
 */
export function bm25Scores(store, queryText) {
  const queryTokens = tokenize(queryText);
  if (!queryTokens.length) return new Map();
  const uniqQuery = new Set(queryTokens);

  const entries = Object.entries(store.entries || {});
  const N = entries.length;
  if (!N) return new Map();

  // Single pass: tokenize each doc, count tf for query terms only, and
  // accumulate df per query term. Doc token-count → avgdl.
  const docTf = new Map(); // id -> Map(term -> count)
  const docLen = new Map(); // id -> token count
  const df = new Map();    // term -> doc count
  let totalLen = 0;

  for (const [id, entry] of entries) {
    const tks = tokenize(entry.chunk?.text || "");
    docLen.set(id, tks.length);
    totalLen += tks.length;

    const tf = new Map();
    for (const t of tks) {
      if (uniqQuery.has(t)) tf.set(t, (tf.get(t) || 0) + 1);
    }
    docTf.set(id, tf);

    for (const t of tf.keys()) df.set(t, (df.get(t) || 0) + 1);
  }

  const avgdl = totalLen / N || 1;

  // Pre-compute idf per query term.
  const idfMap = new Map();
  for (const t of uniqQuery) {
    const dft = df.get(t) || 0;
    if (!dft) continue;
    idfMap.set(t, Math.log((N - dft + 0.5) / (dft + 0.5) + 1));
  }

  const scores = new Map();
  for (const [id, tf] of docTf) {
    let score = 0;
    const dl = docLen.get(id) || 0;
    const lenNorm = 1 - B + B * (dl / avgdl);
    for (const [t, count] of tf) {
      const idf = idfMap.get(t);
      if (!idf) continue;
      score += idf * (count * (K1 + 1)) / (count + K1 * lenNorm);
    }
    if (score > 0) scores.set(id, score);
  }
  return scores;
}
