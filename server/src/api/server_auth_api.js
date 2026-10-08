// SPDX-License-Identifier: MIT
// GET/PUT /v1/server-auth — the bearer-token door, and the lockout escape (the port of
// justwrite_server/api/server_auth_api.py).
//
// The family shape (docgen built it first, 2026-08-05; the apps work the same — user
// ruling): auth config gets its OWN route instead of riding the generic settings API, so the
// middleware can exempt exactly THIS door (plus /v1/health) for loopback clients. Without
// the exemption, `requireForLoopback` + a lost token gated even the boot probe and every way
// to fix it. The tokens already sit plaintext in the app DB any local process can read, so
// the loopback door exposes nothing new.

import { HttpError } from "@delebash/llm-runner/platform/errors";
import { T } from "@delebash/llm-runner/platform/models";
import { pyJson } from "@delebash/llm-runner/platform/pyjson";
import { pyIter, pyOr, strip, truthy } from "@delebash/llm-runner/platform/py";
import { pyGet, pyLoads } from "../book_io.js";
import { state } from "../database/session.js";

const NO_AUTH = () => ({ tokens: [], requireForLoopback: false });

function read() {
  const h = state.handle;
  if (h === null) return NO_AUTH();
  try {
    const row = h.get("settings", "auth");
    const cfg = row && row.value ? pyLoads(row.value) : {};
    return {
      tokens: pyIter(pyOr(pyGet(cfg, "tokens"), [])).filter((t) => typeof t === "string" && t),
      requireForLoopback: truthy(pyGet(cfg, "requireForLoopback")),
    };
  } catch {
    // an unreadable row means no auth, never a 500
    return NO_AUTH();
  }
}

export async function router(app) {
  app.get("/v1/server-auth", async () => read());

  app.put("/v1/server-auth", { schema: { body: T.Record(T.String(), T.Any()) } }, async (req) => {
    const body = req.body;
    const tokens = pyGet(body, "tokens");
    if (!Array.isArray(tokens) || !tokens.every((t) => typeof t === "string")) {
      throw new HttpError(400, "tokens must be a list of strings");
    }
    const cfg = { tokens: tokens.filter((t) => strip(t)), requireForLoopback: truthy(pyGet(body, "requireForLoopback")) };
    const h = state.handle;
    if (h === null) throw new HttpError(503, "database not ready");
    if (h.get("settings", "auth") === null) h.insert("settings", { key: "auth", value: pyJson(cfg) });
    else h.update("settings", { value: pyJson(cfg) }, { key: "auth" });
    return cfg;
  });
}
