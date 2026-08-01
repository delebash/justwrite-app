// RoutingBackend — JustWrite's client for the SHARED routing router
// (/v1/ai/routing, llm_runner.llm.routing_api) — the same surface the shared
// @delebash/llm-ui views use. The routing config on the CURRENT wire
// (llm_runner RoutingConfig) is `{ default }`: the global default
// LLM/embedding. Pins left the wire in the 2026-07-15 one-source rewrite —
// each action routes via its preset ref now (the per-JOB routes left even
// earlier; nothing named `jobs` or `pins` exists on the wire anymore).
//
// A synchronous boot cache lets the AI store's bootstrap read the default
// before Vue mounts (mirrors providerBackend).

import { get, put } from "@delebash/llm-ui";

let _routing = null; // full RoutingResponse { default, features }
let _booted = false;

/**
 * Pull the routing config into the cache. MUST be awaited (after bootProviders,
 * before mounting Vue) so the AI store's synchronous bootstrap can read it.
 */
export async function bootRouting() {
  if (_booted) return;
  // A cold app boot can race the server's own seeding/migration — one failed GET
  // here left the whole session on the legacy fallback ids and broke embeddings
  // ("has no embedding model set", 2026-07-11). Retry briefly; the connection gate
  // has already verified the server answers /health.
  for (let attempt = 0; attempt < 3 && _routing === null; attempt += 1) {
    if (attempt) await new Promise((resolve) => setTimeout(resolve, 700));
    try {
      const data = await get("/v1/ai/routing");
      if (data && typeof data === "object") _routing = data;
    } catch (err) {
      console.error("routingBackend.bootRouting failed:", err);
    }
  }
  _booted = true;
}

/**
 * Re-pull routing from the server into the cache (the shared Routing tabs write
 * routing directly, bypassing this cache). Awaited by the AI store's resync so
 * the renderer picks up default LLM/embedding + model changes in-session.
 */
export async function refreshRouting() {
  try {
    const data = await get("/v1/ai/routing");
    if (data && typeof data === "object") _routing = data;
  } catch (err) {
    console.error("routingBackend.refreshRouting failed:", err);
  }
  _booted = true;
}

/** Sync read for the AI store's bootstrap, mapped to the store's shape:
 *  { defaultLlmId, defaultEmbeddingId, … } — or null if boot failed. */
export function getRoutingPrefs() {
  if (!_routing) return null;
  return {
    defaultLlmId: _routing.default?.llmId || "",
    defaultModel: _routing.default?.model || "",
    defaultEmbeddingId: _routing.default?.embeddingId || "",
    defaultEmbeddingModel: _routing.default?.embeddingModel || "",
  };
}

/** Persist the routing default via PUT /v1/ai/routing (the wire is `{default}`
 *  since the 2026-07-15 one-source rewrite — pins are gone). Refreshes the
 *  cache from the server's authoritative response. */
export async function putRoutingPrefs({
  defaultLlmId, defaultModel, defaultEmbeddingId, defaultEmbeddingModel,
}) {
  const cached = _routing || {};
  const cd = cached.default || {};
  // MERGE the default object with the cache: the AI store tracks only the
  // provider ids + the embedding model, so a `??` fallback preserves the
  // Default-LLM model (and any field this caller doesn't pass) that the shared
  // Routing tab set — otherwise a JW-side save here would silently wipe it.
  const body = {
    default: {
      llmId: defaultLlmId ?? cd.llmId ?? "",
      model: defaultModel ?? cd.model ?? "",
      embeddingId: defaultEmbeddingId ?? cd.embeddingId ?? "",
      embeddingModel: defaultEmbeddingModel ?? cd.embeddingModel ?? "",
    },
  };
  try {
    const data = await put("/v1/ai/routing", body);
    if (data) _routing = data; // refresh cache (authoritative)
  } catch (err) {
    console.error("routingBackend.putRoutingPrefs failed:", err);
  }
}
