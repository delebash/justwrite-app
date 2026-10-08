// SPDX-License-Identifier: MIT
// Assemble / decompose a JustWrite book between the normalized tables and the renderer's
// snapshot JSON (the `exportSnapshot()` shape in stores/project.js) — the port of
// justwrite_server/book_io.py.
//
// - `decompose(h, projectId, snapshot)` replaces a project's rows from a snapshot.
//   Delete-then-insert — simple and obviously correct. Python ran it inside the caller's
//   session (committed by the route); here it runs in ONE transaction, so a failure part-way
//   leaves the old rows, as Python's uncommitted session did.
// - `assemble(h, projectId)` rebuilds the snapshot from the rows, read-only.
//
// assemble emits the **canonical** snapshot shape (link arrays always present on scenes;
// full-key entities; the four default tag-vocab kinds; an empty scene list for every
// chapter). On canonical input, `assemble(decompose(x)) == x` (modulo key order) — verified
// by tests/book_io.test.js.
//
// camelCase on the wire; snake_case columns. Stored JSON keeps Python's json.dumps bytes
// (`pyJson`). The SQL keeps SQLAlchemy's queries (same WHERE / ORDER BY, no ORDER BY where
// Python had none), so rows tie-break the same way.
//
// The snapshot is read the way Python's dict code read it: `x or {}` is Python truthiness,
// `d.get(k, default)` keeps a present-but-null value, and a value of the wrong type fails as
// Python's did (an AttributeError/TypeError → the app's 500 envelope), not silently.

import { randomUUID } from "node:crypto";
import { pyJson } from "@delebash/llm-runner/platform/pyjson";
import { b64decode, isDict, pyInt, pyIter, pyOr, pyTypeName, truthy, ValueError } from "@delebash/llm-runner/platform/py";

// Every per-project table, wiped on decompose (NOT projects itself — it's upserted — and
// NOT the rag_* tables, which the /v1/rag API owns separately).
const PROJECT_TABLES = [
  "parts",
  "chapters",
  "scenes",
  "scene_links",
  "chapter_strands",
  "characters",
  "locations",
  "objects",
  "groups",
  "group_members",
  "notes",
  "strands",
  "strand_beats",
  "worldbuilding",
  "worldbuilding_categories",
  "statuses",
  "tag_vocab",
  "architecture",
  "images",
  "events",
  "project_artifacts",
  "trash",
];

// scene_links / group_members store a singular kind; the snapshot groups by plural
// collection name.
const LINK_PLURAL = { characters: "character", locations: "location", objects: "object", strands: "strand" };
const LINK_SINGULAR = Object.fromEntries(Object.entries(LINK_PLURAL).map(([k, v]) => [v, k]));

const TRASH_KINDS = [
  "chapters",
  "scenes",
  "characters",
  "locations",
  "objects",
  "groups",
  "notes",
  "strands",
  "worldbuilding",
  "events",
  "statuses",
  "tagVocab",
];
const TAG_KINDS = ["characters", "locations", "objects", "worldbuilding"];

// ── Python value helpers (candidates for platform/) ──────────────────────────

/** `d[k] = v` on a dict built from user keys — a "__proto__" key stays data, as in Python. */
export function dset(obj, k, v) {
  if (k === "__proto__") Object.defineProperty(obj, k, { value: v, enumerable: true, writable: true, configurable: true });
  else obj[k] = v;
  return obj;
}

/** `d.get(k, dflt)` on a JSON dict — a present-but-null value stays null; a non-dict fails
 * as Python's AttributeError did. */
export function pyGet(d, k, dflt = null) {
  if (!isDict(d)) throw new TypeError(`'${pyTypeName(d)}' object has no attribute 'get'`);
  return Object.hasOwn(d, k) ? d[k] : dflt;
}

/** `d.items()` on a JSON dict. */
export function pyItems(d) {
  if (!isDict(d)) throw new TypeError(`'${pyTypeName(d)}' object has no attribute 'items'`);
  return Object.entries(d);
}

/** Python's repr() of a JSON value — what `str()` of a list or dict writes. */
function pyRepr(v) {
  if (v === null || v === undefined) return "None";
  if (v === true) return "True";
  if (v === false) return "False";
  if (typeof v === "string") {
    const q = v.includes("'") && !v.includes('"') ? '"' : "'";
    let s = v.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t");
    if (q === "'") s = s.replace(/'/g, "\\'");
    return q + s + q;
  }
  if (typeof v === "number") return String(v);
  if (Array.isArray(v)) return `[${v.map(pyRepr).join(", ")}]`;
  return `{${Object.entries(v)
    .map(([k, x]) => `${pyRepr(k)}: ${pyRepr(x)}`)
    .join(", ")}}`;
}

/** Python's `str(v)` of a JSON value. (A whole-number float — `1.0` — is `1` here: JSON parsed
 * in JavaScript can't tell them apart; the renderer never sends one.) */
export function pyStrOf(v) {
  if (typeof v === "string") return v;
  if (v === null || v === undefined) return "None";
  if (v === true) return "True";
  if (v === false) return "False";
  if (typeof v === "number") return String(v);
  return pyRepr(v);
}

/** `json.loads(text)` — a null text is Python's TypeError. */
export function pyLoads(text) {
  if (text === null || text === undefined) throw new TypeError("the JSON object must be str, bytes or bytearray, not NoneType");
  return JSON.parse(text);
}

/** `datetime.now(timezone.utc).isoformat()` — "YYYY-MM-DDTHH:MM:SS.ffffff+00:00" (the fraction
 * dropped when it is zero, as Python does). The sub-millisecond digits come from the
 * high-resolution clock. Candidate for platform/. */
export function isoNowUtc() {
  const ms = Date.now();
  const sub = Number((process.hrtime.bigint() / 1000n) % 1000n);
  const iso = new Date(ms).toISOString(); // 2026-10-08T12:34:56.789Z
  const us = `${iso.slice(20, 23)}${String(sub).padStart(3, "0")}`;
  return `${iso.slice(0, 19)}${us === "000000" ? "" : `.${us}`}+00:00`;
}

// ── small coercion helpers ──────────────────────────────────────────────

function s_(v) {
  return v === null || v === undefined ? "" : pyStrOf(v);
}

function i_(v, dflt = 0) {
  // int(v) — a list/dict/None is Python's TypeError, a bad string its ValueError: both give
  // the default. (A float NaN/inf raised in Python; JSON parsed here can't carry one.)
  if (typeof v !== "number" && typeof v !== "boolean" && typeof v !== "string") return dflt;
  try {
    return pyInt(v);
  } catch (e) {
    if (e instanceof ValueError) return dflt;
    throw e;
  }
}

const optI = (v) => (v === null || v === undefined ? null : i_(v));

/** A non-empty id, or null (for nullable cross-entity refs). */
function ref(v) {
  const s = s_(v);
  return s || null;
}

const jsonOrNone = (v) => (v !== null && v !== undefined ? pyJson(v) : null);

// ── decompose: snapshot → rows ──────────────────────────────────────────

/** Replace a project's rows from a snapshot (one transaction). */
export function decompose(h, projectId, snap) {
  h.tx(() => decomposeIn(h, projectId, snap));
}

function decomposeIn(h, projectId, snapIn) {
  const snap = pyOr(snapIn, {});
  const proj = pyOr(pyGet(snap, "project"), {});

  const fields = {
    title: s_(pyOr(pyGet(proj, "title"), "Untitled")),
    author: s_(pyGet(proj, "author")),
    subtitle: s_(pyGet(proj, "subtitle")),
    genre: s_(pyGet(proj, "genre")),
    words_goal: i_(pyGet(proj, "wordsGoal")),
    daily_target: i_(pyGet(proj, "dailyTarget")),
    words_written: i_(pyGet(proj, "wordsWritten")),
    started_on: s_(pyGet(proj, "startedOn")),
    deadline: s_(pyGet(proj, "deadline")),
    premise: s_(pyGet(proj, "premise")),
    world_rules: s_(pyGet(snap, "worldRules")),
    cover_image: jsonOrNone(pyGet(proj, "coverImage")),
    updated_at: s_(pyGet(snap, "savedAt")),
    data: "{}", // legacy blob retired once normalized
  };
  // The parent row first (Python flushed it before the wipe), so the project_id FK of every
  // child row below is satisfiable.
  if (h.get("projects", projectId) === null) h.insert("projects", { id: projectId, ...fields });
  else h.update("projects", fields, { id: projectId });

  // Wipe existing child rows; reinsert below.
  for (const t of PROJECT_TABLES) h.run(`DELETE FROM ${t} WHERE ${t}.project_id = ?`, [projectId]);

  const savedAt = s_(pyGet(snap, "savedAt"));
  const voiceCanon = new Set(pyIter(pyOr(pyGet(snap, "voiceCanonChapterIds"), [])));

  // #235: the four per-entity AI artifacts arrive as top-level keyed maps
  // (chapterCritiques / chapterReaderKnowledge / chapterMultiReader / characterAudits) —
  // the renderer relocated them off the entity objects so undo can't drag them. A legacy
  // snapshot (old export/backup) may still embed them on the chapter/character objects:
  // accept either, map first. Storage is unchanged — they land on the entity-row columns.
  const critiquesMap = pyOr(pyGet(snap, "chapterCritiques"), {});
  const rkMap = pyOr(pyGet(snap, "chapterReaderKnowledge"), {});
  const mrMap = pyOr(pyGet(snap, "chapterMultiReader"), {});
  const auditsMap = pyOr(pyGet(snap, "characterAudits"), {});

  const add = (table, row) => h.insert(table, { project_id: projectId, ...row });

  // parts → chapters → chapter_strands
  for (const [pi, part] of pyIter(pyOr(pyGet(snap, "parts"), [])).entries()) {
    const pid = s_(pyGet(part, "id"));
    add("parts", { id: pid, position: pi, title: s_(pyGet(part, "title")) });
    for (const [ci, ch] of pyIter(pyOr(pyGet(part, "chapters"), [])).entries()) {
      const chid = s_(pyGet(ch, "id"));
      add("chapters", {
        id: chid,
        part_id: pid,
        position: ci,
        num: i_(pyGet(ch, "num")),
        title: s_(pyGet(ch, "title")),
        words: i_(pyGet(ch, "words")),
        status: s_(pyOr(pyGet(ch, "status"), "todo")),
        is_voice_canon: voiceCanon.has(chid),
        critique: jsonOrNone(pyGet(critiquesMap, chid, pyGet(ch, "critique"))),
        reader_knowledge: jsonOrNone(pyGet(rkMap, chid, pyGet(ch, "readerKnowledge"))),
        multi_reader: jsonOrNone(pyGet(mrMap, chid, pyGet(ch, "multiReader"))),
      });
      for (const [li, sid] of pyIter(pyOr(pyGet(ch, "strands"), [])).entries()) {
        add("chapter_strands", { chapter_id: chid, strand_id: s_(sid), position: li });
      }
    }
  }

  // scenes → scene_links
  for (const [chid, sceneList] of pyItems(pyOr(pyGet(snap, "scenes"), {}))) {
    for (const [si, scn] of pyIter(pyOr(sceneList, [])).entries()) {
      const sid = s_(pyGet(scn, "id"));
      add("scenes", { id: sid, chapter_id: s_(chid), position: si, title: s_(pyGet(scn, "title")), body: s_(pyGet(scn, "body")) });
      for (const [plural, singular] of Object.entries(LINK_PLURAL)) {
        for (const [li, r] of pyIter(pyOr(pyGet(scn, plural), [])).entries()) {
          add("scene_links", { scene_id: sid, kind: singular, ref_id: s_(r), position: li });
        }
      }
    }
  }

  // characters (+ extras pulled from the characterExtras map)
  const extrasMap = pyOr(pyGet(snap, "characterExtras"), {});
  for (const [i, c] of pyIter(pyOr(pyGet(snap, "characters"), [])).entries()) {
    const cid = s_(pyGet(c, "id"));
    add("characters", {
      id: cid,
      position: i,
      name: s_(pyGet(c, "name")),
      main: truthy(pyGet(c, "main")),
      age: optI(pyGet(c, "age")),
      gender: s_(pyGet(c, "gender")),
      pronouns: s_(pyGet(c, "pronouns")),
      life_status: s_(pyGet(c, "lifeStatus")),
      one_liner: s_(pyGet(c, "oneLiner")),
      role: s_(pyGet(c, "role")),
      aliases: pyJson(pyOr(pyGet(c, "aliases"), [])),
      tags: pyJson(pyOr(pyGet(c, "tags"), [])),
      extras: jsonOrNone(pyGet(extrasMap, cid)),
      audit: jsonOrNone(pyGet(auditsMap, cid, pyGet(c, "audit"))),
    });
  }

  for (const [i, loc] of pyIter(pyOr(pyGet(snap, "locations"), [])).entries()) {
    add("locations", {
      id: s_(pyGet(loc, "id")),
      position: i,
      name: s_(pyGet(loc, "name")),
      kind: s_(pyGet(loc, "kind")),
      note: s_(pyGet(loc, "note")),
      tags: pyJson(pyOr(pyGet(loc, "tags"), [])),
    });
  }

  for (const [i, obj] of pyIter(pyOr(pyGet(snap, "objects"), [])).entries()) {
    add("objects", {
      id: s_(pyGet(obj, "id")),
      position: i,
      name: s_(pyGet(obj, "name")),
      kind: s_(pyGet(obj, "kind")),
      note: s_(pyGet(obj, "note")),
      tags: pyJson(pyOr(pyGet(obj, "tags"), [])),
    });
  }

  // groups → group_members (member display name dropped; resolved on assemble)
  for (const [i, g] of pyIter(pyOr(pyGet(snap, "groups"), [])).entries()) {
    const gid = s_(pyGet(g, "id"));
    add("groups", { id: gid, position: i, name: s_(pyGet(g, "name")), blurb: s_(pyGet(g, "blurb")), color: s_(pyGet(g, "color")) });
    for (const [mi, m] of pyIter(pyOr(pyGet(g, "members"), [])).entries()) {
      add("group_members", { group_id: gid, kind: s_(pyGet(m, "kind")), ref_id: s_(pyGet(m, "id")), position: mi });
    }
  }

  for (const [i, n] of pyIter(pyOr(pyGet(snap, "notes"), [])).entries()) {
    const anchor = pyOr(pyGet(n, "anchor"), {});
    add("notes", {
      id: s_(pyGet(n, "id")),
      position: i,
      title: s_(pyGet(n, "title")),
      body: s_(pyGet(n, "body")),
      tag: s_(pyOr(pyGet(n, "tag"), "note")),
      updated: s_(pyGet(n, "updated")),
      anchor_chapter_id: ref(pyGet(anchor, "chapterId")),
      anchor_scene_id: ref(pyGet(anchor, "sceneId")),
    });
  }

  // strands → strand_beats
  for (const [i, st] of pyIter(pyOr(pyGet(snap, "strands"), [])).entries()) {
    const sid = s_(pyGet(st, "id"));
    add("strands", {
      id: sid,
      position: i,
      name: s_(pyGet(st, "name")),
      color: s_(pyGet(st, "color")),
      blurb: s_(pyGet(st, "blurb")),
      body: s_(pyGet(st, "body")),
      status: s_(pyOr(pyGet(st, "status"), "open")),
    });
    for (const [bi, b] of pyIter(pyOr(pyGet(st, "beats"), [])).entries()) {
      add("strand_beats", {
        id: s_(pyGet(b, "id")),
        strand_id: sid,
        position: bi,
        chapter_id: ref(pyGet(b, "chapterId")),
        scene_id: ref(pyGet(b, "sceneId")),
        label: s_(pyGet(b, "label")),
        note: s_(pyGet(b, "note")),
      });
    }
  }

  for (const [i, w] of pyIter(pyOr(pyGet(snap, "worldbuilding"), [])).entries()) {
    add("worldbuilding", {
      id: s_(pyGet(w, "id")),
      position: i,
      category_id: s_(pyGet(w, "category")),
      title: s_(pyGet(w, "title")),
      status: s_(pyGet(w, "status")),
      words: i_(pyGet(w, "words")),
      summary: s_(pyGet(w, "summary")),
      body: s_(pyGet(w, "body")),
      tags: pyJson(pyOr(pyGet(w, "tags"), [])),
      related: pyJson(pyOr(pyGet(w, "related"), [])),
    });
  }

  for (const [i, c] of pyIter(pyOr(pyGet(snap, "worldbuildingCategories"), [])).entries()) {
    add("worldbuilding_categories", {
      id: s_(pyGet(c, "id")),
      position: i,
      label: s_(pyGet(c, "label")),
      icon: s_(pyGet(c, "icon")),
      hue: i_(pyGet(c, "hue")),
    });
  }

  for (const [i, st] of pyIter(pyOr(pyGet(snap, "statuses"), [])).entries()) {
    add("statuses", { id: s_(pyGet(st, "id")), position: i, label: s_(pyGet(st, "label")), color: s_(pyGet(st, "color")) });
  }

  for (const [kind, items] of pyItems(pyOr(pyGet(snap, "tagVocabularies"), {}))) {
    for (const [i, t] of pyIter(pyOr(items, [])).entries()) {
      add("tag_vocab", { id: s_(pyGet(t, "id")), kind: s_(kind), position: i, label: s_(pyGet(t, "label")) });
    }
  }

  for (const [i, [aid, docIn]] of pyItems(pyOr(pyGet(snap, "architecture"), {})).entries()) {
    const doc = pyOr(docIn, {});
    add("architecture", {
      id: s_(aid),
      position: i,
      title: s_(pyGet(doc, "title")),
      status: s_(pyGet(doc, "status")),
      words: i_(pyGet(doc, "words")),
      body: s_(pyGet(doc, "body")),
    });
  }

  for (const [entityId, imgList] of pyItems(pyOr(pyGet(snap, "images"), {}))) {
    for (const [i, img] of pyIter(pyOr(imgList, [])).entries()) {
      const rec = Object.fromEntries(pyItems(img).filter(([k]) => k !== "id" && k !== "addedAt"));
      add("images", {
        id: s_(pyGet(img, "id")),
        entity_kind: "",
        entity_id: s_(entityId),
        position: i,
        added_at: optI(pyGet(img, "addedAt")),
        data: pyJson(rec),
      });
    }
  }

  for (const [entityId, evList] of pyItems(pyOr(pyGet(snap, "events"), {}))) {
    for (const [i, ev] of pyIter(pyOr(evList, [])).entries()) {
      add("events", {
        id: s_(pyGet(ev, "id")),
        entity_kind: "",
        entity_id: s_(entityId),
        position: i,
        when: s_(pyGet(ev, "when")),
        title: s_(pyGet(ev, "title")),
        note: s_(pyGet(ev, "note")),
      });
    }
  }

  for (const [kind, items] of pyItems(pyOr(pyGet(snap, "trash"), {}))) {
    for (const it of pyIter(pyOr(items, []))) {
      add("trash", { id: s_(pyGet(it, "id")), kind: s_(kind), payload: pyJson(it), deleted_at: optI(pyGet(it, "deletedAt")) });
    }
  }

  // AI artifacts — singletons + keyed maps
  for (const kind of ["reverseOutline", "plotHoles", "marketingPack"]) {
    const val = pyGet(snap, kind);
    if (val !== null && val !== undefined) {
      add("project_artifacts", { kind, key: "", data: pyJson(val), updated_at: savedAt });
    }
  }
  for (const [kind, mapkey] of [
    ["dailyRecap", "dailyRecaps"],
    ["beatSheet", "beatSheets"],
    ["relationshipArc", "relationshipArcs"],
  ]) {
    for (const [k, v] of pyItems(pyOr(pyGet(snap, mapkey), {}))) {
      add("project_artifacts", { kind, key: s_(k), data: pyJson(v), updated_at: savedAt });
    }
  }
}

// ── assemble: rows → snapshot ───────────────────────────────────────────

export const setdefault = (obj, k, dflt) => {
  if (!Object.hasOwn(obj, k)) dset(obj, k, dflt);
  return obj[k];
};

/** The snapshot rebuilt from the rows, or null when the project doesn't exist. */
export function assemble(h, projectId) {
  const proj = h.get("projects", projectId);
  if (proj === null) return null;

  const all = (table, order) =>
    h.all(`SELECT * FROM ${table} WHERE ${table}.project_id = ?${order ? ` ORDER BY ${order}` : ""}`, [projectId], table);
  const ordered = (table) => all(table, `${table}.position`);

  // scenes (+ links) grouped by chapter
  const emptyLinks = () => Object.fromEntries(Object.keys(LINK_PLURAL).map((p) => [p, []]));
  const linksByScene = {};
  for (const ln of all("scene_links", "scene_links.position")) {
    const d = setdefault(linksByScene, ln.scene_id, emptyLinks());
    const plural = LINK_SINGULAR[ln.kind];
    if (plural) d[plural].push(ln.ref_id);
  }
  const scenesByCh = {};
  for (const scn of ordered("scenes")) {
    const s = { id: scn.id, title: scn.title, body: scn.body };
    Object.assign(s, truthy(linksByScene[scn.id]) ? linksByScene[scn.id] : emptyLinks());
    setdefault(scenesByCh, scn.chapter_id, []).push(s);
  }

  // chapters (+ strands) grouped by part
  const strandsByCh = {};
  for (const cs of all("chapter_strands", "chapter_strands.position")) setdefault(strandsByCh, cs.chapter_id, []).push(cs.strand_id);
  const chaptersByPart = {};
  const voiceCanon = [];
  // #235: the per-entity AI artifacts come back as top-level keyed maps, not embedded on
  // the entity objects (they live outside the renderer's undo).
  const chapterCritiques = {};
  const chapterRk = {};
  const chapterMr = {};
  for (const ch of ordered("chapters")) {
    setdefault(scenesByCh, ch.id, []); // every chapter has a (possibly empty) scene list
    const c = {
      id: ch.id,
      num: ch.num,
      title: ch.title,
      words: ch.words,
      status: ch.status,
      strands: Object.hasOwn(strandsByCh, ch.id) ? strandsByCh[ch.id] : [],
    };
    if (ch.critique !== null) dset(chapterCritiques, ch.id, pyLoads(ch.critique));
    if (ch.reader_knowledge !== null) dset(chapterRk, ch.id, pyLoads(ch.reader_knowledge));
    if (ch.multi_reader !== null) dset(chapterMr, ch.id, pyLoads(ch.multi_reader));
    if (ch.is_voice_canon) voiceCanon.push(ch.id);
    setdefault(chaptersByPart, ch.part_id, []).push(c);
  }
  const parts = ordered("parts").map((p) => ({
    id: p.id,
    title: p.title,
    chapters: Object.hasOwn(chaptersByPart, p.id) ? chaptersByPart[p.id] : [],
  }));

  const characters = [];
  const extras = {};
  const characterAudits = {};
  for (const c of ordered("characters")) {
    const obj = {
      id: c.id,
      main: c.main,
      age: c.age,
      gender: c.gender,
      pronouns: c.pronouns,
      aliases: pyLoads(c.aliases),
      lifeStatus: c.life_status,
      oneLiner: c.one_liner,
      role: c.role,
      name: c.name,
      tags: pyLoads(c.tags),
    };
    if (c.audit !== null) dset(characterAudits, c.id, pyLoads(c.audit));
    characters.push(obj);
    if (c.extras !== null) dset(extras, c.id, pyLoads(c.extras));
  }

  const entity = (x) => ({ id: x.id, name: x.name, kind: x.kind, note: x.note, tags: pyLoads(x.tags) });
  const locations = ordered("locations").map(entity);
  const objects = ordered("objects").map(entity);
  const strands = ordered("strands").map((s) => ({
    id: s.id,
    name: s.name,
    color: s.color,
    blurb: s.blurb,
    body: s.body,
    status: s.status,
    beats: [],
  }));

  // strand beats grouped onto their strand (which already carries beats=[])
  const beatsByStrand = {};
  for (const b of all("strand_beats", "strand_beats.position")) {
    setdefault(beatsByStrand, b.strand_id, []).push({ id: b.id, chapterId: b.chapter_id, sceneId: b.scene_id, label: b.label, note: b.note });
  }
  for (const s of strands) s.beats = Object.hasOwn(beatsByStrand, s.id) ? beatsByStrand[s.id] : [];

  // group members, with display name resolved from the entity tables
  const nameBy = new Map();
  const nk = (kind, id) => `${kind}\u0000${id}`;
  for (const c of characters) nameBy.set(nk("character", c.id), c.name);
  for (const x of locations) nameBy.set(nk("location", x.id), x.name);
  for (const x of objects) nameBy.set(nk("object", x.id), x.name);
  for (const s of strands) nameBy.set(nk("strand", s.id), s.name);
  const membersByGroup = {};
  for (const gm of all("group_members", "group_members.position")) {
    const m = { kind: gm.kind, id: gm.ref_id };
    const nm = nameBy.get(nk(gm.kind, gm.ref_id));
    if (nm !== undefined && nm !== null) m.name = nm;
    setdefault(membersByGroup, gm.group_id, []).push(m);
  }
  const groups = ordered("groups").map((g) => ({
    id: g.id,
    name: g.name,
    blurb: g.blurb,
    color: g.color,
    members: Object.hasOwn(membersByGroup, g.id) ? membersByGroup[g.id] : [],
  }));

  const notes = [];
  for (const n of ordered("notes")) {
    let anchor = null;
    if (n.anchor_chapter_id) {
      anchor = { chapterId: n.anchor_chapter_id };
      if (n.anchor_scene_id) anchor.sceneId = n.anchor_scene_id;
    }
    notes.push({ id: n.id, title: n.title, body: n.body, tag: n.tag, updated: n.updated, anchor });
  }

  const worldbuilding = ordered("worldbuilding").map((w) => ({
    id: w.id,
    category: w.category_id,
    title: w.title,
    tags: pyLoads(w.tags),
    status: w.status,
    words: w.words,
    summary: w.summary,
    body: w.body,
    related: pyLoads(w.related),
  }));
  const wbCategories = ordered("worldbuilding_categories").map((c) => ({ id: c.id, label: c.label, icon: c.icon, hue: c.hue }));
  const statuses = ordered("statuses").map((s) => ({ id: s.id, label: s.label, color: s.color }));

  const tagVocab = Object.fromEntries(TAG_KINDS.map((k) => [k, []]));
  for (const t of all("tag_vocab", "tag_vocab.position")) setdefault(tagVocab, t.kind, []).push({ id: t.id, label: t.label });

  const architecture = {};
  for (const a of ordered("architecture")) {
    dset(architecture, a.id, { id: a.id, title: a.title, status: a.status, words: a.words, body: a.body });
  }

  const images = {};
  for (const im of ordered("images")) {
    setdefault(images, im.entity_id, []).push({ id: im.id, addedAt: im.added_at, ...pyLoads(im.data) });
  }

  const events = {};
  for (const ev of ordered("events")) {
    setdefault(events, ev.entity_id, []).push({ id: ev.id, when: ev.when, title: ev.title, note: ev.note });
  }

  const trash = Object.fromEntries(TRASH_KINDS.map((k) => [k, []]));
  for (const it of all("trash", "trash.deleted_at, trash.id")) setdefault(trash, it.kind, []).push(pyLoads(it.payload));

  let reverseOutline = null;
  let plotHoles = null;
  let marketingPack = null;
  const dailyRecaps = {};
  const beatSheets = {};
  const relationshipArcs = {};
  for (const a of all("project_artifacts", null)) {
    const data = pyLoads(a.data);
    if (a.kind === "reverseOutline") reverseOutline = data;
    else if (a.kind === "plotHoles") plotHoles = data;
    else if (a.kind === "marketingPack") marketingPack = data;
    else if (a.kind === "dailyRecap") dset(dailyRecaps, a.key, data);
    else if (a.kind === "beatSheet") dset(beatSheets, a.key, data);
    else if (a.kind === "relationshipArc") dset(relationshipArcs, a.key, data);
  }

  const projectObj = {
    title: proj.title,
    author: proj.author,
    subtitle: proj.subtitle,
    genre: proj.genre,
    wordsGoal: proj.words_goal,
    dailyTarget: proj.daily_target,
    wordsWritten: proj.words_written,
    startedOn: proj.started_on,
    deadline: proj.deadline,
    premise: proj.premise,
    coverImage: proj.cover_image ? pyLoads(proj.cover_image) : null,
  };

  return {
    project: projectObj,
    parts,
    scenes: scenesByCh,
    characters,
    characterExtras: extras,
    locations,
    objects,
    groups,
    strands,
    notes,
    architecture,
    worldbuilding,
    worldbuildingCategories: wbCategories,
    tagVocabularies: tagVocab,
    images,
    events,
    statuses,
    trash,
    dailyRecaps,
    reverseOutline,
    beatSheets,
    plotHoles,
    chapterCritiques,
    chapterReaderKnowledge: chapterRk,
    chapterMultiReader: chapterMr,
    characterAudits,
    voiceCanonChapterIds: voiceCanon,
    relationshipArcs,
    marketingPack,
    worldRules: proj.world_rules,
    savedAt: proj.updated_at,
  };
}

// ── portable image transfer (zip export / import) ────────────────────────────
// A project exports as a zip whose images travel as FILES under images/, not as ImageBlob
// ids (which are local to one DB). `externalizeImages` rewrites each image record to a file
// reference and hands back the bytes; `internalizeImages` does the inverse — re-uploads the
// bytes as fresh image_blobs — so a book can be re-imported as a NEW project on any machine.
// `importBookSnapshot` is the ONE "decompose a book (+ its image files)" core shared by the
// /v1/projects/import endpoint AND the sample seeder (`seed.createDemoProject`).

const MIME_EXT = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
  "image/bmp": "bmp",
  "image/avif": "avif",
};

function extFor(mime) {
  const k = String(mime || "").toLowerCase();
  return Object.hasOwn(MIME_EXT, k) ? MIME_EXT[k] : "bin";
}

/**
 * A shallow copy of `snap` with every image record — the per-entity `images` arrays AND the
 * project `coverImage` (the only two holders) — passed through `fn(record) → record`.
 */
function mapImageRecords(snap, fn) {
  const out = { ...snap };
  out.images = Object.fromEntries(
    pyItems(pyOr(pyGet(snap, "images"), {})).map(([eid, lst]) => [eid, pyIter(pyOr(lst, [])).map((rec) => fn(rec))]),
  );
  const proj = { ...pyOr(pyGet(snap, "project"), {}) };
  if (truthy(pyGet(proj, "coverImage"))) proj.coverImage = fn(proj.coverImage);
  out.project = proj;
  return out;
}

/**
 * [bytes, mime] for an image record the SERVER can resolve — a server-kind record (its bytes
 * live in an image_blobs row) or an inline data-URL. null for a legacy `{kind:"file", path}`
 * record: `path` is a renderer-local Tauri path only the renderer's bridge could read, so
 * the server cannot externalize it.
 */
function recordBytes(h, rec) {
  const sid = pyGet(rec, "serverId");
  if (truthy(sid)) {
    const blob = h.get("image_blobs", sid);
    if (blob !== null) return [blob.data, pyGet(rec, "mime") || blob.mime || "application/octet-stream"];
    return null;
  }
  const dataUrl = pyGet(rec, "dataUrl");
  if (truthy(dataUrl)) {
    const m = /^data:([^;]+);base64,([\s\S]*)$/.exec(dataUrl);
    if (m) return [b64decode(m[2]), m[1]];
  }
  return null;
}

/**
 * Rewrite every server-resolvable image record (server-kind or inline data-URL) to reference
 * a file under images/, returning `[rewrittenSnapshot, Map(filename → bytes)]`. A legacy
 * `{kind:"file", path}` record is UNRESOLVABLE server-side (its path is renderer-local) so it
 * stays as-is: its record travels in book.json, its bytes do NOT enter the zip. The current
 * app only writes server-kind + data-URL images, so this gap is legacy-only.
 */
export function externalizeImages(h, snap) {
  const files = new Map();
  const take = (rec) => {
    const got = truthy(rec) ? recordBytes(h, rec) : null;
    if (got === null) return rec;
    const [raw, mime] = got;
    // serverId is globally unique → collision-free filenames across entities.
    const stem = pyGet(rec, "serverId") || pyGet(rec, "id") || randomUUID();
    const fname = `${pyStrOf(stem)}.${extFor(mime)}`;
    files.set(fname, raw);
    return {
      id: pyGet(rec, "id"),
      addedAt: pyGet(rec, "addedAt"),
      name: pyGet(rec, "name", ""),
      mime: pyGet(rec, "mime") || mime,
      file: fname,
    };
  };
  return [mapImageRecords(snap, take), files];
}

/**
 * Inverse of `externalizeImages`: re-upload each file-referencing record's bytes as a fresh
 * image_blobs row and rewrite the record to a server-kind record. Records with no `file`
 * (e.g. an already-inline data-URL) pass through. `files` is a Map (filename → bytes).
 */
export function internalizeImages(h, snap, files) {
  const now = isoNowUtc();
  const put = (rec) => {
    const fname = truthy(rec) ? pyGet(rec, "file") : null;
    const raw = truthy(fname) ? (files.get(fname) ?? null) : null;
    if (raw === null) return rec;
    const mime = pyGet(rec, "mime") || "application/octet-stream";
    const blobId = randomUUID();
    h.insert("image_blobs", { id: blobId, name: pyGet(rec, "name", ""), mime, data: raw, created_at: now });
    return {
      id: pyGet(rec, "id"),
      addedAt: pyGet(rec, "addedAt"),
      name: pyGet(rec, "name", ""),
      mime,
      kind: "server",
      serverId: blobId,
    };
  };
  return mapImageRecords(snap, put);
}

/**
 * Decompose a book snapshot (+ its exported image `files`, a Map) into `projectId`, creating
 * fresh image_blobs for its images — one transaction. The ONE core the per-project import
 * endpoint AND the sample seeder both call.
 */
export function importBookSnapshot(h, snap, files, projectId) {
  h.tx(() => decompose(h, projectId, internalizeImages(h, snap, files || new Map())));
}
