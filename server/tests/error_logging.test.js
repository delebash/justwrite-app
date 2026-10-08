// SPDX-License-Identifier: MIT
// Port of tests/test_error_logging.py — every handled error reaches the server log
// (2026-07-17, #6). The motivating bug: a preset PUT with a bad field was rejected 422 by
// FastAPI's DEFAULT validation handler, which logs NOTHING — so a failed write left zero
// server trace. These pin that (a) a 422 logs at WARNING with method+path, (b) it returns
// the problem+json shape (not FastAPI's default), and (c) a 4xx HTTP error logs too.
// pytest's caplog → a sink on the kit's log (every logger, as caplog's root handler saw).
import { addSink, LEVELS } from "@delebash/llm-runner/platform/log";
import { expect, onTestFinished, test } from "vitest";
import { client, tmpPath, useHermeticKit } from "./helpers.js";

useHermeticKit();

function captureWarnings() {
  const records = [];
  const remove = addSink((r) => {
    if (r.levelno >= LEVELS.WARNING) records.push(r);
  });
  onTestFinished(remove);
  return records;
}

test("422_validation_failure_is_logged_and_problem_json", async () => {
  const c = await client(tmpPath());
  const records = captureWarnings();
  // temperature must be a float — a string fails body validation → 422.
  const r = await c.post("/v1/ai/engine-presets", { json: { name: "x", temperature: "not-a-number" } });
  expect(r.statusCode).toBe(422);
  // OUR handler, not FastAPI's default: problem+json + a JSON-safe errors list.
  expect(r.headers["content-type"].startsWith("application/problem+json")).toBe(true);
  const body = r.json();
  expect(body.status === 422 && body.type.endsWith("/validation-error")).toBe(true);
  expect(Array.isArray(body.errors) && body.errors.length > 0).toBe(true);
  // The whole point: it left a trace, naming the path.
  expect(records.some((rec) => rec.msg.includes("/v1/ai/engine-presets") && rec.levelno === LEVELS.WARNING)).toBe(true);
});

test("4xx_httpexception_is_logged", async () => {
  const c = await client(tmpPath());
  const records = captureWarnings();
  // PUT a preset id that doesn't exist → 404 (presets_api).
  const r = await c.put("/v1/ai/engine-presets/does-not-exist", { json: { id: "does-not-exist", name: "x" } });
  expect(r.statusCode).toBe(404);
  expect(records.some((rec) => rec.msg.includes("does-not-exist") && rec.levelno === LEVELS.WARNING)).toBe(true);
});
