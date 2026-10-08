// SPDX-License-Identifier: MIT
// Filesystem locations for the JustWrite server — the port of justwrite_server/paths.py.
//
// Resolution order (THE family policy — the shape lives in the kit, never here:
// `@delebash/llm-runner/platform/data_paths`):
//   1. Explicit `--data-dir` CLI flag
//   2. `JUSTWRITE_DATA_DIR` — the user's choice; also how the desktop shell hands down its
//      resolved root
//   3. `data/` beside the app (the DEFAULT — portable, in the install dir)
//   4. The OS app-data dir, only when the install dir is not writable

import path from "node:path";
import { resolveDataDir } from "@delebash/llm-runner/platform";

export const APP_NAME = "JustWrite";

// The checkout root in a source install: server/src/paths.js → repo. (A packaged build
// ignores this — the kit uses the executable's folder.)
export const SOURCE_ROOT = path.resolve(import.meta.dirname, "..", "..");

/**
 * The app's data root, per the ONE family policy (user ruling 2026-08-14 — *"absolutely no
 * data ... stored anywhere but where the user has set the storage directory, which by
 * default will be the install directory for the app"*).
 *
 * The desktop shell resolves this shape itself and hands the result down via
 * `JUSTWRITE_DATA_DIR`, so this function governs HEADLESS runs. Shell and server implement
 * the identical ladder (the kit's one implementation).
 */
export function defaultDataDir() {
  return resolveDataDir({ appName: APP_NAME, envVar: "JUSTWRITE_DATA_DIR", sourceRoot: SOURCE_ROOT });
}
