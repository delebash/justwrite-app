// SPDX-License-Identifier: MIT
// POST /v1/shutdown — the kit's route (platform/shutdown_api.js), mounted so the desktop shell can
// ask a JustWrite server it finds on its port to stop before it would kill it (2026-10-15). The
// test client connects as another machine; "this machine" is a request with a loopback address.
import { expect, test } from "vitest";
import { createApp } from "../src/app.js";
import { client, tmpPath, useHermeticKit } from "./helpers.js";

useHermeticKit();

const fromThisMachine = (app, path, method = "POST") =>
  app.request(`http://testserver${path}`, { method }, { incoming: { socket: { remoteAddress: "127.0.0.1" } } });

test("shutdown_is_refused_from_another_machine", async () => {
  const c = await client(tmpPath());
  expect((await c.post("/v1/shutdown")).statusCode).toBe(403);
});

test("shutdown_from_this_machine_needs_no_token", async () => {
  // Tokens required even on this machine: the rest of /v1 asks for one (the book list here), the
  // shell's stop doesn't carry one and still gets through.
  const tmp = tmpPath();
  await (await client(tmp)).put("/v1/server-auth", { json: { tokens: ["s3cret"], requireForLoopback: true } });
  const app = await createApp(tmp);
  expect((await fromThisMachine(app, "/v1/projects", "GET")).status).toBe(401);
  const r = await fromThisMachine(app, "/v1/shutdown");
  expect(r.status).toBe(200);
  expect(await r.json()).toEqual({ ok: true, exiting: false }); // no running server in a test
});
