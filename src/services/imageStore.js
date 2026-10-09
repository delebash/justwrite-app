// ============================================================
// imageStore.js — renderer-side facade over image storage.
//
// P4: images now live in the JustWrite SERVER (/v1/images) — uploaded as
// bytes, referenced by id, rendered via <img src="…/v1/images/{id}">. This
// replaced the Tauri-FS bridge; the legacy on-disk `{path}` records are no
// longer read (that path was removed — pre-P4 file records no longer resolve,
// and a DB reset clears them). Inline data-URL records are still READ for
// back-compat.
//
// Stored "image" record shapes:
//   server (new):  { id, addedAt, name, mime, kind: "server", serverId }
//   legacy inline: { id, addedAt, name, kind: "dataurl", dataUrl }
//
// Callers don't branch on `kind`; they call `urlFor(image)` and get something
// an <img src> can use.
//
// In a scene an image is stored by its PATH, `/v1/images/{id}` (`imagePath`) —
// never by the address of the server that showed it: a scene syncs to devices
// whose servers are elsewhere, and the phone's server is inside the app (a
// worker an <img> can't reach). `displaySrc` turns a stored src into one this
// window can show — the server's address on a computer, a blob from the in-app
// server on the phone; the editor's `imageView` and `vSceneImages` (read views)
// use it. The schema reads an absolute address stored before 2026-10-08 back to
// the path (server/src/editor/editorSchema.js `stableImageSrc`).
// ============================================================

import { inAppServer, serverUrl, post, del, requestBlob } from "@delebash/llm-ui";
import { SERVER_IMAGE, stableImageSrc } from "justwrite-server/editor/editorSchema.js";

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

/** The path a scene stores for a server image. */
export const imagePath = (serverId) => `/v1/images/${serverId}`;

/** What a scene stores for an image record: its path, or the data URL of an inline one. */
export async function storedSrcFor(image) {
  if (image?.serverId) return imagePath(image.serverId);
  return urlFor(image);
}

const blobUrls = new Map(); // path → Promise<blob: URL>, for the session

/**
 * A stored image src as something this window can show: a server image's path through the
 * server's address on a computer, or as a blob read from the in-app server on the phone; any
 * other src (a data URL, an image on the web) as it is.
 */
export function displaySrc(src) {
  const path = stableImageSrc(src);
  if (!SERVER_IMAGE.test(path ?? "")) return Promise.resolve(src ?? "");
  if (!inAppServer()) return Promise.resolve(serverUrl(path));
  let url = blobUrls.get(path);
  if (!url) {
    url = requestBlob(path).then((blob) => URL.createObjectURL(blob));
    url.catch(() => blobUrls.delete(path));
    blobUrls.set(path, url);
  }
  return url;
}

/**
 * Resolve an image record to something an <img> tag can render. Server records
 * through `displaySrc`; data-URL records pass through. (Legacy on-disk
 * `{path}` records are no longer resolvable — that path was removed post-P4.)
 */
export async function urlFor(image) {
  if (!image) return "";
  if (image.dataUrl) return image.dataUrl;
  if (image.serverId) return displaySrc(imagePath(image.serverId));
  return "";
}

/**
 * Scene HTML for a read-only view (v-html): each server image's src moves to
 * `data-scene-image`, so the browser doesn't try the bare path; the element's
 * `v-scene-images` directive then shows it through `displaySrc`.
 */
export function withSceneImages(html) {
  if (!html || !html.includes("<img")) return html;
  return html.replace(/(<img\b[^>]*?)\ssrc="([^"]*)"/gi, (all, head, src) => (SERVER_IMAGE.test(stableImageSrc(src)) ? `${head} data-scene-image="${src}"` : all));
}

function showSceneImages(el) {
  for (const img of el.querySelectorAll("img[data-scene-image]")) {
    const src = img.getAttribute("data-scene-image");
    img.removeAttribute("data-scene-image");
    displaySrc(src).then((url) => {
      img.src = url;
    }, () => {});
  }
}

/** The directive for read-only views of scene HTML (with `withSceneImages`). */
export const vSceneImages = { mounted: showSceneImages, updated: showSceneImages };

/** The editor's node view for an image (editorExtensions' `imageView`): shown through `displaySrc`. */
export function imageView() {
  return ({ node }) => {
    const img = document.createElement("img");
    let shown = null;
    const show = (n) => {
      for (const a of ["alt", "title", "width", "height"]) {
        if (n.attrs[a] == null || n.attrs[a] === "") img.removeAttribute(a);
        else img.setAttribute(a, n.attrs[a]);
      }
      const src = n.attrs.src;
      if (src === shown) return;
      shown = src;
      displaySrc(src).then((url) => {
        if (shown === src) img.src = url;
      }, () => {});
    };
    show(node);
    return {
      dom: img,
      update(n) {
        if (n.type !== node.type) return false;
        show(n);
        return true;
      },
    };
  };
}

/**
 * Best-effort cleanup. Server records are DELETEd; data URLs just vanish with
 * the record. Errors are swallowed — the project store forgets the image
 * either way.
 */
export async function removeImage(image) {
  if (image?.serverId) {
    try { await del(`/v1/images/${image.serverId}`); } catch { /* ignore */ }
    return;
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
      // them); blob.type carries the server's content-type. Path-first single
      // arg — the kit's requestBlob(path, {method="GET"}) (serverApi.js since
      // 2026-08-05; same base, authed only when a token is set — JW sets none).
      const blob = await requestBlob(`/v1/images/${image.serverId}`);
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
