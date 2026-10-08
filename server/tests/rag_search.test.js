// SPDX-License-Identifier: MIT
// Port of tests/test_rag_search.py — unit tests for the pure retrieval math (rag_search.js):
// the BM25 + cosine + RRF port of the renderer's rag/{bm25,hybrid,vectorStore}.js, without
// going through HTTP. The scorers return Maps (Python returned dicts).
import { expect, test } from "vitest";
import { bm25Scores, cosineScores, hybridRank, tokenize } from "../src/rag_search.js";

test("tokenize_drops_stopwords_and_singletons", () => {
  // "what"/"is"/"the" are stop words; single chars are dropped. (NB: the JS stop list this
  // is ported from does NOT include "about" — this port stays faithful to the list.)
  expect(tokenize("What is the brass key")).toEqual(["brass", "key"]);
  expect(tokenize("")).toEqual([]);
  expect(tokenize("a I")).toEqual([]); // both too short / stop words
});

test("bm25_ranks_term_matches_and_omits_zero_rows", () => {
  const docs = [
    ["a", "the brass key on the table"],
    ["b", "a quiet morning with nothing"],
    ["c", "brass"],
  ];
  const scores = bm25Scores(docs, "brass key");
  expect(scores.has("b")).toBe(false); // shares no query terms -> omitted (no zero rows)
  expect(scores.has("a") && scores.has("c")).toBe(true);
  expect(scores.get("a")).toBeGreaterThan(scores.get("c")); // two term matches beat one
});

test("bm25_empty_query_returns_nothing", () => {
  expect(bm25Scores([["a", "brass key"]], "").size).toBe(0);
  expect(bm25Scores([["a", "brass key"]], "the and of").size).toBe(0); // all stop words
});

test("cosine_skips_mismatched_dims", () => {
  const docs = [
    ["a", [1.0, 0.0]],
    ["b", [1.0, 0.0, 0.0]],
  ];
  const scores = cosineScores(docs, [1.0, 0.0]);
  expect([...scores.keys()]).toEqual(["a"]); // b is 3-dim, skipped against a 2-dim query
  expect(Math.abs(scores.get("a") - 1.0)).toBeLessThan(1e-9);
});

test("cosine_zero_query_returns_nothing", () => {
  expect(cosineScores([["a", [1.0, 0.0]]], [0.0, 0.0]).size).toBe(0);
});

test("hybrid_blend_lets_keyword_override_vector", () => {
  // Vector points at b; the keyword points at a. RRF should surface a first because a wins
  // the BM25 ranking AND places second on cosine.
  const items = [
    { id: "a", vector: [1.0, 0.0], text: "the brass key", chunk: { id: "a" } },
    { id: "b", vector: [0.0, 1.0], text: "a quiet morning", chunk: { id: "b" } },
  ];
  const res = hybridRank(items, [0.0, 1.0], "brass key", 2);
  expect(res.map((h) => h.chunk.id)).toEqual(["a", "b"]);
  expect(res[0].cosScore).toBe(0.0); // a's cosine vs [0,1]
  expect(res[0].bmScore).toBeGreaterThan(0);
  expect(Math.abs(res[1].cosScore - 1.0)).toBeLessThan(1e-9); // b's cosine vs [0,1]
  expect(res[1].bmScore).toBe(0);
});

test("hybrid_surfaces_keyword_hit_even_with_mismatched_vector_dims", () => {
  // A chunk whose vector dims don't match the query is skipped by cosine but can still
  // surface via BM25 — cosScore is null there (matches the JS path).
  const items = [{ id: "a", vector: [1.0, 0.0, 0.0], text: "brass key", chunk: { id: "a" } }];
  const res = hybridRank(items, [1.0, 0.0], "brass", 5);
  expect(res.length).toBe(1);
  expect(res[0].cosScore).toBeNull();
  expect(res[0].bmScore).toBeGreaterThan(0);
});

test("hybrid_pure_vector_ranks_by_cosine", () => {
  const items = [
    { id: "a", vector: [1.0, 0.0], text: "", chunk: { id: "a" } },
    { id: "b", vector: [0.0, 1.0], text: "", chunk: { id: "b" } },
    { id: "c", vector: [0.7, 0.7], text: "", chunk: { id: "c" } },
  ];
  const res = hybridRank(items, [1.0, 0.0], "", 2);
  expect(res[0].chunk.id).toBe("a"); // identical direction
  expect(res[0].score).toBeGreaterThanOrEqual(res[1].score);
});
