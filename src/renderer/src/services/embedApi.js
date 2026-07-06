// Client for the shared embeddings endpoint (POST /v1/ai/embeddings). The server
// holds the key + the live registry adapter; we pass the embedding provider id
// (the routing default) + model. Returns one vector per input, in order.
// HTTP via the shared kit transport.
//
// P3 (co-resident embeddings): when the embedding provider is the bundled
// llama.cpp runner, the embed model must be RESIDENT before we call it — the
// embed request goes straight to the router (:8080/v1/embeddings), not through
// the runner service, so a not-yet-loaded model would just fail. So the FIRST
// time we embed against the bundled runner we lazily download + load + PIN the
// embed (POST /v1/llm-runner/ensure-embedding) and wait for it to go resident.
// Cloud/Ollama providers are untouched; JustVoice (no embeddings) never hits this.

import { get, post } from "@delebash/llm-ui";

const BUNDLED_RUNNER_PROVIDER = "local-llamacpp";
// Router lifecycle words that mean "the child will answer an embed request now":
// `loaded` = in VRAM; `sleeping` = idle-unloaded but reloads on the next request
// (parity with the runner's own _confirm_load, which accepts both).
const READY_STATES = new Set(["loaded", "sleeping"]);
const POLL_INTERVAL_MS = 1000;
// Headroom for a cold first run: the ~100 MB nomic GGUF fetch + the child spawn.
const POLL_TIMEOUT_MS = 180000;

// One in-flight/succeeded ensure, shared across a burst of embed calls (an index
// build is many batches) so we download+load+pin ONCE per session. Cleared on a
// real (non-abort) embed failure so a crashed router self-heals on the next try.
let _ensurePromise = null;

/** Test/reset hook — drop the cached ensure so the next embed re-prepares. */
export function _resetEnsureCache() {
  _ensurePromise = null;
}

function isAbort(e) {
  return e?.name === "AbortError" || /abort/i.test(e?.message || "");
}

async function pollEmbedResident(modelId, signal) {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  for (;;) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    let resident = null;
    try {
      resident = await get("/v1/llm-runner/resident", { signal });
    } catch (err) {
      if (isAbort(err)) throw err;
      // A transient GET failure isn't a load failure — keep polling to the deadline.
    }
    const row = resident?.models?.find((m) => m.id === modelId);
    if (row) {
      if (READY_STATES.has(row.status)) return;
      if (row.status === "error" || row.status === "failed") {
        throw new Error(
          `The local embedding model "${modelId}" failed to load. Open Settings → AI → ` +
          `Built-in engine to see the model log, then try again.`,
        );
      }
    }
    if (Date.now() > deadline) {
      throw new Error(
        `Timed out preparing the local embedding model "${modelId}". It may still be ` +
        `downloading — try again in a moment.`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

/**
 * Lazy P3 prep: when `providerType` is the bundled llama.cpp runner, make its
 * pinned co-resident embed model resident (download-if-needed + load + pin)
 * BEFORE the embed request. A no-op Promise for cloud/Ollama providers.
 * Idempotent within a session (the ensure is cached; the runner's own load is
 * idempotent when the model is already resident).
 */
export function ensureEmbeddingReady(providerId, providerType, { signal } = {}) {
  if (providerType !== BUNDLED_RUNNER_PROVIDER) return Promise.resolve();
  // One shared ensure across a burst of embed calls (an index build is many batches → one
  // download/load/pin). Tradeoff: the shared promise binds to the FIRST caller's `signal`, so if
  // that op is cancelled mid-ensure, a second concurrent op awaiting the same promise sees its
  // AbortError. Benign in JW — RAG embed ops are effectively sequential, and the `.catch` below
  // nulls the cache so the next attempt re-ensures cleanly. Revisit if truly-concurrent RAG lands.
  if (!_ensurePromise) {
    _ensurePromise = (async () => {
      const res = await post("/v1/llm-runner/ensure-embedding", {}, { signal });
      // ok:false → no local embed configured (routing points elsewhere); nothing to wait for.
      if (!res?.ok || !res.modelId) return;
      await pollEmbedResident(res.modelId, signal);
    })().catch((err) => {
      _ensurePromise = null; // let the next attempt retry (download/load may just need a nudge)
      throw err;
    });
  }
  return _ensurePromise;
}

export async function embedTexts({ providerId, providerType, model, input, signal } = {}) {
  if (!providerId) throw new Error("embed: providerId is required.");
  if (input == null) throw new Error("embed: input is required.");
  const arr = Array.isArray(input) ? input : [input];
  if (!arr.length) return [];
  // Make the bundled runner's pinned embed resident before we call it (no-op otherwise).
  await ensureEmbeddingReady(providerId, providerType, { signal });
  let json;
  try {
    json = await post(
      "/v1/ai/embeddings",
      { providerId, model: model || "", input: arr },
      { signal },
    );
  } catch (err) {
    // A real embed failure (NOT a user abort) can mean the pinned local embed's router
    // died — drop the cached "ready" so the next attempt re-ensures (respawn + reload).
    if (!isAbort(err)) _resetEnsureCache();
    throw err;
  }
  return Array.isArray(json?.embeddings) ? json.embeddings.filter(Array.isArray) : [];
}
