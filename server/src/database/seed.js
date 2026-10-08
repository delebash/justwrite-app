// SPDX-License-Identifier: MIT
// Boot-time + reset-time workspace seeding for the JustWrite server — the port of
// justwrite_server/database/seed.py.
//
// The LLM seed (providers, catalog, switches, recommendations, routing, and feature prompts)
// is SHARED — the kit's `seedLlm()` seeds it, including the feature DATA JustWrite
// registered via `installLlm` (its feature catalog + prompts). This module owns only
// JustWrite's NON-LLM piece: the demo book, which since QC-40 (user, 2026-07-10, option 1)
// is NOT seeded at boot — a fresh install has ZERO projects and the renderer lands on its
// welcome screen, and the demo is created only when the user clicks "Try tutorial project"
// (POST /v1/projects/demo → the helper below). The old `demoSeeded` gate flag is no longer
// written; existing DBs keep the inert row.

import { loadFromConfigs, seedLlm, stores } from "@delebash/llm-runner/llm";
import { getLogger } from "@delebash/llm-runner/platform/log";
import * as bookIo from "../book_io.js";
import { DEMO_PROJECT_ID, demoBookSnapshot, demoSampleImages } from "./demo_seed.js";
import { state } from "./session.js";

const log = getLogger("justwrite_server.database.seed");

/**
 * Create the demo book (fixed id — reset-safe, never duplicated) if it does not exist. Does
 * NOT touch `activeProjectId` (the renderer switches to it through its normal project
 * flow). Returns true if it created the project, false if it already existed.
 */
export function createDemoProject(h) {
  if (h.get("projects", DEMO_PROJECT_ID) !== null) return false;
  const snap = demoBookSnapshot();
  snap.savedAt = bookIo.isoNowUtc();
  // ONE "decompose a book (+ its image files)" core, shared with /v1/projects/import (the
  // sample ships image-less today, so demoSampleImages() is usually empty).
  bookIo.importBookSnapshot(h, snap, demoSampleImages(), DEMO_PROJECT_ID);
  return true;
}

/** Load the seeded providers into the shared LLM adapter registry so dispatch + the
 * /v1/llm-providers `registered` flag work from boot. */
function registerSeededProviders() {
  try {
    loadFromConfigs(stores.getProviderStore().list());
  } catch (e) {
    // never let registry wiring crash boot / reset
    log.warning(`LLM provider boot registration failed: ${e?.message ?? e}`);
  }
}

/**
 * Run the SHARED LLM seed (one transaction). Uses the open database when no handle is given
 * (the `serve` entrypoint); the workspace-reset handler passes its own after the wipe. The
 * demo book is NOT seeded here (QC-40) — a fresh/reset workspace ships with no projects.
 *
 * Requires `installLlm` to have run first (it registers JW's feature data the shared seeder
 * reads) — true for both the `serve` boot and createApp tests.
 */
export function seedWorkspace(h = null) {
  if (h === null) {
    if (state.handle === null) return;
    h = state.handle;
  }
  try {
    seedLlm(h); // shared: providers/catalog/switches/recs/routing/prompts — its own transaction
  } catch (e) {
    // never let a seed failure crash boot / reset (the transaction rolled back)
    log.warning(`workspace seed failed: ${e?.message ?? e}`);
  }
  // After providers are committed, register them with the shared adapter registry.
  registerSeededProviders();
}
