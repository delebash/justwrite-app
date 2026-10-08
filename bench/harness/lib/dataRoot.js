// Resolve the data root the APP would use, so an autostarted bench server sees
// the SAME engine + models + books as `npm run dev` does.
//
// Since the Electron move (2026-10-08) the desktop shell, the server and this bench
// all ask the kit's ONE ladder (`@delebash/llm-runner/platform/data_paths`):
// JUSTWRITE_DATA_DIR, else the Change-folder pointer `dataroot.txt`, else `data/`
// beside the app (`<repo>/data` in a checkout), else the OS fallback. It replaced a
// hand-kept mirror of the Rust shell's resolution — there is nothing left to keep
// in step.

import { resolveDataDir } from "@delebash/llm-runner/platform/data_paths";

/**
 * The data root the app would resolve, for the bench's autostart.
 * `env` is injectable for tests only.
 */
export function resolveAppDataRoot(repoRoot, { env = process.env } = {}) {
  return resolveDataDir({ appName: "JustWrite", envVar: "JUSTWRITE_DATA_DIR", sourceRoot: repoRoot, env });
}
