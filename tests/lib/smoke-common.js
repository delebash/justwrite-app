// Shared boot/browser helpers for every JW script that drives the renderer with
// Playwright — `headless-smoke.js`, `book-smoke.js`, the bench harness
// (`bench/harness/`), the flow tests (`tests/flows/`).
//
// This file is JustWrite's DOOR to the family implementation in
// `../just-core/scripts/lib/exec-resolve.js` (target-tree P7): it binds
// JW's env override (JW_CHROME) and re-exports the helpers. Import from HERE;
// never re-fork.
//
// WHY the law: findChrome() had been COPIED into 20 JW scripts before this file
// existed (2026-07-19), then JW's and JV's "one homes" forked ACROSS repos —
// same disease, bigger scale — until the kit became the single implementation.
// Every probe under tests/probes/ imports it from here (2026-10-24; the dead probes were deleted).

import {
  chromeLaunchOptions as kitChromeLaunchOptions,
  findChrome as kitFindChrome,
  isUp,
  sleep,
  waitReady,
} from "../../../just-core/scripts/lib/exec-resolve.js";

/** Path to a usable Chromium executable, or `undefined` (a SUCCESS value —
 *  Playwright then resolves from its own registry). `JW_CHROME` overrides. */
export const findChrome = () => kitFindChrome({ env: "JW_CHROME" });

/** Launch options carrying the resolved browser, if one was found. */
export const chromeLaunchOptions = () => kitChromeLaunchOptions({ env: "JW_CHROME" });

export { isUp, sleep, waitReady };

/** The app's top-level routes (hash) reachable with no required params — what the headless smoke
 *  drives, and the start of the accessibility test's page list (e2e/lib/pages.js). */
export const ROUTES = [
  "#/", "#/chapters", "#/search", "#/characters", "#/locations", "#/objects",
  "#/groups", "#/worldbuilding", "#/strands", "#/plot", "#/timeline", "#/notes",
  "#/brainstorm", "#/markers", "#/relations", "#/analysis",
  "#/reader-knowledge", "#/import", "#/export", "#/trash", "#/settings",
  "#/help", "#/ai", "#/architecture", "#/welcome",
];

/** The app and the server a probe drives (tests/probes/), from JW_APP and JW_API — never a
 *  default. Probes write to the server they drive (presets, projects, even a data reset), and
 *  their old default was your running JustWrite (:1420 / :17495), your real library. */
export function probeTarget() {
  const app = process.env.JW_APP || "";
  const api = process.env.JW_API || "";
  if (!app || !api) {
    console.error("Set JW_APP and JW_API to a scratch app and server — a probe writes to the server it drives, so it never defaults to your running JustWrite.");
    process.exit(2);
  }
  return { app, api };
}

/** The kit's AI calls answered by the test (its ai-stub.js): `stubAi(page, (body) => reply)`. */
export { stubAi } from "../../../just-core/scripts/lib/ai-stub.js";
