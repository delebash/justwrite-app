// SPDX-License-Identifier: MIT
// The phone's twin of autosave_api.js. The file autosave (a rotating JSON copy of each book in a
// folder) isn't on the phone — decided 2026-10-08 (JustWrite's TASKS, Sync decision 8): the
// database is the save there, and the storage guard keeps its change files in the app's own
// folder. The routes answer as "no autosave folder", so the window's autosave timer and Settings
// → Backups behave as they do when a computer has none.
import { HttpError } from "@delebash/llm-runner/platform/errors";

export async function router(app) {
  app.post("/v1/projects/:project_id/autosave", async (req) => ({ ok: true, projectId: req.params.project_id, key: null }));
  app.get("/v1/projects/autosaves", async () => []);
  app.get("/v1/projects/autosaves/:key", async () => {
    throw new HttpError(404, "autosave not found");
  });
  app.delete("/v1/projects/autosaves", async (_req, reply) => reply.code(204).send());
  app.delete("/v1/projects/autosaves/:key", async (_req, reply) => reply.code(204).send());
  app.get("/v1/projects/autosave-dir", async () => ({ dir: null }));
  app.put("/v1/projects/autosave-dir", async () => {
    throw new HttpError(400, "there is no autosave folder on the phone");
  });
}
