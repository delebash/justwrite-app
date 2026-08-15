// ============================================================
// bookTransfer.js — per-project ZIP export / import (JW-local).
//
// A project exports as a single "<title>.zip" (a "<title>/" folder holding
// book.json + images/ inside); import reads one back as a NEW project. The
// SERVER produces/consumes the zip bytes (GET /v1/projects/{id}/export +
// POST /v1/projects/import).
//
// EXPORT WORKS EVERYWHERE. The desktop shell's native "save as" is only the
// nicer of two destinations: with it you choose the folder and we remember it;
// without it (browser / headless) the blob goes to the browser's Downloads the
// same way a PDF does. This is the shape the shared kit's DataManagement
// already uses for the whole-DB backup — the per-book zip was the odd one out.
//
// IMPORT is still desktop-only: it needs a file picker handing us the bytes,
// which is why the two capabilities below are separate flags and not one.
//
// Each chooser remembers its own last folder (persisted in the settings doc,
// keyed per chooser); the first time, it defaults to the app's data folder.
// ============================================================

import { post, requestBlob } from "@delebash/llm-ui";
import { chooserDir, rememberDir } from "./chooserDirs.js";
import { saveBlob } from "./download.js";
import { hasShell, pickFile } from "./native.js";

// Both gates are the same question — "is a desktop shell there?" — and the kit
// owns the one test (2026-08-14). They were two probes of the old
// `window.justwrite` global, evaluated at module load, which is why this file
// needed two test files to cover its two capability states.
/** Host offers a native "save as" — export picks (and remembers) a folder. */
export const canSaveFiles = hasShell();
/** Host offers a file picker — the gate on Import, which has no browser path. */
export const canPickBooks = hasShell();

// Filesystem-safe filename stem — the display title minus chars illegal in a
// filename (mirrors the server's `_safe_title`); spaces + hyphens are kept, so
// "The Ninth Facet" stays intact. Never empty.
export function safeTitle(title) {
  const s = (title || "").replace(/[<>:"/\\|?*]/g, "").trim().replace(/\.+$/, "");
  return s || "book";
}

/**
 * Export a project as "<title>.zip". Desktop: a user-chosen location via the
 * native dialog. Browser: straight to Downloads.
 * Returns { ok, path } | { ok, downloaded } | { ok:false, cancelled }.
 */
export async function exportProject(projectId, title) {
  const blob = await requestBlob(`/v1/projects/${projectId}/export`);
  return saveBlob(blob, `${safeTitle(title)}.zip`, {
    // Keeps the existing "export" folder memory; manuscripts use their own key
    // so a submissions folder and a backup folder don't fight over one slot.
    chooser: "export",
    title: "Export book",
    filterName: "JustWrite book",
    filterExt: "zip",
  });
}

/**
 * Pick a "<title>.zip" and import it as a NEW project. Returns the new project's
 * { id, title } (the server minted the id), or null if the user cancelled.
 */
export async function importProject() {
  const picked = await pickFile({
    title: "Import book",
    filterName: "JustWrite book",
    filterExt: "zip",
    defaultDir: await chooserDir("import"),
  });
  if (!picked?.dataBase64) return null;
  if (picked.dir) rememberDir("import", picked.dir);
  return post("/v1/projects/import", { zipBase64: picked.dataBase64 });
}

/**
 * Save an arbitrary blob (the whole-DB backup zip) via the native save dialog,
 * defaulting to + remembering the "backup" chooser's folder. The host hook for
 * the shared DataManagement's "Export backup" (Task B1). Returns the save result.
 */
export async function saveBackupBlob(blob, suggestedName) {
  return saveBlob(blob, suggestedName, {
    chooser: "backup",
    title: "Export backup",
    filterName: "Backup",
    filterExt: "zip",
  });
}
