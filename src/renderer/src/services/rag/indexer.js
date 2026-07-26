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
import { friendlyAiError, embedTexts, ensureEmbeddingReady } from "@delebash/llm-ui";
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
  const items = await embedBatches({ chunks: chunksToEmbed, model, provider, signal, onProgress });
  await putInBatches(projectId, model, items);
  if (onProgress) onProgress({ phase: "done" });
}

/**
 * Embed `chunks` in batches; returns the PUT-ready items. Pure compute — it never
 * mutates the index, so a caller can stage a FULL replacement before destroying
 * anything (the non-destructive rebuild, 2026-07-11). Stops early on abort and
 * returns what it has; the caller decides what an incomplete stage means.
 */
async function embedBatches({ chunks, model, provider, signal, onProgress }) {
  const total = chunks.length;
  const items = [];
  for (let batchStart = 0; batchStart < total; batchStart += EMBED_BATCH_SIZE) {
    if (signal?.aborted) break;
    const batch = chunks.slice(batchStart, batchStart + EMBED_BATCH_SIZE);

    let vectors;
    try {
      vectors = await embedTexts({
        providerId: provider.id, providerType: provider.providerType,
        input: batch.map((c) => c.text), model, signal,
        taskType: "document",
      });
    } catch (err) {
      throw friendlyAiError(err, provider);
    }
    if (!Array.isArray(vectors) || vectors.length !== batch.length) {
      throw new Error("Embeddings response length didn't match the batch size.");
    }

    for (let i = 0; i < batch.length; i++) {
      items.push({ chunkId: batch[i].id, sha: batch[i].sha, vector: vectors[i], chunk: batch[i] });
    }
    if (onProgress) {
      for (let i = 0; i < batch.length; i++) {
        onProgress({ phase: "embedding", index: batchStart + i + 1, total, chunk: batch[i] });
      }
    }
  }
  return items;
}

// PUT in the same batch size the embeds used — one huge body would balloon the
// request (a book of vectors is ~20 MB as JSON).
async function putInBatches(projectId, model, items) {
  for (let i = 0; i < items.length; i += EMBED_BATCH_SIZE) {
    await putVectors(projectId, model, items.slice(i, i + EMBED_BATCH_SIZE));
  }
}

// ─── Public API ───────────────────────────────────────────────────────────

/** Incremental build — embeds new/changed chunks, removes deleted ones. */
export async function buildOrUpdateIndex({ signal, onProgress, provider, model } = {}) {
  const ai = useAiStore();
  const project = useProjectStore();

  // Self-heal a failed routing boot fetch before resolving (2026-07-11).
  if (!provider) await ai.ensureEmbeddingDefaults();
  const resolvedProvider = resolveProvider(ai, provider);
  if (!resolvedProvider) {
    throw new Error("No embedding provider configured. Open AI Settings and set an embedding provider.");
  }
  const resolvedModel = resolveModel(ai, resolvedProvider, model);
  if (!resolvedModel) {
    // No embedding MODEL chosen (a fresh workspace ships the catalog full and every
    // selection empty, by design). Say THAT — the old path went ahead and embedded
    // into a provider with no model, and the user got "Bad gateway" (2026-07-26).
    throw new Error("No embedding model is set yet. Open AI Settings and choose one (Quick Setup picks it for you).");
  }
  // Make the bundled runner RESIDENT before the first batch (2026-07-26). The kit's
  // ensure exists for exactly this and JW never called it: on a cold boot nothing has
  // spawned the engine, so batch 1 hit a dead port and surfaced as "Bad gateway — the
  // provider's upstream is unreachable". It is a no-op for cloud/BYO providers, and it
  // registers a visible "Preparing the embedding model" task so a minutes-long first
  // load reads as progress instead of a hang.
  await ensureEmbeddingReady(resolvedProvider.id, resolvedProvider.type, { signal, model: resolvedModel });
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

  // Self-heal a failed routing boot fetch before resolving (2026-07-11).
  if (!provider) await ai.ensureEmbeddingDefaults();
  const resolvedProvider = resolveProvider(ai, provider);
  if (!resolvedProvider) {
    throw new Error("No embedding provider configured. Open AI Settings and set an embedding provider.");
  }
  const resolvedModel = resolveModel(ai, resolvedProvider, model);
  if (!resolvedModel) {
    // No embedding MODEL chosen (a fresh workspace ships the catalog full and every
    // selection empty, by design). Say THAT — the old path went ahead and embedded
    // into a provider with no model, and the user got "Bad gateway" (2026-07-26).
    throw new Error("No embedding model is set yet. Open AI Settings and choose one (Quick Setup picks it for you).");
  }
  // Make the bundled runner RESIDENT before the first batch (2026-07-26). The kit's
  // ensure exists for exactly this and JW never called it: on a cold boot nothing has
  // spawned the engine, so batch 1 hit a dead port and surfaced as "Bad gateway — the
  // provider's upstream is unreachable". It is a no-op for cloud/BYO providers, and it
  // registers a visible "Preparing the embedding model" task so a minutes-long first
  // load reads as progress instead of a hang.
  await ensureEmbeddingReady(resolvedProvider.id, resolvedProvider.type, { signal, model: resolvedModel });
  const projectId = project.activeProjectId;

  if (onProgress) onProgress({ phase: "chunking" });
  const freshChunks = await chunkProjectAsync(project);

  // Stage the WHOLE replacement first; clear only once every chunk embedded
  // (2026-07-11). The old clear-then-embed order destroyed the index whenever
  // the embed leg failed mid-build — a crashed local model cost the user their
  // 77-scene index — and a mid-build Cancel did the same. Now a failure or
  // cancel anywhere during embedding leaves the existing index untouched.
  const items = await embedBatches({
    chunks: freshChunks, model: resolvedModel,
    provider: resolvedProvider, signal, onProgress,
  });
  if (signal?.aborted) {
    if (onProgress) onProgress({ phase: "done" });
    return; // cancelled mid-embed → the existing index stays as it was
  }
  await clear(projectId);
  await putInBatches(projectId, resolvedModel, items);
  if (onProgress) onProgress({ phase: "done" });
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
