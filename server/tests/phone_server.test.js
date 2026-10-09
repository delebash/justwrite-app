// SPDX-License-Identifier: MIT
// The phone's in-app server (server/src/phone.js; the kit's docs/plans/2026-10-08-the-phone.md):
// its routes answer as the desktop server's do, and the `.phone.js` twins the worker bundle swaps
// in keep the originals' names and answers. (The bundle itself — Fastify in a web worker on
// SQLite WASM — is run in a browser by the phone checks, not here: this is the same app on Node.)
import { join } from "node:path";
import { openDatabase } from "@delebash/llm-runner/platform/sql";
import { createServer } from "@delebash/llm-runner/platform/server";
import { expect, test } from "vitest";
import * as demoTwin from "../src/database/demo_seed.phone.js";
import * as demo from "../src/database/demo_seed.js";
import { router as autosaveTwin } from "../src/api/autosave_api.phone.js";
import * as appStateTwin from "../src/app_state.phone.js";
import * as appState from "../src/app_state.js";
import { createPhoneApp, PHONE_DATA_DIR } from "../src/phone.js";
import { testClient, tmpPath } from "./helpers.js";

const SNAP = {
  project: { title: "The Lamp", author: "Mira Halden" },
  parts: [{ id: "p1", title: "Part One", chapters: [{ id: "ch1", num: 1, title: "Arrival", words: 6, status: "draft", strands: [] }] }],
  scenes: { ch1: [{ id: "s1", title: "Opening", body: "<p>The lamp on the bench was lying.</p>" }] },
  characters: [{ id: "c1", name: "Cael" }],
};

async function phone() {
  const app = await createPhoneApp({ handle: openDatabase(join(tmpPath(), "justwrite.db"), { foreignKeys: true }) });
  await app.ready();
  return testClient(app);
}

test("the phone's server keeps a book, its versions and settings, and answers errors as the desktop's", async () => {
  const c = await phone();
  expect((await c.get("/v1/health")).json()).toMatchObject({ status: "ok", product: "JustWrite Server", dataDir: PHONE_DATA_DIR, dbReady: true });
  expect((await c.get("/v1/projects")).json()).toEqual([]);
  expect((await c.put("/v1/projects/prj1/book", { json: SNAP, headers: { "x-jw-client": "w1" } })).statusCode).toBe(204);
  const book = (await c.get("/v1/projects/prj1/book")).json();
  expect(book.parts[0].chapters[0].title).toBe("Arrival");
  expect(book.scenes.ch1[0].body).toBe("<p>The lamp on the bench was lying.</p>");
  expect((await c.get("/v1/projects")).json().map((p) => p.id)).toEqual(["prj1"]);
  // a missing book: the kit's problem+json, as on a computer
  const missing = await c.get("/v1/projects/nope/book");
  expect(missing.statusCode).toBe(404);
  expect(missing.json()).toMatchObject({ type: "https://justwrite.dev/errors/not-found", detail: "project not found" });
  // the tutorial book (from the twin's bundled copy on the phone; from the disk here)
  expect((await c.post("/v1/projects/demo")).statusCode).toBeLessThan(300);
  expect((await c.get("/v1/projects")).json().map((p) => p.id)).toContain(demo.DEMO_PROJECT_ID);
  expect((await c.get("/v1/sessions")).statusCode).toBe(200);
  expect((await c.get("/v1/settings")).statusCode).toBe(200);
});

test("the twins keep the originals' names and answers", async () => {
  expect(Object.keys(demoTwin).sort()).toEqual(Object.keys(demo).filter((k) => !k.startsWith("_")).sort());
  expect(demoTwin.DEMO_PROJECT_ID).toBe(demo.DEMO_PROJECT_ID);
  expect(demoTwin.DEFAULT_SAMPLE).toBe(demo.DEFAULT_SAMPLE);
  expect(demoTwin.listSamples()).toEqual(demo.listSamples());
  expect(demoTwin.demoBookSnapshot()).toEqual(demo.demoBookSnapshot());
  expect([...demoTwin.demoSampleImages()]).toEqual([...demo.demoSampleImages()]);
  expect(Object.keys(appStateTwin).sort()).toEqual(Object.keys(appState).sort());

  const app = createServer({ typeBase: "https://justwrite.dev/errors/" });
  app.register(autosaveTwin);
  const c = testClient(app);
  expect((await c.post("/v1/projects/prj1/autosave", { json: { project: {} } })).json()).toMatchObject({ ok: true, projectId: "prj1" });
  expect((await c.get("/v1/projects/autosave-dir")).json()).toEqual({ dir: null });
  expect((await c.get("/v1/projects/autosaves")).json()).toEqual([]);
});
