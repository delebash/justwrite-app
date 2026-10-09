// SPDX-License-Identifier: MIT
// Sync in JustWrite (server/src/sync.js, ../just-sqlite-sync): the save writes only what changed,
// so a window's older snapshot never undoes another device's change; scene text written on two
// devices merges through the editor's own schema; the routes (pull/push, export/import, pairing);
// a workspace reset starts a new library. "Another device" is a second database with JustWrite's
// tables and the same sync setup, talking to the app through its /v1/sync routes.
import { join } from "node:path";
import { betterSqlite3Adapter, decodeFile, encodeFile, openSync } from "@delebash/sqlite-sync";
import { openDatabase } from "@delebash/llm-runner/platform";
import { expect, test } from "vitest";
import * as Y from "yjs";
import { TABLES } from "../src/database/models.js";
import { SYNC_SCHEMA_VERSION, SYNC_TABLES, getSync, sceneTextAdapter } from "../src/sync.js";
import { client, tmpPath, useHermeticKit } from "./helpers.js";

useHermeticKit();

const SNAP = {
  project: { title: "The Lamp", author: "Mira Halden" },
  parts: [
    {
      id: "p1",
      title: "Part One",
      chapters: [
        { id: "ch1", num: 1, title: "Arrival", words: 10, status: "draft", strands: [] },
        { id: "ch2", num: 2, title: "The Map", words: 5, status: "todo", strands: [] },
      ],
    },
  ],
  scenes: { ch1: [{ id: "s1", title: "Opening", body: "<p>The lamp on the bench was lying.</p>" }], ch2: [] },
  characters: [{ id: "c1", name: "Cael" }],
};
const WINDOW = { "x-jw-client": "window-1" };

/** Another JustWrite device: its own database, JustWrite's tables, the same sync setup. */
function otherDevice(name) {
  const h = openDatabase(join(tmpPath(), "justwrite.db"), { foreignKeys: true });
  h.createTables(TABLES);
  const tables = Object.fromEntries(SYNC_TABLES.map((t) => [t, {}]));
  tables.scenes = { text: { body: sceneTextAdapter } };
  const sync = openSync(betterSqlite3Adapter(h.raw), { app: "justwrite", schemaVersion: SYNC_SCHEMA_VERSION, tables, deviceName: name, yjs: Y });
  return { h, sync };
}

/** The other device syncs with the app through its routes: pull, then push. */
async function syncThroughRoutes(c, dev, { join = false } = {}) {
  const hello = (await c.get("/v1/sync/hello")).json();
  const pulled = await c.post("/v1/sync/pull", { json: { vector: dev.sync.vector() } });
  expect(pulled.statusCode).toBe(200);
  dev.sync.apply(pulled.json(), { join });
  const pushed = await c.post("/v1/sync/push", { json: dev.sync.changesSince(hello.vector) });
  expect(pushed.statusCode).toBe(200);
}

const book = async (c) => (await c.get("/v1/projects/prj1/book", { headers: WINDOW })).json();

test("a save writes only the fields that changed", async () => {
  const c = await client(tmpPath());
  expect((await c.put("/v1/projects/prj1/book", { json: SNAP, headers: WINDOW })).statusCode).toBe(204);
  const snap = await book(c);
  const sync = getSync();
  const before = sync.seq;
  snap.parts[0].chapters[0].title = "Arrival, revised";
  expect((await c.put("/v1/projects/prj1/book", { json: snap, headers: WINDOW })).statusCode).toBe(204);
  const changed = sync.changesSince({ [sync.device]: before }).changes;
  expect(changed.map((ch) => [ch.t, ch.c, ch.v])).toEqual([["chapters", "title", "Arrival, revised"]]);
});

test("a window's older snapshot doesn't undo another device's change", async () => {
  const c = await client(tmpPath());
  await c.put("/v1/projects/prj1/book", { json: SNAP, headers: WINDOW });
  const stale = await book(c); // the window loads the book…
  const phone = otherDevice("phone");
  await syncThroughRoutes(c, phone, { join: true });
  phone.h.run("UPDATE chapters SET title = ? WHERE id = ?", ["Written on the phone", "ch2"]);
  await syncThroughRoutes(c, phone); // …the phone's edit lands on the server…
  expect((await c.get("/v1/projects/prj1/book")).json().parts[0].chapters[1].title).toBe("Written on the phone");
  stale.parts[0].chapters[0].title = "Edited in the window"; // …and the window saves its own edit
  await c.put("/v1/projects/prj1/book", { json: stale, headers: WINDOW });
  const after = (await c.get("/v1/projects/prj1/book")).json().parts[0].chapters;
  expect(after.map((ch) => ch.title)).toEqual(["Edited in the window", "Written on the phone"]);
});

test("scene text written on two devices merges, through the editor's schema", async () => {
  const c = await client(tmpPath());
  await c.put("/v1/projects/prj1/book", { json: SNAP, headers: WINDOW });
  const phone = otherDevice("phone");
  await syncThroughRoutes(c, phone, { join: true });
  const snap = await book(c);
  snap.scenes.ch1[0].body = "<p>The brass lamp on the bench was lying.</p>";
  await c.put("/v1/projects/prj1/book", { json: snap, headers: WINDOW });
  phone.h.run("UPDATE scenes SET body = ? WHERE id = ?", ["<p>The lamp on the bench was lying, <strong>beautifully</strong>.</p><p>A new paragraph.</p>", "s1"]);
  await syncThroughRoutes(c, phone);
  const want = "<p>The brass lamp on the bench was lying, <strong>beautifully</strong>.</p><p>A new paragraph.</p>";
  expect((await c.get("/v1/projects/prj1/book")).json().scenes.ch1[0].body).toBe(want);
  expect(phone.h.one("SELECT body FROM scenes WHERE id = ?", ["s1"]).body).toBe(want);
});

test("a book exported by hand imports on another device, and back", async () => {
  const c = await client(tmpPath());
  await c.put("/v1/projects/prj1/book", { json: SNAP, headers: WINDOW });
  await c.put("/v1/projects/prj2/book", { json: { ...SNAP, project: { title: "Another" } }, headers: WINDOW });
  const r = await c.post("/v1/sync/export", { json: { projectIds: ["prj1"] } });
  expect(r.statusCode).toBe(200);
  expect(decodeURIComponent(r.headers["content-disposition"])).toContain(".jwsync");
  const phone = otherDevice("phone");
  phone.sync.apply(await decodeFile(new Uint8Array(r.rawPayload)), { join: true });
  expect(phone.h.all("SELECT id FROM projects").map((p) => p.id)).toEqual(["prj1"]);
  // the phone edits and sends a file back: importing it merges
  phone.h.run("UPDATE characters SET name = ? WHERE id = ?", ["Cael Varn", "c1"]);
  const back = await encodeFile(phone.sync.changesSince({}, { scope: (t, pk) => t !== "image_blobs" && pk[0] === "prj1" }));
  const imp = await c.post("/v1/sync/import", { payload: Buffer.from(back), headers: { "content-type": "application/octet-stream" } });
  expect(imp.statusCode).toBe(200);
  expect((await c.get("/v1/projects/prj1/book")).json().characters[0].name).toBe("Cael Varn");
});

test("a file from another library is refused until joined", async () => {
  const c = await client(tmpPath());
  const stranger = otherDevice("stranger");
  stranger.h.insert("projects", { id: "x1", title: "Theirs", author: "", subtitle: "", genre: "", words_goal: 0, daily_target: 0, words_written: 0, started_on: "", deadline: "", premise: "", world_rules: "", updated_at: "", data: "{}" });
  const bytes = Buffer.from(await encodeFile(stranger.sync.changesSince({})));
  const refused = await c.post("/v1/sync/import", { payload: bytes, headers: { "content-type": "application/octet-stream" } });
  expect(refused.statusCode).toBe(409);
  expect(refused.json()).toMatchObject({ status: 409, error: "library-mismatch" });
  const joined = await c.post("/v1/sync/import", { payload: bytes, params: { join: "1" }, headers: { "content-type": "application/octet-stream" } });
  expect(joined.statusCode).toBe(200);
  expect(getSync().library).toBe(stranger.sync.library);
});

test("pairing gives a code with the library, its key, a new token and this server's addresses", async () => {
  const c = await client(tmpPath());
  const r = (await c.post("/v1/sync/pair", { json: {} })).json();
  expect(r.code).toMatchObject({ v: 1, app: "justwrite", library: getSync().library });
  expect(r.code.key).toHaveLength(43);
  expect(r.code.token.length).toBeGreaterThan(20);
  // the token now guards the server (requests from other machines need it)
  expect((await c.get("/v1/sync/status")).statusCode).toBe(401);
  const ok = await c.get("/v1/sync/status", { headers: { authorization: `Bearer ${r.code.token}` } });
  expect(ok.statusCode).toBe(200);
  expect(ok.json().settings.listenOnNetwork).toBe(true);
});

test("a workspace reset starts a new library", async () => {
  const c = await client(tmpPath());
  await c.put("/v1/projects/prj1/book", { json: SNAP, headers: WINDOW });
  const before = getSync().library;
  expect((await c.post("/v1/data/reset", { json: {} })).statusCode).toBe(200);
  expect(getSync().library).not.toBe(before);
  // and recording still works on the re-created tables
  await c.put("/v1/projects/prj9/book", { json: SNAP, headers: WINDOW });
  expect(getSync().changesSince({}).changes.some((ch) => ch.t === "projects" && ch.k === '["prj9"]')).toBe(true);
});
