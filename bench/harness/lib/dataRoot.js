// Resolve the data root the APP would use, so an autostarted bench server sees
// the SAME engine + models + books as `npm run dev` does — not an empty
// platformdirs default (the "engine is not installed" trap: a bare
// `justwrite_server.serve serve` falls back to platformdirs.user_data_dir,
// paths.py:12-14, a different directory from the app's).
//
// This is a deliberate MIRROR of the app shell's resolution
// (src-tauri/src/lib.rs:274-308): the `dataroot.txt` pointer first — beside the
// exe, then in the OS config dir — else the default `<exe dir>/data`. Three
// divergences, all safe for the bench's DEV-only world: the JUSTWRITE_DATA_DIR
// env short-circuit below (the server CLI honors it, the Rust shell doesn't),
// plus:
//   - the exe dir is pinned to src-tauri/target/debug (the bench requires a dev
//     build; there is no packaged-exe case to probe for), and
//   - the shell's dir_is_writable probe is skipped (a dev checkout is writable).
// If the Rust resolution ever changes, change this with it.

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** The app's bundle identifier — the OS config dir is keyed by it. */
function readIdentifier(repoRoot) {
  try {
    return JSON.parse(readFileSync(join(repoRoot, "src-tauri", "tauri.conf.json"), "utf8")).identifier || "";
  } catch {
    return "";
  }
}

/**
 * The data root the app would resolve, mirrored for the bench's autostart.
 * `env`/`platform` are injectable for tests only.
 */
export function resolveAppDataRoot(repoRoot, { env = process.env, platform = process.platform } = {}) {
  // Highest precedence: an explicit env override — the same envvar the server
  // CLI itself honors (cli.py:39), so a user who sets it gets exactly that root.
  if (env.JUSTWRITE_DATA_DIR) return env.JUSTWRITE_DATA_DIR;

  const exeDir = join(repoRoot, "src-tauri", "target", "debug");
  const candidates = [join(exeDir, "dataroot.txt")];
  const identifier = readIdentifier(repoRoot);
  const cfgDir = platform === "win32"
    ? env.APPDATA || ""
    : platform === "darwin"
      ? join(homedir(), "Library", "Application Support")
      : env.XDG_CONFIG_HOME || join(homedir(), ".config");
  if (identifier && cfgDir) candidates.push(join(cfgDir, identifier, "dataroot.txt"));

  for (const p of candidates) {
    try {
      const s = readFileSync(p, "utf8").trim();
      if (s) return s; // a user-relocated root — the pointer wins (lib.rs:298-306)
    } catch {
      /* no pointer here — try the next candidate */
    }
  }
  return join(exeDir, "data"); // the dev default (lib.rs:274-283)
}
