// SPDX-License-Identifier: MIT
// Port of tests/test_server_auth.py — /v1/server-auth, the bearer-token door, persists (the
// P5 dormant-bug pin: the route once froze a pre-boot session factory; the JS reads the
// database handle at call time).
import { expect, test } from "vitest";
import { client, tmpPath, useHermeticKit } from "./helpers.js";

useHermeticKit();

test("server_auth_roundtrip_persists_tokens", async () => {
  const c = await client(tmpPath());
  // Empty by default — auth off.
  expect((await c.get("/v1/server-auth")).json()).toEqual({ tokens: [], requireForLoopback: false });

  const r = await c.put("/v1/server-auth", { json: { tokens: ["s3cret", "  "] } });
  expect(r.statusCode).toBe(200);
  expect(r.json()).toEqual({ tokens: ["s3cret"], requireForLoopback: false });

  // Tokens now gate /v1 for non-loopback clients (the test client is one), so read it back
  // WITH the bearer — proves the config actually reached the DB.
  const body = (await c.get("/v1/server-auth", { headers: { authorization: "Bearer s3cret" } })).json();
  expect(body).toEqual({ tokens: ["s3cret"], requireForLoopback: false });
});

test("server_auth_rejects_non_string_tokens", async () => {
  const c = await client(tmpPath());
  expect((await c.put("/v1/server-auth", { json: { tokens: "nope" } })).statusCode).toBe(400);
});
