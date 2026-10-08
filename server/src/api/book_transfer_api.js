// SPDX-License-Identifier: MIT
// /v1/projects — per-project ZIP export / import (the port of
// justwrite_server/api/book_transfer_api.py).
//
// A book travels as a single `<title>.zip` whose contents unzip to a `<title>/` folder
// holding `book.json` (the `exportSnapshot()` / book_io shape) and an `images/` folder of the
// book's image files. The SERVER owns the data: export assembles the book and externalizes
// its image bytes into the zip; import parses the zip, re-uploads the images as fresh
// image_blobs rows, and decomposes into a NEW project. Deciding *where* to write/read the zip
// is the desktop shell's native dialog; this module only produces/consumes bytes — so it is
// testable and performs no arbitrary-path filesystem access.
//
// Import shares ONE core with the sample seeder: `book_io.importBookSnapshot`.
//
// The zip is built and read in memory with the kit's platform/zip (Python's `zipfile`:
// `writestr` and `ZipFile(io.BytesIO(raw))`) — Python reads these zips and these read Python's.

import { randomUUID } from "node:crypto";
import { HttpError } from "@delebash/llm-runner/platform/errors";
import { T } from "@delebash/llm-runner/platform/models";
import { pyJson } from "@delebash/llm-runner/platform/pyjson";
import { attachment } from "@delebash/llm-runner/platform/server";
import { b64decode, pyOr, rstrip, strip, ValueError } from "@delebash/llm-runner/platform/py";
import { BadZipFile, ZipReader, ZipWriter } from "@delebash/llm-runner/platform/zip";
import * as bookIo from "../book_io.js";
import { pyGet } from "../book_io.js";
import { getDb } from "../database/session.js";

/**
 * The book title made filesystem-safe — drops only chars illegal in Windows / POSIX
 * filenames, otherwise preserved — so the zip is `<Title>.zip` unzipping to a `<Title>/`
 * folder (user: "zip file should be name of book"). Never empty.
 */
export function safeTitle(title) {
  const s = rstrip(strip(String(title || "").replace(/[<>:"/\\|?*\x00-\x1f]/g, "")), ".");
  return s || "book";
}

/** `json.loads(bytes)`: the encoding detected the way Python's json module detects it (a
 * UTF-8 BOM is skipped; UTF-16/32 by BOM or by their zero bytes). A bad byte is a
 * UnicodeDecodeError (a ValueError). */
export function loadsBytes(b) {
  const starts = (...xs) => xs.every((x, i) => b[i] === x);
  let enc = "utf-8";
  if (b.length >= 4 && (starts(0x00, 0x00, 0xfe, 0xff) || starts(0xff, 0xfe, 0x00, 0x00))) enc = "utf-32";
  else if (b.length >= 2 && (starts(0xfe, 0xff) || starts(0xff, 0xfe))) enc = "utf-16";
  else if (starts(0xef, 0xbb, 0xbf)) enc = "utf-8-sig";
  else if (b.length >= 4) {
    if (!b[0]) enc = b[1] ? "utf-16-be" : "utf-32-be";
    else if (!b[1]) enc = b[2] || b[3] ? "utf-16-le" : "utf-32-le";
  } else if (b.length === 2) {
    if (!b[0]) enc = "utf-16-be";
    else if (!b[1]) enc = "utf-16-le";
  }
  let text;
  try {
    text = decodeAs(b, enc);
  } catch (e) {
    throw new ValueError(`'${enc}' codec can't decode bytes: ${e?.message ?? e}`);
  }
  return JSON.parse(text);
}

function decodeAs(b, enc) {
  const dec = (label, buf) => new TextDecoder(label, { fatal: true, ignoreBOM: true }).decode(buf);
  if (enc === "utf-8") return dec("utf-8", b);
  if (enc === "utf-8-sig") return dec("utf-8", b.subarray(3));
  if (enc === "utf-16") return b[0] === 0xff ? dec("utf-16le", b.subarray(2)) : dec("utf-16be", b.subarray(2));
  if (enc === "utf-16-le") return dec("utf-16le", b);
  if (enc === "utf-16-be") return dec("utf-16be", b);
  // UTF-32: four-byte code units (TextDecoder has none).
  let le = enc === "utf-32-le";
  let body = b;
  if (enc === "utf-32") {
    le = b[0] === 0xff;
    body = b.subarray(4);
  }
  if (body.length % 4) throw new Error("truncated data");
  let out = "";
  for (let i = 0; i < body.length; i += 4) {
    const cp = le ? body.readUInt32LE(i) : body.readUInt32BE(i);
    if (cp > 0x10ffff) throw new Error("code point not in range(0x110000)");
    out += String.fromCodePoint(cp);
  }
  return out;
}

/** The `<folder>/book.json` (or a bare `book.json`) inside the zip — the shape export
 * writes. The shallowest match wins (the first of the shortest), so a nested stray can't
 * hijack it. */
function findBookJson(names) {
  const hits = names.filter((n) => n === "book.json" || (n.endsWith("/book.json") && n.split("/").length - 1 === 1));
  if (!hits.length) return null;
  let best = hits[0];
  for (const n of hits.slice(1)) if (n.length < best.length) best = n;
  return best;
}

// base64 of the .zip bytes — the same upload style as /v1/images (no multipart).
export const BookZipUpload = T.Object({ zipBase64: T.String() });

export async function router(app) {
  app.get("/v1/projects/:project_id/export", async (req, reply) => {
    const h = getDb();
    const assembled = bookIo.assemble(h, req.params.project_id);
    if (assembled === null) throw new HttpError(404, "project not found");
    const [snap, files] = bookIo.externalizeImages(h, assembled);

    const folder = safeTitle(pyOr(pyGet(pyOr(pyGet(snap, "project"), {}), "title"), "book"));
    const zip = new ZipWriter();
    zip.writestr(`${folder}/book.json`, pyJson(snap, { ensureAscii: false, indent: 2 }));
    for (const [fname, raw] of files) zip.writestr(`${folder}/images/${fname}`, raw);
    const body = zip.toBuffer();
    // The kit's `attachment`: a title outside ASCII (Japanese, say) travels as RFC 5987's
    // filename*= — Python's export failed such a title with a 500 (fixed 2026-10-08).
    return reply.header("content-disposition", attachment(`${folder}.zip`)).type("application/zip").send(body);
  });

  app.post("/v1/projects/import", { schema: { body: BookZipUpload } }, async (req) => {
    let raw;
    try {
      raw = b64decode(req.body.zipBase64, true);
    } catch (e) {
      if (e instanceof ValueError) throw new HttpError(400, "invalid base64");
      throw e;
    }
    let zf;
    try {
      zf = ZipReader.fromBuffer(raw);
    } catch (e) {
      if (e instanceof BadZipFile || e instanceof RangeError) throw new HttpError(400, "not a valid zip");
      throw e;
    }

    const bookName = findBookJson(zf.names());
    if (bookName === null) throw new HttpError(400, "zip has no book.json");
    let snap;
    try {
      snap = loadsBytes(zf.read(zf.info(bookName)));
    } catch (e) {
      if (e instanceof SyntaxError || e instanceof ValueError) throw new HttpError(400, "book.json is not valid JSON");
      throw e;
    }
    const imgDir = `${bookName.slice(0, -"book.json".length)}images/`; // "<folder>/images/" or "images/"
    const files = new Map();
    for (const e of zf.entries) {
      if (!e.name.endsWith("/") && e.name.startsWith(imgDir)) files.set(e.name.slice(imgDir.length), zf.read(e));
    }

    if (snap === null || typeof snap !== "object" || Array.isArray(snap)) {
      throw new HttpError(400, "book.json must be an object");
    }
    const projectId = `prj_${randomUUID().replace(/-/g, "")}`;
    bookIo.importBookSnapshot(getDb(), snap, files, projectId);
    const title = pyOr(pyGet(pyOr(pyGet(snap, "project"), {}), "title"), "Untitled");
    return { id: projectId, title, created: true };
  });
}

