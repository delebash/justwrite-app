// SPDX-License-Identifier: MIT
// The phone's twin of autosave_api.js. The file autosave (a rotating JSON copy of each book in a
// folder) isn't on the phone — decided 2026-10-08 (JustWrite's TASKS, Sync decision 8): the
// database is the save there, and the storage guard keeps its change files in the app's own
// folder. The routes answer as "no autosave folder", so the window's autosave timer and Settings
// → Backups behave as they do when a computer has none.
import { HttpError } from "@delebash/llm-runner/platform/errors";
import { Hono } from "@delebash/llm-runner/platform/server";

export const router = new Hono();
router.post("/v1/projects/:project_id/autosave", (c) => c.json({ ok: true, projectId: c.req.param("project_id"), key: null }));
router.get("/v1/projects/autosaves", (c) => c.json([]));
router.get("/v1/projects/autosaves/:key", () => {
  throw new HttpError(404, "autosave not found");
});
router.delete("/v1/projects/autosaves", (c) => c.body(null, 204));
router.delete("/v1/projects/autosaves/:key", (c) => c.body(null, 204));
router.get("/v1/projects/autosave-dir", (c) => c.json({ dir: null }));
router.put("/v1/projects/autosave-dir", () => {
  throw new HttpError(400, "there is no autosave folder on the phone");
});
