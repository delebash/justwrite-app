// SPDX-License-Identifier: MIT
// /v1/projects/*/sweep-draft — the entity sweep's per-project working draft (the port of
// justwrite_server/api/sweep_draft_api.py).
//
// A (2026-07-18): the sweep writes each chapter's raw extraction result here as it
// finishes, so a crash/cancel/close never loses an hour-long run — reopening the sweep modal
// resumes from the draft and only re-scans pending, failed, or text-changed chapters. The
// draft is working state, NOT the book: nothing lands in the story bible until the user
// accepts proposals, and the draft is cleared on accept or Start-over.
//
// Shape is renderer-owned (services/analysis/sweepDraft.js is the one writer); the server
// stores the document opaquely, like the autosave mirror. GET returns {"draft": null} rather
// than 404 when absent — absence is the normal first-run state, not an error.

import { HttpError } from "@delebash/llm-runner/platform/errors";
import { T } from "@delebash/llm-runner/platform/models";
import { pyJson } from "@delebash/llm-runner/platform/pyjson";
import { isoNowUtc, orElse } from "../book_io.js";
import { getDb } from "../database/session.js";

export async function router(app) {
  app.get("/v1/projects/:project_id/sweep-draft", async (req) => {
    const row = getDb().get("sweep_drafts", req.params.project_id);
    if (row === null) return { draft: null, updatedAt: "" };
    let draft;
    try {
      draft = JSON.parse(row.data);
    } catch {
      draft = null;
    }
    return { draft, updatedAt: row.updated_at };
  });

  app.put("/v1/projects/:project_id/sweep-draft", { schema: { body: T.Record(T.String(), T.Any()) } }, async (req) => {
    const h = getDb();
    const pid = req.params.project_id;
    // The FK to projects.id makes an orphan draft impossible — surface a clean 404 instead of
    // an integrity error when the project doesn't exist.
    if (h.get("projects", pid) === null) throw new HttpError(404, "project not found");
    const now = isoNowUtc();
    const data = pyJson(orElse(req.body, {}));
    if (h.get("sweep_drafts", pid) === null) h.insert("sweep_drafts", { project_id: pid, data, updated_at: now });
    else h.update("sweep_drafts", { data, updated_at: now }, { project_id: pid });
    return { ok: true, updatedAt: now };
  });

  app.delete("/v1/projects/:project_id/sweep-draft", async (req, reply) => {
    const h = getDb();
    if (h.get("sweep_drafts", req.params.project_id) !== null) h.delete("sweep_drafts", { project_id: req.params.project_id });
    return reply.code(204).send();
  });
}
