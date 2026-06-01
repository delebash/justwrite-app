// RAG indexer — orchestrates chunking, diffing, embedding, and persistence.
//
// buildOrUpdateIndex({ signal, onProgress, provider, model })
//   Incremental: embeds only new/changed chunks; removes stale ones.
//
// rebuildIndex({ signal, onProgress, provider, model })
//   Full rebuild: wipes the existing store and re-embeds every chunk.
//
// clearIndex()
//   Drops the stored index for the active project.
//
// indexStatus()
//   Returns a status summary without loading the full store.

import { OpenAICompatClient } from "../openai-compat.js";
import { friendlyAiError } from "../aiErrors.js";
import { useAiStore } from "../../stores/ai.js";
import { useProjectStore } from "../../stores/project.js";
import { chunkProjectAsync } from "./chunker.js";
import { load, save, upsert, removeId, diff, clear } from "./vectorStore.js";

// How many chunks to embed per API call. Batching reduces round-trips while
// still respecting per-request limits on most providers.
const EMBED_BATCH_SIZE = 16;

// ─── Helpers ──────────────────────────────────────────────────────────────

function emptyStore(model) {
  return { dims: 0, model, entries: {} };
}

function resolveProvider(ai, override) {
  return override || ai.embeddingProvider;
}

function resolveModel(provider, override) {
  return override || provider?.embeddingModel || "";
}

/**
 * Core indexing loop shared by buildOrUpdateIndex and rebuildIndex.
 * `chunksToEmbed` is already the filtered work list (all chunks for a full
 * rebuild, or the add+update delta for an incremental run).
 *
 * @param {object} opts
 * @param {string}   opts.projectId
 * @param {object}   opts.store         — mutable store object
 * @param {Chunk[]}  opts.chunksToEmbed
 * @param {string[]} opts.idsToRemove
 * @param {object}   opts.client
 * @param {string}   opts.model
 * @param {AbortSignal|undefined} opts.signal
 * @param {Function|undefined}   opts.onProgress
 */
async function embedAndPersist({
  projectId,
  store,
  chunksToEmbed,
  idsToRemove,
  client,
  model,
  signal,
  onProgress,
}) {
  // 1. Remove stale entries.
  for (const id of idsToRemove) {
    removeId(store, id);
  }

  const total = chunksToEmbed.length;

  // 2. Embed in batches of EMBED_BATCH_SIZE.
  for (let batchStart = 0; batchStart < total; batchStart += EMBED_BATCH_SIZE) {
    if (signal?.aborted) break;

    const batch = chunksToEmbed.slice(batchStart, batchStart + EMBED_BATCH_SIZE);
    const inputs = batch.map((c) => c.text);

    let vectors;
    try {
      vectors = await client.embed({ input: inputs, model, signal });
    } catch (err) {
      throw friendlyAiError(err, client.provider);
    }

    if (!Array.isArray(vectors) || vectors.length !== batch.length) {
      throw new Error("Embeddings response length didn't match the batch size.");
    }

    // Validate dims — detect a model that returns a different dimensionality
    // than what the store was built with.
    const firstDim = vectors[0]?.length;
    if (store.dims && firstDim && store.dims !== firstDim) {
      throw new Error(
        `Embedding dimension mismatch: store has ${store.dims} dims, model returned ${firstDim}. ` +
        "Use rebuildIndex() after changing embedding models.",
      );
    }

    for (let i = 0; i < batch.length; i++) {
      if (signal?.aborted) break;
      const chunk  = batch[i];
      const vector = vectors[i];
      upsert(store, chunk.id, chunk.sha, vector, chunk);

      if (onProgress) {
        onProgress({
          phase: "embedding",
          index: batchStart + i + 1,
          total,
          chunk,
        });
      }
    }
  }

  // 3. Persist.
  save(projectId, store);
  if (onProgress) onProgress({ phase: "done" });
}

// ─── Public API ───────────────────────────────────────────────────────────

/**
 * Incremental build — only embeds new or changed chunks, removes deleted ones.
 *
 * @param {object} [opts]
 * @param {AbortSignal} [opts.signal]
 * @param {Function}    [opts.onProgress]  — ({ phase, index, total, chunk })
 * @param {object}      [opts.provider]    — override embedding provider
 * @param {string}      [opts.model]       — override embedding model id
 */
export async function buildOrUpdateIndex({ signal, onProgress, provider, model } = {}) {
  const ai      = useAiStore();
  const project = useProjectStore();

  const resolvedProvider = resolveProvider(ai, provider);
  if (!resolvedProvider) {
    throw new Error(
      "No embedding provider configured. Open Settings → AI providers and set an embedding provider.",
    );
  }
  const resolvedModel = resolveModel(resolvedProvider, model);
  const client  = new OpenAICompatClient(resolvedProvider);
  const projectId = project.activeProjectId;

  if (onProgress) onProgress({ phase: "chunking" });

  const freshChunks = await chunkProjectAsync(project);

  // Load or create the store.
  let store = load(projectId);

  // If the model changed, wipe the store — vectors from a different model
  // are not comparable.
  if (store && store.model && store.model !== resolvedModel) {
    store = null;
  }

  if (!store) {
    store = emptyStore(resolvedModel);
  }

  const { toAdd, toUpdate, toRemove } = diff(store, freshChunks);
  const chunksToEmbed = [...toAdd, ...toUpdate];

  await embedAndPersist({
    projectId,
    store,
    chunksToEmbed,
    idsToRemove: toRemove,
    client,
    model: resolvedModel,
    signal,
    onProgress,
  });
}

/**
 * Full rebuild — ignores the existing store and re-embeds every chunk.
 *
 * @param {object} [opts]
 * @param {AbortSignal} [opts.signal]
 * @param {Function}    [opts.onProgress]
 * @param {object}      [opts.provider]
 * @param {string}      [opts.model]
 */
export async function rebuildIndex({ signal, onProgress, provider, model } = {}) {
  const ai      = useAiStore();
  const project = useProjectStore();

  const resolvedProvider = resolveProvider(ai, provider);
  if (!resolvedProvider) {
    throw new Error(
      "No embedding provider configured. Open Settings → AI providers and set an embedding provider.",
    );
  }
  const resolvedModel = resolveModel(resolvedProvider, model);
  const client  = new OpenAICompatClient(resolvedProvider);
  const projectId = project.activeProjectId;

  if (onProgress) onProgress({ phase: "chunking" });

  const freshChunks = await chunkProjectAsync(project);

  // Start from a clean slate.
  const store = emptyStore(resolvedModel);

  await embedAndPersist({
    projectId,
    store,
    chunksToEmbed: freshChunks,
    idsToRemove: [],
    client,
    model: resolvedModel,
    signal,
    onProgress,
  });
}

/**
 * Remove the RAG index for the active project.
 */
export async function clearIndex() {
  const project = useProjectStore();
  clear(project.activeProjectId);
}

/**
 * Quick status summary — does NOT load the full vector data.
 *
 * @returns {{ projectId: string, exists: boolean, entryCount: number, model: string, dims: number }}
 */
export function indexStatus() {
  const project   = useProjectStore();
  const projectId = project.activeProjectId;
  const store     = load(projectId);
  if (!store) {
    return { projectId, exists: false, entryCount: 0, model: "", dims: 0 };
  }
  return {
    projectId,
    exists: true,
    entryCount: Object.keys(store.entries || {}).length,
    model: store.model || "",
    dims:  store.dims  || 0,
  };
}
