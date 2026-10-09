// SPDX-License-Identifier: MIT
// /v1/projects — the JustWrite book domain API (the port of
// justwrite_server/api/projects_api.py).
//
// The book lives in the **normalized per-entity tables** (parts/chapters/scenes/
// characters/…); `book_io.assemble`/`decompose` convert between those rows and the
// renderer's snapshot JSON. The aggregate seam the renderer uses is
// `GET/PUT /v1/projects/{id}/book`. The bare `/{id}` GET/PUT are back-compat aliases of it,
// and the per-entity reads (`/chapters`, `/characters`) are extracted from the assembled
// book so other clients (e.g. a future mobile app) get granular JSON.

import { HttpError } from "@delebash/llm-runner/platform/errors";
import { T } from "@delebash/llm-runner/platform/models";
import { pyIter, pyOr } from "@delebash/llm-runner/platform/py";
import { Hono, input } from "@delebash/llm-runner/platform/server";
import * as bookIo from "../book_io.js";
import { pyGet } from "../book_io.js";
import { DEMO_PROJECT_ID } from "#database/demo_seed";
import { createDemoProject } from "../database/demo_book.js";
import { getDb } from "../database/session.js";

const DICT_BODY = input({ body: T.Record(T.String(), T.Any()) });

// What each open window last loaded or saved of a book (bookIo.rowsByTable), keyed by the
// window's `x-jw-client` id: a save writes only that window's own edits against it, so a field
// another device changed meanwhile (sync) isn't written back with the window's older value. A
// window with no base here (no id, or a server restarted under it) saves against the database.
const bases = new Map();
const MAX_BASES = 32;
const baseKey = (c) => {
  const client = c.req.header("x-jw-client");
  return client ? `${client}\u0000${c.req.param("project_id")}` : null;
};
function remember(key, rows) {
  if (!key) return;
  bases.delete(key);
  bases.set(key, rows);
  if (bases.size > MAX_BASES) bases.delete(bases.keys().next().value);
}

function loadBook(c) {
  const projectId = c.req.param("project_id");
  const snap = assembleOr404(getDb(), projectId);
  remember(baseKey(c), bookIo.rowsByTable(bookIo.bookRows(projectId, snap)));
  return snap;
}

function saveBook(c) {
  const key = baseKey(c);
  const next = bookIo.saveBookChanges(getDb(), c.req.param("project_id"), pyOr(c.req.valid("json"), {}), key ? (bases.get(key) ?? null) : null);
  remember(key, next);
}

function assembleOr404(h, projectId) {
  const snap = bookIo.assemble(h, projectId);
  if (snap === null) throw new HttpError(404, "project not found");
  return snap;
}

export const router = new Hono();
router.get("/v1/projects", (c) =>
  c.json(
    getDb()
      .all("SELECT * FROM projects ORDER BY projects.updated_at DESC", [], "projects")
      .map((p) => ({ id: p.id, title: p.title, author: p.author, updatedAt: p.updated_at })),
  ),
);

// QC-40: the sample book — "The Ninth Facet" — is no longer seeded at boot; the renderer's
// "Try tutorial project" button creates it HERE on demand. Fixed id: never duplicated, and
// re-creatable after the user deletes it. Returns the metadata the renderer needs to
// register + open it.
router.post("/v1/projects/demo", (c) => {
  const h = getDb();
  const created = createDemoProject(h);
  const row = h.get("projects", DEMO_PROJECT_ID);
  return c.json({ id: row.id, title: row.title, author: row.author, created });
});

router.get("/v1/projects/:project_id", (c) => c.json(loadBook(c)));

router.put("/v1/projects/:project_id", DICT_BODY, (c) => {
  saveBook(c);
  return c.body(null, 204);
});

router.delete("/v1/projects/:project_id", (c) => {
  const h = getDb();
  const projectId = c.req.param("project_id");
  // child rows cascade via the project_id FK
  if (h.get("projects", projectId) !== null) h.delete("projects", { id: projectId });
  return c.body(null, 204);
});

router.get("/v1/projects/:project_id/book", (c) => c.json(loadBook(c)));

router.put("/v1/projects/:project_id/book", DICT_BODY, (c) => {
  saveBook(c);
  return c.body(null, 204);
});

router.get("/v1/projects/:project_id/chapters", (c) => {
  const snap = assembleOr404(getDb(), c.req.param("project_id"));
  const scenes = pyOr(pyGet(snap, "scenes"), {});
  const out = [];
  for (const part of pyIter(pyOr(pyGet(snap, "parts"), []))) {
    for (const ch of pyIter(pyOr(pyGet(part, "chapters"), []))) {
      out.push({
        id: pyGet(ch, "id"),
        num: pyGet(ch, "num"),
        title: pyGet(ch, "title"),
        words: pyGet(ch, "words", 0),
        status: pyGet(ch, "status"),
        partId: pyGet(part, "id"),
        partTitle: pyGet(part, "title"),
        sceneCount: pyOr(pyGet(scenes, pyGet(ch, "id"), []), []).length,
      });
    }
  }
  return c.json(out);
});

router.get("/v1/projects/:project_id/characters", (c) =>
  c.json(pyOr(pyGet(assembleOr404(getDb(), c.req.param("project_id")), "characters"), [])),
);
