// SPDX-License-Identifier: MIT
// Port of tests/test_rag.py — /v1/rag, the server-side RAG vector store + hybrid search.
import { expect, test } from "vitest";
import { state } from "../src/database/session.js";
import { client, tmpPath, useHermeticKit } from "./helpers.js";

useHermeticKit();

const EMPTY = { exists: false, count: 0, model: "", dims: 0 };

test("put_status_shas", async () => {
  const c = await client(tmpPath());
  expect((await c.get("/v1/rag/p1/status")).json()).toEqual(EMPTY);
  const body = {
    model: "text-embedding-3-small",
    items: [
      { chunkId: "a", sha: "sha-a", vector: [1.0, 0.0, 0.0], chunk: { id: "a", text: "alpha" } },
      { chunkId: "b", sha: "sha-b", vector: [0.0, 1.0, 0.0], chunk: { id: "b", text: "beta" } },
    ],
  };
  expect((await c.put("/v1/rag/p1", { json: body })).statusCode).toBe(204);
  expect((await c.get("/v1/rag/p1/status")).json()).toEqual({ exists: true, count: 2, model: "text-embedding-3-small", dims: 3 });
  expect((await c.get("/v1/rag/p1/shas")).json()).toEqual({ a: "sha-a", b: "sha-b" });
  // list[float]: stored as Python wrote it — every element a float.
  expect(state.handle.value("SELECT vector FROM rag_vectors WHERE chunk_id = 'a'")).toBe("[1.0, 0.0, 0.0]");
});

test("search_ranks_by_cosine", async () => {
  const c = await client(tmpPath());
  await c.put("/v1/rag/p1", {
    json: {
      model: "m",
      items: [
        { chunkId: "a", sha: "1", vector: [1.0, 0.0], chunk: { id: "a" } },
        { chunkId: "b", sha: "1", vector: [0.0, 1.0], chunk: { id: "b" } },
        { chunkId: "c", sha: "1", vector: [0.7, 0.7], chunk: { id: "c" } },
      ],
    },
  });
  const res = (await c.post("/v1/rag/p1/search", { json: { vector: [1.0, 0.0], k: 2 } })).json();
  expect(res.length).toBe(2);
  expect(res[0].chunk.id).toBe("a"); // identical direction ranks first
  expect(res[0].score).toBeGreaterThanOrEqual(res[1].score);
  expect((await c.post("/v1/rag/p1/search", { json: { vector: [1.0, 0.0], k: 1 } })).json().length).toBe(1);
});

test("upsert_remove_clear", async () => {
  const c = await client(tmpPath());
  const put = (items) => c.put("/v1/rag/p1", { json: { model: "m", items } });
  await put([{ chunkId: "a", sha: "1", vector: [1.0, 0.0], chunk: { id: "a" } }]);
  // re-PUT the same id with a new sha → upsert, count stays 1
  await put([{ chunkId: "a", sha: "2", vector: [1.0, 0.0], chunk: { id: "a" } }]);
  expect((await c.get("/v1/rag/p1/status")).json().count).toBe(1);
  expect((await c.get("/v1/rag/p1/shas")).json()).toEqual({ a: "2" });
  await put([{ chunkId: "b", sha: "1", vector: [0.0, 1.0], chunk: { id: "b" } }]);
  expect((await c.get("/v1/rag/p1/status")).json().count).toBe(2);
  await c.post("/v1/rag/p1/remove", { json: { ids: ["a"] } });
  expect((await c.get("/v1/rag/p1/shas")).json()).toEqual({ b: "1" });
  await c.delete("/v1/rag/p1");
  expect((await c.get("/v1/rag/p1/status")).json()).toEqual(EMPTY);
});

test("search_skips_mismatched_dims", async () => {
  const c = await client(tmpPath());
  await c.put("/v1/rag/p1", { json: { model: "m", items: [{ chunkId: "a", sha: "1", vector: [1.0, 0.0, 0.0], chunk: { id: "a" } }] } });
  expect((await c.post("/v1/rag/p1/search", { json: { vector: [1.0, 0.0], k: 5 } })).json()).toEqual([]);
});

test("search_bm25_scores_scene_links", async () => {
  // Move 3 (RAG build): a query term that appears ONLY in a scene chunk's `links` line (its
  // entity names) still ranks that chunk via the BM25 leg — "where is X" works even when the
  // prose never names the place.
  const c = await client(tmpPath());
  await c.put("/v1/rag/p1", {
    json: {
      model: "m",
      items: [
        {
          chunkId: "a",
          sha: "1",
          vector: [1.0, 0.0],
          chunk: { id: "a", text: "She waited by the desk.", links: "Characters: Aria · Location: Customs House" },
        },
        { chunkId: "b", sha: "1", vector: [1.0, 0.0], chunk: { id: "b", text: "A quiet morning with nothing.", links: "" } },
      ],
    },
  });
  // Identical vectors → cosine ties; only the links text can separate them.
  const res = (await c.post("/v1/rag/p1/search", { json: { vector: [1.0, 0.0], queryText: "customs house", k: 2 } })).json();
  expect(res[0].chunk.id).toBe("a");
  expect(res[0].bmScore).toBeGreaterThan(0);
  // Chunks with no links field (pre-Move-3 rows, cards) still search fine.
  expect(res[1].chunk.id).toBe("b");
});

test("projects_isolated", async () => {
  const c = await client(tmpPath());
  await c.put("/v1/rag/p1", { json: { model: "m", items: [{ chunkId: "a", sha: "1", vector: [1.0], chunk: { id: "a" } }] } });
  await c.put("/v1/rag/p2", { json: { model: "m", items: [{ chunkId: "x", sha: "1", vector: [1.0], chunk: { id: "x" } }] } });
  expect((await c.get("/v1/rag/p1/shas")).json()).toEqual({ a: "1" });
  expect((await c.get("/v1/rag/p2/shas")).json()).toEqual({ x: "1" });
});
