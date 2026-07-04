// RAG indexer — chunk, diff, embed, persist to the server (/v1/rag).
//
// buildOrUpdateIndex({ signal, onProgress, provider, model })
//   Incremental: embeds only new/changed chunks (diffed against the server's
//   shas map); removes stale ones.
// rebuildIndex(...)   Full: clears the server index and re-embeds every chunk.
// clearIndex()        Drops the server index for the active project.
// indexStatus()       async — { projectId, exists, entryCount, model, dims }.

import { useAiStore } from "../../stores/ai.js";
import { useProjectStore } from "../../stores/project.js";
import { friendlyAiError } from "../aiErrors.js";
import { embedTexts } from "../embedApi.js";
import { chunkProjectAsync } from "./chunker.js";
import { clear, diff, putVectors, removeIds, shas, status } from "./vectorStore.js";

// How many chunks to embed per API call.
const EMBED_BATCH_SIZE = 16;

// Thrown when the resolved embedding model differs from the model the index
// was built with. Vectors from different models aren't comparable, so the
// only safe options are switch back, or rebuildIndex() to re-embed.
export class IndexModelMismatchError extends Error {
  constructor(currentModel, targetModel) {
    super(
      `The index was built with "${currentModel || "(unknown)"}" but the embedding ` +
      `provider is now set to "${targetModel || "(unknown)"}". Hit Rebuild to ` +
      `re-embed everything against the new model, or switch the embedding ` +
      `provider back to keep the existing index.`,
    );
    this.name = "IndexModelMismatchError";
    this.currentModel = currentModel;
    this.targetModel = targetModel;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function resolveProvider(ai, override) {
  return override || ai.embeddingProvider;
}

// Routing override (AI ▸ Features → Default embedding) wins, then the provider's
// own embeddingModel — via the store's single resolution rule.
function resolveModel(ai, provider, override) {
  return override || ai.embeddingModelFor(provider);
}

/**
 * Core loop shared by build + rebuild. Embeds `chunksToEmbed` in batches and
 * PUTs each batch to the server; removes `idsToRemove` first.
 */
async function embedAndPersist({
  projectId, model, chunksToEmbed, idsToRemove, provider, signal, onProgress,
}) {
  if (idsToRemove.length) await removeIds(projectId, idsToRemove);

  const total = chunksToEmbed.length;
  for (let batchStart = 0; batchStart < total; batchStart += EMBED_BATCH_SIZE) {
    if (signal?.aborted) break;
    const batch = chunksToEmbed.slice(batchStart, batchStart + EMBED_BATCH_SIZE);

    let vectors;
    try {
      vectors = await embedTexts({
        providerId: provider.id, providerType: provider.providerType,
        input: batch.map((c) => c.text), model, signal,
      });
    } catch (err) {
      throw friendlyAiError(err, provider);
    }
    if (!Array.isArray(vectors) || vectors.length !== batch.length) {
      throw new Error("Embeddings response length didn't match the batch size.");
    }

    const items = batch.map((chunk, i) => ({
      chunkId: chunk.id, sha: chunk.sha, vector: vectors[i], chunk,
    }));
    await putVectors(projectId, model, items);

    if (onProgress) {
      for (let i = 0; i < batch.length; i++) {
        onProgress({ phase: "embedding", index: batchStart + i + 1, total, chunk: batch[i] });
      }
    }
  }
  if (onProgress) onProgress({ phase: "done" });
}

// ─── Public API ───────────────────────────────────────────────────────────

/** Incremental build — embeds new/changed chunks, removes deleted ones. */
export async function buildOrUpdateIndex({ signal, onProgress, provider, model } = {}) {
  const ai = useAiStore();
  const project = useProjectStore();

  const resolvedProvider = resolveProvider(ai, provider);
  if (!resolvedProvider) {
    throw new Error("No embedding provider configured. Open Settings → AI providers and set an embedding provider.");
  }
  const resolvedModel = resolveModel(ai, resolvedProvider, model);
  const projectId = project.activeProjectId;

  if (onProgress) onProgress({ phase: "chunking" });
  const freshChunks = await chunkProjectAsync(project);

  // Refuse to silently mix models — the user must switch back or Rebuild.
  const st = await status(projectId);
  if (st.exists && st.model && st.model !== resolvedModel) {
    throw new IndexModelMismatchError(st.model, resolvedModel);
  }

  const shasMap = await shas(projectId);
  const { toAdd, toUpdate, toRemove } = diff(shasMap, freshChunks);

  await embedAndPersist({
    projectId, model: resolvedModel,
    chunksToEmbed: [...toAdd, ...toUpdate], idsToRemove: toRemove,
    provider: resolvedProvider, signal, onProgress,
  });
}

/** Full rebuild — clears the server index and re-embeds every chunk. */
export async function rebuildIndex({ signal, onProgress, provider, model } = {}) {
  const ai = useAiStore();
  const project = useProjectStore();

  const resolvedProvider = resolveProvider(ai, provider);
  if (!resolvedProvider) {
    throw new Error("No embedding provider configured. Open Settings → AI providers and set an embedding provider.");
  }
  const resolvedModel = resolveModel(ai, resolvedProvider, model);
  const projectId = project.activeProjectId;

  if (onProgress) onProgress({ phase: "chunking" });
  const freshChunks = await chunkProjectAsync(project);

  await clear(projectId);
  await embedAndPersist({
    projectId, model: resolvedModel,
    chunksToEmbed: freshChunks, idsToRemove: [],
    provider: resolvedProvider, signal, onProgress,
  });
}

/** Remove the RAG index for the active project. */
export async function clearIndex() {
  const project = useProjectStore();
  await clear(project.activeProjectId);
}

/** Quick status summary (async — queries the server). */
export async function indexStatus() {
  const project = useProjectStore();
  const projectId = project.activeProjectId;
  try {
    const st = await status(projectId);
    return { projectId, exists: st.exists, entryCount: st.count, model: st.model || "", dims: st.dims || 0 };
  } catch {
    return { projectId, exists: false, entryCount: 0, model: "", dims: 0 };
  }
}
