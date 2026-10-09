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
import { pyOr } from "@delebash/llm-runner/platform/py";
import { pyJson } from "@delebash/llm-runner/platform/pyjson";
import { Hono, input } from "@delebash/llm-runner/platform/server";
import { isoNowUtc } from "../book_io.js";
import { getDb } from "../database/session.js";

export const router = new Hono();
router.get("/v1/projects/:project_id/sweep-draft", (c) => {
  const row = getDb().get("sweep_drafts", c.req.param("project_id"));
  if (row === null) return c.json({ draft: null, updatedAt: "" });
  let draft;
  try {
    draft = JSON.parse(row.data);
  } catch {
    draft = null;
  }
  return c.json({ draft, updatedAt: row.updated_at });
});

router.put("/v1/projects/:project_id/sweep-draft", input({ body: T.Record(T.String(), T.Any()) }), (c) => {
  const h = getDb();
  const pid = c.req.param("project_id");
  // The FK to projects.id makes an orphan draft impossible — surface a clean 404 instead of
  // an integrity error when the project doesn't exist.
  if (h.get("projects", pid) === null) throw new HttpError(404, "project not found");
  const now = isoNowUtc();
  const data = pyJson(pyOr(c.req.valid("json"), {}));
  if (h.get("sweep_drafts", pid) === null) h.insert("sweep_drafts", { project_id: pid, data, updated_at: now });
  else h.update("sweep_drafts", { data, updated_at: now }, { project_id: pid });
  return c.json({ ok: true, updatedAt: now });
});

router.delete("/v1/projects/:project_id/sweep-draft", (c) => {
  const h = getDb();
  const pid = c.req.param("project_id");
  if (h.get("sweep_drafts", pid) !== null) h.delete("sweep_drafts", { project_id: pid });
  return c.body(null, 204);
});
