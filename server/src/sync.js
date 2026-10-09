// SPDX-License-Identifier: MIT
// JustWrite's sync — the books through the family's sync product (@delebash/sqlite-sync, the
// ../just-sqlite-sync repo). Every device keeps the whole library and works offline; changes
// travel by a file carried by hand, through a cloud folder, or over HTTP with another device or a
// server. The design: ../just-llm-runner/docs/plans/2026-10-08-sync-product-design.md; the
// decisions, verbatim: docs/dev/TASKS.md "Sync — offline first, by file, folder and server".
//
// The product's app layer (`@delebash/sqlite-sync/app`) runs the rest — this device's identity,
// the settings, the auto-sync, listening on the network, pairing, the by-hand file and the routes.
// What is JustWrite's own is here: which tables sync (the book — projects + book_io's
// PROJECT_TABLES + image_blobs + chapter_versions; never chats, writing sessions, settings, the AI
// tables or the search index), the scene-text adapter (the editor's own schema, so a merged scene
// renders exactly as the editor writes it), where the `sync` settings and the bearer tokens live
// (the settings table's `sync` and `auth` rows), what an export holds (the picked books and their
// images), and the error shape (the kit's problem+json).

import { createAppSync } from "@delebash/sqlite-sync/app";
import { ApiError, HttpError } from "@delebash/llm-runner/platform/errors";
import { getLogger } from "@delebash/llm-runner/platform/log";
import { pyJson } from "@delebash/llm-runner/platform/pyjson";
import { getSchema } from "@tiptap/core";
import { generateHTML, generateJSON } from "./editor/html.js";
import { Node as PMNode } from "@tiptap/pm/model";
import { updateYFragment, yXmlFragmentToProseMirrorRootNode } from "@tiptap/y-tiptap";
import * as Y from "yjs";
import { bodyToHtml, editorExtensions, schemaMention } from "./editor/editorSchema.js";
import { PROJECT_TABLES, pyLoads } from "./book_io.js";
import { state as dbState } from "./database/session.js";
import { SYNC_PLATFORM, syncDatabase } from "./sync_platform.js";

const log = getLogger("justwrite_server.sync");

/** Raised when JustWrite's synced tables or the scene adapter change shape in a way older
 * devices can't apply (the engine refuses newer batches: "update JustWrite on this device"). */
export const SYNC_SCHEMA_VERSION = 1;

// ── scene text: merged edit by edit through Yjs, on the editor's own schema ──────────────

let editor = null;
function editorSchema() {
  if (!editor) {
    const extensions = editorExtensions({ mention: schemaMention() });
    editor = { extensions, schema: getSchema(extensions) };
  }
  return editor;
}

/**
 * A scene body (the editor's HTML) as a Yjs document: changed by y-tiptap's updateYFragment —
 * the smallest difference, the same function the editor's collaboration binding calls on every
 * keystroke — and rendered back with the editor's schema.
 */
export const sceneTextAdapter = {
  apply(doc, value) {
    const { extensions, schema } = editorSchema();
    const html = bodyToHtml(value ?? "") || "<p></p>";
    const node = PMNode.fromJSON(schema, generateJSON(html, extensions));
    const fragment = doc.getXmlFragment("prosemirror");
    doc.transact(() => updateYFragment(doc, fragment, node, { mapping: new Map(), isOMark: new Map() }));
  },
  render(doc) {
    const { extensions, schema } = editorSchema();
    return generateHTML(yXmlFragmentToProseMirrorRootNode(doc.getXmlFragment("prosemirror"), schema).toJSON(), extensions);
  },
};

export const SYNC_TABLES = ["projects", ...PROJECT_TABLES, "image_blobs", "chapter_versions"];
function tableConfig() {
  const out = {};
  for (const t of SYNC_TABLES) out[t] = {};
  out.scenes = { text: { body: sceneTextAdapter } };
  return out;
}

// ── where JustWrite keeps things: the settings table's `sync` and `auth` rows ─────────────

function readRow(key) {
  const h = dbState.handle;
  if (!h) return null;
  const row = h.get("settings", key);
  return row && row.value ? pyLoads(row.value) : null;
}

function writeRow(key, obj) {
  const h = dbState.handle;
  const value = pyJson(obj);
  if (h.get("settings", key) === null) h.insert("settings", { key, value });
  else h.update("settings", { value }, { key });
}

/** The blobs (images) a set of books use: their images rows' and covers' server ids. */
function blobsOf(h, ids) {
  const out = new Set();
  const marks = ids.map(() => "?").join(", ");
  const add = (json) => {
    try {
      const rec = json ? JSON.parse(json) : null;
      if (rec?.serverId) out.add(rec.serverId);
    } catch {
      // not an image record
    }
  };
  for (const r of h.all(`SELECT data FROM images WHERE project_id IN (${marks})`, ids)) add(r.data);
  for (const r of h.all(`SELECT cover_image FROM projects WHERE id IN (${marks})`, ids)) add(r.cover_image);
  return out;
}

const appSync = createAppSync({
  app: "justwrite",
  appName: "JustWrite",
  schemaVersion: SYNC_SCHEMA_VERSION,
  tables: tableConfig,
  database: () => syncDatabase(dbState.handle.raw),
  yjs: Y,
  settings: { read: () => readRow("sync"), write: (cfg) => writeRow("sync", cfg) },
  auth: {
    tokens: () => {
      const cfg = readRow("auth");
      return Array.isArray(cfg?.tokens) ? cfg.tokens : [];
    },
    add: (token) => {
      const cfg = readRow("auth") ?? {};
      const tokens = Array.isArray(cfg.tokens) ? cfg.tokens.filter((t) => typeof t === "string" && t) : [];
      writeRow("auth", { tokens: [...tokens, token], requireForLoopback: !!cfg.requireForLoopback });
    },
  },
  units: {
    // a book and the images it uses
    scope: (ids) => {
      const books = new Set(ids);
      const blobs = blobsOf(dbState.handle, ids);
      return (t, pk) => (t === "image_blobs" ? blobs.has(pk[0]) : books.has(pk[0]));
    },
    name: (ids) => dbState.handle.get("projects", ids[0])?.title || "Books",
    extension: "jwsync",
    noun: "books",
  },
  errors: {
    badRequest: (detail) => new HttpError(400, detail),
    notReady: () => new HttpError(503, "database not ready"),
    // 409 problem+json: `detail` is the reason in words, `error` the engine's code
    // (library-mismatch, schema-too-new, clock-drift, wrong-key, …) so the window can say what to do
    refused: (e) => new ApiError(409, e.code, "Sync refused", e.message, { error: e.code, ...(e.details ?? {}) }),
  },
  log,
  // a computer's defaults, or the phone's (sync_platform.phone.js)
  platform: SYNC_PLATFORM,
});

/** Open sync on the book tables (after initDb). Safe to call again (a reset, a new data dir). */
export const openBookSync = (_h, dataDir) => appSync.open(dataDir);
/** The engine, or null before boot. */
export const getSync = () => appSync.get();
/** Stamp what the triggers noted — after every write request (app.js) and before every sync. */
export const flushSync = () => appSync.flush();
/** A workspace reset dropped and re-created every table: this device starts a new library. */
export const resetBookSync = (_h, dataDir) => appSync.reset(dataDir);
/** Stop the auto-sync timers (the server is stopping). */
export const stopBookSync = () => appSync.stop();
/** "0.0.0.0" when paired devices may connect (the setting is on and a pairing token exists). */
export const networkHost = () => appSync.networkHost();
/** The `sync` settings, with their defaults. */
export const readSyncSettings = () => appSync.readSettings();
/** The routes: /v1/sync/… (the product's). */
export const router = appSync.routes;
