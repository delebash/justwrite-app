// Settings document — the renderer's preferences, server-backed (SQL via
// /v1/settings), NOT IndexedDB. bootSettings() pulls the whole document into an
// in-memory copy once before mount so Pinia stores can read their section
// synchronously in `state: () => ({...})`; writeSetting updates that copy and
// queues a debounced PATCH carrying just the changed section. Replaces the
// per-key justwrite:ui / justwrite:ai / justwrite:hardwarePresets kv reads.

import { getSettings, patchSettings, deleteSettings } from "./settingsApi.js";

// The settings document, populated by bootSettings(). Each top-level key is a
// section owned by one store (ui / ai / hardwarePresets / activeProjectId / …).
let _doc = {};

// Per-section debounce so a burst of edits (typing a hue, dragging a slider)
// collapses into one PATCH ~150ms after the last change.
const _timers = new Map();
const PATCH_DEBOUNCE_MS = 150;

/**
 * Boot the settings layer. MUST be awaited before mounting Vue / initialising
 * any store that reads settings. Resilient: on failure the app boots with an
 * empty document (defaults) rather than hanging.
 */
export async function bootSettings() {
  try {
    const doc = await getSettings();
    _doc = doc && typeof doc === "object" ? doc : {};
  } catch (err) {
    console.error("bootSettings failed:", err);
    _doc = {};
  }
}

/** Read a section's value, or undefined if unset. Returned by reference — the
 *  caller spreads/clones before mutating (the stores already do). */
export function readSetting(key) {
  return _doc[key];
}

/** Write a section wholesale: update the in-memory document and queue a
 *  debounced PATCH carrying just this section. */
export function writeSetting(key, value) {
  _doc[key] = value;
  const existing = _timers.get(key);
  if (existing) clearTimeout(existing);
  _timers.set(key, setTimeout(() => {
    _timers.delete(key);
    patchSettings({ [key]: value });
  }, PATCH_DEBOUNCE_MS));
}

/** A deep copy of the whole settings document — for the backup bundle. */
export function getAllSettings() {
  return JSON.parse(JSON.stringify(_doc));
}

/** Apply a settings document wholesale (restoring a backup): write every
 *  section through so each persists and the in-memory copy updates. */
export function applySettings(doc) {
  if (!doc || typeof doc !== "object") return;
  for (const [key, value] of Object.entries(doc)) writeSetting(key, value);
}

/** Force-flush any pending debounced section writes immediately. Awaitable;
 *  the unload handlers fire it without awaiting. */
export function flushSettings() {
  const keys = [..._timers.keys()];
  if (!keys.length) return Promise.resolve();
  const patch = {};
  for (const k of keys) {
    clearTimeout(_timers.get(k));
    _timers.delete(k);
    patch[k] = _doc[k];
  }
  return patchSettings(patch);
}

/** Wipe the whole settings document (reset workspace), locally and on the
 *  server. Awaitable so callers can reload right after. */
export async function clearSettings() {
  for (const t of _timers.values()) clearTimeout(t);
  _timers.clear();
  _doc = {};
  await deleteSettings();
}

// Flush pending writes on page hide so a closed tab doesn't drop the last
// ~150ms of settings edits. patchSettings uses keepalive so the in-flight PATCH
// survives unload.
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", flushSettings);
  window.addEventListener("beforeunload", flushSettings);
}
