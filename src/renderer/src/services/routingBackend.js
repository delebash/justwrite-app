// RoutingBackend — JustWrite's client for the SHARED routing router
// (/v1/ai/routing, llm_runner.llm.routing_api) — the same surface the shared
// @delebash/llm-ui Features tab uses. Routing (default provider/embedding +
// per-feature pins) lives in real server tables now, NOT the `ai` settings blob;
// this is how the renderer's AI store reads/writes it.
//
// A synchronous boot cache lets the AI store's bootstrap read the default + pins
// before Vue mounts (mirrors providerBackend). `putRoutingPrefs` MERGES the
// store's fields with the cached Quick/Accuracy roles — those are owned by the
// Features tab, and the AI store doesn't track them, so a write here must never
// wipe them.

import { get, put } from "@delebash/llm-ui";

let _routing = null; // full RoutingResponse { default, quick, accuracy, features }
let _booted = false;

/**
 * Pull the routing config into the cache. MUST be awaited (after bootProviders,
 * before mounting Vue) so the AI store's synchronous bootstrap can read it.
 */
export async function bootRouting() {
  if (_booted) return;
  try {
    const data = await get("/v1/ai/routing");
    if (data && typeof data === "object") _routing = data;
  } catch (err) {
    console.error("routingBackend.bootRouting failed:", err);
  }
  _booted = true;
}

/** Sync read for the AI store's bootstrap, mapped to the store's shape:
 *  { defaultLlmId, defaultEmbeddingId, featurePins } — or null if boot failed.
 *  featurePins carries only the features that actually route somewhere. */
export function getRoutingPrefs() {
  if (!_routing) return null;
  const featurePins = {};
  for (const f of _routing.features || []) {
    if (f.providerId || f.role) {
      featurePins[f.key] = { providerId: f.providerId || "", model: f.model || "", role: f.role || "" };
    }
  }
  return {
    defaultLlmId: _routing.default?.llmId || "",
    defaultEmbeddingId: _routing.default?.embeddingId || "",
    featurePins,
  };
}

/** Persist default + feature pins via PUT /v1/ai/routing. Merges the cached
 *  Quick/Accuracy roles so this write never clobbers them. Refreshes the cache
 *  from the server's authoritative response. */
export async function putRoutingPrefs({ defaultLlmId, defaultEmbeddingId, featurePins }) {
  const cached = _routing || {};
  const pins = {};
  for (const [key, v] of Object.entries(featurePins || {})) {
    if (v && (v.providerId || v.role)) {
      pins[key] = { providerId: v.providerId || "", model: v.model || "", role: v.role || "" };
    }
  }
  const body = {
    default: { llmId: defaultLlmId || "", embeddingId: defaultEmbeddingId || "" },
    quick: { providerId: cached.quick?.providerId || "", model: cached.quick?.model || "" },
    accuracy: { providerId: cached.accuracy?.providerId || "", model: cached.accuracy?.model || "" },
    pins,
  };
  try {
    const data = await put("/v1/ai/routing", body);
    if (data) _routing = data; // refresh cache (authoritative)
  } catch (err) {
    console.error("routingBackend.putRoutingPrefs failed:", err);
  }
}
