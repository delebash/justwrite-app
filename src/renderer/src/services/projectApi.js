// Client for the JustWrite book domain API (/v1/projects). Mirrors storage.js's
// sync-cache + debounced-write pattern so the project store's SYNCHRONOUS
// bootstrap (the Pinia state factory) keeps working: hydrateProjects() bulk-
// loads the registry + the active book into an in-memory cache before Vue
// mounts; the store's sync loaders serve from it; saves debounce a PUT.
//
// This replaces the kv blob (justwrite:project:<id>) for project snapshots —
// books now live in the server's NORMALIZED tables (parts/chapters/scenes/
// characters/…) and are assembled/decomposed through the aggregate book
// endpoint: GET /v1/projects/{id}/book returns the whole book as JSON, PUT
// /v1/projects/{id}/book decomposes a snapshot into the tables. (Legacy blobs
// are migrated server-side at startup.) The active-id pointer + undo tail stay
// in kv (storage.js).

import { serverUrl } from "./serverApi.js";

const _snapshots = new Map(); // id -> snapshot object
let _booted = false;

const PUT_DEBOUNCE_MS = 400;
const _putTimers = new Map();

async function _fetchJson(path, opts) {
  const res = await fetch(serverUrl(path), opts);
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.status === 204 ? null : res.json();
}

/**
 * Load the active book's snapshot into the cache. MUST be awaited (after
 * bootStorage, before mounting Vue) so the store's synchronous bootstrap can
 * read it. Resilient: on failure the store falls back to seeding/minting
 * rather than hanging. (The registry index + active-id pointer stay in kv.)
 */
export async function bootProjects(activeId) {
  if (_booted) return;
  if (activeId) {
    try {
      const snap = await _fetchJson(`/v1/projects/${activeId}/book`);
      if (snap && typeof snap === "object") _snapshots.set(activeId, snap);
    } catch (err) {
      // 404 is normal for a freshly-minted, never-saved active id.
      if (!String(err.message).includes("404")) {
        console.error("projectApi.bootProjects failed:", err);
      }
    }
  }
  _booted = true;
}

/** Sync read from the cache (null if not loaded). */
export function getSnapshot(id) {
  return _snapshots.get(id) || null;
}

function _flushPut(id) {
  if (!_putTimers.has(id)) return Promise.resolve();
  clearTimeout(_putTimers.get(id));
  _putTimers.delete(id);
  const snap = _snapshots.get(id);
  if (snap === undefined) return Promise.resolve();
  return fetch(serverUrl(`/v1/projects/${id}/book`), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(snap),
    keepalive: true,
  }).catch((err) => console.error("projectApi PUT failed:", err));
}

/** Cache the snapshot synchronously, queue a debounced PUT. */
export function putSnapshot(id, snap) {
  _snapshots.set(id, snap);
  if (_putTimers.has(id)) clearTimeout(_putTimers.get(id));
  _putTimers.set(id, setTimeout(() => { void _flushPut(id); }, PUT_DEBOUNCE_MS));
}

export function removeProject(id) {
  _snapshots.delete(id);
  if (_putTimers.has(id)) { clearTimeout(_putTimers.get(id)); _putTimers.delete(id); }
  // Deletes the project row; child rows cascade via the project_id FK. (The
  // registry index lives in kv and is maintained by the store, not here.)
  fetch(serverUrl(`/v1/projects/${id}`), { method: "DELETE" }).catch(() => {});
}

/** Async load for switching to a project not already in the cache. */
export async function fetchSnapshot(id) {
  if (_snapshots.has(id)) return _snapshots.get(id);
  try {
    const snap = await _fetchJson(`/v1/projects/${id}/book`);
    if (snap && typeof snap === "object") {
      _snapshots.set(id, snap);
      return snap;
    }
  } catch (err) {
    console.error("projectApi.fetchSnapshot failed:", err);
  }
  return null;
}

export function flushPendingProjects() {
  return Promise.allSettled([..._putTimers.keys()].map((id) => _flushPut(id)));
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", flushPendingProjects);
  window.addEventListener("beforeunload", flushPendingProjects);
}
