// SPDX-License-Identifier: MIT
// /v1/sessions — the writing-activity log, daily word counts (the port of
// justwrite_server/api/sessions_api.py).
//
// Real tables: a row per day (the log), a per-chapter checkpoint for delta attribution, and
// a singleton pointer for "today's chapter". Global (per install), not project scoped — it
// tracks the writer's daily output across every project. The server owns the authoritative
// delta (diffs its stored checkpoint), so a debounced POST of only the latest count can't
// double-count.

import { T } from "@delebash/llm-runner/platform/models";
import { Hono, input } from "@delebash/llm-runner/platform/server";
import { dset } from "../book_io.js";
import { getDb } from "../database/session.js";

const META_ID = "singleton";

export const RecordBody = T.Object({
  chapterId: T.String(),
  words: T.Integer(),
  day: T.String(), // yyyy-mm-dd in the client's local time
});

export const router = new Hono();
router.get("/v1/sessions", (c) => {
  const h = getDb();
  const days = {};
  for (const r of h.all("SELECT * FROM sessions", [], "sessions")) dset(days, r.day, r.words);
  const chapterWords = {};
  for (const r of h.all("SELECT * FROM session_chapter_words", [], "session_chapter_words")) dset(chapterWords, r.chapter_id, r.words);
  const meta = h.get("session_meta", META_ID);
  const lastWrite = meta && meta.last_write_chapter ? { chapterId: meta.last_write_chapter, day: meta.last_write_day } : null;
  return c.json({ days, chapterWords, lastWrite });
});

router.post("/v1/sessions/record", input({ body: RecordBody }), (c) => {
  const h = getDb();
  const { chapterId, words, day } = c.req.valid("json");
  h.tx(() => {
    const cw = h.get("session_chapter_words", chapterId);
    const prev = cw ? cw.words : 0;
    const delta = Math.max(0, words - prev); // deletions never subtract recorded progress

    if (cw === null) h.insert("session_chapter_words", { chapter_id: chapterId, words });
    else h.update("session_chapter_words", { words }, { chapter_id: chapterId });

    if (delta > 0) {
      const row = h.get("sessions", day);
      if (row === null) h.insert("sessions", { day, words: delta });
      else h.update("sessions", { words: row.words + delta }, { day });
      const meta = h.get("session_meta", META_ID);
      if (meta === null) h.insert("session_meta", { id: META_ID, last_write_chapter: chapterId, last_write_day: day });
      else h.update("session_meta", { last_write_chapter: chapterId, last_write_day: day }, { id: META_ID });
    }
  });
  return c.body(null, 204);
});

router.delete("/v1/sessions", (c) => {
  const h = getDb();
  h.tx(() => {
    h.run("DELETE FROM sessions");
    h.run("DELETE FROM session_chapter_words");
    h.run("DELETE FROM session_meta");
  });
  return c.body(null, 204);
});
