// SPDX-License-Identifier: MIT
// GET /v1/health — liveness + version + persistence status (the port of
// justwrite_server/api/health_api.py).

import { Hono } from "@delebash/llm-runner/platform/server";
import { getState } from "#app_state";
import { getEngine } from "../database/session.js";
import { API_VERSION, PRODUCT, VERSION } from "../version.js";

export const router = new Hono();
router.get("/v1/health", (c) =>
  c.json({
    // camelCase wire (shared cross-app convention).
    status: "ok",
    product: PRODUCT,
    version: VERSION,
    apiVersion: API_VERSION,
    dataDir: getState().dataDir,
    dbReady: getEngine() !== null,
  }),
);
