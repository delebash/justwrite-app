// The scratch server the gates run on — moved out of scripts/smoke.js 2026-10-16, when the real-model
// eval (scripts/eval.js) joined the smoke: find the data root the app uses, snapshot it into a
// scratch root, start a server on the snapshot, and kill it (with its children) afterwards. The
// user's own data and their running app are only ever read, never written.

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveAppDataRoot } from "../../bench/harness/lib/dataRoot.js";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * The data root the desktop app actually uses.
 *
 * Asking the RUNNING server is the authoritative answer and the first probe:
 * /v1/health reports its own `dataDir` (server/src/api/health_api.js), so we read the
 * truth instead of re-deriving it. With the app closed, the fallback is the kit's one
 * ladder — the same one the desktop shell and the server use (`<repo>/data` in a
 * checkout, unless JUSTWRITE_DATA_DIR or a Change-folder pointer says otherwise).
 */
export async function findDataRoot(ports = [17495]) {
  if (process.env.JW_DATA_ROOT) return process.env.JW_DATA_ROOT;
  for (const port of ports) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/v1/health`, { signal: AbortSignal.timeout(1500) });
      if (r.ok) {
        const { dataDir } = await r.json();
        if (dataDir && existsSync(dataDir)) return dataDir;
      }
    } catch { /* not running — try the next probe */ }
  }
  const root = resolveAppDataRoot(ROOT);
  return existsSync(join(root, "justwrite.db")) ? root : "";
}

/** Snapshot <source>/justwrite.db into a fresh scratch root via SQLite's backup
 *  API (safe against a live, mid-write source — a plain copy is not). Returns
 *  the scratch root; an empty one if there was nothing to snapshot.
 *
 *  The snapshot then switches warm_default_on_startup OFF in the scratch copy: a
 *  configured source DB carries a default model + warm-on-boot, so the scratch
 *  server otherwise spends every gate run downloading a ~500 MB llama.cpp build
 *  into %TEMP% (measured 2026-08-08) for a sweep that never generates a token.
 *  `cacheRoot` points the copy at an engine cache (the source's own, for a run that
 *  loads real models — scripts/eval.js). */
export function snapshotDataRoot(source, { prefix = "jw-smoke-", cacheRoot = "" } = {}) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  const src = source ? join(source, "justwrite.db") : "";
  if (!src || !existsSync(src)) {
    console.log(`· data              EMPTY scratch dir (no DB at ${src || "<no root found>"}) — the sweep will be less realistic`);
    return dir;
  }
  const r = spawnSync(process.execPath, [
    join(ROOT, "scripts", "node24.js"), join(ROOT, "scripts", "snapshot-db.js"), src, join(dir, "justwrite.db"),
    ...(cacheRoot ? ["--cache-root", cacheRoot] : []),
  ], { encoding: "utf8" });
  if (r.status !== 0) {
    console.log(`· data              snapshot FAILED (${(r.stderr || "").trim().slice(0, 160)}) — continuing on an empty dir`);
    return dir;
  }
  const mb = (statSync(join(dir, "justwrite.db")).size / 1048576).toFixed(1);
  console.log(`· data              snapshot of ${source} (${mb} MB) → ${dir}`);
  return dir;
}

/** The server on Electron's own Node (scripts/node24.js) — the runtime it ships on — on `dataDir`.
 *  `uiDir` also serves a built UI at /. */
export function startServer({ port, dataDir, uiDir = "", stdio = ["ignore", "ignore", "inherit"] }) {
  return spawn(process.execPath, [join(ROOT, "scripts", "node24.js"), join(ROOT, "server", "src", "serve.js"), "serve", "--port", String(port), "--data-dir", dataDir], {
    cwd: ROOT,
    stdio,
    // JUST_AI_HOME confines the scratch server's family registrations to the scratch
    // itself. Without it, this boot writes "JustWrite Server → <scratch>/ai-cache"
    // into the MACHINE-WIDE %LOCALAPPDATA%/just-ai registry, and a scratch that
    // outlives cleanup becomes a Quick Setup cache offer (the 2026-08-08 ghost —
    // one proceed click repointed the real install's cache at %TEMP%). The kit now
    // also refuses temp-dir roots, but this harness should not rely on that net.
    env: { ...process.env, JUSTWRITE_DATA_DIR: dataDir, JUST_AI_HOME: dataDir, ...(uiDir ? { JUSTWRITE_UI_DIR: uiDir } : {}) },
  });
}

/** Kill a child AND its grandchildren. `child.kill()` on Windows signals only
 *  the direct process, which strands the server/esbuild children holding the
 *  ports — the next run then dies on "port already in use". */
export function killTree(child) {
  if (!child || child.exitCode !== null) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    try { process.kill(-child.pid, "SIGTERM"); } catch { child.kill("SIGTERM"); }
  }
}
