// SPDX-License-Identifier: MIT
// JustWrite's error answers — the problem-type prefix and the catch-all 500 — shared by the
// server on a computer (app.js) and the phone's in-app server (phone.js).

import { getLogger } from "@delebash/llm-runner/platform/log";

const log = getLogger("justwrite_server.app");

export const TYPE_BASE = "https://justwrite.dev/errors/";

/**
 * The catch-all error envelope: an unhandled exception becomes a JSON 500 that still carries
 * the CORS headers (stamped by the CORS hook before the route ran), so the browser sees a
 * real error instead of a CORS block. Uniform with JustVoice's server (verified the hard way
 * there, 2026-06-12). The detail is Python's `str(exc)[:300]`.
 */
export function errorEnvelope(err, request, reply) {
  log.exception(`unhandled error on ${request.method} ${request.url.split("?")[0]}`, err);
  const detail = [...String(err instanceof Error ? err.message : err)].slice(0, 300).join("");
  return reply.code(500).type("application/json").send({ title: "Internal Server Error", detail });
}
