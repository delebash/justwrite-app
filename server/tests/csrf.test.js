// SPDX-License-Identifier: MIT
// Port of tests/test_csrf.py — the CSRF Origin guard (the kit's csrf.js), the no-token "do
// the vector directly" hardening, and the CORS hook that sits inside it. +2 tests beyond
// Python: the settings-driven CORS branch (no Python test covered it; its answers are hono/cors's
// since 2026-10-13), and the Electron window's origin (`app://justwrite`),
// which the desktop app's mutating calls carry.
import { expect, test } from "vitest";
import { client, tmpPath, useHermeticKit } from "./helpers.js";

useHermeticKit();

test("cross_site_mutation_rejected", async () => {
  const c = await client(tmpPath());
  // A malicious page's cross-site mutating request is rejected (the CSRF vector).
  const r = await c.put("/v1/projects/x/book", { json: { project: { title: "T" } }, headers: { origin: "http://evil.example" } });
  expect(r.statusCode).toBe(403);
});

test("no_origin_and_app_origin_allowed", async () => {
  const c = await client(tmpPath());
  // No Origin (non-browser client) → allowed.
  expect((await c.put("/v1/projects/a/book", { json: { project: { title: "T" } } })).statusCode).toBe(204);
  // The app's own dev origin → allowed (so dev:spa + the headless smoke work).
  expect(
    (await c.put("/v1/projects/b/book", { json: { project: { title: "T" } }, headers: { origin: "http://localhost:1420" } }))
      .statusCode,
  ).toBe(204);
});

test("same_origin_mutation_allowed", async () => {
  // The SERVER-HOSTED UI (headless mode: `serve` + a browser on the dist/ mount) is
  // same-origin, and browsers DO send Origin on same-origin mutations. Without the
  // same-origin allowance every write from that UI 403'd (found 2026-07-15). The origin is
  // derived per-request, so a non-default host/port works too.
  const c = await client(tmpPath());
  const r = await c.put("/v1/projects/s/book", { json: { project: { title: "T" } }, headers: { origin: "http://testserver" } });
  expect(r.statusCode).toBe(204);
});

test("cross_site_read_allowed", async () => {
  const c = await client(tmpPath());
  await c.put("/v1/projects/x/book", { json: { project: { title: "T" } } });
  // GET is not the CSRF vector (and CORS blocks the page from reading the body).
  const r = await c.get("/v1/projects/x/book", { headers: { origin: "http://evil.example" } });
  expect(r.statusCode).toBe(200);
});

test("settings_driven_cors", async () => {
  // The `cors` settings section (read at boot) switches CORS from allow-all to an explicit
  // list + regex with credentials. The CORS answers are hono/cors's (the kit's platform/cors.js
  // since 2026-10-13, `a4ef14d`; hono.dev/docs/middleware/builtin/cors) — the kit's
  // server/tests/cors.test.js asserts the same. The CSRF guard still doesn't take the regex
  // (measured on the Python server 2026-10-08: app.py passed it only the origins list).
  const tmp = tmpPath();
  await (await client(tmp)).patch("/v1/settings", {
    json: { cors: { origins: ["http://ok.example"], originRegex: "https://.*\\.trusted\\.dev" } },
  });
  const c = await client(tmp); // CORS is read at boot
  const cors = (r) =>
    Object.fromEntries(Object.entries(r.headers).filter(([k]) => k.startsWith("access-control") || k === "vary"));

  let r = await c.get("/v1/health", { headers: { origin: "http://ok.example" } });
  expect(cors(r)).toEqual({ "access-control-allow-credentials": "true", "access-control-allow-origin": "http://ok.example", vary: "Origin" });
  r = await c.get("/v1/health", { headers: { origin: "https://a.trusted.dev" } });
  expect(r.headers["access-control-allow-origin"]).toBe("https://a.trusted.dev");
  // Not allowed: no Allow-Origin, so the browser keeps the answer from the page.
  r = await c.get("/v1/health", { headers: { origin: "http://evil.example" } });
  expect(cors(r)).toEqual({ "access-control-allow-credentials": "true", vary: "Origin" });

  // A preflight is answered 204 with no body; allowHeaders ["*"] allows the requested headers back.
  r = await c.options("/v1/health", {
    headers: { origin: "http://ok.example", "access-control-request-method": "PUT", "access-control-request-headers": "Content-Type, X-Custom" },
  });
  expect(r.statusCode).toBe(204);
  expect(r.body).toBe("");
  const h = cors(r);
  expect(h["access-control-allow-origin"]).toBe("http://ok.example");
  expect(h["access-control-allow-credentials"]).toBe("true");
  expect(h["access-control-max-age"]).toBe("600");
  expect(h["access-control-allow-methods"].split(",")).toContain("PUT");
  expect(h["access-control-allow-headers"]).toBe("Content-Type,X-Custom");
  // A refused preflight: 204 with no Allow-Origin — the browser refuses the request.
  r = await c.options("/v1/health", { headers: { origin: "http://evil.example", "access-control-request-method": "PUT" } });
  expect(r.statusCode).toBe(204);
  expect(r.headers["access-control-allow-origin"]).toBeUndefined();

  // The CORS origins are the CSRF guard's extra allowlist; its regex is not.
  expect((await c.put("/v1/projects/a/book", { json: {}, headers: { origin: "http://ok.example" } })).statusCode).toBe(204);
  r = await c.put("/v1/projects/a/book", { json: {}, headers: { origin: "https://a.trusted.dev" } });
  expect(r.statusCode).toBe(403);
  expect(cors(r)).toEqual({}); // CSRF runs outside CORS: its 403 carries no CORS headers
});

test("desktop_origin_survives_a_cors_lockdown", async () => {
  // Not Python's answer (it allowed only the listed origins) — decided 2026-10-08 with the
  // move: the desktop window is the app itself, so a CORS lockdown never shuts it out.
  const tmp = tmpPath();
  await (await client(tmp)).patch("/v1/settings", { json: { cors: { origins: ["http://ok.example"] } } });
  const c = await client(tmp);
  const r = await c.get("/v1/health", { headers: { origin: "app://justwrite" } });
  expect(r.headers["access-control-allow-origin"]).toBe("app://justwrite");
});

test("electron_window_origin_allowed", async () => {
  // The desktop window loads the renderer from app://justwrite; its writes must pass.
  const c = await client(tmpPath());
  const r = await c.put("/v1/projects/e/book", { json: { project: { title: "T" } }, headers: { origin: "app://justwrite" } });
  expect(r.statusCode).toBe(204);
  expect(r.headers["access-control-allow-origin"]).toBe("*");
});
