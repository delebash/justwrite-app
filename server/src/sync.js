// SPDX-License-Identifier: MIT
// JustWrite's sync — the books through the family's sync engine (@delebash/sqlite-sync, the
// ../just-sqlite-sync repo). Every device keeps the whole library and works offline; changes
// travel by a file carried by hand, through a cloud folder, or over HTTP with another device or a
// server. The design: ../just-llm-runner/docs/plans/2026-10-08-sync-product-design.md; the
// decisions, verbatim: docs/dev/TASKS.md "Sync — offline first, by file, folder and server".
//
// Here: which tables sync (the book — projects + book_io's PROJECT_TABLES + image_blobs +
// chapter_versions; never chats, writing sessions, settings, the AI tables or the search index),
// the scene-text adapter (the editor's own schema, so a merged scene renders exactly as the editor
// writes it), this device's identity, the `sync` settings section, the routes, and the folder and
// peer auto-sync.

import { createHash, randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  SyncError,
  betterSqlite3Adapter,
  decodeFile,
  encodeFile,
  folderSync,
  generateLibraryKey,
  openSync,
  readFileHeader,
  syncWithPeer,
} from "@delebash/sqlite-sync";
import { registerSyncRoutes } from "@delebash/sqlite-sync/fastify";
import { nodeFolder } from "@delebash/sqlite-sync/node-folder";
import { ApiError, HttpError } from "@delebash/llm-runner/platform/errors";
import { getLogger } from "@delebash/llm-runner/platform/log";
import { pyJson } from "@delebash/llm-runner/platform/pyjson";
import { getSchema } from "@tiptap/core";
import { generateHTML, generateJSON } from "@tiptap/html/server";
import { Node as PMNode } from "@tiptap/pm/model";
import { updateYFragment, yXmlFragmentToProseMirrorRootNode } from "@tiptap/y-tiptap";
import * as Y from "yjs";
import { bodyToHtml, editorExtensions, schemaMention } from "../../src/services/editorSchema.js";
import { PROJECT_TABLES, pyLoads } from "./book_io.js";
import { state as dbState } from "./database/session.js";

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

// ── this device ─────────────────────────────────────────────────────────────────────────

/**
 * This device's id, kept beside the database: `sync-device.json` in the data folder, tied to this
 * machine and user — a data folder copied to another computer becomes a new device instead of a
 * twin of this one (two devices with one id would lose each other's changes).
 */
function deviceIdentity(dataDir) {
  const file = path.join(dataDir, "sync-device.json");
  const machine = createHash("sha256").update(`${os.hostname()}\u0000${os.userInfo().username}\u0000${process.platform}`).digest("hex").slice(0, 16);
  try {
    const j = JSON.parse(readFileSync(file, "utf8"));
    if (j && j.machine === machine && typeof j.id === "string" && j.id) return j.id;
  } catch {
    // none yet, or unreadable: a new identity
  }
  const id = randomBytes(8).toString("hex");
  writeFileSync(file, JSON.stringify({ id, machine }));
  return id;
}

// ── the `sync` settings section ─────────────────────────────────────────────────────────

const DEFAULTS = {
  deviceName: null, // shown to the other devices; the computer's name when unset
  folder: null, // a folder inside Dropbox/OneDrive/… the desktop's sync client keeps in step
  autoMinutes: 5, // folder and paired devices: sync this often while the app runs (0 = by hand only)
  pollSeconds: 5, // an open window checks this often whether another device's changes landed
  listenOnNetwork: false, // let paired devices reach this server (applies on the next start)
  key: null, // the library key: encrypts folder files; travels in the pairing code
  peers: [], // [{ url, token, name }] — devices or servers this one syncs with over HTTP
};

export function readSyncSettings(h = dbState.handle) {
  if (!h) return { ...DEFAULTS };
  try {
    const row = h.get("settings", "sync");
    const cfg = row && row.value ? pyLoads(row.value) : {};
    return { ...DEFAULTS, ...(cfg && typeof cfg === "object" ? cfg : {}) };
  } catch (e) {
    log.warning(`sync settings unreadable, using defaults: ${e?.message ?? e}`);
    return { ...DEFAULTS };
  }
}

function writeSyncSettings(h, cfg) {
  const value = pyJson({ ...DEFAULTS, ...cfg });
  if (h.get("settings", "sync") === null) h.insert("settings", { key: "sync", value });
  else h.update("settings", { value }, { key: "sync" });
}

function libraryKey(h) {
  const cfg = readSyncSettings(h);
  if (cfg.key) return cfg.key;
  const key = generateLibraryKey();
  writeSyncSettings(h, { ...cfg, key });
  return key;
}

// ── the engine on this database ─────────────────────────────────────────────────────────

let current = null; // { sync, dataDir }
let rev = 0; // moves whenever another device's changes land here — the window reloads its book
let lastRun = { folder: null, peers: [] };
let timer = null;

/** The engine, wrapped so every apply that changed rows moves `rev`. */
function tracked(sync) {
  return new Proxy(sync, {
    get(target, prop) {
      if (prop === "apply") {
        return (batch, opts) => {
          const r = target.apply(batch, opts);
          if (r.rows) rev++;
          return r;
        };
      }
      const v = target[prop];
      return typeof v === "function" ? v.bind(target) : v;
    },
  });
}

/** Open sync on the book tables (after initDb). Safe to call again (a reset, a new data dir). */
export function openBookSync(h, dataDir) {
  const cfg = readSyncSettings(h);
  const sync = openSync(betterSqlite3Adapter(h.raw), {
    app: "justwrite",
    schemaVersion: SYNC_SCHEMA_VERSION,
    tables: tableConfig(),
    deviceId: deviceIdentity(dataDir),
    deviceName: cfg.deviceName || os.hostname(),
    yjs: Y,
  });
  current = { sync: tracked(sync), dataDir };
  schedule();
  return current.sync;
}

/** The engine, or null before boot. */
export function getSync() {
  return current?.sync ?? null;
}

/** Stamp what the triggers noted — after every write request (app.js) and before every sync. */
export function flushSync() {
  try {
    current?.sync.flush();
  } catch (e) {
    log.warning(`sync flush failed: ${e?.message ?? e}`);
  }
}

/**
 * A workspace reset dropped and re-created every table: this device starts a new library (its
 * identity stays). The engine's tables and triggers go with the old one.
 */
export function resetBookSync(h, dataDir) {
  for (const { name } of h.all("SELECT name FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'sync\\_\\_%' ESCAPE '\\'")) {
    h.exec(`DROP TRIGGER IF EXISTS "${name}"`);
  }
  for (const { name } of h.all("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'sync\\_%' ESCAPE '\\'")) {
    h.exec(`DROP TABLE IF EXISTS "${name}"`);
  }
  return openBookSync(h, dataDir ?? current?.dataDir);
}

function need() {
  const s = getSync();
  if (!s) throw new HttpError(503, "database not ready");
  return s;
}

// ── running a sync ──────────────────────────────────────────────────────────────────────

async function runFolder() {
  const h = dbState.handle;
  const cfg = readSyncSettings(h);
  if (!cfg.folder) return null;
  const started = new Date().toISOString();
  try {
    const r = await folderSync(need(), nodeFolder(cfg.folder), { key: libraryKey(h), name: "folder" }).sync();
    lastRun.folder = { at: started, ok: true, pulled: r.pulled.applied, pushed: r.pushed.written, problems: r.pulled.problems.length };
  } catch (e) {
    lastRun.folder = { at: started, ok: false, error: String(e?.message ?? e), code: e?.code ?? null };
    log.warning(`folder sync failed: ${e?.message ?? e}`);
  }
  return lastRun.folder;
}

async function runPeers() {
  const cfg = readSyncSettings(dbState.handle);
  const out = [];
  for (const p of cfg.peers ?? []) {
    const started = new Date().toISOString();
    try {
      const r = await syncWithPeer(need(), { url: p.url, token: p.token });
      out.push({ url: p.url, name: r.peer.name ?? p.name, at: started, ok: true, pulled: r.pulled.applied, sent: r.pushed.sent });
    } catch (e) {
      out.push({ url: p.url, name: p.name, at: started, ok: false, error: String(e?.message ?? e), code: e?.code ?? null });
    }
  }
  lastRun.peers = out;
  return out;
}

function schedule() {
  if (timer) clearInterval(timer);
  timer = null;
  const minutes = Number(readSyncSettings(dbState.handle).autoMinutes) || 0;
  if (minutes <= 0) return;
  timer = setInterval(() => {
    void runFolder().then(runPeers);
  }, minutes * 60_000);
  timer.unref?.();
}

/** Stop the auto-sync timer (the server is stopping). */
export function stopBookSync() {
  if (timer) clearInterval(timer);
  timer = null;
}

/** The addresses another device can reach this server at (the same Wi-Fi, Tailscale, ZeroTier…). */
function reachableUrls(port) {
  const out = [];
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family === "IPv4" && !a.internal) out.push(`http://${a.address}:${port}/v1/sync`);
    }
  }
  return out;
}

/** Listen on the network instead of only this computer — when the user turned it on AND a
 * pairing token exists (with no token the server would be open to anyone on the network). */
export function networkHost(h = dbState.handle) {
  if (!readSyncSettings(h).listenOnNetwork) return null;
  try {
    const row = h.get("settings", "auth");
    const tokens = row && row.value ? (pyLoads(row.value)?.tokens ?? []) : [];
    if (!tokens.some((t) => typeof t === "string" && t)) {
      log.warning("sync: 'let my other devices connect' is on but no pairing token exists — staying on this computer only");
      return null;
    }
  } catch {
    return null;
  }
  return "0.0.0.0";
}

function addAuthToken(h, token) {
  const row = h.get("settings", "auth");
  const cfg = row && row.value ? (pyLoads(row.value) ?? {}) : {};
  const tokens = Array.isArray(cfg.tokens) ? cfg.tokens.filter((t) => typeof t === "string" && t) : [];
  const next = { tokens: [...tokens, token], requireForLoopback: !!cfg.requireForLoopback };
  if (row === null) h.insert("settings", { key: "auth", value: pyJson(next) });
  else h.update("settings", { value: pyJson(next) }, { key: "auth" });
}

function syncFailure(e) {
  // 409 problem+json: `detail` is the reason in words, `error` the engine's code (library-mismatch,
  // schema-too-new, clock-drift, wrong-key, …) so the window can say what to do
  if (e instanceof SyncError) throw new ApiError(409, e.code, "Sync refused", e.message, { error: e.code, ...(e.details ?? {}) });
  throw e;
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

// ── the routes ──────────────────────────────────────────────────────────────────────────

export async function router(app) {
  // The engine's own three routes: GET hello · POST pull · POST push — what another device's
  // syncWithPeer calls. The bearer-token hook (app.js) guards them like every /v1 route.
  registerSyncRoutes(app, need, { prefix: "/v1/sync" });

  app.addContentTypeParser("application/octet-stream", { parseAs: "buffer", bodyLimit: 1024 * 1024 * 1024 }, (_req, body, done) => done(null, body));

  /** What an open window polls: `rev` moves when another device's changes land here. */
  app.get("/v1/sync/rev", async () => ({ rev, pollSeconds: Number(readSyncSettings(dbState.handle).pollSeconds) || 5 }));

  app.get("/v1/sync/status", async (req) => {
    const s = need();
    const cfg = readSyncSettings(dbState.handle);
    return {
      device: s.device,
      deviceName: s.deviceName,
      library: s.library,
      rev,
      peers: s.peers(),
      settings: {
        deviceName: cfg.deviceName,
        folder: cfg.folder,
        autoMinutes: cfg.autoMinutes,
        pollSeconds: cfg.pollSeconds,
        listenOnNetwork: cfg.listenOnNetwork,
        hasKey: !!cfg.key,
        peers: (cfg.peers ?? []).map((p) => ({ url: p.url, name: p.name ?? null })),
      },
      lastRun,
      listening: { host: req.socket?.localAddress ?? null, port: req.socket?.localPort ?? null },
    };
  });

  app.put("/v1/sync/settings", async (req) => {
    const h = dbState.handle;
    const body = req.body ?? {};
    const cfg = readSyncSettings(h);
    const next = { ...cfg };
    if ("deviceName" in body) next.deviceName = body.deviceName ? String(body.deviceName) : null;
    if ("folder" in body) next.folder = body.folder ? String(body.folder) : null;
    if ("autoMinutes" in body) next.autoMinutes = Math.max(0, Number(body.autoMinutes) || 0);
    if ("pollSeconds" in body) next.pollSeconds = Math.max(1, Number(body.pollSeconds) || 5);
    if ("listenOnNetwork" in body) next.listenOnNetwork = !!body.listenOnNetwork;
    if (Array.isArray(body.removePeers)) next.peers = (cfg.peers ?? []).filter((p) => !body.removePeers.includes(p.url));
    writeSyncSettings(h, next);
    if (next.deviceName && next.deviceName !== cfg.deviceName) need().setDeviceName(next.deviceName);
    schedule();
    return { ok: true, restartRequired: next.listenOnNetwork !== cfg.listenOnNetwork };
  });

  /** The libraries already in a folder (to join one instead of starting a second). */
  app.post("/v1/sync/folder/libraries", async (req) => {
    const folder = req.body?.folder || readSyncSettings(dbState.handle).folder;
    if (!folder) throw new HttpError(400, "no folder given");
    return { libraries: await folderSync(need(), nodeFolder(String(folder))).libraries() };
  });

  app.post("/v1/sync/folder/run", async () => {
    const r = await runFolder();
    if (!r) throw new HttpError(400, "no sync folder is set");
    return r;
  });

  app.post("/v1/sync/run", async () => ({ folder: await runFolder(), peers: await runPeers() }));

  /** A file of some books, carried by hand to another device (import merges). */
  app.post("/v1/sync/export", async (req, reply) => {
    const h = dbState.handle;
    const ids = Array.isArray(req.body?.projectIds) ? req.body.projectIds.map(String) : [];
    if (!ids.length) throw new HttpError(400, "pick at least one book");
    const books = new Set(ids);
    const blobs = blobsOf(h, ids);
    const batch = need().changesSince({}, { scope: (t, pk) => (t === "image_blobs" ? blobs.has(pk[0]) : books.has(pk[0])) });
    const bytes = await encodeFile(batch, req.body?.encrypt ? { key: libraryKey(h) } : {});
    const title = h.get("projects", ids[0])?.title || "Books";
    const name = `${String(title).replace(/[\\/:*?"<>|]+/g, " ").trim().slice(0, 60) || "Books"}${ids.length > 1 ? ` +${ids.length - 1}` : ""} ${new Date().toISOString().slice(0, 10)}.jwsync`;
    reply.header("content-disposition", `attachment; filename="${encodeURIComponent(name)}"`);
    return reply.type("application/octet-stream").send(Buffer.from(bytes));
  });

  /** Import a carried file: merges. `?join=1` adopts the file's library (a device's first sync). */
  app.post("/v1/sync/import", async (req) => {
    const bytes = req.body instanceof Uint8Array ? req.body : null;
    if (!bytes) throw new HttpError(400, "send the file as application/octet-stream");
    let header;
    try {
      header = readFileHeader(bytes);
    } catch (e) {
      syncFailure(e);
    }
    const s = need();
    const join = String(req.query?.join ?? "") === "1";
    if (header.library !== s.library && !join) {
      throw new ApiError(
        409,
        "library-mismatch",
        "Sync refused",
        `This file is from another library${header.fromName ? ` (${header.fromName})` : ""}. Join it to merge its books into this one.`,
        { error: "library-mismatch", fromName: header.fromName ?? null },
      );
    }
    try {
      const batch = await decodeFile(bytes, header.enc ? { key: readSyncSettings(dbState.handle).key ?? undefined } : {});
      const r = s.apply(batch, { join });
      s.recordPeer(header.from, { name: header.fromName ?? null, kind: "file" });
      return { applied: r.applied, rows: r.rows, problems: r.problems, from: header.fromName ?? header.from };
    } catch (e) {
      syncFailure(e);
    }
  });

  /** Sync now with a device or server over HTTP (and remember it). */
  app.post("/v1/sync/peer/run", async (req) => {
    const { url, token, join } = req.body ?? {};
    if (!url) throw new HttpError(400, "give the other device's address");
    try {
      const r = await syncWithPeer(need(), { url: String(url), token: token ? String(token) : undefined, join: !!join });
      const h = dbState.handle;
      const cfg = readSyncSettings(h);
      const peers = (cfg.peers ?? []).filter((p) => p.url !== url);
      writeSyncSettings(h, { ...cfg, peers: [...peers, { url: String(url), token: token ? String(token) : null, name: r.peer.name ?? null }] });
      return { peer: r.peer, pulled: r.pulled.applied, sent: r.pushed.sent };
    } catch (e) {
      syncFailure(e);
    }
  });

  /**
   * Pair a device: a code (shown as a QR) with this library, its key, a new token for the other
   * device, and this server's addresses. Turning pairing on also turns on listening on the
   * network (applies on the next start).
   */
  app.post("/v1/sync/pair", async (req) => {
    const h = dbState.handle;
    const s = need();
    const token = randomBytes(24).toString("base64url");
    addAuthToken(h, token);
    const cfg = readSyncSettings(h);
    const wasListening = cfg.listenOnNetwork;
    writeSyncSettings(h, { ...cfg, listenOnNetwork: true });
    const port = req.socket?.localPort ?? 17495;
    return {
      code: { v: 1, app: "justwrite", library: s.library, key: libraryKey(h), token, name: s.deviceName, urls: reachableUrls(port) },
      restartRequired: !wasListening,
    };
  });

  /** The other side of pairing: join with a code from another device. */
  app.post("/v1/sync/pair/join", async (req) => {
    const code = typeof req.body?.code === "string" ? JSON.parse(req.body.code) : req.body?.code;
    if (!code || code.app !== "justwrite" || !Array.isArray(code.urls)) throw new HttpError(400, "not a JustWrite pairing code");
    const h = dbState.handle;
    let lastError = null;
    for (const url of code.urls) {
      try {
        const r = await syncWithPeer(need(), { url, token: code.token, join: true });
        const cfg = readSyncSettings(h);
        const peers = (cfg.peers ?? []).filter((p) => p.url !== url);
        writeSyncSettings(h, { ...cfg, key: code.key ?? cfg.key, peers: [...peers, { url, token: code.token, name: r.peer.name ?? code.name ?? null }] });
        return { url, peer: r.peer, pulled: r.pulled.applied, sent: r.pushed.sent };
      } catch (e) {
        lastError = e;
      }
    }
    syncFailure(lastError ?? new HttpError(400, "none of the device's addresses answered"));
  });
}
