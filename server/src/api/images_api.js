// SPDX-License-Identifier: MIT
// /v1/images — server-side image blob store (the port of justwrite_server/api/images_api.py).
//
// The renderer uploads bytes (base64 JSON — no multipart dependency), references the
// returned id from a project's `images` records (as `serverId`), and renders them with
// `<img src="…/v1/images/{id}">`.

import { randomUUID } from "node:crypto";
import { HttpError } from "@delebash/llm-runner/platform/errors";
import { opt, T } from "@delebash/llm-runner/platform/models";
import { b64decode, ValueError } from "@delebash/llm-runner/platform/py";
import { Hono, input } from "@delebash/llm-runner/platform/server";
import { isoNowUtc } from "../book_io.js";
import { getDb } from "../database/session.js";

export const ImageUpload = T.Object({
  name: opt(T.String(), ""),
  mime: opt(T.String(), "application/octet-stream"),
  dataBase64: T.String(),
});

/** Starlette's Response(media_type=…): a text/* type gets "; charset=utf-8" appended. */
function mediaType(mime) {
  return mime.startsWith("text/") && !mime.toLowerCase().includes("charset") ? `${mime}; charset=utf-8` : mime;
}

export const router = new Hono();
router.post("/v1/images", input({ body: ImageUpload }), (c) => {
  const body = c.req.valid("json");
  let raw;
  try {
    raw = b64decode(body.dataBase64, true);
  } catch (e) {
    if (e instanceof ValueError) throw new HttpError(400, "invalid base64");
    throw e;
  }
  const imageId = randomUUID();
  const now = isoNowUtc();
  getDb().insert("image_blobs", {
    id: imageId,
    name: body.name,
    mime: body.mime || "application/octet-stream",
    data: raw,
    created_at: now,
  });
  return c.json({ id: imageId, name: body.name, mime: body.mime, addedAt: now });
});

router.get("/v1/images/:image_id", (c) => {
  const row = getDb().get("image_blobs", c.req.param("image_id"));
  if (row === null) throw new HttpError(404, "image not found");
  return c.body(new Uint8Array(row.data), 200, { "Content-Type": mediaType(row.mime || "application/octet-stream") });
});

router.delete("/v1/images/:image_id", (c) => {
  const h = getDb();
  const imageId = c.req.param("image_id");
  if (h.get("image_blobs", imageId) !== null) h.delete("image_blobs", { id: imageId });
  return c.body(null, 204);
});
