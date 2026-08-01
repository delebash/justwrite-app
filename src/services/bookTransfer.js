// ============================================================
// bookTransfer.js — per-project ZIP export / import (JW-local).
//
// A project exports as a single "<title>.zip" (a "<title>/" folder holding
// book.json + images/ inside); import reads one back as a NEW project. The
// SERVER produces/consumes the zip bytes (GET /v1/projects/{id}/export +
// POST /v1/projects/import); the desktop shell's native save/open dialog is
// where the file lands / comes from. Desktop-only — a browser has no
// filesystem to write a loose file to (the buttons hide when `canTransferBooks`
// is false).
//
// Each chooser remembers its own last folder (persisted in the settings doc,
// keyed per chooser); the first time, it defaults to the app's data folder.
// ============================================================

import { post, requestBlob } from "@delebash/llm-ui";
import { chooserDir, rememberDir } from "./chooserDirs.js";

const jw = typeof window !== "undefined" ? window.justwrite : null;
export const canTransferBooks = !!(jw?.shell?.saveFile && jw?.shell?.pickFile);

// Filesystem-safe filename stem — the display title minus chars illegal in a
// filename (mirrors the server's `_safe_title`); spaces + hyphens are kept, so
// "The Ninth Facet" stays intact. Never empty.
function safeTitle(title) {
  const s = (title || "").replace(/[<>:"/\\|?*]/g, "").trim().replace(/\.+$/, "");
  return s || "book";
}

/**
 * Export a project to a user-chosen "<title>.zip". Returns the save result
 * ({ ok, path } | { ok:false, cancelled }).
 */
export async function exportProject(projectId, title) {
  const blob = await requestBlob(`/v1/projects/${projectId}/export`);
  const res = await jw.shell.saveFile({
    blob,
    suggestedName: `${safeTitle(title)}.zip`,
    title: "Export book",
    filterName: "JustWrite book",
    filterExt: "zip",
    defaultDir: await chooserDir("export"),
  });
  if (res?.path) rememberDir("export", res.path.replace(/[/\\][^/\\]*$/, "")); // the folder it saved to
  return res;
}

/**
 * Pick a "<title>.zip" and import it as a NEW project. Returns the new project's
 * { id, title } (the server minted the id), or null if the user cancelled.
 */
export async function importProject() {
  const picked = await jw.shell.pickFile({
    title: "Import book",
    filterName: "JustWrite book",
    filterExt: "zip",
    defaultDir: await chooserDir("import"),
  });
  if (!picked || picked.cancelled || !picked.dataBase64) return null;
  if (picked.dir) rememberDir("import", picked.dir);
  return post("/v1/projects/import", { zipBase64: picked.dataBase64 });
}

/**
 * Save an arbitrary blob (the whole-DB backup zip) via the native save dialog,
 * defaulting to + remembering the "backup" chooser's folder. The host hook for
 * the shared DataManagement's "Export backup" (Task B1). Returns the save result.
 */
export async function saveBackupBlob(blob, suggestedName) {
  const res = await jw.shell.saveFile({
    blob,
    suggestedName,
    title: "Export backup",
    filterName: "Backup",
    filterExt: "zip",
    defaultDir: await chooserDir("backup"),
  });
  if (res?.path) rememberDir("backup", res.path.replace(/[/\\][^/\\]*$/, ""));
  return res;
}
