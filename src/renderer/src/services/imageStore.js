// ============================================================
// imageStore.js — renderer-side facade over the image IPC bridge,
// with a localStorage data-URL fallback when running in a browser.
//
// The shape of a stored "image" record is:
//   { id, addedAt, name, kind: "file" | "dataurl", path?, dataUrl? }
//
// Callers don't branch on `kind`; they call `urlFor(image)` and the
// service hands back something an <img src> can use.
// ============================================================

const jw = typeof window !== "undefined" ? window.justwrite : null;
export const hasNativeImages = !!(jw?.images?.save);

// In-memory cache of resolved URLs for disk-backed images. Keyed by
// `path`. We never invalidate — paths are write-once.
const urlCache = new Map();

/**
 * Save a File/Blob and return a record ready to push into the project
 * store's images dict. Optional id can be supplied so the caller can
 * reference the image before the IPC roundtrip completes.
 */
export async function saveImage(file) {
  if (hasNativeImages) {
    const buffer = await file.arrayBuffer();
    const res = await jw.images.save({ name: file.name, buffer: new Uint8Array(buffer) });
    return { kind: "file", path: res.path, name: res.name, addedAt: res.addedAt };
  }
  // Browser fallback.
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ kind: "dataurl", dataUrl: reader.result, name: file.name, addedAt: Date.now() });
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * Resolve an image record to something an <img> tag can render.
 * Async because disk-backed reads hop through IPC; data-URL records
 * resolve synchronously via the returned promise.
 */
export async function urlFor(image) {
  if (!image) return "";
  if (image.dataUrl) return image.dataUrl;
  if (image.path && hasNativeImages) {
    if (urlCache.has(image.path)) return urlCache.get(image.path);
    const url = await jw.images.read(image.path);
    urlCache.set(image.path, url);
    return url;
  }
  return "";
}

/**
 * Best-effort cleanup. Disk-backed images get unlinked; data URLs
 * just vanish with the record. Errors are swallowed because the
 * project store still wants to forget the image either way.
 */
export async function removeImage(image) {
  if (image?.path && hasNativeImages) {
    urlCache.delete(image.path);
    try { await jw.images.delete(image.path); } catch {}
  }
}

/**
 * Read an image record back as raw bytes — needed when packaging the
 * file into another archive (e.g. an EPUB cover). Works for both
 * disk-backed (`path`) and inline (`dataUrl`) records, and returns
 * `{ bytes: Uint8Array, mime, ext }` ready to feed into JSZip.
 */
export async function readImageBytes(image) {
  if (!image) return null;
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
  const ext = MIME_TO_EXT[mime] || "bin";
  return { bytes, mime, ext };
}

const MIME_TO_EXT = {
  "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png",
  "image/webp": "webp", "image/gif": "gif", "image/svg+xml": "svg",
};
