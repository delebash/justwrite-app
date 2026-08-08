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

import { chooserDir, rememberDir } from "./chooserDirs.js";

/** Download `blob` as `filename`. Returns nothing; the browser owns the rest. */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoked on a timer, not immediately: Safari and Firefox have both been seen
  // to abort a download whose object URL is released in the same tick as click().
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/**
 * Save `blob` as `filename`, asking the user where when the host can.
 *
 * `chooser` names the folder memory (chooserDirs keys them separately, so the
 * book zip and a manuscript can remember different places). The dialog strings
 * come from the caller because only a view has i18n.
 *
 * Reads `window.justwrite` per call rather than at module load: capability can
 * differ between the desktop shell and a browser tab, and callers are tested in
 * both.
 *
 * Returns { ok, path } | { ok, downloaded } | { ok:false, cancelled } | { ok:false, error }.
 */
export async function saveBlob(blob, filename, { chooser = "export", title, filterName, filterExt } = {}) {
  const shell = typeof window !== "undefined" ? window.justwrite?.shell : null;
  if (!shell?.saveFile) {
    downloadBlob(blob, filename);
    return { ok: true, downloaded: true };
  }
  const res = await shell.saveFile({
    blob,
    suggestedName: filename,
    title,
    filterName,
    filterExt,
    defaultDir: await chooserDir(chooser),
  });
  if (res?.path) rememberDir(chooser, res.path.replace(/[/\\][^/\\]*$/, "")); // the folder it saved to
  return res;
}
