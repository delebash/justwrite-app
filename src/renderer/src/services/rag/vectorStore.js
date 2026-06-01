// Persistent vector store — one store per project, keyed by project id,
// backed by the existing IDB-based storage adapter.
//
// Store shape:
//   {
//     dims:    number,          — embedding dimensionality
//     model:   string,          — model id used to build the store
//     entries: {
//       [chunkId]: { sha: string, vector: number[], chunk: Chunk }
//     }
//   }
//
// NOTE: Vectors can be large (1536 dims × 8 bytes × 1000 chunks ≈ 12 MB).
// The storage adapter stores the JSON-serialised value — acceptable for v1.

import { getItem, setItem, removeItem } from "../storage.js";

// ─── Key ──────────────────────────────────────────────────────────────────

export function storageKey(projectId) {
  return `justwrite:rag:${projectId}`;
}

// ─── Lifecycle ────────────────────────────────────────────────────────────

/**
 * Load the store for a project from IDB cache.
 * Returns null if no store exists yet.
 *
 * @param {string} projectId
 * @returns {{ dims: number, model: string, entries: object } | null}
 */
export function load(projectId) {
  const raw = getItem(storageKey(projectId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    // Ensure required fields exist.
    return {
      dims: parsed.dims || 0,
      model: parsed.model || "",
      entries: parsed.entries && typeof parsed.entries === "object" ? parsed.entries : {},
    };
  } catch {
    return null;
  }
}

/**
 * Persist the store to IDB.
 *
 * @param {string} projectId
 * @param {{ dims: number, model: string, entries: object }} store
 */
export function save(projectId, store) {
  try {
    setItem(storageKey(projectId), JSON.stringify(store));
  } catch {}
}

/**
 * Remove the store key for the project.
 *
 * @param {string} projectId
 */
export function clear(projectId) {
  removeItem(storageKey(projectId));
}

// ─── Mutations ────────────────────────────────────────────────────────────

/**
 * Insert or replace a single entry in the store (mutates in place).
 *
 * @param {object} store
 * @param {string} chunkId
 * @param {string} sha
 * @param {number[]} vector
 * @param {object} chunk — the full Chunk object
 */
export function upsert(store, chunkId, sha, vector, chunk) {
  store.entries[chunkId] = { sha, vector, chunk };
  // Update dims from the first real vector inserted (or whenever it changes).
  if (vector.length && store.dims !== vector.length) {
    store.dims = vector.length;
  }
}

/**
 * Remove a single entry from the store (mutates in place).
 *
 * @param {object} store
 * @param {string} chunkId
 */
export function removeId(store, chunkId) {
  delete store.entries[chunkId];
}

// ─── Queries ──────────────────────────────────────────────────────────────

/**
 * All stored chunk ids.
 *
 * @param {object} store
 * @returns {string[]}
 */
export function chunkIds(store) {
  return Object.keys(store.entries || {});
}

/**
 * Diff the store against a fresh set of chunks.
 *
 * @param {object} store
 * @param {Array<Chunk>} freshChunks
 * @returns {{ toAdd: Chunk[], toUpdate: Chunk[], toRemove: string[] }}
 */
export function diff(store, freshChunks) {
  const entries = store.entries || {};
  const freshById = new Map(freshChunks.map((c) => [c.id, c]));

  const toAdd = [];
  const toUpdate = [];

  for (const chunk of freshChunks) {
    const existing = entries[chunk.id];
    if (!existing) {
      toAdd.push(chunk);
    } else if (existing.sha !== chunk.sha) {
      toUpdate.push(chunk);
    }
  }

  const toRemove = Object.keys(entries).filter((id) => !freshById.has(id));

  return { toAdd, toUpdate, toRemove };
}

// ─── Similarity ───────────────────────────────────────────────────────────

/**
 * Cosine similarity between two equal-length vectors.
 * Returns a value in [-1, 1]; higher is more similar.
 *
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number}
 */
export function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na  += a[i] * a[i];
    nb  += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Return the top-k most similar chunks to a query vector.
 * Entries whose vector dimensionality doesn't match queryVec are skipped
 * (guard against partial rebuilds after a model switch).
 *
 * @param {object} store
 * @param {number[]} queryVec
 * @param {number} [k=8]
 * @returns {Array<{ chunk: object, score: number }>}
 */
export function topK(store, queryVec, k = 8) {
  const qDim = queryVec.length;
  const results = [];

  for (const entry of Object.values(store.entries || {})) {
    if (!entry.vector || entry.vector.length !== qDim) continue;
    results.push({ chunk: entry.chunk, score: cosine(queryVec, entry.vector) });
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, k);
}
