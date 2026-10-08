// SPDX-License-Identifier: MIT
// Port of tests/test_chat.py — /v1/chat/sessions, manuscript-RAG chat SESSIONS (real rows,
// not a kv blob). Covers session CRUD, list ordering (updatedAt desc), the per-session
// 30-message cap, meta-only rename, and the one-time lazy migration of a pre-sessions thread
// (legacy chat_messages rows) into a session that shows up in the list.
import { expect, test } from "vitest";
import { state } from "../src/database/session.js";
import { client, tmpPath, useHermeticKit } from "./helpers.js";

useHermeticKit();

async function makeProject(c, pid = "prj1") {
  // chat_sessions.project_id FKs projects(id), so a session needs a real book.
  expect((await c.put(`/v1/projects/${pid}`, { json: { project: { title: "Book" } } })).statusCode).toBe(204);
}

const put = (c, sid, body) => c.put(`/v1/chat/sessions/${sid}`, { json: { projectId: "prj1", ...body } });
const list = async (c) => (await c.get("/v1/chat/sessions", { params: { projectId: "prj1" } })).json();

test("list_empty", async () => {
  const c = await client(tmpPath());
  await makeProject(c);
  expect(await list(c)).toEqual([]);
});

test("create_get_and_list_roundtrip", async () => {
  const c = await client(tmpPath());
  await makeProject(c);
  const msgs = [
    { role: "user", content: "Who is Mira?" },
    { role: "assistant", content: "A cartographer.", citations: [{ sceneId: "s1" }] },
  ];
  expect((await put(c, "s_a", { mode: "book", title: "Who is Mira?", messages: msgs })).statusCode).toBe(204);

  const lst = await list(c);
  expect(lst.length).toBe(1);
  expect(lst[0].id).toBe("s_a");
  expect(lst[0].title).toBe("Who is Mira?");
  expect(lst[0].messageCount).toBe(2);
  expect("messages" in lst[0]).toBe(false); // the list stays light

  const full = (await c.get("/v1/chat/sessions/s_a")).json();
  expect(full.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
  expect(full.messages[1].citations).toEqual([{ sceneId: "s1" }]);
  expect("error" in full.messages[0]).toBe(false); // absent errors omitted, not null
});

test("replace_all_is_wholesale", async () => {
  const c = await client(tmpPath());
  await makeProject(c);
  await put(c, "s_a", { title: "T", messages: [{ role: "user", content: "one" }, { role: "assistant", content: "two" }] });
  // A shorter message list fully overwrites the longer one.
  await put(c, "s_a", { title: "T", messages: [{ role: "user", content: "solo" }] });
  const full = (await c.get("/v1/chat/sessions/s_a")).json();
  expect(full.messages.map((m) => m.content)).toEqual(["solo"]);
});

test("empty_session_never_persisted", async () => {
  const c = await client(tmpPath());
  await makeProject(c);
  // Creating with no messages must NOT create a row (the empty-never-persisted rule).
  expect((await put(c, "ghost", { title: "x", messages: [] })).statusCode).toBe(204);
  expect(await list(c)).toEqual([]);
  expect((await c.get("/v1/chat/sessions/ghost")).statusCode).toBe(404);
  // Same for a meta-only (no messages key) create.
  expect((await put(c, "ghost2", { title: "x" })).statusCode).toBe(204);
  expect(await list(c)).toEqual([]);
});

test("message_cap_30", async () => {
  const c = await client(tmpPath());
  await makeProject(c);
  const many = Array.from({ length: 50 }, (_, i) => ({ role: "user", content: `m${i}` }));
  await put(c, "s_a", { title: "T", messages: many });
  const full = (await c.get("/v1/chat/sessions/s_a")).json();
  expect(full.messages.length).toBe(30);
  // The tail is kept (server slices the last 30).
  expect(full.messages[0].content).toBe("m20");
  expect(full.messages.at(-1).content).toBe("m49");
});

test("rename_is_meta_only_and_keeps_messages", async () => {
  const c = await client(tmpPath());
  await makeProject(c);
  await put(c, "s_a", { title: "Old title", updatedAt: "2026-01-01T00:00:00Z", messages: [{ role: "user", content: "keep me" }] });
  // A rename sends title WITHOUT messages → turns untouched, updatedAt preserved.
  expect((await put(c, "s_a", { title: "New title" })).statusCode).toBe(204);
  const full = (await c.get("/v1/chat/sessions/s_a")).json();
  expect(full.title).toBe("New title");
  expect(full.messages.map((m) => m.content)).toEqual(["keep me"]);
  expect(full.updatedAt).toBe("2026-01-01T00:00:00Z"); // rename didn't bump the time
});

test("list_sorted_by_updated_at_desc", async () => {
  const c = await client(tmpPath());
  await makeProject(c);
  await put(c, "older", { title: "older", updatedAt: "2026-01-01T00:00:00Z", messages: [{ role: "user", content: "a" }] });
  await put(c, "newer", { title: "newer", updatedAt: "2026-06-01T00:00:00Z", messages: [{ role: "user", content: "b" }] });
  await put(c, "mid", { title: "mid", updatedAt: "2026-03-01T00:00:00Z", messages: [{ role: "user", content: "c" }] });
  expect((await list(c)).map((s) => s.id)).toEqual(["newer", "mid", "older"]);
});

test("scopes_coexist_in_one_list", async () => {
  const c = await client(tmpPath());
  await makeProject(c);
  await put(c, "book1", { mode: "book", title: "book q", messages: [{ role: "user", content: "book q" }] });
  await put(c, "char1", { mode: "character", characterId: "c1", title: "char q", messages: [{ role: "user", content: "char q" }] });
  const lst = await list(c);
  expect(new Set(lst.map((s) => s.mode))).toEqual(new Set(["book", "character"]));
  const ch = lst.find((s) => s.mode === "character");
  expect(ch.characterId).toBe("c1");
});

test("delete_removes_session_and_messages", async () => {
  const c = await client(tmpPath());
  await makeProject(c);
  await put(c, "s_a", { title: "T", messages: [{ role: "user", content: "hi" }] });
  expect((await c.delete("/v1/chat/sessions/s_a")).statusCode).toBe(204);
  expect(await list(c)).toEqual([]);
  expect((await c.get("/v1/chat/sessions/s_a")).statusCode).toBe(404);
});

test("persist_across_instances_and_project_delete_cascade", async () => {
  const tmp = tmpPath();
  const c = await client(tmp);
  await makeProject(c);
  await put(c, "s_a", { title: "T", messages: [{ role: "user", content: "persisted" }] });

  const c2 = await client(tmp); // new server instance, same SQLite file
  expect((await c2.get("/v1/chat/sessions/s_a")).json().messages[0].content).toBe("persisted");

  // Deleting the book cascades its sessions + messages away (project_id FK CASCADE).
  expect((await c2.delete("/v1/projects/prj1")).statusCode).toBe(204);
  expect(await list(c2)).toEqual([]);
});

/** Insert pre-sessions rows straight into the legacy chat_messages table (the old wire
 * format), simulating a DB upgraded from before sessions. */
function seedLegacyThread(projectId, mode, characterId, messages) {
  state.handle.tx(() => {
    for (const [i, m] of messages.entries()) {
      state.handle.insert("chat_messages", {
        project_id: projectId,
        mode,
        character_id: characterId,
        position: i,
        role: m.role,
        content: m.content,
        citations: "[]",
      });
    }
  });
}

test("migration_legacy_thread_becomes_a_session", async () => {
  const c = await client(tmpPath());
  await makeProject(c);
  seedLegacyThread("prj1", "book", "", [
    { role: "user", content: "What did the map hide?" },
    { role: "assistant", content: "A door." },
  ]);
  seedLegacyThread("prj1", "character", "c1", [{ role: "user", content: "Who do you trust?" }]);

  // First list triggers the lazy lift.
  const lst = await list(c);
  expect(lst.length).toBe(2);
  const book = lst.find((s) => s.mode === "book");
  const ch = lst.find((s) => s.mode === "character");
  expect(book.title).toBe("What did the map hide?"); // title from the first user turn
  expect(book.messageCount).toBe(2);
  expect(ch.characterId).toBe("c1");
  expect(ch.title).toBe("Who do you trust?");

  // The migrated turns are retrievable in order.
  const full = (await c.get(`/v1/chat/sessions/${book.id}`)).json();
  expect(full.messages.map((m) => m.content)).toEqual(["What did the map hide?", "A door."]);

  // Idempotent: a second list neither duplicates nor re-lifts (legacy rows gone).
  expect((await list(c)).length).toBe(2);
});
