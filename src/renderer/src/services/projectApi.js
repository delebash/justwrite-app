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

import { get, put, del } from "@delebash/llm-ui";

const _snapshots = new Map(); // id -> snapshot object
let _registry = [];           // [{id,title,author,savedAt}] derived from GET /v1/projects
let _registryLoaded = false;  // did the GET /v1/projects at boot actually succeed?
let _booted = false;

const PUT_DEBOUNCE_MS = 400;
const _putTimers = new Map();

/**
 * Load the active book's snapshot into the cache. MUST be awaited (after
 * bootSettings, before mounting Vue) so the store's synchronous bootstrap can
 * read it. Resilient: on failure the store falls back to seeding/minting
 * rather than hanging. (The registry index + active-id pointer stay in kv.)
 */
export async function bootProjects(activeId) {
  if (_booted) return;
  // The registry is derived from the projects table — pull the list first so
  // the store's synchronous bootstrap can read it (and fall back to the most
  // recent project when the active-id pointer is missing).
  try {
    const list = await get("/v1/projects");
    if (Array.isArray(list)) {
      _registry = list.map((p) => ({ id: p.id, title: p.title, author: p.author, savedAt: p.updatedAt }));
      _registryLoaded = true;
    }
  } catch (err) {
    console.error("projectApi.bootProjects registry failed:", err);
  }
  if (activeId) {
    try {
      const snap = await get(`/v1/projects/${activeId}/book`);
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

/** Sync read of the project registry (derived from the projects table at boot).
 *  [{ id, title, author, savedAt }], most-recently-updated first. */
export function listRegistry() {
  return _registry.map((p) => ({ ...p }));
}

/** Whether GET /v1/projects actually succeeded at boot. False means the server
 *  was unreachable — callers must NOT infer "project absent" from an empty
 *  registry (it could just be a failed fetch). */
export function isRegistryLoaded() {
  return _registryLoaded;
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
  return put(`/v1/projects/${id}/book`, snap, { keepalive: true }).catch((err) =>
    console.error("projectApi PUT failed:", err),
  );
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
  // Deletes the project row; child rows cascade via the project_id FK. The
  // derived registry drops it automatically on the next boot.
  del(`/v1/projects/${id}`).catch(() => {});
}

/** Async load for switching to a project not already in the cache. */
export async function fetchSnapshot(id) {
  if (_snapshots.has(id)) return _snapshots.get(id);
  try {
    const snap = await get(`/v1/projects/${id}/book`);
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
