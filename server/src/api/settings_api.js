// SPDX-License-Identifier: MIT
// /v1/settings — the renderer's preferences document, real rows (the port of
// justwrite_server/api/settings_api.py).
//
// One row per top-level section (ui / ai / hardwarePresets / activeProjectId / …); GET
// assembles them into a single document, PATCH upserts the sections it's given. Each
// section has a single renderer-side owner that writes it wholesale, so a shallow
// per-section upsert is the right merge — a deep merge would fail to propagate key
// DELETIONS (e.g. clearing a model-tier override drops a key from the `ai` section). Values
// are real JSON the server parses, stored as Python's json.dumps text.

import { T } from "@delebash/llm-runner/platform/models";
import { pyJson } from "@delebash/llm-runner/platform/pyjson";
import { Hono, input } from "@delebash/llm-runner/platform/server";
import { dset, pyLoads } from "../book_io.js";
import { getDb } from "../database/session.js";

// D3b (2026-07-13, user): a user-changed FOLDER PATH never resets. These setting keys are
// folder-path CONFIG, not workspace data — `autosaveDir` (the autosave folder) and
// `chooserDirs` (every remembered file/folder-dialog location) — and survive a workspace
// reset the way the data root already does. BOTH reset paths preserve them: DELETE
// /v1/settings here, and the shared /v1/data/reset in data_admin.js (which imports this
// whitelist so there's one source of truth).
export const PRESERVED_FOLDER_KEYS = ["autosaveDir", "chooserDirs"];

/** Every row decoded into one document (an unreadable value reads as null). */
export function readAll(h) {
  const out = {};
  for (const row of h.all("SELECT * FROM settings", [], "settings")) {
    try {
      dset(out, row.key, pyLoads(row.value));
    } catch {
      dset(out, row.key, null);
    }
  }
  return out;
}

/** Upsert each given section wholesale (one transaction). */
export function writeMany(h, patch) {
  h.tx(() => {
    for (const [key, value] of Object.entries(patch)) {
      const encoded = pyJson(value);
      if (h.get("settings", key) === null) h.insert("settings", { key, value: encoded });
      else h.update("settings", { value: encoded }, { key });
    }
  });
}

/** Wipe every section EXCEPT the folder-path config whitelist (D3b). */
export function clearKeepingFolders(h) {
  h.run(`DELETE FROM settings WHERE settings."key" NOT IN (${PRESERVED_FOLDER_KEYS.map(() => "?").join(", ")})`, PRESERVED_FOLDER_KEYS);
}

export const router = new Hono();
router.get("/v1/settings", (c) => c.json(readAll(getDb())));

router.patch("/v1/settings", input({ body: T.Record(T.String(), T.Any()) }), (c) => {
  const h = getDb();
  writeMany(h, c.req.valid("json"));
  return c.json(readAll(h));
});

router.delete("/v1/settings", (c) => {
  clearKeepingFolders(getDb());
  return c.body(null, 204);
});
