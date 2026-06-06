// ============================================================
// audioStore.js — renderer facade over the audio IPC bridge,
// with a session-only blob fallback when running in a browser.
//
// Shape of a stored chapter-audio record:
//   { kind: "file",  projectId, chapterId, path, size, duration, version }
//   { kind: "blob",  projectId, chapterId, blob, url, duration }
//
// `projectId` rides on the record (not just the on-disk path) so that
// the project store can clear audio for a deleted project, and so a
// later switchProject can scope chapterAudio cleanly.
//
// The "file" shape persists across reloads (path is durable, audio dir
// scoped per-project on disk). The "blob" shape only exists in the
// browser-only dev path and dies with the session.
//
// Callers shouldn't branch on `kind` — they call `urlFor(record)` to
// get something an <audio> tag can play, and `saveChapterAs(record,
// name)` to trigger a Save As dialog.
// ============================================================

import { convertFileSrc } from "@tauri-apps/api/core";

const jw = typeof window !== "undefined" ? window.justwrite : null;
export const hasNativeAudio = !!(jw?.audio?.save);

// path → asset URL. Asset URLs are stable for the lifetime of the
// session, so caching avoids re-running convertFileSrc on every play.
const urlCache = new Map();

/**
 * Persist a rendered chapter WAV. Returns a record ready to drop into
 * `studio.chapterAudio[chapterId]`.
 */
export async function saveChapter({ projectId, chapterId, blob, duration }) {
  if (hasNativeAudio) {
    const res = await jw.audio.save({ projectId, chapterId, blob });
    if (!res || res.error) throw new Error(res?.error || "audio_save failed");
    return {
      kind: "file",
      projectId,
      chapterId,
      path: res.path,
      size: res.size,
      duration,
      // Stamps the asset URL with a cache-buster so re-rendering the
      // same chapter (same path, different bytes) doesn't replay the
      // stale WAV out of the webview's media cache.
      version: Date.now(),
    };
  }
  return {
    kind: "blob",
    projectId,
    chapterId,
    blob,
    url: URL.createObjectURL(blob),
    duration,
  };
}

/**
 * Resolve a record to something `<audio src=…>` (or `new Audio(url)`)
 * can play. Synchronous — `convertFileSrc` is a pure path transform.
 */
export function urlFor(record) {
  if (!record) return "";
  if (record.kind === "blob") return record.url || "";
  if (record.kind === "file" && record.path) {
    const cached = urlCache.get(record.path);
    if (cached) return record.version ? `${cached}?v=${record.version}` : cached;
    const url = convertFileSrc(record.path);
    urlCache.set(record.path, url);
    return record.version ? `${url}?v=${record.version}` : url;
  }
  return "";
}

/**
 * Best-effort cleanup. File-kind records unlink the file; blob-kind
 * revoke the object URL. Errors are swallowed because callers still
 * want to forget the record either way.
 */
export async function removeChapter(record) {
  if (!record) return;
  if (record.kind === "file" && record.path && hasNativeAudio) {
    urlCache.delete(record.path);
    try { await jw.audio.delete(record.path); } catch {}
    return;
  }
  if (record.kind === "blob" && record.url) {
    try { URL.revokeObjectURL(record.url); } catch {}
  }
}

/**
 * Save As — file-to-file copy on Tauri (no bytes through IPC), or the
 * anchor-download trick on the browser-only dev path. Returns the
 * bridge's `{ ok, path?, cancelled?, error? }` shape.
 */
export async function saveChapterAs(record, suggestedName) {
  if (!record) return { ok: false, error: "no record" };
  if (record.kind === "file" && record.path && hasNativeAudio) {
    return jw.audio.saveAs(record.path, suggestedName);
  }
  const url = record.url || (record.blob && URL.createObjectURL(record.blob));
  if (!url) return { ok: false, error: "no audio source" };
  const a = document.createElement("a");
  a.href = url;
  a.download = suggestedName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  return { ok: true };
}

/**
 * Wipe every chapter audio file for a project. Used by "Clear audio"
 * affordances and (eventually) project deletion.
 */
export async function clearProject(projectId) {
  if (hasNativeAudio) {
    urlCache.clear();
    try { await jw.audio.clearProject(projectId); } catch {}
  }
}
