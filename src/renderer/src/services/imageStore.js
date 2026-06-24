// ============================================================
// imageStore.js — renderer-side facade over image storage.
//
// P4: images now live in the JustWrite SERVER (/v1/images) — uploaded as
// bytes, referenced by id, rendered via <img src="…/v1/images/{id}">. This
// replaces the Tauri-FS bridge + data-URL-in-snapshot paths (both still
// READ for back-compat with records written before P4).
//
// Stored "image" record shapes:
//   server (new):  { id, addedAt, name, mime, kind: "server", serverId }
//   legacy file:   { id, addedAt, name, kind: "file", path }
//   legacy inline: { id, addedAt, name, kind: "dataurl", dataUrl }
//
// Callers don't branch on `kind`; they call `urlFor(image)` and get something
// an <img src> can use.
// ============================================================

import { serverUrl, post, del, requestBlob } from "@delebash/llm-ui";

const jw = typeof window !== "undefined" ? window.justwrite : null;
// Legacy desktop images (records with a `path`) still read through the bridge.
export const hasNativeImages = !!(jw?.images?.read);

// In-memory cache of resolved URLs for legacy disk-backed images (write-once).
const urlCache = new Map();

const MIME_TO_EXT = {
  "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png",
  "image/webp": "webp", "image/gif": "gif", "image/svg+xml": "svg",
};

// Base64-encode an ArrayBuffer in chunks (apply(...) on a huge array overflows
// the call stack).
function _base64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/**
 * Upload a File/Blob to the server and return a record ready to push into the
 * project store's images dict. Falls back to an inline data URL if the server
 * is unreachable (browser/offline), so the app degrades rather than failing.
 */
export async function saveImage(file) {
  try {
    const dataBase64 = _base64(await file.arrayBuffer());
    const { id } = await post("/v1/images", {
      name: file.name,
      mime: file.type || "application/octet-stream",
      dataBase64,
    });
    return { kind: "server", serverId: id, name: file.name, mime: file.type || "", addedAt: Date.now() };
  } catch (err) {
    console.error("imageStore.saveImage upload failed, falling back to data URL:", err);
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ kind: "dataurl", dataUrl: reader.result, name: file.name, addedAt: Date.now() });
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * Resolve an image record to something an <img> tag can render. Server records
 * map to a direct HTTP URL; data-URL records pass through; legacy disk records
 * hop through the Tauri bridge.
 */
export async function urlFor(image) {
  if (!image) return "";
  if (image.dataUrl) return image.dataUrl;
  if (image.serverId) return serverUrl(`/v1/images/${image.serverId}`);
  if (image.path && hasNativeImages) {
    if (urlCache.has(image.path)) return urlCache.get(image.path);
    try {
      const url = await jw.images.read(image.path);
      urlCache.set(image.path, url);
      return url;
    } catch (err) {
      console.error("imageStore.urlFor failed:", err);
      return null;
    }
  }
  return "";
}

/**
 * Best-effort cleanup. Server records are DELETEd; legacy disk records are
 * unlinked via the bridge; data URLs just vanish with the record. Errors are
 * swallowed — the project store forgets the image either way.
 */
export async function removeImage(image) {
  if (image?.serverId) {
    try { await del(`/v1/images/${image.serverId}`); } catch { /* ignore */ }
    return;
  }
  if (image?.path && hasNativeImages) {
    urlCache.delete(image.path);
    try { await jw.images.delete(image.path); } catch { /* ignore */ }
  }
}

/**
 * Read an image record back as raw bytes — needed when packaging the file into
 * another archive (e.g. an EPUB cover). Returns `{ bytes, mime, ext }`.
 */
export async function readImageBytes(image) {
  if (!image) return null;
  if (image.serverId) {
    try {
      // requestBlob keeps the raw bytes (the json/text transport would corrupt
      // them); blob.type carries the server's content-type.
      const blob = await requestBlob("GET", `/v1/images/${image.serverId}`);
      const mime = blob.type || "application/octet-stream";
      const bytes = new Uint8Array(await blob.arrayBuffer());
      return { bytes, mime, ext: MIME_TO_EXT[mime] || "bin" };
    } catch (err) {
      console.error("imageStore.readImageBytes failed:", err);
      return null;
    }
  }
  let dataUrl = image.dataUrl;
  if (!dataUrl) dataUrl = await urlFor(image);
  if (!dataUrl) return null;
  // data:image/png;base64,XXXX… — split off the header and decode.
  const match = /^data:([^;]+);base64,(.*)$/i.exec(dataUrl);
  if (!match) return null;
  const mime = match[1];
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { bytes, mime, ext: MIME_TO_EXT[mime] || "bin" };
}
