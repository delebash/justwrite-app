// SPDX-License-Identifier: MIT
// GET /v1/health — liveness + version + persistence status (the port of
// justwrite_server/api/health_api.py).

import { getState } from "../app_state.js";
import { getEngine } from "../database/session.js";
import { API_VERSION, PRODUCT, VERSION } from "../version.js";

export async function router(app) {
  app.get("/v1/health", async () => ({
    // camelCase wire (shared cross-app convention).
    status: "ok",
    product: PRODUCT,
    version: VERSION,
    apiVersion: API_VERSION,
    dataDir: getState().dataDir,
    dbReady: getEngine() !== null,
  }));
}
