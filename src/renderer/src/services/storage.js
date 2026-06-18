// Storage adapter — backs the renderer's localStorage-shaped store with the
// JustWrite server's /v1/kv table (SQLite) instead of IndexedDB.
//
// Why a sync API over a network store: Pinia state initialisers run at
// module-import time (`state: () => ({ ...load() })`), so we can't await in
// there. bootStorage() bulk-loads every `justwrite:*` key into an in-memory
// `cache` once at app boot (before Vue mounts); the sync getters serve from
// that cache. Writes update the cache immediately and queue a per-key
// debounced PUT/DELETE so a typing session doesn't hammer the server.
//
// P1 of the server migration (docs/plans/2026-06-18-jw-server-migration.md).
// The renderer still writes a whole-project snapshot blob under one key here;
// P2 normalizes it into per-entity rows. Until then, a hard window-close can
// drop the very last edit if its 50ms-debounced write hasn't flushed —
// `keepalive` covers small keys on unload, the desktop shell flushes on
// close, and P2's incremental writes remove the large-blob case entirely.
//
// Public API (unchanged from the IndexedDB version):
//   getItem(key)        → string | null      (sync, cache-backed)
//   setItem(key, val)   → void               (sync; queues a debounced PUT)
//   removeItem(key)     → void               (sync; queues a debounced DELETE)
//   listKeys(prefix?)   → string[]           (sync, cache-backed)
//   clearPrefix(prefix) → Promise<void>
//   flushPending()      → Promise            (await pending writes)
//   bootStorage()       → Promise<void>      (await before mounting Vue)

import { serverUrl } from "./serverApi.js";

const PREFIX = "justwrite:";

// Synchronous shadow of every justwrite:* key. Populated by bootStorage().
const cache = new Map();
let booted = false;

// Per-key debounce timers so a burst of writes from the typing path
// collapses into one server call ~50ms after the last edit.
const writeTimers = new Map();
const WRITE_DEBOUNCE_MS = 50;

// JustWrite keys are colon-delimited (`justwrite:project`) with no slashes or
// spaces, so they're safe unencoded in a path segment. (Encoding the colon to
// %3A would depend on the server decoding it back; raw is verified to work.)
function kvUrl(key) {
  return serverUrl(`/v1/kv/${key}`);
}

// Flush one key's pending write to the server. Returns the in-flight promise
// so callers (tests, explicit flushes) can await it; the unload handler
// ignores the return. `keepalive` lets small writes complete during unload.
function flushKey(key) {
  if (!writeTimers.has(key)) return Promise.resolve();
  clearTimeout(writeTimers.get(key));
  writeTimers.delete(key);
  const val = cache.get(key);
  if (val === undefined) {
    return fetch(kvUrl(key), { method: "DELETE", keepalive: true }).catch(() => {});
  }
  return fetch(kvUrl(key), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ value: val }),
    keepalive: true,
  }).catch(() => {});
}

function scheduleWrite(key) {
  const existing = writeTimers.get(key);
  if (existing) clearTimeout(existing);
  writeTimers.set(key, setTimeout(() => { void flushKey(key); }, WRITE_DEBOUNCE_MS));
}

/**
 * Boot the storage layer. MUST be awaited before mounting Vue or initialising
 * any Pinia store. Bulk-loads every `justwrite:*` key from the server into the
 * in-memory cache so the synchronous getters have data to serve. Resilient:
 * on failure the app boots with an empty cache (defaults) rather than hanging.
 */
export async function bootStorage() {
  if (booted) return;
  try {
    const res = await fetch(serverUrl("/v1/kv"));
    if (res.ok) {
      const all = await res.json();
      for (const [k, v] of Object.entries(all)) {
        if (typeof k === "string" && k.startsWith(PREFIX)) cache.set(k, v);
      }
    } else {
      console.error("storage.bootStorage: server returned", res.status);
    }
  } catch (err) {
    console.error("storage.bootStorage failed:", err);
  }
  booted = true;
}

/** Synchronous read — returns null if absent (matches localStorage). */
export function getItem(key) {
  if (!cache.has(key)) return null;
  const v = cache.get(key);
  return v === undefined ? null : v;
}

/** Synchronous write. Updates the cache and queues a debounced server PUT. */
export function setItem(key, value) {
  const s = typeof value === "string" ? value : String(value);
  cache.set(key, s);
  scheduleWrite(key);
}

/** Synchronous delete. Updates the cache and queues a debounced server DELETE. */
export function removeItem(key) {
  cache.delete(key);
  scheduleWrite(key);
}

/** All cached keys (optionally filtered by prefix). */
export function listKeys(prefix = PREFIX) {
  const out = [];
  for (const k of cache.keys()) {
    if (k.startsWith(prefix)) out.push(k);
  }
  return out;
}

/** Wipe every key under `prefix`, locally and on the server. Awaitable so
 *  callers can reload immediately afterwards without losing the writes. */
export async function clearPrefix(prefix = PREFIX) {
  for (const k of listKeys(prefix)) {
    cache.delete(k);
    if (writeTimers.has(k)) { clearTimeout(writeTimers.get(k)); writeTimers.delete(k); }
  }
  try {
    await fetch(serverUrl(`/v1/kv?prefix=${encodeURIComponent(prefix)}`), { method: "DELETE" });
  } catch (err) {
    console.error("storage.clearPrefix failed:", err);
  }
}

/** Force-flush any pending debounced writes immediately. Returns a promise
 *  callers may await; the unload handlers fire it without awaiting. */
export function flushPending() {
  return Promise.allSettled([...writeTimers.keys()].map((k) => flushKey(k)));
}

// Flush pending writes on page hide so a closed tab doesn't drop the last
// ~50ms of edits. Handlers must be sync; `flushKey` uses `keepalive: true` so
// small in-flight writes survive unload.
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", flushPending);
  window.addEventListener("beforeunload", flushPending);
}
