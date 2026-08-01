// Client for the server-owned disk autosave (/v1/projects/*/autosave). The
// renderer already PUTs each snapshot to the DB (services/projectApi.js); this
// mirrors the same snapshot to a rotating on-disk JSON file the PYTHON SERVER
// owns (moved off the Tauri Rust side 2026-07-13, so it also works in
// browser-dev). Thin wrappers over the shared kit serverApi transport.
//
// The close/unload flush passes { keepalive: true } straight through serverApi's
// opts -> fetch, matching projectApi's book PUT, so the browser can finish the
// request after the document starts unloading (best-effort; the Tauri shell adds
// a brief drain grace before it kills the sidecar — see lib.rs CloseRequested).

import { get, post, put, del } from "@delebash/llm-ui";

/** Rotate + write the on-disk autosave for a project. `opts` flows through to
 *  fetch — the close path passes { keepalive: true }. */
export function postAutosave(id, snap, opts = {}) {
  return post(`/v1/projects/${id}/autosave`, snap, opts);
}

/** Every on-disk autosave, newest first: [{projectId,title,savedAt,generation,key}]. */
export function listAutosaves() {
  return get("/v1/projects/autosaves");
}

/** The parsed snapshot for one key (`<projectId>__<generation>`). */
export function readAutosave(key) {
  return get(`/v1/projects/autosaves/${encodeURIComponent(key)}`);
}

/** Delete one autosave file by key. */
export function deleteAutosave(key) {
  return del(`/v1/projects/autosaves/${encodeURIComponent(key)}`);
}

/** Delete every autosave file. */
export function deleteAllAutosaves() {
  return del("/v1/projects/autosaves");
}

/** The current autosave folder: { dir }. */
export function getAutosaveDir() {
  return get("/v1/projects/autosave-dir");
}

/** Set the autosave folder (server creates it): { dir } -> { dir }. */
export function putAutosaveDir(dir) {
  return put("/v1/projects/autosave-dir", { dir });
}
