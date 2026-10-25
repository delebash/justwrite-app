// SPDX-License-Identifier: MIT
// Several windows on one server — the desktop app and a browser on the server started on its own
// (the kit's ChangeCounter on the sync product's GET /v1/sync/rev, server/src/sync.js): a window's
// save that changed a book moves the counter for the OTHER windows, never its own, so their open
// book reads again; a write that changed no book row moves nothing; a restore or a workspace reset
// renews the data's epoch (every window reloads); clearing the settings keeps it.
import { expect, test } from "vitest";
import { DATA_EPOCH_KEY } from "../src/api/settings_api.js";
import { pyLoads } from "../src/book_io.js";
import { state as dbState } from "../src/database/session.js";
import { client, tmpPath, useHermeticKit } from "./helpers.js";

useHermeticKit();

const SNAP = {
  project: { title: "The Lamp", author: "Mira Halden" },
  parts: [{ id: "p1", title: "Part One", chapters: [{ id: "ch1", num: 1, title: "Arrival", words: 10, status: "draft", strands: [] }] }],
  scenes: { ch1: [{ id: "s1", title: "Opening", body: "<p>The lamp on the bench was lying.</p>" }] },
  characters: [{ id: "c1", name: "Cael" }],
};
const A = { "x-client-id": "window-a" };
const B = { "x-client-id": "window-b" };
const rev = async (c, headers) => (await c.get("/v1/sync/rev", { headers })).json();

test("a window's book save moves the other windows' counter, never its own", async () => {
  const c = await client(tmpPath());
  const a0 = await rev(c, A);
  const b0 = await rev(c, B);
  expect(a0.epoch).toBeTruthy();
  expect(a0.pollSeconds).toBeGreaterThan(0);
  expect((await c.put("/v1/projects/prj1/book", { json: SNAP, headers: A })).statusCode).toBe(204);
  expect((await rev(c, A)).rev).toBe(a0.rev);
  expect((await rev(c, B)).rev).not.toBe(b0.rev);
  // B saves an edit of its own: A's counter moves, B's stays
  const b1 = await rev(c, B);
  const a1 = await rev(c, A);
  const snap = (await c.get("/v1/projects/prj1/book", { headers: B })).json();
  snap.parts[0].chapters[0].title = "Arrival, revised";
  expect((await c.put("/v1/projects/prj1/book", { json: snap, headers: B })).statusCode).toBe(204);
  expect((await rev(c, B)).rev).toBe(b1.rev);
  expect((await rev(c, A)).rev).not.toBe(a1.rev);
});

test("a write that changed no book row moves nobody's counter", async () => {
  const c = await client(tmpPath());
  await c.put("/v1/projects/prj1/book", { json: SNAP, headers: A });
  const b0 = await rev(c, B);
  // the same book again (nothing changed), and a setting
  const snap = (await c.get("/v1/projects/prj1/book", { headers: A })).json();
  expect((await c.put("/v1/projects/prj1/book", { json: snap, headers: A })).statusCode).toBe(204);
  expect((await c.patch("/v1/settings", { json: { ui: { theme: "dark" } }, headers: A })).statusCode).toBe(200);
  expect((await rev(c, B)).rev).toBe(b0.rev);
});

test("a workspace reset renews the epoch; clearing the settings keeps it", async () => {
  const c = await client(tmpPath());
  const e0 = (await rev(c, A)).epoch;
  expect((await c.delete("/v1/settings", { headers: A })).statusCode).toBe(204);
  expect((await rev(c, A)).epoch).toBe(e0);
  expect((await c.post("/v1/data/reset", { json: {}, headers: A })).statusCode).toBe(200);
  expect((await rev(c, B)).epoch).not.toBe(e0);
});

test("a restore renews the epoch, in the restored data", async () => {
  const c = await client(tmpPath());
  await c.put("/v1/projects/prj1/book", { json: SNAP, headers: A });
  const blob = (await c.get("/v1/data/backup")).rawPayload;
  const e0 = (await rev(c, A)).epoch;
  const form = new FormData();
  form.append("file", new Blob([blob], { type: "application/zip" }), "backup.zip");
  const r = await c.app.request("http://testserver/v1/data/restore", { method: "POST", body: form, headers: { host: "testserver", ...A } });
  expect(r.status).toBe(200);
  const e1 = (await rev(c, B)).epoch;
  expect(e1).not.toBe(e0);
  // kept in the database: the backup's own row (the old epoch) was replaced
  expect(pyLoads(dbState.handle.get("settings", DATA_EPOCH_KEY).value)).toBe(e1);
});

test("the epoch is the server's row: the settings document neither shows nor writes it", async () => {
  const c = await client(tmpPath());
  const e0 = (await rev(c, A)).epoch;
  expect((await c.get("/v1/settings")).json()).not.toHaveProperty(DATA_EPOCH_KEY);
  expect((await c.patch("/v1/settings", { json: { [DATA_EPOCH_KEY]: "stale" } })).statusCode).toBe(200);
  expect((await rev(c, A)).epoch).toBe(e0);
});
