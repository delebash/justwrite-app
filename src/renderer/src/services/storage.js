// Storage adapter — swaps localStorage for IndexedDB while keeping the
// synchronous read/write shape every store was written against.
//
// Why a sync API over an async store: Pinia state initialisers run at
// module-import time (`state: () => ({ ...load() })`), so we can't await
// in there. We hydrate every `justwrite:*` key from IDB into an
// in-memory `cache` once at app boot, before Vue mounts, then back the
// sync getters with that cache. Writes update the cache immediately and
// queue a per-key debounced write to IDB so a typing session doesn't
// hammer the disk.
//
// API mirrors `localStorage`:
//   getItem(key)       → string | null
//   setItem(key, val)  → void
//   removeItem(key)    → void
//
// All other behaviours (Object.keys(localStorage), iteration) are
// replaced by:
//   listKeys(prefix?)        → string[]    (synchronous, cache-backed)
//   clearPrefix(prefix)      → Promise<void>

import { createStore, get, set, del, keys as idbKeys } from "idb-keyval";

const PREFIX = "justwrite:";

// Dedicated IDB database + object store so we don't share scope with any
// other consumer in the same origin.
const store = createStore("justwrite", "kv");

// Synchronous shadow of every justwrite:* key. Populated by bootStorage().
const cache = new Map();
let booted = false;

// Per-key debounce timers so a burst of writes from the typing path
// collapses into one IDB call ~50ms after the last edit.
const writeTimers = new Map();
const WRITE_DEBOUNCE_MS = 50;

function flushKey(key) {
  if (!writeTimers.has(key)) return;
  clearTimeout(writeTimers.get(key));
  writeTimers.delete(key);
  const val = cache.get(key);
  if (val === undefined) {
    void del(key, store);
  } else {
    void set(key, val, store);
  }
}

function scheduleWrite(key) {
  const existing = writeTimers.get(key);
  if (existing) clearTimeout(existing);
  writeTimers.set(key, setTimeout(() => flushKey(key), WRITE_DEBOUNCE_MS));
}

/**
 * Boot the storage layer. MUST be awaited before mounting Vue or
 * initialising any Pinia store. Hydrates the in-memory cache from IDB
 * so the synchronous getters have data to serve.
 */
export async function bootStorage() {
  if (booted) return;

  try {
    const ks = await idbKeys(store);
    for (const k of ks) {
      if (typeof k !== "string" || !k.startsWith(PREFIX)) continue;
      cache.set(k, await get(k, store));
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

/** Synchronous write. Updates the cache and queues a debounced IDB flush. */
export function setItem(key, value) {
  const s = typeof value === "string" ? value : String(value);
  cache.set(key, s);
  scheduleWrite(key);
}

/** Synchronous delete. */
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

/** Wipe every key under `prefix`. Awaits the IDB delete so callers can
 *  reload immediately afterwards without losing the writes. */
export async function clearPrefix(prefix = PREFIX) {
  const ks = listKeys(prefix);
  for (const k of ks) {
    cache.delete(k);
    if (writeTimers.has(k)) { clearTimeout(writeTimers.get(k)); writeTimers.delete(k); }
    await del(k, store);
  }
  // Belt and braces — sweep IDB directly in case the cache missed a key
  // (e.g. one written by a different tab between hydration and reset).
  try {
    const allKs = await idbKeys(store);
    for (const k of allKs) {
      if (typeof k === "string" && k.startsWith(prefix)) await del(k, store);
    }
  } catch {}
}

/** Force-flush any pending debounced writes immediately. Useful before
 *  navigation/reload paths where we can't wait for the next timer tick. */
export function flushPending() {
  for (const k of [...writeTimers.keys()]) flushKey(k);
}

// Flush pending writes on page hide so a closed tab doesn't drop the
// last 50ms of edits. Doesn't await — pagehide handlers must be sync —
// but the IDB set() call inside flushKey() will run to completion
// because IDB writes survive page-unload.
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", flushPending);
  window.addEventListener("beforeunload", flushPending);
}
