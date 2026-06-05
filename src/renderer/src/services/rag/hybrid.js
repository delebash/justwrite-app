// Hybrid keyword + semantic retrieval — blends BM25 and cosine rankings
// via Reciprocal Rank Fusion so exact-string queries ("every mention of
// the brass key") aren't punished by embedding surface-form loss while
// fuzzy semantic queries still benefit from the vector recall.
//
// RRF is scale-free: we don't have to normalise BM25 and cosine to the
// same range. score(d) = sum over rankings of 1 / (RRF_K + rank(d)).
// RRF_K = 60 follows the original Cormack et al. paper; the precise
// value matters less than its existence (it tames top-1 dominance).

import { cosineScores } from "./vectorStore.js";
import { bm25Scores } from "./bm25.js";

const RRF_K = 60;

/**
 * Hybrid top-k retrieval. Returns an array shaped like topK's output but
 * with extra `cosScore` + `bmScore` fields for the caller to surface to
 * the UI (the citation-list "similarity" badge keeps showing the cosine
 * score, since it's the most human-interpretable number).
 *
 * @param {object} store
 * @param {number[]} queryVec
 * @param {string}   queryText
 * @param {number}   [k=8]
 * @returns {Array<{chunk:object, score:number, cosScore:number|null, bmScore:number}>}
 */
export function topKHybrid(store, queryVec, queryText, k = 8) {
  const cos = cosineScores(store, queryVec);          // id -> cos sim
  const bm  = bm25Scores(store, queryText || "");      // id -> bm25 (sparse)

  const cosRanked = [...cos.entries()].sort((a, b) => b[1] - a[1]);
  const bmRanked  = [...bm.entries()].sort((a, b) => b[1] - a[1]);

  const cosRank = new Map();
  cosRanked.forEach(([id], i) => { cosRank.set(id, i + 1); });
  const bmRank  = new Map();
  bmRanked.forEach(([id], i) => { bmRank.set(id, i + 1); });

  const ids = new Set([...cosRank.keys(), ...bmRank.keys()]);
  const blended = [];
  for (const id of ids) {
    const cr = cosRank.get(id);
    const br = bmRank.get(id);
    const rrf = (cr ? 1 / (RRF_K + cr) : 0) + (br ? 1 / (RRF_K + br) : 0);
    blended.push({
      id,
      score:    rrf,
      cosScore: cos.get(id) ?? null,
      bmScore:  bm.get(id)  ?? 0,
    });
  }
  blended.sort((a, b) => b.score - a.score);

  const top = blended.slice(0, k);
  return top
    .map((r) => {
      const chunk = store.entries?.[r.id]?.chunk;
      if (!chunk) return null;
      return {
        chunk,
        score:    r.score,
        cosScore: r.cosScore,
        bmScore:  r.bmScore,
      };
    })
    .filter(Boolean);
}
