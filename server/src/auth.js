// SPDX-License-Identifier: MIT
// JustWrite's auth SEAM — the settings read behind the family bearer-auth middleware (the
// kit's `BearerAuthMiddleware`, wired in app.js); the port of justwrite_server/auth.py.
//
// The POLICY (token check, loopback bypass, the 2026-08-05 lockout escape) lives once in the
// kit. What stays here is the only genuinely per-app part: where this app keeps its auth
// config — the `auth` row of the settings document (`{ tokens: [...], requireForLoopback:
// bool }`), read per /v1 request so a change applies live.

import { getLogger } from "@delebash/llm-runner/platform/log";
import { truthy } from "@delebash/llm-runner/platform/py";
import { orElse, pyGet, pyIter, pyLoads } from "./book_io.js";
import { state } from "./database/session.js";

const log = getLogger("justwrite_server.auth");

/** [tokens, requireForLoopback] from the `auth` settings row. Defaults to no auth on any read
 * error so a settings glitch can't lock the user out. */
export function readAuth() {
  const h = state.handle;
  if (h === null) return [[], false];
  try {
    const row = h.get("settings", "auth");
    if (row === null) return [[], false];
    const cfg = orElse(pyLoads(row.value), {});
    const tokens = pyIter(orElse(pyGet(cfg, "tokens"), [])).filter((t) => typeof t === "string" && t);
    return [tokens, truthy(pyGet(cfg, "requireForLoopback"))];
  } catch (e) {
    // never let an auth-config read 500
    log.warning(`auth config read failed (treating as no-auth): ${e?.message ?? e}`);
    return [[], false];
  }
}
