// SPDX-License-Identifier: MIT
// The tutorial book — "Try tutorial project" (POST /v1/projects/demo). Its own module so the
// projects routes don't import the AI seed (database/seed.js, and through it the kit's whole
// runner): the phone's in-app server runs those routes without it (the kit's
// docs/plans/2026-10-08-the-phone.md).

import * as bookIo from "../book_io.js";
import { DEMO_PROJECT_ID, demoBookSnapshot, demoSampleImages } from "./demo_seed.js";

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
