// SPDX-License-Identifier: MIT
// /v1/projects/*/autosave — the server-owned rotating disk autosave (the port of
// justwrite_server/api/autosave_api.py).
//
// A 3-generation rotating snapshot file per project (current -> prev -> prev2) written
// crash-safely via tmp-file + atomic rename, plus list / read / delete. The renderer already
// PUTs the same snapshot to the DB (PUT /v1/projects/{id}/book); this endpoint owns the extra
// on-disk JSON mirror so the work survives a DB wipe and OS-level backups (OneDrive / Time
// Machine) pick the file up.
//
// Base dir = the `autosaveDir` setting (a real /v1/settings key), default
// <dataDir>/projects. Python had to mount this router BEFORE the projects router so the
// literal `/autosaves` + `/autosave-dir` segments won over `/{project_id}` (FastAPI matches in
// registration order); Fastify prefers a static segment over a parameter by itself.
//
// The files keep Python's bytes: `json.dumps(snapshot, indent=2)` written through pathlib's
// `write_text`, which writes "\n" as the OS line separator (CRLF on Windows).

import { copyFileSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { HttpError } from "@delebash/llm-runner/platform/errors";
import { purePath, samePath } from "@delebash/llm-runner/platform/data_paths";
import { T } from "@delebash/llm-runner/platform/models";
import { pyJson } from "@delebash/llm-runner/platform/pyjson";
import { pyOr, pySorted, strip } from "@delebash/llm-runner/platform/py";
import { getState } from "../app_state.js";
import { pyGet } from "../book_io.js";
import { getDb } from "../database/session.js";

const IS_WIN = process.platform === "win32";

// generation -> filename suffix (the live file has no gen marker).
const GEN_SUFFIX = {
  current: ".autosave.json",
  prev: ".autosave.prev.json",
  prev2: ".autosave.prev2.json",
};
// Suffix order matters when stripping a filename: `.autosave.prev2.json` also ends with
// `.autosave.json`, so match the LONGEST suffix first.
const SUFFIX_GEN = [
  [".autosave.prev2.json", "prev2"],
  [".autosave.prev.json", "prev"],
  [".autosave.json", "current"],
];

const isFile = (p) => statSync(p, { throwIfNoEntry: false })?.isFile() === true;
const isDir = (p) => statSync(p, { throwIfNoEntry: false })?.isDirectory() === true;

// ── pathlib text files (candidates for platform/) ────────────────────────────

/** `Path.write_text(s, encoding="utf-8")` — "\n" written as the OS line separator. */
export function writeText(p, s) {
  writeFileSync(p, IS_WIN ? s.replace(/\n/g, "\r\n") : s, "utf8");
}

/** `Path.read_text(encoding="utf-8")` — strict UTF-8 (a bad byte is Python's
 * UnicodeDecodeError, a ValueError), universal newlines. */
export function readText(p) {
  const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(readFileSync(p));
  return text.replace(/\r\n?/g, "\n");
}

/**
 * Sanitize a project id into a filesystem-safe stem (verbatim port of the Rust `safe_id`):
 * keep ASCII alphanumerics + '-' + '_', map everything else to '_', and never yield an empty
 * stem. Also blocks path traversal in a key. (Per code point, as Python iterates a str.)
 */
export function safeId(s) {
  let cleaned = "";
  for (const c of String(s)) cleaned += /^[A-Za-z0-9_-]$/.test(c) ? c : "_";
  return cleaned || "project";
}

/** The autosave folder: the `autosaveDir` setting when set, else <dataDir>/projects.
 * Created on demand. */
function resolveDir(h) {
  const row = h.get("settings", "autosaveDir");
  if (row !== null) {
    let val = null;
    try {
      val = JSON.parse(row.value);
    } catch {
      val = null;
    }
    if (typeof val === "string" && strip(val)) {
      const p = purePath(val);
      mkdirSync(p, { recursive: true });
      return p;
    }
  }
  const p = purePath(path.join(getState().dataDir, "projects"));
  mkdirSync(p, { recursive: true });
  return p;
}

/** Map a `<projectId>__<generation>` key to its on-disk path, or null if the key is
 * malformed. `safeId` on the id half also blocks path traversal. */
function pathForKey(d, key) {
  const at = key.lastIndexOf("__");
  if (at < 0) return null;
  const projectId = key.slice(0, at);
  const generation = key.slice(at + 2);
  if (!Object.hasOwn(GEN_SUFFIX, generation)) return null;
  return path.join(d, `${safeId(projectId)}${GEN_SUFFIX[generation]}`);
}

/**
 * D3a (2026-07-13): when the autosave folder changes, MOVE the existing rotating files into
 * the new folder so a folder change never loses the user's autosaves. Best-effort — a failed
 * move must not fail the PUT; never clobbers a file already in the new folder. A move across
 * drives copies then deletes (shutil.move). Only the 3 rotation generations move; the
 * transient `.autosave.tmp.json` doesn't.
 */
function migrateAutosaves(oldDir, newDir) {
  try {
    if (samePath(oldDir, newDir) || !isDir(oldDir)) return;
  } catch {
    return;
  }
  const suffixes = Object.values(GEN_SUFFIX);
  for (const name of readdirSync(oldDir)) {
    try {
      const entry = path.join(oldDir, name);
      if (!isFile(entry) || !suffixes.some((s) => name.endsWith(s))) continue;
      const target = path.join(newDir, name);
      if (statSync(target, { throwIfNoEntry: false })) continue; // don't clobber an autosave already there
      try {
        renameSync(entry, target);
      } catch (e) {
        if (e.code !== "EXDEV") throw e;
        copyFileSync(entry, target);
        unlinkSync(entry);
      }
    } catch {
      // best-effort, per file
    }
  }
}

export async function router(app) {
  app.post("/v1/projects/:project_id/autosave", { schema: { body: T.Record(T.String(), T.Any()) } }, async (req) => {
    const d = resolveDir(getDb());
    const pid = safeId(req.params.project_id);
    const current = path.join(d, `${pid}.autosave.json`);
    const prev = path.join(d, `${pid}.autosave.prev.json`);
    const prev2 = path.join(d, `${pid}.autosave.prev2.json`);
    const tmp = path.join(d, `${pid}.autosave.tmp.json`);

    // Write to tmp first, then rotate + atomic-rename so a crash mid-write can't corrupt the
    // live autosave (a rename overwrites atomically, as os.replace).
    writeText(tmp, pyJson(req.body, { indent: 2 }));
    if (statSync(prev, { throwIfNoEntry: false })) renameSync(prev, prev2);
    if (statSync(current, { throwIfNoEntry: false })) renameSync(current, prev);
    renameSync(tmp, current);

    return { ok: true, projectId: pid, key: `${pid}__current` };
  });

  app.get("/v1/projects/autosaves", async () => {
    const d = resolveDir(getDb());
    const out = [];
    if (!isDir(d)) return out;
    for (const name of readdirSync(d)) {
      const entry = path.join(d, name);
      if (!isFile(entry)) continue;
      let projectId = null;
      let generation = null;
      for (const [suffix, gen] of SUFFIX_GEN) {
        if (name.endsWith(suffix)) {
          projectId = name.slice(0, -suffix.length);
          generation = gen;
          break;
        }
      }
      if (generation === null || projectId === null) continue;
      let parsed;
      try {
        parsed = JSON.parse(readText(entry));
      } catch {
        continue;
      }
      let title = "Untitled";
      let savedAt = "";
      if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
        const proj = parsed.project;
        if (proj !== null && typeof proj === "object" && !Array.isArray(proj) && typeof proj.title === "string") title = proj.title;
        if (typeof parsed.savedAt === "string") savedAt = parsed.savedAt;
      }
      out.push({ projectId, title, savedAt, generation, key: `${projectId}__${generation}` });
    }
    // Most recent first; empty savedAt sorts last.
    return pySorted(out, (e) => e.savedAt, true);
  });

  app.get("/v1/projects/autosaves/:key", async (req) => {
    const d = resolveDir(getDb());
    const p = pathForKey(d, req.params.key);
    if (p === null || !isFile(p)) throw new HttpError(404, "autosave not found");
    let doc;
    try {
      doc = JSON.parse(readText(p));
    } catch (e) {
      throw new HttpError(500, `autosave read failed: ${e?.message ?? e}`);
    }
    // FastAPI validated the `-> dict` return: a file holding anything else failed as an
    // unhandled response-validation error (the 500 envelope).
    if (doc === null || typeof doc !== "object" || Array.isArray(doc)) {
      throw new Error("1 validation error: Input should be a valid dictionary");
    }
    return doc;
  });

  app.delete("/v1/projects/autosaves", async (_req, reply) => {
    const d = resolveDir(getDb());
    if (isDir(d)) {
      for (const name of readdirSync(d)) {
        const entry = path.join(d, name);
        if (isFile(entry) && SUFFIX_GEN.some(([s]) => name.endsWith(s))) unlinkSync(entry);
      }
    }
    return reply.code(204).send();
  });

  app.delete("/v1/projects/autosaves/:key", async (req, reply) => {
    const d = resolveDir(getDb());
    const p = pathForKey(d, req.params.key);
    if (p !== null && isFile(p)) unlinkSync(p);
    return reply.code(204).send();
  });

  app.get("/v1/projects/autosave-dir", async () => ({ dir: resolveDir(getDb()) }));

  app.put("/v1/projects/autosave-dir", { schema: { body: T.Record(T.String(), T.Any()) } }, async (req) => {
    const h = getDb();
    const newDir = pyGet(pyOr(req.body, {}), "dir");
    if (typeof newDir !== "string" || !strip(newDir)) throw new HttpError(400, "dir is required");
    const oldDir = resolveDir(h); // the folder in use BEFORE the change (from the setting)
    const p = purePath(newDir);
    mkdirSync(p, { recursive: true });
    migrateAutosaves(oldDir, p); // D3a: carry the user's autosaves to the new folder
    const encoded = pyJson(newDir);
    if (h.get("settings", "autosaveDir") === null) h.insert("settings", { key: "autosaveDir", value: encoded });
    else h.update("settings", { value: encoded }, { key: "autosaveDir" });
    return { dir: p };
  });
}
