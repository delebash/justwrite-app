// Shared boot/browser helpers for every JW script that drives the renderer with
// Playwright — `headless-smoke.js`, `book-smoke.js`, the bench harness
// (`bench/harness/`).
//
// This file is JustWrite's DOOR to the family implementation in
// `../just-llm-runner/scripts/lib/exec-resolve.js` (target-tree P7): it binds
// JW's env override (JW_CHROME) and re-exports the helpers. Import from HERE;
// never re-fork.
//
// WHY the law: findChrome() had been COPIED into 20 JW scripts before this file
// existed (2026-07-19), then JW's and JV's "one homes" forked ACROSS repos —
// same disease, bigger scale — until the kit became the single implementation.
// Probe scripts under tests/probes/ that still carry an old private copy are
// filed in docs/dev/TASKS.md, not silently assumed converted.

import {
  chromeLaunchOptions as kitChromeLaunchOptions,
  findChrome as kitFindChrome,
  isUp,
  sleep,
  waitReady,
} from "../../../just-llm-runner/scripts/lib/exec-resolve.js";

/** Path to a usable Chromium executable, or `undefined` (a SUCCESS value —
 *  Playwright then resolves from its own registry). `JW_CHROME` overrides. */
export const findChrome = () => kitFindChrome({ env: "JW_CHROME" });

/** Launch options carrying the resolved browser, if one was found. */
export const chromeLaunchOptions = () => kitChromeLaunchOptions({ env: "JW_CHROME" });

export { isUp, sleep, waitReady };
