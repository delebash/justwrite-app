// SPDX-License-Identifier: MIT
// A scene stores a server image by its path, `/v1/images/<id>`, never by the address of the server
// that showed it (server/src/editor/editorSchema.js `stableImageSrc`): a scene syncs to devices
// whose servers sit elsewhere, and the phone's server is inside the app. An absolute address
// stored before is read back to the path by the editor's own schema — so the sync's merge of a
// scene (sceneTextAdapter) and the editor both write the path.
import { getSchema } from "@tiptap/core";
import { generateHTML, generateJSON } from "@tiptap/html/server";
import { expect, test } from "vitest";
import { editorExtensions, schemaMention, stableImageSrc } from "../src/editor/editorSchema.js";
import { createPhoneApp } from "../src/phone.js";
import { openDatabase } from "@delebash/llm-runner/platform/sql";
import { join } from "node:path";
import { testClient, tmpPath } from "./helpers.js";

test("an image's address becomes its path; other images stay as they are", () => {
  expect(stableImageSrc("http://127.0.0.1:17495/v1/images/img_1a2b")).toBe("/v1/images/img_1a2b");
  expect(stableImageSrc("https://localhost/v1/images/img_1a2b")).toBe("/v1/images/img_1a2b");
  expect(stableImageSrc("/v1/images/img_1a2b")).toBe("/v1/images/img_1a2b");
  expect(stableImageSrc("https://example.com/v1/images/x/y.png")).toBe("https://example.com/v1/images/x/y.png");
  expect(stableImageSrc("data:image/png;base64,AAAA")).toBe("data:image/png;base64,AAAA");
});

test("a scene stored with an absolute image address is written back with the path", () => {
  const extensions = editorExtensions({ mention: schemaMention() });
  getSchema(extensions);
  const stored = '<p>Before.</p><img src="http://127.0.0.1:17495/v1/images/img_1a2b" alt="the map"><p>After.</p>';
  const html = generateHTML(generateJSON(stored, extensions), extensions);
  expect(html).toContain('src="/v1/images/img_1a2b"');
  expect(html).toContain('alt="the map"');
  expect(html).not.toContain("127.0.0.1");
});

test("the phone's server keeps and returns an image's bytes", async () => {
  const app = await createPhoneApp({ handle: openDatabase(join(tmpPath(), "justwrite.db"), { foreignKeys: true }) });
  const c = testClient(app);
  const png = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");
  const up = await c.post("/v1/images", { json: { name: "map.png", mime: "image/png", dataBase64: png.toString("base64") } });
  expect(up.statusCode).toBeLessThan(300);
  const got = await c.get(`/v1/images/${up.json().id}`);
  expect(got.statusCode).toBe(200);
  expect(got.headers["content-type"]).toContain("image/png");
  expect(Buffer.from(got.rawPayload).equals(png)).toBe(true);
});
