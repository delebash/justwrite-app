#!/usr/bin/env node
// Python launcher for the npm scripts. Resolves THIS PROJECT'S interpreter and
// execs it with whatever arguments follow.
//
// Usage (from any cwd — the venv is found relative to this file, not to cwd):
//   node scripts/py.js -m pytest -q
//   node scripts/py.js -m justwrite_server.serve serve
//
// WHY this exists. `npm run test:server` and `npm run server` used to call bare
// `python`, which resolves to whatever is first on PATH — on the user's Windows
// box that is a stock F:\Python312 with none of this project's dependencies, so
// `npm run test:server` died with
//   "python -m pytest: error: unrecognized arguments: -n"
// (no pytest-xdist, which server/pyproject.toml's addopts requires), and the
// runner's suite died at collection with "No module named 'google'" — both of
// them a missing-install, reported as though the test config were broken. It
// also silently took `npm run test:fast` down with it, since test:fast chains
// test:server, so the project's own quick gate could not complete.
//
// Hardcoding .venv/Scripts/python.exe would fix Windows and break the Linux dev
// container, which has no .venv and runs the interpreter straight off PATH — so
// the venv is PREFERRED and PATH is the documented fallback, per platform.
//
// The resolution itself lives in tests/lib/smoke-common.js beside findChrome(),
// which is this repo's one home for "find a platform-specific executable" — that
// file exists because findChrome() had been COPIED into 20 scripts. A second copy
// of the same idea here is how that starts again, so this is a thin CLI wrapper
// over findPython() and nothing more.

import { spawn } from "node:child_process";
import { findPython } from "../tests/lib/smoke-common.js";

const python = findPython();
const args = process.argv.slice(2);
if (!args.length) {
  console.error("scripts/py.js: no arguments — expected e.g. `-m pytest -q`");
  process.exit(2);
}

const child = spawn(python, args, { stdio: "inherit", shell: false });
child.on("error", (err) => {
  console.error(`scripts/py.js: could not run ${python}\n  ${err.message}`);
  console.error("  Expected the project venv at .venv/ — create it, or put a suitable python on PATH.");
  process.exit(1);
});
// Preserve the child's exit code so npm still fails the script when pytest fails.
child.on("exit", (code, signal) => process.exit(signal ? 1 : (code ?? 1)));
