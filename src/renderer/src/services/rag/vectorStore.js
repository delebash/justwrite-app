// RAG vector store — server-backed client over /v1/rag.
//
// Was an IDB/kv blob (justwrite:rag:<id>) loaded WHOLE into the browser and
// hybrid-searched in JS. Now vectors live in the server's rag_vectors table:
// the renderer embeds chunks via its provider and PUTs them here; retrieval is
// a server-side hybrid (BM25 + cosine + RRF) search. See
// server/justwrite_server/api/rag.py + rag_search.py.

import { serverUrl } from "../serverApi.js";

async function _json(path, opts) {
  const res = await fetch(serverUrl(path), opts);
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.status === 204 ? null : res.json();
}

const _post = (path, body) => _json(path, {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});

// ─── Index metadata ─────────────────────────────────────────────────────

/** { exists, count, model, dims } for a project's index. */
export function status(projectId) {
  return _json(`/v1/rag/${projectId}/status`);
}

/** chunkId -> sha map, for incremental diffing. */
export function shas(projectId) {
  return _json(`/v1/rag/${projectId}/shas`);
}

// ─── Mutations ──────────────────────────────────────────────────────────

/** Upsert a batch of embedded chunks. `items`: [{ chunkId, sha, vector, chunk }]. */
export function putVectors(projectId, model, items) {
  return _json(`/v1/rag/${projectId}`, {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, items }),
  });
}

/** Remove a batch of chunk ids. */
export function removeIds(projectId, ids) {
  if (!ids?.length) return Promise.resolve();
  return _post(`/v1/rag/${projectId}/remove`, { ids });
}

/** Drop the whole index for a project. */
export function clear(projectId) {
  return _json(`/v1/rag/${projectId}`, { method: "DELETE" });
}

// ─── Retrieval ──────────────────────────────────────────────────────────

/**
 * Server-side hybrid (BM25 + cosine + RRF) top-k. Returns
 * [{ chunk, score, cosScore, bmScore }] — the same shape the old in-JS
 * topKHybrid produced, so callers are unchanged.
 */
export function search(projectId, vector, queryText, k = 8) {
  return _post(`/v1/rag/${projectId}/search`, { vector, queryText: queryText || "", k });
}

// ─── Diff ───────────────────────────────────────────────────────────────

/**
 * Diff fresh chunks against the server's shas map (chunkId -> sha).
 *
 * @param {Record<string,string>} shasMap
 * @param {Array<{id:string, sha:string}>} freshChunks
 * @returns {{ toAdd: object[], toUpdate: object[], toRemove: string[] }}
 */
export function diff(shasMap, freshChunks) {
  const have = shasMap || {};
  const freshIds = new Set(freshChunks.map((c) => c.id));
  const toAdd = [];
  const toUpdate = [];
  for (const chunk of freshChunks) {
    if (!(chunk.id in have)) toAdd.push(chunk);
    else if (have[chunk.id] !== chunk.sha) toUpdate.push(chunk);
  }
  const toRemove = Object.keys(have).filter((id) => !freshIds.has(id));
  return { toAdd, toUpdate, toRemove };
}
