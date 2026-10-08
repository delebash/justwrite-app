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
// The zip is read and written in memory here the way Python's `zipfile` does it (the kit's
// data_api ZipWriter/ZipReader work on files): writestr's entries (deflate, the local time,
// mode 0o600, the UTF-8 flag only for a non-ASCII name), and the reader's central-directory
// walk, name checks and CRC check. The archive is not byte-identical to Python's (the
// deflate stream comes from Node's zlib) — both read each other's.

import { randomUUID } from "node:crypto";
import zlib from "node:zlib";
import { HttpError } from "@delebash/llm-runner/platform/errors";
import { T } from "@delebash/llm-runner/platform/models";
import { pyJson } from "@delebash/llm-runner/platform/pyjson";
import { RuntimeError, rstrip, strip, ValueError } from "@delebash/llm-runner/platform/py";
import * as bookIo from "../book_io.js";
import { b64decode, orElse, pyGet } from "../book_io.js";
import { getDb } from "../database/session.js";

const IS_WIN = process.platform === "win32";

/**
 * The book title made filesystem-safe — drops only chars illegal in Windows / POSIX
 * filenames, otherwise preserved — so the zip is `<Title>.zip` unzipping to a `<Title>/`
 * folder (user: "zip file should be name of book"). Never empty.
 */
export function safeTitle(title) {
  const s = rstrip(strip(String(title || "").replace(/[<>:"/\\|?*\x00-\x1f]/g, "")), ".");
  return s || "book";
}

// ── zip in memory, as Python's zipfile (candidates for platform/) ────────────

export class BadZipFile extends Error {
  constructor(m) {
    super(m);
    this.name = "BadZipFile";
  }
}

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_END = 0x06054b50;
const SIG_END64 = 0x06064b50;
const SIG_END64_LOC = 0x07064b50;
const LIMIT32 = 0xffffffff;

// cp437's upper half — zipfile's decoding of a name without the UTF-8 flag.
const CP437_HIGH = `ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■${String.fromCharCode(0xa0)}`;
const cp437 = (buf) => [...buf].map((b) => (b < 0x80 ? String.fromCharCode(b) : CP437_HIGH[b - 0x80])).join("");
const utf8Strict = (buf) => new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(buf);

/** DOS [time, date] of the local clock (zipfile's `time.localtime()`). */
function dosNow() {
  const d = new Date();
  return [
    (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  ];
}

/** `zipfile.ZipFile(buf, "w", ZIP_DEFLATED)` + `writestr(name, data)`, in memory. */
export class ZipBuilder {
  constructor() {
    this.chunks = [];
    this.offset = 0;
    this.entries = [];
  }

  push(buf) {
    this.chunks.push(buf);
    this.offset += buf.length;
  }

  /** `zf.writestr(arcname, data)` — a str is written as UTF-8. */
  writestr(arcname, data) {
    const raw = typeof data === "string" ? Buffer.from(data, "utf8") : Buffer.from(data);
    const ascii = /^[\x00-\x7f]*$/.test(arcname);
    const nameBuf = Buffer.from(arcname, ascii ? "latin1" : "utf8");
    const flags = ascii ? 0 : 0x800;
    const [time, date] = dosNow();
    const comp = zlib.deflateRawSync(raw);
    const crc = zlib.crc32(raw) >>> 0;
    if (raw.length > 0x7fffffff || comp.length > LIMIT32 || this.offset > LIMIT32) {
      // zipfile switches to ZIP64 past 2 GiB; a book over that can't travel as JSON anyway.
      throw new RuntimeError("zip entry too large");
    }
    const h = Buffer.alloc(30);
    h.writeUInt32LE(SIG_LOCAL, 0);
    h.writeUInt16LE(20, 4);
    h.writeUInt16LE(flags, 6);
    h.writeUInt16LE(8, 8);
    h.writeUInt16LE(time, 10);
    h.writeUInt16LE(date, 12);
    h.writeUInt32LE(crc, 14);
    h.writeUInt32LE(comp.length, 18);
    h.writeUInt32LE(raw.length, 22);
    h.writeUInt16LE(nameBuf.length, 26);
    h.writeUInt16LE(0, 28);
    const headerOffset = this.offset;
    this.push(h);
    this.push(nameBuf);
    this.push(comp);
    this.entries.push({ nameBuf, flags, time, date, crc, size: raw.length, csize: comp.length, headerOffset });
  }

  /** The central directory + end record; returns the whole archive. */
  finish() {
    const cdStart = this.offset;
    for (const e of this.entries) {
      const c = Buffer.alloc(46);
      c.writeUInt32LE(SIG_CENTRAL, 0);
      c.writeUInt8(20, 4);
      c.writeUInt8(IS_WIN ? 0 : 3, 5); // create_system: 0 on Windows, 3 (Unix) elsewhere
      c.writeUInt16LE(20, 6);
      c.writeUInt16LE(e.flags, 8);
      c.writeUInt16LE(8, 10);
      c.writeUInt16LE(e.time, 12);
      c.writeUInt16LE(e.date, 14);
      c.writeUInt32LE(e.crc, 16);
      c.writeUInt32LE(e.csize, 20);
      c.writeUInt32LE(e.size, 24);
      c.writeUInt16LE(e.nameBuf.length, 28);
      c.writeUInt32LE((0o600 << 16) >>> 0, 38); // writestr's mode for a file
      c.writeUInt32LE(e.headerOffset, 42);
      this.push(c);
      this.push(e.nameBuf);
    }
    const end = Buffer.alloc(22);
    end.writeUInt32LE(SIG_END, 0);
    end.writeUInt16LE(this.entries.length, 8);
    end.writeUInt16LE(this.entries.length, 10);
    end.writeUInt32LE(this.offset - cdStart, 12);
    end.writeUInt32LE(cdStart, 16);
    this.push(end);
    return Buffer.concat(this.chunks);
  }
}

/** zipfile's `_EndRecData` + `_EndRecData64` over a buffer. */
function endRecord(buf) {
  const size = buf.length;
  if (size < 22) return null;
  let at;
  let rec = buf.subarray(size - 22);
  if (rec.readUInt32LE(0) === SIG_END && rec.readUInt16LE(20) === 0) {
    at = size - 22;
  } else {
    const from = Math.max(size - (1 << 16) - 22, 0);
    const i = buf.subarray(from).lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    if (i < 0) return null;
    at = from + i;
    rec = buf.subarray(at, at + 22);
    if (rec.length !== 22) return null; // the zip is corrupted
  }
  const end = { at, zip64: false, cdSize: rec.readUInt32LE(12), cdOffset: rec.readUInt32LE(16) };
  if (at >= 20 && buf.readUInt32LE(at - 20) === SIG_END64_LOC) {
    const loc = buf.subarray(at - 20, at);
    if (loc.readUInt32LE(4) !== 0 || loc.readUInt32LE(16) > 1) {
      throw new BadZipFile("zipfiles that span multiple disks are not supported");
    }
    if (at >= 76 && buf.readUInt32LE(at - 76) === SIG_END64) {
      const r = buf.subarray(at - 76, at - 20);
      end.zip64 = true;
      end.cdSize = Number(r.readBigUInt64LE(40));
      end.cdOffset = Number(r.readBigUInt64LE(48));
    }
  }
  return end;
}

function decodeZip64Extra(e, extra) {
  let i = 0;
  while (i + 4 <= extra.length) {
    const id = extra.readUInt16LE(i);
    const len = extra.readUInt16LE(i + 2);
    if (i + 4 + len > extra.length) throw new BadZipFile(`Corrupt extra field ${id.toString(16).padStart(4, "0")} (size=${len})`);
    if (id === 1) {
      let j = i + 4;
      for (const field of ["size", "csize", "offset"]) {
        if (e[field] !== LIMIT32) continue;
        if (j + 8 > i + 4 + len) throw new BadZipFile("Corrupt zip64 extra field");
        e[field] = Number(extra.readBigUInt64LE(j));
        j += 8;
      }
    }
    i += 4 + len;
  }
}

/** `zipfile.ZipFile(io.BytesIO(raw))` — the central directory, read up front. */
export class ZipView {
  constructor(buf) {
    this.buf = buf;
    const end = endRecord(buf);
    if (!end) throw new BadZipFile("File is not a zip file");
    let concat = end.at - end.cdSize - end.cdOffset;
    if (end.zip64) concat -= 56 + 20;
    const start = end.cdOffset + concat;
    if (start < 0) throw new BadZipFile("Bad offset for central directory");
    const cd = buf.subarray(start, start + end.cdSize);
    this.entries = [];
    let pos = 0;
    while (pos < end.cdSize) {
      if (cd.length - pos < 46) throw new BadZipFile("Truncated central directory");
      if (cd.readUInt32LE(pos) !== SIG_CENTRAL) throw new BadZipFile("Bad magic number for central directory");
      const flags = cd.readUInt16LE(pos + 8);
      const n = cd.readUInt16LE(pos + 28);
      const x = cd.readUInt16LE(pos + 30);
      const k = cd.readUInt16LE(pos + 32);
      const rawName = cd.subarray(pos + 46, pos + 46 + n);
      const origName = flags & 0x800 ? utf8Strict(rawName) : cp437(rawName);
      // ZipInfo's own clean-up of a stored name: cut at a NUL, the OS separator → "/".
      let name = origName;
      const nul = name.indexOf("\0");
      if (nul >= 0) name = name.slice(0, nul);
      if (IS_WIN) name = name.replace(/\\/g, "/");
      const e = {
        origName,
        name,
        flags,
        method: cd.readUInt16LE(pos + 10),
        crc: cd.readUInt32LE(pos + 16),
        csize: cd.readUInt32LE(pos + 20),
        size: cd.readUInt32LE(pos + 24),
        offset: cd.readUInt32LE(pos + 42),
      };
      decodeZip64Extra(e, cd.subarray(pos + 46 + n, pos + 46 + n + x));
      e.offset += concat;
      this.entries.push(e);
      pos += 46 + n + x + k;
    }
  }

  /** `namelist()`. */
  names() {
    return this.entries.map((e) => e.name);
  }

  /** `getinfo(name)` — the LAST entry of that name, as zipfile's NameToInfo keeps. */
  info(name) {
    for (let i = this.entries.length - 1; i >= 0; i--) if (this.entries[i].name === name) return this.entries[i];
    throw new Error(`There is no item named '${name}' in the archive`);
  }

  /** `read(info)` — the member's bytes, checked the way zipfile checks them. */
  read(e) {
    const buf = this.buf;
    const h = buf.subarray(e.offset, e.offset + 30);
    if (h.length !== 30) throw new BadZipFile("Truncated file header");
    if (h.readUInt32LE(0) !== SIG_LOCAL) throw new BadZipFile("Bad magic number for file header");
    const n = h.readUInt16LE(26);
    const fname = buf.subarray(e.offset + 30, e.offset + 30 + n);
    if (e.flags & 0x20) throw new Error("compressed patched data (flag bit 5)");
    if (e.flags & 0x40) throw new Error("strong encryption (flag bit 6)");
    const fnameStr = h.readUInt16LE(6) & 0x800 ? utf8Strict(fname) : cp437(fname);
    if (fnameStr !== e.origName) {
      throw new BadZipFile(`File name in directory '${e.origName}' and header ${fname} differ.`);
    }
    if (e.flags & 0x1) throw new RuntimeError(`File '${e.name}' is encrypted, password required for extraction`);
    const dataAt = e.offset + 30 + n + h.readUInt16LE(28);
    const comp = buf.subarray(dataAt, dataAt + e.csize);
    let raw;
    if (e.method === 0) raw = comp;
    else if (e.method === 8) raw = e.csize ? zlib.inflateRawSync(comp) : Buffer.alloc(0);
    else throw new Error("That compression method is not supported"); // zipfile also reads bzip2 / lzma
    if (zlib.crc32(raw) >>> 0 !== e.crc) throw new BadZipFile(`Bad CRC-32 for file '${e.name}'`);
    return Buffer.from(raw);
  }
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

/** Starlette writes header values as latin-1: a title outside it failed the export with
 * Python's UnicodeEncodeError (a 500 through the app's envelope). Copied on purpose — a
 * FINDING, not a feature: a book titled in Japanese can't be exported (the fix, in both:
 * an RFC 5987 `filename*=UTF-8''…` alongside an ASCII fallback). */
function latin1Header(value) {
  const cps = [...value];
  const bad = cps.findIndex((c) => c.codePointAt(0) > 0xff);
  if (bad < 0) return value;
  let end = bad;
  while (end + 1 < cps.length && cps[end + 1].codePointAt(0) > 0xff) end++;
  const where =
    end === bad
      ? `character '\\u${cps[bad].codePointAt(0).toString(16).padStart(4, "0")}' in position ${bad}`
      : `characters in position ${bad}-${end}`;
  throw new Error(`'latin-1' codec can't encode ${where}: ordinal not in range(256)`);
}

// base64 of the .zip bytes — the same upload style as /v1/images (no multipart).
export const BookZipUpload = T.Object({ zipBase64: T.String() });

export async function router(app) {
  app.get("/v1/projects/:project_id/export", async (req, reply) => {
    const h = getDb();
    const assembled = bookIo.assemble(h, req.params.project_id);
    if (assembled === null) throw new HttpError(404, "project not found");
    const [snap, files] = bookIo.externalizeImages(h, assembled);

    const folder = safeTitle(orElse(pyGet(orElse(pyGet(snap, "project"), {}), "title"), "book"));
    const zip = new ZipBuilder();
    zip.writestr(`${folder}/book.json`, pyJson(snap, { ensureAscii: false, indent: 2 }));
    for (const [fname, raw] of files) zip.writestr(`${folder}/images/${fname}`, raw);
    const body = zip.finish();
    const disposition = latin1Header(`attachment; filename="${folder}.zip"`);
    return reply.header("content-disposition", disposition).type("application/zip").send(body);
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
      zf = new ZipView(raw);
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
    const title = orElse(pyGet(orElse(pyGet(snap, "project"), {}), "title"), "Untitled");
    return { id: projectId, title, created: true };
  });
}

