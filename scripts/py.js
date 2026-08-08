#!/usr/bin/env node
// Python launcher for the npm scripts. Resolves THIS PROJECT'S interpreter and
// execs it with whatever arguments follow.
//
// Usage (from any cwd — the venv is found relative to this file, not to cwd):
//   node scripts/py.js -m pytest -q
//   node scripts/py.js -m justwrite_server.serve serve
//
// WHY this exists: bare `python` resolves to whatever is first on PATH — on the
// user's Windows box a stock F:\Python312 with none of this project's
// dependencies — so `npm run test:server` died with "unrecognized arguments:
// -n" (no pytest-xdist) and took `test:fast` down with it. The venv is
// PREFERRED and PATH is the fallback (the Linux dev container has no .venv).
//
// The resolution lives in tests/lib/smoke-common.js beside findChrome() — the
// repo's one door to the kit's shared resolver — so this stays a thin CLI
// wrapper and nothing more.

import { runProjectPython } from "../tests/lib/smoke-common.js";

runProjectPython(process.argv.slice(2));
