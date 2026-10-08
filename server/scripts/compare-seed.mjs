// SPDX-License-Identifier: MIT
// JustWrite's seed + storage parity check: the Python server and the JavaScript server each
// boot on a fresh data folder exactly as `serve` boots them (createApp + seedWorkspace), the
// same requests are replayed on both, and the databases are compared cell by cell — every
// table's DDL in sqlite_master and every cell as SQLite's quote() (type and bytes), in rowid
// order — at four points: right after the seed; after a write sequence over every JustWrite
// store (books, the bundled sample, settings, prefs, auth, sessions, chat, versions, RAG);
// after the volatile writes (the demo book, an image, a sweep draft — their clocks and
// random ids masked); and after a workspace reset. Every answer is compared too (status +
// JSON; a zip by its member names and bytes).
//
//   node scripts/node24.mjs server/scripts/compare-seed.mjs     (JW_PYTHON overrides the Python)
//
// The Python server was deleted on 2026-10-08, after this ran clean (17,741 cells, 0 different);
// to run it again, check out the commit before the deletion. The record of the run is in
// docs/dev/RESEARCH.md.
//
// The model is the kit's scripts/compare-seed.mjs. Both sides read and write only temp
// folders: JUST_AI_HOME and LLM_RUNNER_CACHE point into the temp folder, so neither touches
// the family registry or a real cache.

import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SERVER = resolve(HERE, "..");
const REPO = resolve(SERVER, "..");
const PY = process.env.JW_PYTHON || join(REPO, ".venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");

const dir = mkdtempSync(join(tmpdir(), "jw-compare-seed-"));
process.env.JUST_AI_HOME = join(dir, "family");
process.env.LLM_RUNNER_CACHE = join(dir, "user-cache");

const procs = await import("@delebash/llm-runner/platform").then((m) => m.procs);
const { createApp } = await import("../src/app.js");
const { seedWorkspace } = await import("../src/database/seed.js");
const { state } = await import("../src/database/session.js");
const { ZipReader } = await import("@delebash/llm-runner/platform/zip");

async function python(...args) {
  const r = await procs.run([PY, join(HERE, "compare-seed.py"), ...args], {
    env: { ...process.env, PYTHONIOENCODING: "utf-8" },
  });
  if (r.returncode !== 0) throw new Error(`compare-seed.py ${args[0]} failed:\n${r.stderr}`);
  return r;
}

// ── the request list (bodies as the renderer would send them: JSON.stringify text) ──
const body = (v) => JSON.stringify(v);
const book = {
  project: {
    title: "The Cartographer's Daughter — ü “q” 📚",
    author: "Mira Halden",
    subtitle: "A novel",
    genre: "Literary",
    wordsGoal: 90000,
    dailyTarget: 1200,
    wordsWritten: "41280",
    startedOn: "March 11, 2026",
    deadline: "",
    premise: "A mapmaker's daughter inherits a ledger.",
    coverImage: { id: "cov", addedAt: 5, kind: "file", path: "/x/c.png", name: "c.png", mime: "image/png" },
  },
  parts: [
    {
      id: "p1",
      title: "The Inheritance",
      chapters: [
        { id: "ch1", num: 1, title: "What the door remembers", words: 120.7, status: "done", strands: ["s1", "s2"] },
        { id: "ch2", num: "2", title: "An inventory", words: 0, status: "", strands: [] },
      ],
    },
  ],
  chapterCritiques: { ch1: { generatedAt: "x", score: 0.5, notes: [{ severity: "low", message: "tighten — ✂" }] } },
  chapterReaderKnowledge: { ch2: { status: "ok", n: -1.25 } },
  chapterMultiReader: {},
  characterAudits: { c1: { verdict: "consistent", concerns: [], big: 12345678901234, huge: 1e21 } },
  scenes: {
    ch1: [
      { id: "scn1", title: "The key", body: "<p>The key turned.</p>", characters: ["c1"], locations: ["l1"], objects: ["o1"], strands: ["s1"] },
      { id: "scn2", title: "", body: "<p>Cedar and ash.</p>", characters: ["c1", "c2"], locations: [], objects: [], strands: ["s2"] },
    ],
    ch2: [],
  },
  characters: [
    { id: "c1", main: true, age: 31, gender: "", pronouns: "she/her", aliases: ["El"], lifeStatus: "alive", oneLiner: "x", role: "P", name: "Elen", tags: ["lead"] },
    { id: "c2", main: 0, age: "40", gender: "m", pronouns: "he/him", aliases: [], lifeStatus: "deceased", oneLiner: "y", role: "F", name: "Idris", tags: [] },
    { id: "c3", main: "yes", age: "old", name: "Nobody" },
  ],
  characterExtras: { c1: { voice: { accent: "north" }, weight: 0.25, quotes: ["…"] } },
  locations: [{ id: "l1", name: "Halden House", kind: "Home", note: "Cliff road.", tags: ["setting"] }],
  objects: [{ id: "o1", name: "The Ledger", kind: "Manuscript", note: "84 pages.", tags: [] }],
  groups: [
    {
      id: "g1",
      name: "The Vael family",
      blurb: "Three generations.",
      color: "red",
      members: [
        { kind: "character", id: "c1", name: "Elen" },
        { kind: "location", id: "l1" },
        { kind: "strand", id: "s9" },
      ],
    },
  ],
  notes: [
    { id: "n1", title: "Story-wide", body: "x", tag: "", updated: "May 22", anchor: null },
    { id: "n2", title: "Chapter note", body: "y", tag: "plot", updated: "May 21", anchor: { chapterId: "ch1" } },
    { id: "n3", title: "Scene note", body: "z", tag: "research", updated: "May 20", anchor: { chapterId: "ch1", sceneId: "scn1" } },
  ],
  strands: [
    { id: "s1", name: "Inheritance", color: "gold", blurb: "b", body: "", status: "", beats: [{ id: "b1", chapterId: "ch1", sceneId: "", label: "Inciting", note: "finds it" }] },
    { id: "s2", name: "The Ledger", color: "blue", blurb: "b2", body: "", status: "open", beats: [] },
  ],
  architecture: { premise: { id: "premise", title: "Premise", status: "done", words: 18, body: "..." }, setting: null },
  worldbuilding: [{ id: "wb1", category: "geography", title: "North Coast", tags: ["setting"], status: "done", words: 540, summary: "s", body: "b", related: ["wb2"] }],
  worldbuildingCategories: [{ id: "geography", label: "Geography", icon: "Pin", hue: 130 }],
  tagVocabularies: { characters: [{ id: "tv1", label: "lead" }], custom: [{ id: "tv2", label: "x" }] },
  images: { c1: [{ id: "img1", addedAt: 1700000000000, kind: "file", path: "/x/a.png", name: "a.png", mime: "image/png", w: 0.5 }] },
  events: { setting: [{ id: "ev1", when: "1881-06-15T09:00", title: "First survey", note: "n" }] },
  statuses: [{ id: "todo", label: "To do", color: "var(--status-todo)" }],
  trash: { characters: [{ id: "c9", name: "Cut", deletedAt: 1700000001000 }], scenes: [{ id: "x9", deletedAt: null }] },
  dailyRecaps: { "2026-06-18": { text: "wrote", totalWords: 1200 } },
  reverseOutline: { structureName: "3-act", summary: "s" },
  beatSheets: { "save-the-cat": { templateKey: "save-the-cat", mapping: {} } },
  plotHoles: null,
  voiceCanonChapterIds: ["ch1"],
  relationshipArcs: { "c1::c2": { summary: "father-daughter" } },
  marketingPack: { logline: "a ledger", blurbs: ["a", "b"] },
  worldRules: "Maps can be wrong.",
  savedAt: "2026-06-18T10:00:00.000Z",
};
const sample = JSON.parse(readFileSync(join(REPO, "samples", "the-ninth-facet", "book.json"), "utf8"));
sample.savedAt = "2026-10-08T00:00:00+00:00";

const ops = [
  ["SNAPSHOT", "seed"],
  ["PUT", "/v1/projects/book1/book", body(book)],
  ["PUT", "/v1/projects/sample/book", body(sample)],
  ["PUT", "/v1/projects/empty", body({})],
  ["PATCH", "/v1/settings", body({ ui: { sidebarCollapsed: true, z: [1, 2.5, "📚"] }, ai: { flags: { m1: "fast" } }, activeProjectId: "book1", n: 1.5, x: null })],
  ["PATCH", "/v1/prefs", body({ ui: { a: 1 }, chooserDirs: { export: "E:/out" } })],
  ["PUT", "/v1/server-auth", body({ tokens: ["  ", ""], requireForLoopback: 1 })],
  ["POST", "/v1/sessions/record", body({ chapterId: "ch1", words: 100, day: "2026-06-18" })],
  ["POST", "/v1/sessions/record", body({ chapterId: "ch1", words: "150", day: "2026-06-18" })],
  ["POST", "/v1/sessions/record", body({ chapterId: "ch2", words: 30, day: "2026-06-19" })],
  [
    "PUT",
    "/v1/chat/sessions/s1",
    body({
      projectId: "book1",
      mode: "book",
      title: "",
      updatedAt: "2026-01-01T00:00:00Z",
      messages: [
        { role: "user", content: "  Who   is\nMira? 📚 " },
        { role: "assistant", content: "A cartographer.", citations: [{ sceneId: "s1", score: 0.25 }], error: "boom" },
      ],
    }),
  ],
  ["PUT", "/v1/chat/sessions/s1", body({ projectId: "book1", title: "Renamed" })],
  ["PUT", "/v1/versions", body({ projectId: "book1", chapterId: "ch1", versions: [{ id: "v1", savedAt: "x", words: 3, scenes: [{ id: "s", body: "<p>ü</p>" }] }, { id: "v0" }] })],
  [
    "PUT",
    "/v1/rag/book1",
    body({
      model: "m",
      items: [
        { chunkId: "a", sha: "1", vector: [1, 0.5, -2], chunk: { id: "a", text: "the brass key", links: "Location: Customs House" } },
        { chunkId: "b", sha: "1", vector: [0, 1, 0], chunk: { id: "b", text: "a quiet morning — ü" } },
      ],
    }),
  ],
  ["PUT", "/v1/rag/book1", body({ model: "", items: [{ chunkId: "a", sha: "2", vector: [1, 0, 0], chunk: { id: "a", text: "brass" } }] })],
  ["POST", "/v1/rag/book1/remove", body({ ids: ["zzz"] })],
  // reads
  ["GET", "/v1/projects", null],
  ["GET", "/v1/projects/book1/book", null],
  ["GET", "/v1/projects/sample", null],
  ["GET", "/v1/projects/empty/book", null],
  ["GET", "/v1/projects/book1/chapters", null],
  ["GET", "/v1/projects/sample/chapters", null],
  ["GET", "/v1/projects/book1/characters", null],
  ["GET", "/v1/settings", null],
  ["GET", "/v1/prefs", null],
  ["GET", "/v1/server-auth", null],
  ["GET", "/v1/sessions", null],
  ["GET", "/v1/chat/sessions?projectId=book1", null],
  ["GET", "/v1/chat/sessions/s1", null],
  ["GET", "/v1/versions?projectId=book1", null],
  ["GET", "/v1/rag/book1/status", null],
  ["GET", "/v1/rag/book1/shas", null],
  ["POST", "/v1/rag/book1/search", body({ vector: [1, 0, 0], queryText: "customs brass", k: 5 })],
  ["GET", "/v1/projects/book1/sweep-draft", null],
  ["GET", "/v1/projects/book1/export", null],
  ["GET", "/v1/projects/sample/export", null],
  ["GET", "/v1/ai/routing", null],
  ["GET", "/v1/ai/prompts", null],
  ["GET", "/v1/llm-providers", null],
  // errors
  ["PUT", "/v1/projects/x/book", "[1]"],
  ["PUT", "/v1/projects/x/book", "{bad"],
  ["PUT", "/v1/projects/x/book", null],
  ["POST", "/v1/images", body({ dataBase64: "!!" })],
  ["POST", "/v1/images", body({ name: 5 })],
  ["GET", "/v1/projects/nope", null],
  ["GET", "/v1/projects/nope/export", null],
  ["POST", "/v1/projects/import", body({ zipBase64: "!!!" })],
  ["POST", "/v1/projects/import", body({ zipBase64: Buffer.from("not a zip").toString("base64") })],
  ["POST", "/v1/projects/import", body({})],
  ["PUT", "/v1/projects/nope/sweep-draft", body({ a: 1 })],
  ["GET", "/v1/nope", null],
  ["POST", "/v1/nope", body({})],
  ["PUT", "/v1/versions", body({ projectId: "book1" })],
  ["POST", "/v1/sessions/record", body({ chapterId: "c", words: "abc", day: "d" })],
  ["POST", "/v1/sessions/record", body({ chapterId: "c", words: 1.5, day: "d" })],
  ["PUT", "/v1/chat/sessions/s2", body({ projectId: "book1", messages: [{ content: "no role" }] })],
  ["GET", "/v1/chat/sessions", null],
  ["GET", "/v1/projects/autosaves/nope__bogus", null],
  ["PUT", "/v1/projects/autosave-dir", body({ dir: "  " })],
  ["PUT", "/v1/server-auth", body({ tokens: "x" })],
  ["GET", "/ui", null],
  ["SNAPSHOT", "writes"],
  // volatile writes: clocks and random ids (masked below)
  ["POST", "/v1/projects/demo", null],
  ["POST", "/v1/projects/demo", null],
  ["POST", "/v1/images", body({ name: "a.png", mime: "image/png", dataBase64: Buffer.from("png-bytes").toString("base64") })],
  ["PUT", "/v1/projects/book1/sweep-draft", body({ version: 1, chapters: { ch1: { status: "done", n: 0.5 } } })],
  ["GET", "/v1/projects/book1/sweep-draft", null],
  ["SNAPSHOT", "volatile"],
  ["PATCH", "/v1/settings", body({ autosaveDir: "C:/somewhere/autosaves" })],
  ["POST", "/v1/data/reset", null],
  ["SNAPSHOT", "reset"],
];
const opsFile = join(dir, "ops.json");
writeFileSync(opsFile, JSON.stringify(ops.map((o) => (o[0] === "SNAPSHOT" ? ["SNAPSHOT", join(dir, `py-${o[1]}.db`)] : o))));

// ── the Python side ──
await python("run", join(dir, "py-data"), opsFile, join(dir, "py-answers.json"));

// ── the JavaScript side ──
const sha = (b) => createHash("sha256").update(b).digest("hex");
function answer(r) {
  const ctype = r.headers["content-type"] || "";
  const out = { status: r.statusCode };
  if (ctype.startsWith("application/zip")) {
    const zf = ZipReader.fromBuffer(r.rawPayload);
    out.zip = zf.entries.map((e) => [e.name, sha(zf.read(e))]);
    out.disposition = r.headers["content-disposition"];
  } else if (ctype.includes("json")) out.json = r.json();
  else if (r.rawPayload.length) {
    out.sha256 = sha(r.rawPayload);
    out.type = ctype;
  }
  return out;
}
const app = await createApp(join(dir, "js-data"));
seedWorkspace();
const jsAnswers = [];
for (const op of ops) {
  if (op[0] === "SNAPSHOT") {
    await state.handle.raw.backup(join(dir, `js-${op[1]}.db`));
    continue;
  }
  const [method, url, b] = op;
  const r = await app.inject({
    method,
    url,
    headers: { host: "testserver", ...(b !== null ? { "content-type": "application/json" } : {}) },
    remoteAddress: "testclient",
    ...(b !== null ? { payload: b } : {}),
  });
  jsAnswers.push([method, url, answer(r)]);
}

// ── compare ──
// Per snapshot: the columns whose cells are a clock or a random id (masked), and nothing else.
const MASKS = {
  seed: {},
  writes: {},
  volatile: {
    projects: ["updated_at"], // the demo's savedAt = now
    project_artifacts: ["updated_at"],
    image_blobs: ["id", "created_at"],
    sweep_drafts: ["updated_at"],
  },
  reset: {},
};
let failures = 0;
let cells = 0;
for (const name of Object.keys(MASKS)) {
  await python("dump", join(dir, `py-${name}.db`), join(dir, `py-${name}.json`));
  await python("dump", join(dir, `js-${name}.db`), join(dir, `js-${name}.json`));
  const a = JSON.parse(readFileSync(join(dir, `py-${name}.json`), "utf8"));
  const b = JSON.parse(readFileSync(join(dir, `js-${name}.json`), "utf8"));
  const diffs = [];
  if (JSON.stringify(a.master) !== JSON.stringify(b.master)) diffs.push("sqlite_master differs");
  let n = 0;
  for (const [t, ta] of Object.entries(a.tables)) {
    const tb = b.tables[t];
    if (!tb) {
      diffs.push(`${t}: missing in JS`);
      continue;
    }
    if (JSON.stringify(ta.cols) !== JSON.stringify(tb.cols)) diffs.push(`${t}: columns differ`);
    if (ta.rows.length !== tb.rows.length) diffs.push(`${t}: ${ta.rows.length} rows (Python) vs ${tb.rows.length} (JS)`);
    const masked = new Set(MASKS[name][t] || []);
    for (let i = 0; i < Math.min(ta.rows.length, tb.rows.length); i++) {
      for (let j = 0; j < ta.cols.length; j++) {
        n++;
        if (masked.has(ta.cols[j])) continue;
        if (ta.rows[i][j] !== tb.rows[i][j]) {
          diffs.push(`${t}[row ${i + 1}].${ta.cols[j]}: ${String(ta.rows[i][j]).slice(0, 120)} | ${String(tb.rows[i][j]).slice(0, 120)}`);
        }
      }
    }
  }
  cells += n;
  failures += diffs.length;
  console.log(`${name}: ${Object.keys(a.tables).length} tables, ${n} cells, ${diffs.length} different`);
  for (const d of diffs.slice(0, 30)) console.log(`  ${d}`);
}

// Answers: identical, except the fields that carry a clock, a random id or a folder path.
const VOLATILE_KEYS = new Set(["dataDir", "updatedAt", "id", "addedAt", "serverId"]);
const scrub = (v, url) => {
  if (Array.isArray(v)) return v.map((x) => scrub(x, url));
  if (v && typeof v === "object") {
    const out = {};
    for (const [k, x] of Object.entries(v)) {
      const volatile = VOLATILE_KEYS.has(k) && (k !== "id" || /\/v1\/(images|projects\/import)$/.test(url));
      out[k] = volatile && !(k === "updatedAt" && !/sweep-draft|demo/.test(url) && url !== "/v1/projects") ? "<masked>" : scrub(x, url);
    }
    return out;
  }
  return v;
};
const pyAnswers = JSON.parse(readFileSync(join(dir, "py-answers.json"), "utf8"));
let answerDiffs = 0;
for (let i = 0; i < pyAnswers.length; i++) {
  const [method, url, pa] = pyAnswers[i];
  const ja = jsAnswers[i][2];
  const A = JSON.stringify(scrub(pa, url));
  const B = JSON.stringify(scrub(ja, url));
  if (A !== B) {
    answerDiffs++;
    console.log(`answer ${method} ${url}:\n  Python ${A.slice(0, 600)}\n  JS     ${B.slice(0, 600)}`);
  }
}
console.log(`answers: ${pyAnswers.length} requests, ${answerDiffs} different`);
console.log(`TOTAL: ${cells} cells compared, ${failures} different cells; ${answerDiffs} different answers (folder ${dir})`);
process.exit(failures || answerDiffs ? 1 : 0);
