// SPDX-License-Identifier: MIT
// The built UI the server hosts for the headless path, through the kit's serveUi (kit 7e617b7, the
// template's): files with an ETag that answer 304, Vite's hashed assets kept for good and the rest
// revalidated, a write there 405 with Allow (an unknown /v1 write stays the API's 404), and the
// Python-era /ui address sent to /.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { client, tmpPath, useHermeticKit } from "./helpers.js";

useHermeticKit();
afterEach(() => {
  delete process.env.JUSTWRITE_UI_DIR;
});

async function withUi() {
  const ui = tmpPath("jw-ui-");
  mkdirSync(join(ui, "assets"));
  writeFileSync(join(ui, "index.html"), "<!doctype html><title>JustWrite</title>");
  writeFileSync(join(ui, "assets", "index-Ab12Cd34.js"), "export {};");
  process.env.JUSTWRITE_UI_DIR = ui;
  return client(tmpPath());
}

test("the UI's files: an ETag and 304, hashed assets kept, the page revalidated", async () => {
  const c = await withUi();
  const page = await c.get("/");
  expect(page.statusCode).toBe(200);
  expect(page.body).toContain("<title>JustWrite</title>");
  expect(page.headers["cache-control"]).toBe("no-cache");
  const tag = page.headers.etag;
  expect(tag).toBeTruthy();
  expect((await c.get("/", { headers: { "if-none-match": tag } })).statusCode).toBe(304);
  const asset = await c.get("/assets/index-Ab12Cd34.js");
  expect(asset.statusCode).toBe(200);
  expect(asset.headers["cache-control"]).toMatch(/immutable/);
});

test("a write to the UI is 405 with Allow; an unknown API write stays a 404; /ui goes to /", async () => {
  const c = await withUi();
  const write = await c.post("/index.html", { json: {} });
  expect(write.statusCode).toBe(405);
  expect(write.headers.allow).toBe("GET, HEAD");
  expect((await c.post("/v1/no-such-route", { json: {} })).statusCode).toBe(404);
  const old = await c.get("/ui");
  expect(old.statusCode).toBe(307);
  expect(old.headers.location).toBe("/");
});
