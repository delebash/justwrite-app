// A picture in a scene, ready for an export (2026-10-29: every export dropped them). The image's src is
// one of the server's images (`/v1/images/<id>`, editorSchema.js SERVER_IMAGE) or an inline data URL;
// its bytes come through imageStore.js readImageBytes, as the cover's do. Each exporter needs PNG or
// JPEG — what pdfmake can embed, and Word and EPUB readers take everywhere — so another format is
// redrawn as a PNG when the browser can (createImageBitmap + OffscreenCanvas); its size in pixels
// comes from the bytes (the `image-size` package). A picture from elsewhere (a web address) or one
// that can't be read is left out, as before.
import { imageSize } from "image-size";
import { SERVER_IMAGE } from "justwrite-server/editor/editorSchema.js";

const EMBEDDABLE = new Set(["image/png", "image/jpeg"]);

/** The image-store record for a scene picture's src, or null for one that isn't the app's. */
export function imageRecordFor(src) {
  const path = SERVER_IMAGE.exec(String(src ?? ""))?.[1];
  if (path) return { serverId: path.slice("/v1/images/".length) };
  if (/^data:image\//i.test(String(src ?? ""))) return { dataUrl: src };
  return null;
}

async function toPng({ bytes, mime }) {
  if (typeof createImageBitmap !== "function" || typeof OffscreenCanvas !== "function") return null;
  const bitmap = await createImageBitmap(new Blob([bytes], { type: mime }));
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  canvas.getContext("2d").drawImage(bitmap, 0, 0);
  const blob = await canvas.convertToBlob({ type: "image/png" });
  return { bytes: new Uint8Array(await blob.arrayBuffer()), mime: "image/png", ext: "png" };
}

/** `{ bytes, mime, ext, width, height }` for a scene picture, or null. */
export async function loadExportImage(src) {
  const record = imageRecordFor(src);
  if (!record) return null;
  const { readImageBytes } = await import("../imageStore.js");
  let image = await readImageBytes(record);
  if (!image) return null;
  if (!EMBEDDABLE.has(image.mime)) image = await toPng(image);
  if (!image) return null;
  const { width, height } = imageSize(image.bytes);
  return width && height ? { ...image, ext: image.mime === "image/jpeg" ? "jpg" : "png", width, height } : null;
}

/** One export's loader: each picture read once however often it appears. Never throws. */
export function exportImageLoader() {
  const seen = new Map();
  return (src) => {
    if (!seen.has(src)) seen.set(src, loadExportImage(src).catch(() => null));
    return seen.get(src);
  };
}

/** A picture's size fitted inside `maxWidth` × `maxHeight`, never enlarged. */
export function fitSize({ width, height }, maxWidth, maxHeight = Infinity) {
  const scale = Math.min(1, maxWidth / width, maxHeight / height);
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/** Base64 of bytes, in chunks the call stack takes. */
export function toBase64(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
