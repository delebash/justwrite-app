// SPDX-License-Identifier: MIT
// /v1/rag — server-side RAG vector store + hybrid retrieval, per project (the port of
// justwrite_server/api/rag_api.py).
//
// The manuscript-chat index lives here, not in the renderer: the renderer embeds chunks
// (via its provider) and PUTs them; diff is a `shas` fetch; retrieval is a POST that returns
// the top-k chunks ranked server-side by the BM25 + cosine + RRF blend (rag_search.js).

import { opt, T } from "@delebash/llm-runner/platform/models";
import { pyFloatValue, pyJson } from "@delebash/llm-runner/platform/pyjson";
import { truthy } from "@delebash/llm-runner/platform/py";
import { dset, pyStrOf } from "../book_io.js";
import { getDb } from "../database/session.js";
import { hybridRank } from "../rag_search.js";

export const RagItem = T.Object({
  chunkId: T.String(),
  sha: T.String(),
  vector: T.Array(T.Number()),
  chunk: T.Record(T.String(), T.Any()),
});

export const RagPutBody = T.Object({
  model: opt(T.String(), ""),
  items: T.Array(RagItem),
});

export const RagSearchBody = T.Object({
  vector: T.Array(T.Number()),
  queryText: opt(T.String(), ""),
  k: opt(T.Integer(), 8),
});

export const RagRemoveBody = T.Object({ ids: T.Array(T.String()) });

export async function router(app) {
  app.get("/v1/rag/:project_id/status", async (req) => {
    const h = getDb();
    const pid = req.params.project_id;
    const meta = h.get("rag_meta", pid);
    const count = Number(h.value("SELECT count(*) FROM rag_vectors WHERE rag_vectors.project_id = ?", [pid]));
    return { exists: count > 0, count, model: meta ? meta.model : "", dims: meta ? meta.dims : 0 };
  });

  app.get("/v1/rag/:project_id/shas", async (req) => {
    const out = {};
    const rows = getDb().all(
      "SELECT rag_vectors.chunk_id AS chunk_id, rag_vectors.sha AS sha FROM rag_vectors WHERE rag_vectors.project_id = ?",
      [req.params.project_id],
    );
    for (const r of rows) dset(out, r.chunk_id, r.sha);
    return out;
  });

  app.put("/v1/rag/:project_id", { schema: { body: RagPutBody } }, async (req, reply) => {
    const h = getDb();
    const pid = req.params.project_id;
    const body = req.body;
    const dims = body.items.length ? body.items[0].vector.length : 0;
    h.tx(() => {
      const meta = h.get("rag_meta", pid);
      if (meta === null) h.insert("rag_meta", { project_id: pid, model: body.model, dims });
      else {
        const upd = {};
        if (body.model) upd.model = body.model;
        if (dims) upd.dims = dims;
        h.update("rag_meta", upd, { project_id: pid });
      }
      // session.merge per item: an existing row is updated in place; a new one is inserted.
      // Python's merges were flushed together at commit, so the SAME new chunkId twice in
      // one batch failed on the primary key (an IntegrityError → 500) — a second plain
      // insert fails here the same way.
      const existed = new Set(
        h.all("SELECT rag_vectors.chunk_id AS chunk_id FROM rag_vectors WHERE rag_vectors.project_id = ?", [pid]).map((r) => r.chunk_id),
      );
      for (const it of body.items) {
        const row = {
          sha: it.sha,
          // list[float]: Python writes every element as a float ("1.0").
          vector: pyJson(it.vector.map(pyFloatValue)),
          chunk: pyJson(it.chunk),
        };
        if (existed.has(it.chunkId)) h.update("rag_vectors", row, { project_id: pid, chunk_id: it.chunkId });
        else h.insert("rag_vectors", { project_id: pid, chunk_id: it.chunkId, ...row });
      }
    });
    return reply.code(204).send();
  });

  app.post("/v1/rag/:project_id/search", { schema: { body: RagSearchBody } }, async (req) => {
    const rows = getDb().all("SELECT * FROM rag_vectors WHERE rag_vectors.project_id = ?", [req.params.project_id], "rag_vectors");
    if (!rows.length) return [];
    const items = rows.map((r) => {
      const chunk = JSON.parse(r.chunk);
      // BM25 scores over text + the scene's entity-links line (Move 3) so "who/where" terms
      // hit scenes whose prose never names the entity; vectors and the returned chunk are
      // untouched.
      const links = Object.hasOwn(chunk, "links") ? chunk.links : "";
      const text = Object.hasOwn(chunk, "text") ? chunk.text : "";
      return { id: r.chunk_id, vector: JSON.parse(r.vector), text: truthy(links) ? `${pyStrOf(text)} ${pyStrOf(links)}` : text, chunk };
    });
    return hybridRank(items, req.body.vector, req.body.queryText, req.body.k);
  });

  app.post("/v1/rag/:project_id/remove", { schema: { body: RagRemoveBody } }, async (req, reply) => {
    const ids = req.body.ids;
    if (ids.length) {
      getDb().run(
        `DELETE FROM rag_vectors WHERE rag_vectors.project_id = ? AND rag_vectors.chunk_id IN (${ids.map(() => "?").join(", ")})`,
        [req.params.project_id, ...ids],
      );
    }
    return reply.code(204).send();
  });

  app.delete("/v1/rag/:project_id", async (req, reply) => {
    const h = getDb();
    const pid = req.params.project_id;
    h.tx(() => {
      h.run("DELETE FROM rag_vectors WHERE rag_vectors.project_id = ?", [pid]);
      if (h.get("rag_meta", pid) !== null) h.delete("rag_meta", { project_id: pid });
    });
    return reply.code(204).send();
  });
}
