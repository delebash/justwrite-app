// SPDX-License-Identifier: MIT
// Port of tests/test_images.py — /v1/images, the server-side image blob store (P4).
import { expect, test } from "vitest";
import { client, tmpPath, useHermeticKit } from "./helpers.js";

useHermeticKit();

test("upload_fetch_delete", async () => {
  const c = await client(tmpPath());
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("fake-image-bytes")]);
  const b64 = png.toString("base64");
  const r = await c.post("/v1/images", { json: { name: "a.png", mime: "image/png", dataBase64: b64 } });
  expect(r.statusCode).toBe(200);
  const imageId = r.json().id;
  expect(r.json().name).toBe("a.png");

  const g = await c.get(`/v1/images/${imageId}`);
  expect(g.statusCode).toBe(200);
  expect(Buffer.compare(g.rawPayload, png)).toBe(0);
  expect(g.headers["content-type"].startsWith("image/png")).toBe(true);

  expect((await c.delete(`/v1/images/${imageId}`)).statusCode).toBe(204);
  expect((await c.get(`/v1/images/${imageId}`)).statusCode).toBe(404);
});

test("fetch_missing_404", async () => {
  expect((await (await client(tmpPath())).get("/v1/images/nope")).statusCode).toBe(404);
});

test("bad_base64_rejected", async () => {
  const c = await client(tmpPath());
  const r = await c.post("/v1/images", { json: { name: "x", mime: "image/png", dataBase64: "!!!not-base64!!!" } });
  expect(r.statusCode).toBe(400);
});
