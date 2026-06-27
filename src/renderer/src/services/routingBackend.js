// RoutingBackend — JustWrite's client for the SHARED routing router
// (/v1/ai/routing, llm_runner.llm.routing_api) — the same surface the shared
// @delebash/llm-ui "Routing by job" tab + Feature Workbench use. The full routing
// config (the default provider/embedding, the per-JOB model routes, and the
// explicit per-feature/per-action pins) lives in real server tables now, NOT the
// `ai` settings blob; this is how the renderer's AI store reads/writes it.
//
// A synchronous boot cache lets the AI store's bootstrap read the default + pins
// before Vue mounts (mirrors providerBackend). The AI store only TRACKS the
// default LLM/embedding + the per-feature pins — it does NOT track the per-job
// routes (`jobs`) or any action-keyed pins the shared Workbench can set. So a
// write here MUST merge back everything the store doesn't own: the server's
// `set_routing` deletes+rebuilds ALL job_routes and routing_pins from the PUT
// body, so omitting `jobs` (or dropping untracked pins) would silently WIPE
// them. `putRoutingPrefs` therefore carries the cached `jobs` + `pins` through
// untouched and only overlays the store's tracked feature pins.

import { get, put } from "@delebash/llm-ui";

let _routing = null; // full RoutingResponse { default, jobs, features, pins }
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

/**
 * Re-pull routing from the server into the cache (the shared Routing tabs write
 * routing directly, bypassing this cache). Awaited by the AI store's resync so
 * the renderer picks up default LLM/embedding + model + pin changes in-session.
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
 *  { defaultLlmId, defaultEmbeddingId, featurePins } — or null if boot failed.
 *  featurePins carries only the features that actually route somewhere. */
export function getRoutingPrefs() {
  if (!_routing) return null;
  const featurePins = {};
  for (const f of _routing.features || []) {
    if (f.providerId) {
      featurePins[f.key] = { providerId: f.providerId || "", model: f.model || "" };
    }
  }
  return {
    defaultLlmId: _routing.default?.llmId || "",
    defaultModel: _routing.default?.model || "",
    defaultEmbeddingId: _routing.default?.embeddingId || "",
    defaultEmbeddingModel: _routing.default?.embeddingModel || "",
    featurePins,
  };
}

/** Persist default + feature pins via PUT /v1/ai/routing. MERGES the cached
 *  per-job routes (`jobs`) and any untracked pins (e.g. the Workbench's
 *  action-keyed pins) back into the body so a JW save never clobbers what it
 *  doesn't own — the server rebuilds job_routes + routing_pins from the body,
 *  so omitting them would wipe them. Refreshes the cache from the server's
 *  authoritative response. */
export async function putRoutingPrefs({
  defaultLlmId, defaultModel, defaultEmbeddingId, defaultEmbeddingModel, featurePins,
}) {
  const cached = _routing || {};
  const cd = cached.default || {};
  // Start from the cached pins so action-keyed / untracked pins survive, then
  // overlay the store's tracked feature pins (set when pinned, delete when the
  // store says "inherit" → null/empty).
  const pins = { ...(cached.pins || {}) };
  for (const [key, v] of Object.entries(featurePins || {})) {
    if (v && v.providerId) pins[key] = { providerId: v.providerId || "", model: v.model || "" };
    else delete pins[key];
  }
  // MERGE the default object with the cache: the AI store tracks only the
  // provider ids + the embedding model, so a `??` fallback preserves the
  // Default-LLM model (and any field this caller doesn't pass) that the shared
  // Routing tab set — otherwise a JW-side save here would silently wipe it.
  // `jobs` is carried through verbatim — the store never edits per-job routes.
  const body = {
    default: {
      llmId: defaultLlmId ?? cd.llmId ?? "",
      model: defaultModel ?? cd.model ?? "",
      embeddingId: defaultEmbeddingId ?? cd.embeddingId ?? "",
      embeddingModel: defaultEmbeddingModel ?? cd.embeddingModel ?? "",
    },
    jobs: cached.jobs || {},
    pins,
  };
  try {
    const data = await put("/v1/ai/routing", body);
    if (data) _routing = data; // refresh cache (authoritative)
  } catch (err) {
    console.error("routingBackend.putRoutingPrefs failed:", err);
  }
}
