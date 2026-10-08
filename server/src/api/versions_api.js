// SPDX-License-Identifier: MIT
// /v1/versions — per-chapter version history, real rows (the port of
// justwrite_server/api/versions_api.py).
//
// A version is a named snapshot of a chapter's scenes; the renderer keeps the last 30 per
// chapter and replaces a chapter's list wholesale on any change (save / delete /
// restore-undo), so PUT is a delete-all-then-insert for that (project, chapter) — the same
// shape as chat sessions. project_id FKs projects, so deleting a book cascades its versions.

import { opt, T } from "@delebash/llm-runner/platform/models";
import { pyJson } from "@delebash/llm-runner/platform/pyjson";
import { orElse, setdefault } from "../book_io.js";
import { getDb } from "../database/session.js";

export const VersionIO = T.Object({
  id: T.String(),
  label: opt(T.String(), ""),
  savedAt: opt(T.String(), ""),
  words: opt(T.Integer(), 0),
  scenes: opt(T.Array(T.Any()), []),
});

export const SaveVersionsBody = T.Object({
  projectId: T.String(),
  chapterId: T.String(),
  versions: opt(T.Array(VersionIO), []),
});

export async function router(app) {
  app.get("/v1/versions", { schema: { querystring: T.Object({ projectId: T.String() }) } }, async (req) => {
    const rows = getDb().all(
      "SELECT * FROM chapter_versions WHERE chapter_versions.project_id = ? ORDER BY chapter_versions.chapter_id, chapter_versions.position",
      [req.query.projectId],
      "chapter_versions",
    );
    const out = {};
    for (const r of rows) {
      setdefault(out, r.chapter_id, []).push({
        id: r.id,
        label: r.label,
        savedAt: r.saved_at,
        words: r.words,
        scenes: JSON.parse(r.scenes || "[]"),
      });
    }
    return out;
  });

  app.put("/v1/versions", { schema: { body: SaveVersionsBody } }, async (req, reply) => {
    const h = getDb();
    const body = req.body;
    h.tx(() => {
      h.delete("chapter_versions", { project_id: body.projectId, chapter_id: body.chapterId });
      for (const [i, v] of body.versions.entries()) {
        h.insert("chapter_versions", {
          project_id: body.projectId,
          chapter_id: body.chapterId,
          id: v.id,
          position: i,
          saved_at: v.savedAt,
          label: v.label,
          words: v.words,
          scenes: pyJson(orElse(v.scenes, [])),
        });
      }
    });
    return reply.code(204).send();
  });
}
