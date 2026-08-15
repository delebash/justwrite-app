// ============================================================
// download.js — deliver a finished Blob to the user.
//
// ONE answer to "where does this file go", shared by everything JustWrite
// exports: the Export view's PDF/DOCX/EPUB (composed in the renderer) and the
// book .zip (composed by the server). On the desktop that means the native
// "save as" — you pick the folder and we remember it; in a browser there is no
// folder chooser, so it lands in Downloads. Same shape the shared kit's
// DataManagement uses for the whole-DB backup.
//
// Until 2026-08-08 only the .zip offered the dialog and the three document
// formats always went straight to Downloads — an inconsistency the user hit
// while testing, not a design.
// ============================================================

import { downloadBlob as kitDownloadBlob, saveBlob as kitSaveBlob } from "@delebash/llm-ui";
import { chooserDir, rememberDir } from "./chooserDirs.js";

/** Download `blob` as `filename`. Returns nothing; the browser owns the rest. */
export const downloadBlob = kitDownloadBlob;

/**
 * Save `blob` as `filename`, asking the user where when the host can.
 *
 * The DELIVERY is the kit's one door (`common/services/fileSave.js`, 2026-08-15)
 * — native dialog where a saver is wired, Downloads otherwise. What stays here
 * is the part that is genuinely JustWrite's: **which folder to open at, and
 * remembering where the user put it.** `chooser` names that memory, so the book
 * zip and a manuscript can remember different places. Dialog strings come from
 * the caller because only a view has i18n.
 *
 * Returns { ok, path } | { ok, downloaded } | { ok:false, cancelled } | { ok:false, error }.
 */
export async function saveBlob(blob, filename, { chooser = "export", title, filterName, filterExt } = {}) {
  let res;
  try {
    res = await kitSaveBlob(blob, filename, {
      title,
      filterName,
      filterExt,
      defaultDir: await chooserDir(chooser),
    });
  } catch (e) {
    return { ok: false, error: String(e || "Save failed.") };
  }
  if (res.path) rememberDir(chooser, res.path.replace(/[/\\][^/\\]*$/, "")); // the folder it saved to
  return res;
}
