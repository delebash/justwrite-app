// SPDX-License-Identifier: MIT
// Port of tests/test_book_transfer.py — per-project ZIP export / import (api/book_transfer_api)
// + the ONE shared import core the sample seeder rides (book_io.importBookSnapshot). The whole
// point of server-executes over the desktop bridge: this round-trip — including the image
// bytes and the cover image — is verifiable here, no shell.
//
// Python read the zips with `zipfile`; here with the kit's (platform/zip, ZipReader). +2 tests
// beyond Python: a multi-MB import (the book import posts a base64 zip as JSON — Fastify's
// default 1 MiB body limit would refuse it; the kit's server lifts it), and a title outside
// latin-1 (Python's export failed it with a 500; fixed 2026-10-08).
import { randomBytes } from "node:crypto";
import { expect, test } from "vitest";
import { ZipReader, ZipWriter } from "@delebash/llm-runner/platform/zip";
import { client, tmpPath, useHermeticKit } from "./helpers.js";

useHermeticKit();

// A real 1x1 transparent PNG so the image round-trip exercises actual bytes.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

async function upload(c, name) {
  return (await c.post("/v1/images", { json: { name, mime: "image/png", dataBase64: PNG.toString("base64") } })).json().id;
}

test("export_import_round_trip_with_images", async () => {
  const c = await client(tmpPath());
  // A source project with an entity image AND a project cover image (the two image holders
  // externalize/internalize must both cover).
  const entitySid = await upload(c, "char.png");
  const coverSid = await upload(c, "cover.png");
  const snap = {
    project: {
      title: "My Book",
      author: "A",
      coverImage: { id: "img_cover", addedAt: 1, kind: "server", serverId: coverSid, name: "cover.png", mime: "image/png" },
    },
    characters: [{ id: "c1", name: "Cael" }],
    images: { c1: [{ id: "img_1", addedAt: 2, kind: "server", serverId: entitySid, name: "char.png", mime: "image/png" }] },
  };
  expect((await c.put("/v1/projects/src/book", { json: snap })).statusCode).toBe(204);

  // Export → a real zip named after the book, folder structure inside.
  const r = await c.get("/v1/projects/src/export");
  expect(r.statusCode).toBe(200);
  expect(r.headers["content-type"]).toBe("application/zip");
  expect(r.headers["content-disposition"] || "").toContain('filename="My Book.zip"');
  const names = ZipReader.fromBuffer(r.rawPayload).names();
  expect(names).toContain("My Book/book.json");
  expect(names.filter((n) => n.startsWith("My Book/images/")).length).toBe(2); // entity + cover

  // Import → a NEW project; images re-uploaded as fresh blobs, bytes preserved.
  const meta = (await c.post("/v1/projects/import", { json: { zipBase64: r.rawPayload.toString("base64") } })).json();
  const newId = meta.id;
  expect(newId !== "src" && meta.title === "My Book").toBe(true);

  const book = (await c.get(`/v1/projects/${newId}/book`)).json();
  expect(book.project.title).toBe("My Book");
  // Cover survived, with a NEW serverId (not the source's), identical bytes.
  const newCover = book.project.coverImage;
  expect(newCover.serverId && newCover.serverId !== coverSid).toBe(true);
  expect(Buffer.compare((await c.get(`/v1/images/${newCover.serverId}`)).rawPayload, PNG)).toBe(0);
  // Entity image survived likewise.
  const newImg = book.images.c1[0];
  expect(newImg.serverId && newImg.serverId !== entitySid).toBe(true);
  expect(Buffer.compare((await c.get(`/v1/images/${newImg.serverId}`)).rawPayload, PNG)).toBe(0);

  // Both projects still exist (import doesn't disturb the source).
  const ids = new Set((await c.get("/v1/projects")).json().map((p) => p.id));
  expect(ids.has("src") && ids.has(newId)).toBe(true);
});

test("image_less_book_round_trips", async () => {
  // The common case (the bundled sample is image-less): no images/ in the zip.
  const c = await client(tmpPath());
  const snap = { project: { title: "Plain" }, characters: [{ id: "c1", name: "X" }] };
  expect((await c.put("/v1/projects/p/book", { json: snap })).statusCode).toBe(204);
  const r = await c.get("/v1/projects/p/export");
  expect(r.statusCode).toBe(200);
  const names = ZipReader.fromBuffer(r.rawPayload).names();
  expect(names).toContain("Plain/book.json");
  expect(names.some((n) => n.startsWith("Plain/images/"))).toBe(false);
  const meta = (await c.post("/v1/projects/import", { json: { zipBase64: r.rawPayload.toString("base64") } })).json();
  const book = (await c.get(`/v1/projects/${meta.id}/book`)).json();
  expect(book.project.title).toBe("Plain");
  expect(book.characters.map((ch) => ch.id)).toEqual(["c1"]);
});

test("export_missing_project_404", async () => {
  expect((await (await client(tmpPath())).get("/v1/projects/nope/export")).statusCode).toBe(404);
});

test("import_rejects_bad_input", async () => {
  const c = await client(tmpPath());
  expect((await c.post("/v1/projects/import", { json: { zipBase64: "!!!" } })).statusCode).toBe(400);
  expect((await c.post("/v1/projects/import", { json: { zipBase64: Buffer.from("not a zip").toString("base64") } })).statusCode).toBe(400);
  const zip = new ZipWriter();
  zip.writestr("random.txt", "x");
  expect((await c.post("/v1/projects/import", { json: { zipBase64: zip.toBuffer().toString("base64") } })).statusCode).toBe(400);
});

test("multi_mb_import_is_accepted", async () => {
  // A book with a 6 MB image (incompressible bytes): the export zip is ~6 MB and its base64
  // JSON body ~8 MB — far past Fastify's 1 MiB default body limit.
  const c = await client(tmpPath());
  const big = randomBytes(6 * 1024 * 1024);
  const sid = (await c.post("/v1/images", { json: { name: "big.png", mime: "image/png", dataBase64: big.toString("base64") } })).json().id;
  await c.put("/v1/projects/big/book", {
    json: { project: { title: "Big" }, images: { x: [{ id: "i", addedAt: 1, kind: "server", serverId: sid, name: "big.png", mime: "image/png" }] } },
  });
  const zipped = (await c.get("/v1/projects/big/export")).rawPayload;
  const payload = { zipBase64: zipped.toString("base64") };
  expect(JSON.stringify(payload).length).toBeGreaterThan(8 * 1024 * 1024);
  const r = await c.post("/v1/projects/import", { json: payload });
  expect(r.statusCode, r.body.slice(0, 200)).toBe(200);
  const book = (await c.get(`/v1/projects/${r.json().id}/book`)).json();
  expect(Buffer.compare((await c.get(`/v1/images/${book.images.x[0].serverId}`)).rawPayload, big)).toBe(0);
});

test("export_title_outside_latin1_downloads", async () => {
  // A header carries latin-1 only: Python's export of a book titled in Japanese answered a
  // 500 (measured 2026-10-08). The name now travels as RFC 5987's filename*= beside an ASCII
  // fallback, and the zip's folder keeps the real title.
  const c = await client(tmpPath());
  await c.put("/v1/projects/p/book", { json: { project: { title: "日本の本" } } });
  const r = await c.get("/v1/projects/p/export");
  expect(r.statusCode).toBe(200);
  expect(r.headers["content-disposition"]).toBe(
    "attachment; filename=\"____.zip\"; filename*=UTF-8''%E6%97%A5%E6%9C%AC%E3%81%AE%E6%9C%AC.zip",
  );
  expect(ZipReader.fromBuffer(r.rawPayload).names()).toContain("日本の本/book.json");
});
