// Shared boot/browser helpers for every JW script that drives the renderer with
// Playwright — `headless-smoke.js`, `book-smoke.js`, the bench harness
// (`bench/harness/`) — and the Python launcher (`scripts/py.js`).
//
// This file is JustWrite's DOOR to the family implementation in
// `../just-llm-runner/scripts/lib/exec-resolve.mjs` (target-tree P7): it binds
// JW's env overrides (JW_CHROME / JW_PYTHON) and venv layout (.venv at the
// repo root) and re-exports the helpers. Import from HERE; never re-fork.
//
// WHY the law: findChrome() had been COPIED into 20 JW scripts before this file
// existed (2026-07-19), then JW's and JV's "one homes" forked ACROSS repos —
// same disease, bigger scale — until the kit became the single implementation.
// Probe scripts under tests/probes/ that still carry an old private copy are
// filed in docs/dev/TASKS.md, not silently assumed converted. And bare
// `python` resolves to a stock PATH interpreter with none of this project's
// dependencies (the F:\Python312 story: "unrecognized arguments: -n", "No
// module named 'llm_runner'") — which is why findPython() exists at all.

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  chromeLaunchOptions as kitChromeLaunchOptions,
  findChrome as kitFindChrome,
  findPython as kitFindPython,
  isUp,
  runPython,
  sleep,
  waitReady,
} from "../../../just-llm-runner/scripts/lib/exec-resolve.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Path to a usable Chromium executable, or `undefined` (a SUCCESS value —
 *  Playwright then resolves from its own registry). `JW_CHROME` overrides. */
export const findChrome = () => kitFindChrome({ env: "JW_CHROME" });

/** Launch options carrying the resolved browser, if one was found. */
export const chromeLaunchOptions = () => kitChromeLaunchOptions({ env: "JW_CHROME" });

/** THIS PROJECT'S Python: the root .venv if present, else PATH. `JW_PYTHON`
 *  overrides everything. */
export const findPython = (repoRoot) =>
  kitFindPython({ env: "JW_PYTHON", root: repoRoot || REPO_ROOT, venvs: [".venv"] });

/** scripts/py.js body: run the resolved interpreter with args, exit-code-preserving. */
export const runProjectPython = (args) =>
  runPython(args, { env: "JW_PYTHON", root: REPO_ROOT, venvs: [".venv"] });

export { isUp, sleep, waitReady };
