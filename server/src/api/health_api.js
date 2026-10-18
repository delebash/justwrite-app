// SPDX-License-Identifier: MIT
// GET /v1/health — liveness + version + persistence status, through the kit's shared router
// (app-structure §14): the family's base wire plus JustWrite's dataDir and dbReady. Imported by
// path (not the platform index), so the phone's in-app server bundles it without Node's fs.

import { makeHealthRouter } from "@delebash/core/platform/health_api";
import { getState } from "#app_state";
import { getEngine } from "../database/session.js";
import { API_VERSION, PRODUCT, VERSION } from "../version.js";

export const router = makeHealthRouter({
  product: PRODUCT,
  version: VERSION,
  apiVersion: API_VERSION,
  extras: () => ({ dataDir: getState().dataDir, dbReady: getEngine() !== null }),
});
