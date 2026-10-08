// SPDX-License-Identifier: MIT
// Port of tests/test_sessions.py — /v1/sessions, the writing-activity log (real tables).
import { expect, test } from "vitest";
import { client, tmpPath, useHermeticKit } from "./helpers.js";

useHermeticKit();

const EMPTY = { days: {}, chapterWords: {}, lastWrite: null };

test("empty", async () => {
  expect((await (await client(tmpPath())).get("/v1/sessions")).json()).toEqual(EMPTY);
});

test("record_attributes_delta_and_pointer", async () => {
  const c = await client(tmpPath());
  const rec = (json) => c.post("/v1/sessions/record", { json });
  // First sighting of a chapter at 100 words -> +100 today.
  expect((await rec({ chapterId: "ch1", words: 100, day: "2026-06-18" })).statusCode).toBe(204);
  let r = (await c.get("/v1/sessions")).json();
  expect(r.days).toEqual({ "2026-06-18": 100 });
  expect(r.chapterWords).toEqual({ ch1: 100 });
  expect(r.lastWrite).toEqual({ chapterId: "ch1", day: "2026-06-18" });

  // Grows to 150 -> +50 more on the same day.
  await rec({ chapterId: "ch1", words: 150, day: "2026-06-18" });
  expect((await c.get("/v1/sessions")).json().days).toEqual({ "2026-06-18": 150 });

  // A deletion (count drops) does NOT subtract; the checkpoint still moves.
  await rec({ chapterId: "ch1", words: 120, day: "2026-06-18" });
  r = (await c.get("/v1/sessions")).json();
  expect(r.days).toEqual({ "2026-06-18": 150 });
  expect(r.chapterWords).toEqual({ ch1: 120 });

  // New day, different chapter -> moves the pointer.
  await rec({ chapterId: "ch2", words: 30, day: "2026-06-19" });
  r = (await c.get("/v1/sessions")).json();
  expect(r.days).toEqual({ "2026-06-18": 150, "2026-06-19": 30 });
  expect(r.lastWrite).toEqual({ chapterId: "ch2", day: "2026-06-19" });
});

test("persist_across_instances_and_clear", async () => {
  const tmp = tmpPath();
  const c = await client(tmp);
  await c.post("/v1/sessions/record", { json: { chapterId: "ch1", words: 40, day: "2026-06-18" } });
  const c2 = await client(tmp); // new server instance, same SQLite file
  expect((await c2.get("/v1/sessions")).json().days).toEqual({ "2026-06-18": 40 });
  expect((await c2.delete("/v1/sessions")).statusCode).toBe(204);
  expect((await c2.get("/v1/sessions")).json()).toEqual(EMPTY);
});
